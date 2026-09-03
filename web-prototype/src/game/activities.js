// Activity definitions and the directors that run them: patrols with public
// events, three-arena strikes with a boss, and an endless survival gauntlet.

import { v3, vdistXZ, clamp01, randRange, weightedPick } from '../core/math.js';
import { SPAWN_TABLES, ENEMIES } from '../data/enemies.js';
import { POWER } from '../data/defs.js';

export const ACTIVITIES = [
  {
    id: 'patrol_rustline', name: 'The Rustline', type: 'Patrol',
    world: { generator: 'patrol', palette: 'rust', seed: 20240 },
    faction: 'severed', power: 100, rewardTier: 'world',
    desc: 'A stripped mining shelf the Severed have made their own. Roam, clear camps, and answer the beacons when they light.',
    unlockPower: 0,
  },
  {
    id: 'patrol_ashfall', name: 'Ashfall Basin', type: 'Patrol',
    world: { generator: 'patrol', palette: 'ash', seed: 55501 },
    faction: 'hollow', power: 160, rewardTier: 'world',
    desc: 'Something under the basin keeps waking up. The Hollow are the symptom, not the cause.',
    unlockPower: 130,
  },
  {
    id: 'strike_sundered', name: 'The Sundered Deep', type: 'Strike',
    world: { generator: 'strike', palette: 'steel', seed: 8801 },
    faction: 'severed', power: 190, rewardTier: 'powerful', boss: 'kell',
    desc: 'Push through three holds and put down Vashek before the Kell finishes rebuilding his crew.',
    unlockPower: 0,
  },
  {
    id: 'strike_ashen', name: 'Ashen Rites', type: 'Strike',
    world: { generator: 'strike', palette: 'ash', seed: 3312 },
    faction: 'hollow', power: 250, rewardTier: 'powerful', boss: 'warpriest',
    desc: 'The Warpriest is mid-ritual. Interrupt him, loudly.',
    unlockPower: 200,
  },
  {
    id: 'ordeal', name: 'Ordeal: The Sundered Deep', type: 'Nightfall',
    world: { generator: 'strike', palette: 'steel', seed: 8801 },
    faction: 'severed', power: 310, rewardTier: 'pinnacle', boss: 'kell',
    modifiers: ['Contest — power advantage is capped', 'Overcharged — enemy shields are doubled', 'Scorched — all enemy damage burns'],
    desc: 'The same run, at a power you have to actually earn. Pinnacle rewards.',
    unlockPower: 280,
  },
  {
    id: 'gauntlet', name: 'The Gauntlet', type: 'Survival',
    world: { generator: 'arena', palette: 'steel', seed: 71,  },
    faction: 'mixed', power: 150, rewardTier: 'powerful',
    desc: 'One arena, endless waves, escalating pressure. Every fifth wave sends a major. Leave whenever — you keep what you earned.',
    unlockPower: 0, endless: true,
  },
];

export function activityById(id) { return ACTIVITIES.find((a) => a.id === id); }

// ---------------------------------------------------------------- base
class Director {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.time = 0;
    this.complete = false;
    this.failed = false;
    this.objective = '';
    this.sub = '';
    this.kills = 0;
    this.score = 0;
    this.rewards = [];
    this.bossRef = null;
  }
  start() {}
  update() {}
  onEnemyKilled(e) { this.kills++; this.score += e.scoreValue || 10; }
  /** How loud the music should be, 0..1. */
  intensity() {
    const g = this.g;
    let n = 0;
    for (const e of g.enemies) if (e.alive && e.aggro) n++;
    return clamp01(n / 7 + (this.bossRef && this.bossRef.alive ? 0.45 : 0));
  }

  spawnGroup(count, opts = {}) {
    const g = this.g;
    const table = SPAWN_TABLES[opts.faction || this.def.faction] || SPAWN_TABLES.severed;
    const out = [];
    for (let i = 0; i < count; i++) {
      const group = opts.group || (Math.random() < 0.14 ? 'special' : 'minor');
      const entry = weightedPick(table[group] || table.minor, Math.random);
      const pos = opts.pos
        ? v3(opts.pos.x + randRange(-6, 6), opts.pos.y, opts.pos.z + randRange(-6, 6))
        : g.world.randomNav(Math.random, {
            near: opts.near || g.player.pos, minDist: opts.minDist ?? 22, maxDist: opts.maxDist ?? 62,
            region: opts.region || null,
          });
      out.push(g.spawnEnemy(entry.id, pos, opts.enemyOpts));
    }
    return out;
  }

  spawnMajor(opts = {}) {
    const g = this.g;
    const table = SPAWN_TABLES[opts.faction || this.def.faction] || SPAWN_TABLES.severed;
    const entry = weightedPick(table.major, Math.random);
    const pos = opts.pos || g.world.randomNav(Math.random, { near: g.player.pos, minDist: 26, maxDist: 50, region: opts.region });
    return g.spawnEnemy(entry.id, pos, opts.enemyOpts);
  }

  aliveCount(filter) {
    let n = 0;
    for (const e of this.g.enemies) if (e.alive && (!filter || filter(e))) n++;
    return n;
  }
}

// ---------------------------------------------------------------- patrol
class PatrolDirector extends Director {
  constructor(g, def) {
    super(g, def);
    this.targetPop = 16;
    this.spawnTimer = 0;
    this.eventTimer = 55;
    this.event = null;
    this.beacon = null;
    this.beaconsDone = 0;
    this.objective = 'Patrol';
    this.sub = 'Clear hostiles · Answer beacons when they light';
  }

  start() {
    this.spawnGroup(10, { minDist: 26, maxDist: 80 });
    this.newBeacon();
  }

  newBeacon() {
    const g = this.g;
    const region = g.world.regions[Math.floor(Math.random() * g.world.regions.length)];
    const pos = g.world.randomNav(Math.random, { near: region.center, maxDist: region.radius * 0.7 });
    this.beacon = { pos, required: 6 + Math.floor(Math.random() * 5), killed: 0, active: false, radius: 22 };
  }

  update(dt) {
    const g = this.g;
    this.time += dt;

    // keep the world populated around the player
    this.spawnTimer -= dt;
    const alive = this.aliveCount();
    if (this.spawnTimer <= 0 && alive < this.targetPop) {
      this.spawnTimer = 2.4;
      this.spawnGroup(Math.min(3, this.targetPop - alive), { minDist: 34, maxDist: 78 });
    }

    // --- beacon
    if (this.beacon) {
      const d = vdistXZ(g.player.pos, this.beacon.pos);
      if (!this.beacon.active && d < this.beacon.radius) {
        this.beacon.active = true;
        g.audio.objective();
        g.ui.banner('BEACON ACTIVE', 'CLEAR THE AREA');
        this.spawnGroup(7, { pos: this.beacon.pos });
        this.spawnMajor({ pos: this.beacon.pos });
      }
      if (this.beacon.active) {
        this.objective = 'Beacon: clear hostiles';
        this.sub = `${this.beacon.killed} / ${this.beacon.required}`;
        if (this.beacon.killed >= this.beacon.required) {
          this.beaconsDone++;
          g.audio.objective();
          g.ui.banner('BEACON SECURED', '+ REWARD');
          g.grantLoot(this.beacon.pos, this.beaconsDone % 3 === 0 ? 'powerful' : 'world', 2);
          this.newBeacon();
        }
      } else {
        this.objective = 'Patrol';
        const dd = Math.round(d);
        this.sub = `Beacon ${dd}m — approach to begin`;
      }
    }

    // --- public event
    this.eventTimer -= dt;
    if (!this.event && this.eventTimer <= 0) this.startEvent();
    if (this.event) this.updateEvent(dt);
  }

  startEvent() {
    const g = this.g;
    const region = g.world.regions[Math.floor(Math.random() * g.world.regions.length)];
    const pos = g.world.randomNav(Math.random, { near: region.center, maxDist: region.radius * 0.5 });
    this.event = { pos, phase: 0, timer: 150, waves: 3, wave: 0, boss: null, radius: 26 };
    g.audio.warn();
    g.ui.banner('PUBLIC EVENT', 'DROP INBOUND');
    g.markWaypoint(pos, 'PUBLIC EVENT');
  }

  updateEvent(dt) {
    const g = this.g;
    const ev = this.event;
    ev.timer -= dt;
    const near = vdistXZ(g.player.pos, ev.pos) < ev.radius;

    if (ev.timer <= 0) {
      g.ui.banner('EVENT FAILED', '');
      g.clearWaypoint();
      this.event = null; this.eventTimer = 120;
      return;
    }
    this.objective = 'Public Event';
    this.sub = `Wave ${Math.min(ev.wave + 1, ev.waves)} / ${ev.waves} · ${Math.ceil(ev.timer)}s`;

    if (!near) return;

    if (ev.phase === 0) {
      ev.phase = 1;
      this.spawnGroup(8, { pos: ev.pos });
      g.audio.objective();
    } else if (ev.phase === 1 && this.aliveCount((e) => vdistXZ(e.pos, ev.pos) < ev.radius * 1.6) === 0) {
      ev.wave++;
      if (ev.wave >= ev.waves) {
        ev.phase = 2;
        ev.boss = this.spawnMajor({ pos: ev.pos, enemyOpts: { hpMul: 2.2 } });
        g.ui.banner('WARLORD INBOUND', '');
        g.audio.warn();
      } else {
        this.spawnGroup(8 + ev.wave * 2, { pos: ev.pos });
        this.spawnMajor({ pos: ev.pos });
      }
    } else if (ev.phase === 2 && (!ev.boss || !ev.boss.alive)) {
      g.ui.banner('EVENT COMPLETE', '+ POWERFUL REWARD');
      g.audio.objective();
      g.grantLoot(ev.pos, 'powerful', 3);
      g.clearWaypoint();
      this.event = null;
      this.eventTimer = 130;
    }
  }

  onEnemyKilled(e) {
    super.onEnemyKilled(e);
    if (this.beacon && this.beacon.active && vdistXZ(e.pos, this.beacon.pos) < this.beacon.radius * 2) {
      this.beacon.killed++;
    }
  }
}

// ---------------------------------------------------------------- strike
class StrikeDirector extends Director {
  constructor(g, def) {
    super(g, def);
    this.stage = 0;
    this.stageState = 'idle';
    this.pending = 0;
    this.waveIndex = 0;
    this.objective = 'Advance';
    this.startTime = 0;
  }

  get region() { return this.g.world.regions[this.stage]; }

  start() {
    this.beginStage(0);
  }

  beginStage(i) {
    const g = this.g;
    this.stage = i;
    this.waveIndex = 0;
    const region = g.world.regions[i];
    if (!region) return;
    if (region.id === 'boss') {
      this.stageState = 'boss';
      this.objective = 'Defeat the boss';
      this.sub = ENEMIES[this.def.boss].name;
      const pos = v3(region.center.x, 0.4, region.center.z - 8);
      const boss = g.spawnEnemy(this.def.boss, pos, {
        hpMul: this.hpMul, damageMul: this.dmgMul,
        onPhase: (b, phase) => this.onBossPhase(b, phase),
      });
      this.bossRef = boss;
      g.setBoss(boss);
      g.ui.banner(ENEMIES[this.def.boss].name.toUpperCase(), 'ENGAGE');
      g.audio.warn();
      this.spawnGroup(6, { region, minDist: 12, maxDist: 30, enemyOpts: { hpMul: this.hpMul, damageMul: this.dmgMul } });
    } else {
      this.stageState = 'clear';
      this.objective = `Clear the hold (${i + 1}/3)`;
      this.sub = '';
      this.spawnWave();
    }
    g.markWaypoint(region.center, region.id === 'boss' ? 'BOSS' : 'ADVANCE');
  }

  get hpMul() { return this.g.enemyHpMul; }
  get dmgMul() { return this.g.enemyDmgMul; }

  spawnWave() {
    const region = this.region;
    const opts = { region, minDist: 14, maxDist: region.radius, enemyOpts: { hpMul: this.hpMul, damageMul: this.dmgMul } };
    const count = 7 + this.stage * 2 + this.waveIndex * 2;
    this.spawnGroup(count, opts);
    if (this.waveIndex >= 1 || this.stage >= 1) this.spawnMajor(opts);
    this.waveIndex++;
  }

  onBossPhase(boss, phase) {
    const g = this.g;
    if (phase.shout) { g.ui.banner(phase.shout, ''); g.audio.warn(); }
    const region = this.g.world.regions[this.g.world.regions.length - 1];
    this.phaseAdds = [];
    for (const id of phase.adds || []) {
      const e = g.spawnEnemy(id, g.world.randomNav(Math.random, { near: region.center, maxDist: region.radius * 0.8 }),
        { hpMul: this.hpMul, damageMul: this.dmgMul });
      this.phaseAdds.push(e);
    }
    if (phase.immuneUntilAddsDead) boss.immune = true;
    else boss.immune = false;
  }

  update(dt) {
    const g = this.g;
    this.time += dt;
    const region = this.region;
    if (!region) return;

    if (this.stageState === 'clear') {
      const inRegion = this.aliveCount((e) => vdistXZ(e.pos, region.center) < region.radius * 1.8);
      this.sub = `Hostiles remaining: ${inRegion}`;
      if (inRegion === 0) {
        if (this.waveIndex < 2 + this.stage) this.spawnWave();
        else {
          this.stageState = 'advance';
          this.objective = 'Advance';
          this.sub = 'The way ahead is clear';
          g.ui.banner('AREA SECURED', 'ADVANCE');
          g.audio.objective();
          g.grantLoot(g.player.pos, 'world', 1);
          const nextRegion = g.world.regions[this.stage + 1];
          if (nextRegion) g.markWaypoint(nextRegion.center, 'ADVANCE');
        }
      }
    } else if (this.stageState === 'advance') {
      const next = g.world.regions[this.stage + 1];
      if (next && vdistXZ(g.player.pos, next.center) < next.radius * 0.85) this.beginStage(this.stage + 1);
    } else if (this.stageState === 'boss') {
      const boss = this.bossRef;
      if (boss && boss.immune && this.phaseAdds && this.phaseAdds.length) {
        const left = this.phaseAdds.filter((e) => e.alive).length;
        this.sub = `Guards remaining: ${left}`;
        if (left === 0) {
          boss.immune = false;
          g.ui.banner('BARRIER DOWN', 'DAMAGE THE BOSS');
          g.audio.objective();
        }
      } else if (boss && boss.alive) {
        this.sub = ENEMIES[this.def.boss].name;
        // trickle adds so the boss room never goes quiet
        this._addTimer = (this._addTimer || 12) - dt;
        if (this._addTimer <= 0 && this.aliveCount() < 12) {
          this._addTimer = 16;
          this.spawnGroup(4, { region: g.world.regions[this.stage], minDist: 16, maxDist: 34,
            enemyOpts: { hpMul: this.hpMul, damageMul: this.dmgMul } });
        }
      }
      if (boss && !boss.alive && !this.complete) {
        this.complete = true;
        g.clearWaypoint();
      }
    }
  }

  intensity() {
    if (this.stageState === 'boss') return 1;
    return super.intensity();
  }
}

// ---------------------------------------------------------------- gauntlet
class GauntletDirector extends Director {
  constructor(g, def) {
    super(g, def);
    this.wave = 0;
    this.state = 'break';
    this.breakTimer = 6;
    this.objective = 'Survive';
    this.bestWave = 0;
  }

  start() { this.objective = 'Survive'; this.sub = 'First wave inbound'; }

  update(dt) {
    const g = this.g;
    this.time += dt;
    if (this.state === 'break') {
      this.breakTimer -= dt;
      this.sub = `Wave ${this.wave + 1} in ${Math.ceil(this.breakTimer)}s`;
      if (this.breakTimer <= 0) this.startWave();
    } else {
      const alive = this.aliveCount();
      this.sub = `Wave ${this.wave} · ${alive} remaining`;
      if (alive === 0) {
        this.state = 'break';
        this.breakTimer = this.wave % 5 === 0 ? 12 : 7;
        g.audio.objective();
        const tier = this.wave % 10 === 0 ? 'pinnacle' : this.wave % 5 === 0 ? 'powerful' : 'world';
        g.ui.banner(`WAVE ${this.wave} CLEARED`, tier === 'world' ? '' : `+ ${tier.toUpperCase()} REWARD`);
        g.grantLoot(g.player.pos, tier, this.wave % 5 === 0 ? 3 : 1);
        g.player.reserves.special = Math.min(24, g.player.reserves.special + 6);
        g.player.reserves.heavy = Math.min(8, g.player.reserves.heavy + 2);
      }
    }
  }

  startWave() {
    const g = this.g;
    this.wave++;
    this.bestWave = Math.max(this.bestWave, this.wave);
    this.state = 'fight';
    // difficulty ramps with the wave number, independent of the base activity power
    const scale = 1 + (this.wave - 1) * 0.16;
    const opts = {
      region: g.world.regions[0], minDist: 16, maxDist: 40,
      faction: this.wave % 2 === 0 ? 'hollow' : 'severed',
      enemyOpts: { hpMul: g.enemyHpMul * scale, damageMul: g.enemyDmgMul * (1 + (this.wave - 1) * 0.06) },
    };
    const count = Math.min(26, 5 + Math.floor(this.wave * 1.6));
    this.spawnGroup(count, opts);
    if (this.wave % 5 === 0) {
      const boss = this.spawnMajor({ ...opts, enemyOpts: { ...opts.enemyOpts, hpMul: opts.enemyOpts.hpMul * 1.8 } });
      this.bossRef = boss;
      g.setBoss(boss);
      g.ui.banner(`WAVE ${this.wave}`, 'MAJOR INBOUND');
      g.audio.warn();
    } else {
      g.ui.banner(`WAVE ${this.wave}`, '');
      if (this.wave >= 3) this.spawnMajor(opts);
    }
    g.player.activityPowerBonus = 0;
  }

  onEnemyKilled(e) {
    super.onEnemyKilled(e);
    this.score += Math.round((e.scoreValue || 10) * (1 + this.wave * 0.1));
  }

  intensity() { return this.state === 'fight' ? clamp01(0.4 + this.aliveCount() / 18) : 0.12; }
}

export function makeDirector(game, def) {
  if (def.type === 'Patrol') return new PatrolDirector(game, def);
  if (def.type === 'Survival') return new GauntletDirector(game, def);
  return new StrikeDirector(game, def);
}

/** Recommended-power helpers used by the director screen. */
export function powerDelta(playerPower, activity) {
  return playerPower - activity.power;
}
export function powerLabel(delta) {
  if (delta >= 10) return { text: 'Advantage', cls: 'over' };
  if (delta >= -10) return { text: 'Matched', cls: '' };
  if (delta >= -40) return { text: 'Underlevelled', cls: 'under' };
  return { text: 'Severely underlevelled', cls: 'under' };
}

export const POWER_REF = POWER;
