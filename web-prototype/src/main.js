// STARFALL — entry point and game facade.
//
// Owns the loop, the camera, and the shared services (damage, explosions, loot,
// spawning) that every other module calls into.

import { Renderer } from './core/gl.js';
import { Input } from './core/input.js';
import { AudioKit } from './core/audio.js';
import {
  v3, vset, vsub, vnorm, vdist, vdistXZ, clamp, clamp01, lerp, mat4, mMul, mPerspective,
  mViewFPS, dirFromAngles, formatNum, randRange, DEG,
} from './core/math.js';

import { ELEMENTS, POWER, xpForLevel, RARITY } from './data/defs.js';
import { CLASSES, SUBCLASSES } from './data/subclasses.js';
import { World } from './game/world.js';
import { Player } from './game/player.js';
import { Enemy } from './game/enemy.js';
import { Effects } from './game/effects.js';
import { ProjectileSystem } from './game/projectiles.js';
import { UI } from './game/ui.js';
import * as Save from './game/save.js';
import { rollDrop, computePower, computeStats, dismantleValue, infuseCost, exoticConflict, weaponHooks } from './game/loot.js';
import { activityById, makeDirector } from './game/activities.js';

class Game {
  constructor() {
    this.sceneCanvas = document.getElementById('scene');
    this.hudCanvas = document.getElementById('hud');
    this.overlay = document.getElementById('overlays');
    this.lockHint = document.getElementById('pointerlock-hint');

    this.renderer = new Renderer(this.sceneCanvas);
    this.input = new Input(this.sceneCanvas);
    this.audio = new AudioKit();
    this.fx = new Effects();
    this.projectiles = new ProjectileSystem(this);
    this.ui = new UI(this, this.hudCanvas, this.overlay);

    this.time = 0;
    this.dt = 0;
    this.fps = 60;
    this.showFps = false;
    this.enemies = [];
    this.engrams = [];
    this.ammoDrops = [];
    this.world = null;
    this.player = new Player(this);
    this.director = null;
    this.activity = null;
    this.inActivity = false;
    this.profile = null;
    this.paused = false;
    this.respawnTimer = 0;
    this.runStats = null;
    this.viewProj = mat4();
    this.view = mat4();
    this.proj = mat4();
    this.camPos = v3();
    this.camFwd = v3(); this.camRight = v3(); this.camUp = v3();
    this.fovBase = 95;
    this.fovCurrent = 62;
    this.activityPower = POWER.start;
    this.enemyHpMul = 1;
    this.enemyDmgMul = 1;
    this.difficultyDamageScale = 1;
    this.shakeOut = { yaw: 0, pitch: 0, roll: 0 };

    this._bindEvents();
    this.boot();
  }

  // ================================================================ boot
  boot() {
    const saved = Save.load();
    this.hasSave = !!saved;
    if (saved) this.profile = saved;
    this.ui.refreshTitle(this.hasSave);
    this.ui.showScreen('title');
    this.state = 'title';
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  newGame(classId) {
    this.audio.init();
    this.profile = Save.newProfile(classId);
    Save.save(this.profile);
    this.hasSave = true;
    this.applySettings();
    this.ui.toast('Guardian created', CLASSES[classId].name.toUpperCase(), 'legendary');
    this.returnToOrbit();
  }

  continueGame() {
    this.audio.init();
    this.applySettings();
    this.returnToOrbit();
  }

  wipeSave() {
    Save.wipe();
    this.profile = null;
    this.hasSave = false;
    this.ui.refreshTitle(false);
  }

  saveProfile() { if (this.profile) Save.save(this.profile); }

  applySettings() {
    const s = this.profile.settings;
    this.input.sensitivity = s.sensitivity * 0.001;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.audio.setMusicVolume(s.musicVolume);
    this.fovBase = s.fov;
    this.saveProfile();
  }

  _bindEvents() {
    window.addEventListener('resize', () => { this.renderer.resize(); this.ui.resize(); });
    this.sceneCanvas.addEventListener('click', () => {
      if (this.state === 'activity' && !this.ui.screen) { this.audio.init(); this.input.requestLock(); }
    });
    this.input.onLockChange = (locked) => {
      this.lockHint.classList.toggle('hidden', locked || this.state !== 'activity' || !!this.ui.screen);
      if (!locked && this.state === 'activity' && !this.ui.screen) this.openMenu('pause');
    };
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'activity' && this.state !== 'orbit') return;
      if (e.code === 'Escape') { e.preventDefault(); this.toggleMenu('pause'); }
      else if (e.code === 'Tab') { e.preventDefault(); this.toggleMenu('character'); }
      else if (e.code === 'KeyM') { if (!this._typing()) this.toggleMenu('director'); }
      else if (e.code === 'F3') { e.preventDefault(); this.showFps = !this.showFps; }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'activity' && !this.ui.screen) this.openMenu('pause');
    });
  }

  _typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  // ================================================================ menus
  openMenu(name) {
    if (this.ui.screen === 'results') return;
    this.ui.showScreen(name);
    this.paused = true;
    this.input.exitLock();
    this.lockHint.classList.add('hidden');
  }
  toggleMenu(name) {
    if (this.ui.screen === name) this.closeMenus();
    else if (this.ui.screen === 'results') { /* results must be dismissed with a button */ }
    else this.openMenu(name);
  }
  closeMenus() {
    if (this.state === 'orbit') { this.ui.showScreen('director'); return; }
    this.ui.showScreen(null);
    this.paused = false;
    this.lockHint.classList.toggle('hidden', this.input.locked);
    if (this.state === 'activity') this.input.requestLock();
  }

  // ================================================================ profile helpers
  equipped() { return Save.equippedItems(this.profile); }
  playerStats() { return computeStats(this.equipped(), CLASSES[this.profile.classId].baseStats); }

  equipItem(item) {
    const conflict = exoticConflict(this.equipped(), item);
    if (conflict) {
      const other = this.equipped()[conflict];
      delete this.profile.equipped[conflict];
      this.ui.toast('Exotic unequipped', other.name, 'exotic');
    }
    this.profile.equipped[item.slot] = item.uid;
    this.audio.pickup();
    this.saveProfile();
    if (this.inActivity) this.player.applyLoadout(Save.loadoutFor(this.profile));
  }

  dismantle(item) {
    if (item.locked) return;
    if (Object.values(this.profile.equipped).includes(item.uid)) return;
    const value = dismantleValue(item);
    Save.removeItem(this.profile, item.uid);
    this.profile.shards += value;
    this.saveProfile();
  }

  dismantleJunk() {
    const eq = new Set(Object.values(this.profile.equipped));
    const junk = this.profile.inventory.filter((i) =>
      !eq.has(i.uid) && !i.locked && (i.rarity === 'common' || i.rarity === 'uncommon'));
    let gained = 0;
    for (const it of junk) { gained += dismantleValue(it); Save.removeItem(this.profile, it.uid); }
    this.profile.shards += gained;
    this.saveProfile();
    this.ui.toast(`Dismantled ${junk.length} items`, `+${gained} shards`, 'uncommon');
  }

  infuse(target, source) {
    const cost = infuseCost(target, source);
    if (this.profile.shards < cost.shards) { this.audio.ui('error'); return; }
    this.profile.shards -= cost.shards;
    target.power = source.power;
    Save.removeItem(this.profile, source.uid);
    this.audio.loot('legendary');
    this.ui.toast('Infused', `${target.name} → ${target.power}`, target.rarity);
    this.saveProfile();
    if (this.inActivity) this.player.applyLoadout(Save.loadoutFor(this.profile));
  }

  setSubclass(id) {
    if (!SUBCLASSES[id] || SUBCLASSES[id].classId !== this.profile.classId) return;
    this.profile.subclassId = id;
    this.saveProfile();
    if (this.inActivity) this.player.applyLoadout(Save.loadoutFor(this.profile));
  }

  // ================================================================ activities
  returnToOrbit() {
    this.state = 'orbit';
    this.inActivity = false;
    this.director = null;
    this.enemies.length = 0;
    this.engrams.length = 0;
    this.ammoDrops.length = 0;
    this.projectiles.clear();
    this.fx.clear();
    this.input.exitLock();
    this.lockHint.classList.add('hidden');
    this.ui.setBoss(null);
    this.ui.clearWaypoint();
    this.saveProfile();
    this.ui.showScreen('director');
  }

  startActivity(id) {
    const def = activityById(id);
    if (!def) return;
    this.activity = def;
    this.world = new World({ ...def.world }, def.world.seed);
    this.renderer.setStatic(this.world.verts);
    this.renderer.env = this.world.env;

    this.enemies.length = 0;
    this.engrams.length = 0;
    this.ammoDrops.length = 0;
    this.projectiles.clear();
    this.fx.clear();

    this.activityPower = def.power;
    // Enemies scale with the activity's recommended power, not the player's.
    const t = (def.power - POWER.start) / 100;
    this.enemyHpMul = 1 + t * 2.1;
    this.enemyDmgMul = 1 + t * 0.62;
    this.difficultyDamageScale = 1 + t * 1.9;

    this.player.applyLoadout(Save.loadoutFor(this.profile));
    this.player.respawn(this.world.playerSpawn, this.world.playerYaw);
    this.player.reserves.special = 18;
    this.player.reserves.heavy = 6;
    this.player.superEnergy = def.type === 'Patrol' ? 0.25 : 0;

    this.director = makeDirector(this, def);
    this.director.start();

    this.runStats = { kills: 0, deaths: 0, start: this.time, rewards: [], shards: 0, xp: 0 };
    this.inActivity = true;
    this.state = 'activity';
    this.respawnTimer = 0;
    this.ui.setBoss(null);
    this.ui.showScreen(null);
    this.paused = false;
    this.ui.banner(def.name.toUpperCase(), def.type.toUpperCase());
    this.audio.init();
    this.input.requestLock();
    this.lockHint.classList.toggle('hidden', this.input.locked);
    this.profile.stats.activitiesRun++;
    this.saveProfile();
  }

  abandon() {
    if (this.inActivity && this.director && this.director.def.endless) this.finishActivity(false, 'ABANDONED');
    else this.returnToOrbit();
  }

  finishActivity(win, verdict) {
    if (!this.inActivity) return;
    const d = this.director;
    const dur = this.time - this.runStats.start;
    const mins = Math.floor(dur / 60), secs = Math.floor(dur % 60);
    const rows = [
      ['Activity', d.def.name],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
      ['Kills', formatNum(this.runStats.kills)],
      ['Deaths', String(this.runStats.deaths)],
      ['Shards', '+' + formatNum(this.runStats.shards)],
      ['Experience', '+' + formatNum(this.runStats.xp)],
    ];
    if (d.def.type === 'Survival') {
      rows.splice(2, 0, ['Waves cleared', String(Math.max(0, d.wave - (win ? 0 : 1)))]);
      rows.splice(3, 0, ['Score', formatNum(d.score)]);
      this.profile.stats.bestWave = Math.max(this.profile.stats.bestWave, d.bestWave);
    }
    if (win && d.def.rewardTier !== 'world') {
      // completion reward on top of anything dropped during the run
      const count = d.def.rewardTier === 'pinnacle' ? 3 : 2;
      for (let i = 0; i < count; i++) this.awardItem(this.rollLoot(d.def.rewardTier), true);
    }
    this.inActivity = false;
    this.input.exitLock();
    this.saveProfile();
    this.ui.showResults({
      title: win ? 'Activity Complete' : 'Activity Ended',
      verdict: verdict || (win ? 'Victory' : 'Defeat'),
      win, rows, rewards: this.runStats.rewards.slice(-8), activityId: d.def.id,
    });
    this.audio[win ? 'levelUp' : 'warn']();
  }

  // ================================================================ spawning
  spawnEnemy(typeId, pos, opts = {}) {
    const e = new Enemy(typeId, pos, {
      hpMul: opts.hpMul ?? this.enemyHpMul,
      damageMul: opts.damageMul ?? this.enemyDmgMul,
      power: this.activityPower,
      onPhase: opts.onPhase,
    });
    this.enemies.push(e);
    return e;
  }

  setBoss(e) { this.ui.setBoss(e); }
  markWaypoint(pos, label) { this.ui.markWaypoint(pos, label); }
  clearWaypoint() { this.ui.clearWaypoint(); }

  // ================================================================ combat facade
  panFor(pos) {
    const dx = pos.x - this.player.pos.x, dz = pos.z - this.player.pos.z;
    const cs = Math.cos(-this.player.yaw), sn = Math.sin(-this.player.yaw);
    const rx = dx * cs - dz * sn;
    return clamp(rx / 25, -0.85, 0.85);
  }

  damageEnemy(enemy, amount, opts = {}) {
    if (!enemy || !enemy.alive) return { dealt: 0, killed: false };
    const res = enemy.takeDamage(amount, opts, this);
    const pos = opts.pos || enemy.center(_tmp);
    if (res.blocked) return res;

    if (this.profile.settings.showDamage && !opts.tick) {
      this.fx.damageText(pos, Math.round(res.dealt || amount), {
        crit: opts.crit,
        color: opts.crit ? '#ffe08a' : opts.element && opts.element !== 'kinetic' ? ELEMENTS[opts.element].css : '#ffffff',
      });
    }
    if (!opts.silent && !opts.tick) {
      this.audio.hit(opts.crit);
      this.fx.impact(pos, _up, opts.element ? ELEMENTS[opts.element].glow : [1, 0.9, 0.7], opts.crit ? 10 : 5);
    }
    if (res.shieldBroken) {
      this.audio.shieldBreak(enemy.shieldElement);
      this.explode(pos, 3.5, 60 * this.difficultyDamageScale, enemy.shieldElement, { source: 'shieldBreak', silent: true });
      this.fx.ring(enemy.center(_tmp), 3.6, ELEMENTS[enemy.shieldElement].glow, 0.4, { vertical: true });
    }
    if (res.killed) this.onEnemyKilled(enemy, opts);
    return res;
  }

  damagePlayer(amount, opts = {}) {
    if (!this.player.alive) return;
    this.player.takeDamage(amount, opts);
  }

  /** Radial damage with linear falloff. `team` decides who it hurts. */
  explode(pos, radius, damage, element = 'kinetic', opts = {}) {
    const team = opts.team || 'player';
    const col = ELEMENTS[element] ? ELEMENTS[element].glow : [1, 0.8, 0.5];
    if (!opts.silent) {
      this.audio.explode(radius > 7);
      this.fx.addShake(clamp(radius / 26, 0.08, 0.7) / (1 + vdist(pos, this.player.pos) * 0.05));
    }
    this.fx.burst(pos, Math.min(46, 14 + Math.floor(radius * 3)), col, { speed: radius * 1.7, size: 0.13, life: 0.55 });
    this.fx.ring(pos, radius, col, 0.42);
    this.fx.particle(pos.x, pos.y, pos.z, 0, 0, 0, { life: 0.22, size: radius * 0.55, color: col, gravity: 0, drag: 8 });

    if (team === 'player') {
      for (const e of this.enemies) {
        if (!e.alive || e === opts.exclude) continue;
        const d = vdist(e.center(_tmp), pos);
        if (d > radius + e.radius) continue;
        const falloff = 1 - clamp01((d - e.radius) / radius) * 0.65;
        this.damageEnemy(e, damage * falloff, {
          element, pos: e.center(_tmp), source: opts.source || 'explosion',
          weapon: opts.weapon, silent: true,
        });
      }
    } else {
      const d = vdist(this.player.center(_tmp), pos);
      if (d < radius + 0.6) {
        this.damagePlayer(damage * (1 - clamp01(d / radius) * 0.6), { element, pos, source: opts.source });
      }
    }
  }

  chainLightning(pos, from, damage, range, targets, silent = false) {
    let source = from;
    let sourcePos = pos;
    const hit = new Set([from && from.id]);
    for (let i = 0; i < targets; i++) {
      let best = null, bestD = range;
      for (const e of this.enemies) {
        if (!e.alive || hit.has(e.id)) continue;
        const d = vdist(e.center(_tmp2), sourcePos);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      hit.add(best.id);
      this.fx.lightning(sourcePos, best.center(_tmp2), ELEMENTS.surge.glow, 5, 0.14);
      this.damageEnemy(best, damage, { element: 'surge', pos: best.center(_tmp2), source: 'chain', silent });
      sourcePos = { x: best.pos.x, y: best.pos.y + best.height * 0.5, z: best.pos.z };
      source = best;
      damage *= 0.75;
    }
    void source;
  }

  applyBurn(enemy, dps, dur) { if (enemy && enemy.alive) enemy.applyBurn(dps, dur); }

  spawnBurnPool(pos, radius, duration, dps) {
    this.projectiles.spawnArea({
      pos, kind: 'burn', radius, duration, dps, tick: 0.4,
      element: 'ember', color: ELEMENTS.ember.glow, team: 'player',
    });
  }

  spawnSingularity(pos, radius, duration, damage) {
    this.projectiles.spawnArea({
      pos, kind: 'singularity', radius, duration, dps: damage / duration * 1.6, tick: 0.3,
      element: 'null', color: ELEMENTS.null.glow, team: 'player', pull: 6,
      onEnd: (a) => this.explode(a.pos, radius * 0.9, damage * 0.8, 'null', { source: 'singularity' }),
    });
  }

  enemiesWithin(pos, radius) {
    let n = 0;
    for (const e of this.enemies) if (e.alive && vdist(e.pos, pos) < radius) n++;
    return n;
  }

  nearestEnemy(pos, maxDist = 1e9, filter = null) {
    let best = null, bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.alive || (filter && !filter(e))) continue;
      const d = vdist(e.center(_tmp2), pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** nth-nearest enemy — used by multi-target abilities. */
  nearestEnemyExcluding(pos, maxDist, index) {
    const list = this.enemies
      .filter((e) => e.alive && vdist(e.center(_tmp2), pos) < maxDist)
      .sort((a, b) => vdist(a.center(_tmp2), pos) - vdist(b.center(_tmp2), pos));
    return list[index] || null;
  }

  enemiesInCone(origin, dir, range, minDot) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const c = e.center(_tmp2);
      vsub(c, origin, _tmp3);
      const d = Math.hypot(_tmp3.x, _tmp3.y, _tmp3.z);
      if (d > range + e.radius) continue;
      vnorm(_tmp3, _tmp3);
      if (_tmp3.x * dir.x + _tmp3.y * dir.y + _tmp3.z * dir.z < minDot) continue;
      out.push(e);
    }
    return out;
  }

  // ================================================================ rewards
  onEnemyKilled(enemy, opts = {}) {
    this.player.onKillCredit(enemy, opts);
    if (this.director) this.director.onEnemyKilled(enemy);
    this.runStats.kills++;
    this.profile.stats.kills++;
    this.addXp(enemy.xpValue);
    this.audio.kill(enemy.rank !== 'minor');

    const col = enemy.faction.accent;
    this.fx.burst(enemy.center(_tmp), enemy.rank === 'minor' ? 16 : 40, col,
      { speed: enemy.rank === 'minor' ? 6 : 11, size: 0.11, life: 0.6 });
    if (enemy.rank !== 'minor') {
      this.fx.ring(enemy.pos, enemy.radius * 5, col, 0.5);
      this.fx.addShake(0.25);
      this.ui.killMessage(`${enemy.def.name} defeated`);
    }
    if (enemy.rank === 'boss' || enemy.rank === 'ultra') this.profile.stats.bossKills++;

    // loot and ammo
    const dropChance = { minor: 0.055, major: 0.75, ultra: 1, boss: 1 }[enemy.rank] ?? 0.05;
    if (Math.random() < dropChance) {
      const tier = enemy.rank === 'boss' ? 'powerful' : enemy.rank === 'major' || enemy.rank === 'ultra' ? (Math.random() < 0.3 ? 'powerful' : 'world') : 'world';
      this.dropEngram(enemy.center(_tmp), tier);
    }
    const ammoRoll = Math.random();
    const ammoChance = enemy.rank === 'minor' ? 0.14 : 0.9;
    if (ammoRoll < ammoChance) {
      const heavy = enemy.rank !== 'minor' ? Math.random() < 0.45 : Math.random() < 0.06;
      this.dropAmmo(enemy.center(_tmp), heavy ? 'heavy' : 'special');
    }
    if (enemy.rank === 'boss' && this.director && !this.director.def.endless) {
      setTimeout(() => { if (this.inActivity) this.finishActivity(true, 'Victory'); }, 2600);
    }
  }

  onPlayerDeath() {
    this.runStats.deaths++;
    this.profile.stats.deaths++;
    this.respawnTimer = this.director && this.director.def.endless ? 0 : 5.0;
    if (this.director && this.director.def.endless) {
      setTimeout(() => { if (this.inActivity) this.finishActivity(false, 'You fell'); }, 2200);
    } else {
      this.ui.banner('YOU DIED', 'RESPAWNING');
    }
  }

  addXp(n) {
    this.profile.xp += n;
    this.runStats.xp += n;
    let need = xpForLevel(this.profile.level);
    while (this.profile.xp >= need) {
      this.profile.xp -= need;
      this.profile.level++;
      this.profile.shards += 40;
      this.audio.levelUp();
      this.ui.banner('LEVEL ' + this.profile.level, '+40 SHARDS');
      need = xpForLevel(this.profile.level);
    }
  }

  rollLoot(tier) {
    return rollDrop({
      playerPower: computePower(this.equipped()),
      tier, classId: this.profile.classId,
      luck: tier === 'pinnacle' ? 1.2 : tier === 'powerful' ? 0.5 : 0,
    });
  }

  awardItem(item, silent = false) {
    Save.addItem(this.profile, item);
    this.runStats.rewards.push(item);
    if (item.rarity === 'exotic') this.profile.stats.exoticsFound++;
    if (!silent) { this.audio.loot(item.rarity); this.ui.lootToast(item); }
    else this.ui.lootToast(item);
    return item;
  }

  /** Immediate loot (event/wave rewards) — spawns pickups near `pos`. */
  grantLoot(pos, tier, count = 1) {
    for (let i = 0; i < count; i++) this.dropEngram(pos, tier);
    const shards = tier === 'pinnacle' ? 60 : tier === 'powerful' ? 30 : 12;
    this.profile.shards += shards;
    this.runStats.shards += shards;
  }

  dropEngram(pos, tier) {
    const item = this.rollLoot(tier);
    const gy = this.world.groundY(pos.x, pos.z, pos.y + 2);
    this.engrams.push({
      item, tier,
      pos: v3(pos.x + randRange(-1, 1), Math.max(gy + 0.6, pos.y), pos.z + randRange(-1, 1)),
      vel: v3(randRange(-2, 2), 4.5, randRange(-2, 2)),
      spin: 0, life: 90, grounded: false,
    });
  }

  dropAmmo(pos, type) {
    const gy = this.world.groundY(pos.x, pos.z, pos.y + 2);
    this.ammoDrops.push({
      type, pos: v3(pos.x + randRange(-0.6, 0.6), Math.max(gy + 0.4, pos.y), pos.z + randRange(-0.6, 0.6)),
      vel: v3(randRange(-1.5, 1.5), 3.5, randRange(-1.5, 1.5)), life: 45, spin: 0,
    });
  }

  // ================================================================ loop
  frame = (now) => {
    requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this.fps = lerp(this.fps, 1 / Math.max(dt, 0.0001), 0.08);

    const active = this.state === 'activity' && !this.paused && !this.ui.screen;
    this.dt = active ? dt : 0;
    if (active) this.time += dt;

    if (active) this.update(dt);
    this.audio.update(dt, this.director && this.state === 'activity' ? this.director.intensity() : 0.05);
    this.render();
    this.ui.renderHud(dt);
    this.input.endFrame();
  };

  update(dt) {
    const p = this.player;
    p.update(dt, this.input);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this);
      if (e.def.wall) e.tryWall(this, dt);
      if (!e.alive && e.deathTimer <= 0) this.enemies.splice(i, 1);
    }

    this.projectiles.update(dt);
    this.fx.update(dt);
    this._updatePickups(dt);
    if (this.director) this.director.update(dt);

    // per-frame perk buff expiry is lazy; nothing to do, but keep hooks warm
    if (p.weapon) weaponHooks(p.weapon);

    if (!p.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && this.director && !this.director.def.endless) {
        const spot = this.world.randomNav(Math.random, { near: p.pos, minDist: 24, maxDist: 60 });
        p.respawn(spot, p.yaw);
        this.audio.revive();
        this.ui.banner('REVIVED', '');
      }
    }

    if (this.director && this.director.complete && this.inActivity) {
      this.director.complete = false;
      this.finishActivity(true, 'Victory');
    }
    this.profile.stats.playTime += dt;
    this._autosave -= dt;
    if (this._autosave === undefined || this._autosave <= 0) { this._autosave = 20; this.saveProfile(); }
  }

  _updatePickups(dt) {
    const p = this.player;
    for (let i = this.engrams.length - 1; i >= 0; i--) {
      const e = this.engrams[i];
      e.life -= dt; e.spin += dt * 2.2;
      if (!e.grounded) {
        e.vel.y -= 22 * dt;
        e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
        const gy = this.world.groundY(e.pos.x, e.pos.z, e.pos.y + 0.6) + 0.55;
        if (e.pos.y <= gy) { e.pos.y = gy; e.grounded = true; e.vel.x = e.vel.z = 0; }
      } else {
        e.pos.y += Math.sin(this.time * 2 + e.spin) * dt * 0.25;
      }
      const d = vdist(e.pos, p.center(_tmp));
      if (d < 2.6 && p.alive) {
        this.awardItem(e.item);
        this.fx.burst(e.pos, 16, RARITY[e.item.rarity].color, { speed: 5, size: 0.09, life: 0.5 });
        this.engrams.splice(i, 1);
        continue;
      }
      if (e.life <= 0) this.engrams.splice(i, 1);
    }

    for (let i = this.ammoDrops.length - 1; i >= 0; i--) {
      const a = this.ammoDrops[i];
      a.life -= dt; a.spin += dt * 3;
      a.vel.y -= 22 * dt;
      a.pos.x += a.vel.x * dt; a.pos.y += a.vel.y * dt; a.pos.z += a.vel.z * dt;
      const gy = this.world.groundY(a.pos.x, a.pos.z, a.pos.y + 0.5) + 0.32;
      if (a.pos.y <= gy) { a.pos.y = gy; a.vel.x *= 0.7; a.vel.z *= 0.7; a.vel.y = 0; }
      if (vdistXZ(a.pos, p.pos) < 2.4 && Math.abs(a.pos.y - p.pos.y) < 2.4 && p.alive) {
        const add = a.type === 'heavy' ? 3 : 8;
        const cap = a.type === 'heavy' ? 8 : 24;
        this.player.reserves[a.type] = Math.min(cap, this.player.reserves[a.type] + add);
        for (const s of ['kinetic', 'energy', 'power']) {
          const w = this.player.weapons[s];
          if (w && w.derived.ammoType === a.type) {
            for (const h of weaponHooks(w)) if (h.onAmmoPickup) h.onAmmoPickup(w, this, {});
          }
        }
        this.audio.ammoPickup();
        this.fx.burst(a.pos, 8, a.type === 'heavy' ? [0.75, 0.55, 1] : [0.5, 0.88, 0.54], { speed: 3, size: 0.07, life: 0.35 });
        this.ammoDrops.splice(i, 1);
        continue;
      }
      if (a.life <= 0) this.ammoDrops.splice(i, 1);
    }
  }

  // ================================================================ render
  render() {
    const r = this.renderer;
    const p = this.player;

    r.resize();

    // --- camera
    this.fx.shakeOffset(this.shakeOut);
    const yaw = p.yaw + p.recoilYaw + this.shakeOut.yaw;
    const pitch = clamp(p.pitch + p.recoilPitch + this.shakeOut.pitch, -1.55, 1.55);
    const w = p.weapon;
    const zoom = w ? w.derived.zoom : 1;
    // `fovBase` is a horizontal FOV (what players expect from a slider); convert
    // it to the vertical FOV the projection matrix wants for the current aspect.
    const hFov = this.fovBase * (p.sprinting ? 1.05 : 1) * (p.superActive ? 1.06 : 1);
    const vFovDeg = 2 * Math.atan(Math.tan(hFov * DEG / 2) / Math.max(r.aspect, 0.3)) / DEG;
    const targetFov = vFovDeg / lerp(1, zoom, p.ads);
    this.fovCurrent = lerp(this.fovCurrent, targetFov, 0.22);

    vset(this.camPos, p.pos.x, p.pos.y + p.eyeY + p.bob * 0.045, p.pos.z);
    dirFromAngles(yaw, pitch, this.camFwd);
    vset(this.camRight, Math.cos(yaw), 0, -Math.sin(yaw));
    // up = right × forward
    vset(this.camUp,
      this.camRight.y * this.camFwd.z - this.camRight.z * this.camFwd.y,
      this.camRight.z * this.camFwd.x - this.camRight.x * this.camFwd.z,
      this.camRight.x * this.camFwd.y - this.camRight.y * this.camFwd.x);

    const fovRad = this.fovCurrent * DEG;
    mPerspective(this.proj, fovRad, r.aspect, 0.06, 900);
    mViewFPS(this.view, this.camPos, yaw, pitch, this.shakeOut.roll);
    mMul(this.viewProj, this.proj, this.view);
    r.tanHalfFov = Math.tan(fovRad / 2);

    r.beginFrame(this.camPos, this.camFwd, this.camRight, this.camUp);
    if (this.world) {
      for (const l of this.world.lights) {
        if (vdist(l.pos, this.camPos) < l.radius * 3.5) r.addLight(l.pos, l.color, l.radius, l.intensity);
      }
      for (const e of this.enemies) e.render(r, this);
      this.projectiles.render(r);
      this._renderPickups(r);
      this.fx.render(r);
      if (p.alive) p.render(r, this.camPos, this.camFwd, this.camRight, this.camUp);
      if (p.superActive) r.addLight(this.camPos, ELEMENTS[p.superDef.element].glow, 16, 1.2);
    }
    r.endFrame(this.viewProj);
  }

  _renderPickups(r) {
    for (const e of this.engrams) {
      const col = RARITY[e.item.rarity].color;
      const s = 0.22 + (e.item.rarity === 'exotic' ? 0.1 : 0);
      r.box(e.pos.x, e.pos.y, e.pos.z, s, s, s, e.spin, col, 0.9, true);
      r.box(e.pos.x, e.pos.y, e.pos.z, s * 1.5, s * 0.25, s * 1.5, -e.spin * 0.7, col, 0.7, true);
      r.sprite(e.pos.x, e.pos.y, e.pos.z, s * 3.2, col, 0.35);
      r.addLight(e.pos, col, 7, 1.0);
      // a beam of light so drops are findable across the arena
      _tmp.x = e.pos.x; _tmp.y = e.pos.y; _tmp.z = e.pos.z;
      _tmp2.x = e.pos.x; _tmp2.y = e.pos.y + 3.4; _tmp2.z = e.pos.z;
      r.beam(_tmp, _tmp2, 0.09, col, 0.28);
    }
    for (const a of this.ammoDrops) {
      const col = a.type === 'heavy' ? [0.75, 0.55, 1] : [0.5, 0.88, 0.54];
      r.box(a.pos.x, a.pos.y, a.pos.z, 0.18, 0.1, 0.12, a.spin, col, 0.85, true);
      r.sprite(a.pos.x, a.pos.y, a.pos.z, 0.5, col, 0.3);
      r.addLight(a.pos, col, 4.5, 0.7);
    }
  }
}

const _tmp = v3(), _tmp2 = v3(), _tmp3 = v3();
const _up = v3(0, 1, 0);

// ---------------------------------------------------------------- bootstrap
function start() {
  try {
    window.STARFALL = new Game();
  } catch (err) {
    console.error(err);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:40px;text-align:center;' +
      'font-family:system-ui,sans-serif;color:#d8e4f4;background:#05070d;z-index:99';
    box.innerHTML = `<div><h1 style="letter-spacing:.3em">STARFALL</h1>
      <p style="color:#7f90a8;max-width:520px;line-height:1.6">This game needs WebGL, which your browser did not provide.</p>
      <pre style="color:#ff6b6b;font-size:12px;white-space:pre-wrap;max-width:640px">${String(err && err.message || err)}</pre></div>`;
    document.body.appendChild(box);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

export { Game };
