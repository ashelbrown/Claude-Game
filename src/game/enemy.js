// Enemy units: steering, combat AI, elemental shields, stagger and rendering.
// Bodies come from the data-driven rigs in data/enemies.js and are animated by
// part tag (legL/legR/armL/armR/head/torso/bob/spin).

import {
  v3, vsub, vnorm, vlen, vdist, vdistXZ, clamp, clamp01, lerp, damp, angleDelta,
  randRange, rayAabb, aabb, coneSpread, TAU,
} from '../core/math.js';
import { ENEMIES, FACTIONS, RIGS } from '../data/enemies.js';
import { ELEMENTS, SHIELD_MATCH_MULT, SHIELD_MISMATCH_MULT } from '../data/defs.js';

let NEXT_ID = 1;

export class Enemy {
  constructor(typeId, pos, opts = {}) {
    const def = ENEMIES[typeId];
    if (!def) throw new Error('unknown enemy: ' + typeId);
    this.id = NEXT_ID++;
    this.type = typeId;
    this.def = def;
    this.faction = FACTIONS[def.faction];
    this.rig = RIGS[def.rig];
    this.scale = def.scale || 1;

    this.pos = v3(pos.x, pos.y, pos.z);
    this.vel = v3();
    this.yaw = opts.yaw ?? Math.random() * TAU;
    this.radius = def.radius * this.scale;
    this.height = def.height * this.scale;
    this.flying = !!def.flying;
    this.hoverHeight = def.hover ?? (this.flying ? 1.4 : 0);

    const hpMul = opts.hpMul ?? 1;
    this.maxHp = Math.round(def.hp * hpMul);
    this.hp = this.maxHp;
    this.maxShield = Math.round((def.shield || 0) * hpMul);
    this.shield = this.maxShield;
    this.shieldElement = def.shieldElement || null;
    this.damageMul = opts.damageMul ?? 1;
    this.power = opts.power ?? 100;
    this.rank = def.rank;
    this.alive = true;

    this.state = 'idle';
    this.stateTime = 0;
    this.target = null;
    this.attackTimer = randRange(0, 0.6);
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = randRange(0.6, 2.0);
    this.reposTimer = 0;
    this.goal = null;
    this.staggerAmount = 0;
    this.staggerTimer = 0;
    this.burn = 0;
    this.burnDps = 0;
    this.weaken = 0;
    this.weakenTimer = 0;
    this.suppress = 0;
    this.tetheredBy = null;
    this.blinkTimer = randRange(2, 5);
    this.abilityTimer = randRange(3, 7);
    this.walkPhase = Math.random() * TAU;
    this.bobPhase = Math.random() * TAU;
    this.spawnTime = opts.spawnAnim === false ? 0 : 0.55;
    this.flash = 0;
    this.lastHitTime = -99;
    this.deathTimer = 0;
    this.grounded = false;
    this.telegraph = 0;
    this.beamTimer = 0;
    this.slamTimer = def.slam ? def.slam.cooldown * 0.6 : 0;
    this.phaseIndex = 0;
    this.immune = false;
    this.onPhase = opts.onPhase || null;
    this.isBoss = def.rank === 'boss' || def.rank === 'ultra';
    this.wallBox = null;
    this.wallTimer = def.wall ? def.wall.cooldown : 0;
    this.aggro = false;
    this.leash = opts.leash || null;
    this.xpValue = def.xp;
    this.scoreValue = def.score;
    this.tint = def.tint || [1, 1, 1];
  }

  // ---------------------------------------------------------------- geometry
  center(out = v3()) { out.x = this.pos.x; out.y = this.pos.y + this.height * 0.5; out.z = this.pos.z; return out; }
  aimPoint(out = v3()) { out.x = this.pos.x; out.y = this.pos.y + this.height * 0.62; out.z = this.pos.z; return out; }
  headPoint(out = v3()) {
    const c = this.def.crit;
    out.x = this.pos.x; out.y = this.pos.y + c.y * this.scale; out.z = this.pos.z;
    return out;
  }
  muzzlePoint(out = v3()) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    out.x = this.pos.x + fx * this.radius * 1.3;
    out.y = this.pos.y + this.height * 0.66;
    out.z = this.pos.z + fz * this.radius * 1.3;
    return out;
  }
  bodyAabb(out) {
    out.minx = this.pos.x - this.radius; out.maxx = this.pos.x + this.radius;
    out.miny = this.pos.y; out.maxy = this.pos.y + this.height;
    out.minz = this.pos.z - this.radius; out.maxz = this.pos.z + this.radius;
    return out;
  }

  /** Ray test: crit sphere first (head), then the body box. */
  rayHit(origin, dir, maxT, pad = 0) {
    const c = this.def.crit;
    const cr = c.r * this.scale + pad;
    const hx = this.pos.x, hy = this.pos.y + c.y * this.scale, hz = this.pos.z;
    const tHead = raySphere(origin, dir, hx, hy, hz, cr, maxT);
    this.bodyAabb(_box);
    _box.minx -= pad; _box.maxx += pad; _box.minz -= pad; _box.maxz += pad; _box.maxy += pad;
    const tBody = rayAabb(origin, dir, _box, maxT);
    if (tHead >= 0 && (tBody < 0 || tHead <= tBody + 0.25)) return { t: tHead, crit: true };
    if (tBody >= 0) return { t: tBody, crit: false };
    return null;
  }

  // ---------------------------------------------------------------- damage
  /**
   * Apply damage. Returns { dealt, killed, shieldBroken, blocked }.
   * Elemental shields take triple from a matching element and very little otherwise.
   */
  takeDamage(amount, opts = {}, g = null) {
    if (!this.alive) return { dealt: 0, killed: false };
    if (this.immune && !opts.ignoreImmune) {
      if (g) g.fx.damageText(this.headPoint(_v), 0, { text: 'IMMUNE', color: '#8fb6e0', size: 13 });
      return { dealt: 0, killed: false, blocked: true };
    }
    let dmg = amount * (1 + this.weaken);
    let shieldBroken = false;

    if (this.shield > 0 && !opts.ignoreShield) {
      const match = opts.element && opts.element === this.shieldElement;
      const mult = match ? SHIELD_MATCH_MULT : (opts.element === 'kinetic' ? 1 : SHIELD_MISMATCH_MULT);
      const toShield = dmg * mult;
      if (toShield >= this.shield) {
        const overkillFraction = (toShield - this.shield) / Math.max(mult, 0.001);
        this.shield = 0;
        shieldBroken = true;
        dmg = overkillFraction;
      } else {
        this.shield -= toShield;
        dmg = 0;
      }
    }

    const before = this.hp;
    this.hp -= dmg;
    const dealt = before - Math.max(0, this.hp) + (shieldBroken ? 0 : 0);
    this.flash = 0.09;
    this.lastHitTime = g ? g.time : 0;
    this.aggro = true;

    // Stagger: enough burst damage briefly interrupts the unit.
    const staggerResist = this.def.stagger ?? 1;
    this.staggerAmount += (amount / this.maxHp) * staggerResist;
    if (this.staggerAmount > 0.12 && this.state !== 'dead' && !this.isBoss) {
      this.staggerAmount = 0;
      this.staggerTimer = Math.min(0.55, 0.18 + amount / this.maxHp);
      this.state = 'stagger'; this.stateTime = 0;
    }

    if (this.hp <= 0) { this.die(g, opts); return { dealt, killed: true, shieldBroken }; }
    return { dealt, killed: false, shieldBroken };
  }

  applyWeaken(amount, dur) { this.weaken = Math.max(this.weaken, amount); this.weakenTimer = Math.max(this.weakenTimer, dur); }
  applySuppress(dur) { this.suppress = Math.max(this.suppress, dur); }
  applyBurn(dps, dur) { this.burnDps = Math.max(this.burnDps, dps); this.burn = Math.max(this.burn, dur); }

  die(g, opts = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 1.1;
    if (this.wallBox && g) { g.world.removeDynamic(this.wallBox); this.wallBox = null; }
    if (g) g.onEnemyKilled(this, opts);
  }

  // ---------------------------------------------------------------- update
  update(dt, g) {
    if (this.spawnTime > 0) {
      this.spawnTime -= dt;
      if (Math.random() < dt * 30) {
        g.fx.particle(this.pos.x + randRange(-0.5, 0.5), this.pos.y + Math.random() * this.height,
          this.pos.z + randRange(-0.5, 0.5), 0, randRange(1, 3), 0,
          { life: 0.4, size: 0.08, color: this.faction.accent, gravity: -3, drag: 2 });
      }
      return;
    }
    if (!this.alive) {
      this.deathTimer -= dt;
      this.pos.y += this.vel.y * dt;
      this.vel.y -= 14 * dt;
      const gy = g.world.groundY(this.pos.x, this.pos.z, this.pos.y + 0.4);
      if (this.pos.y < gy) { this.pos.y = gy; this.vel.y = 0; }
      return;
    }

    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.weakenTimer > 0) { this.weakenTimer -= dt; if (this.weakenTimer <= 0) this.weaken = 0; }
    if (this.suppress > 0) this.suppress -= dt;
    if (this.burn > 0) {
      this.burn -= dt;
      this._burnTick = (this._burnTick || 0) - dt;
      if (this._burnTick <= 0) {
        this._burnTick = 0.4;
        g.damageEnemy(this, this.burnDps * 0.4, { element: 'ember', source: 'burn', tick: true, pos: this.center(_v) });
        g.fx.particle(this.pos.x + randRange(-0.3, 0.3), this.pos.y + this.height * 0.6, this.pos.z + randRange(-0.3, 0.3),
          0, randRange(1.2, 2.4), 0, { life: 0.5, size: 0.08, color: ELEMENTS.ember.glow, gravity: -3, drag: 2 });
      }
      if (this.burn <= 0) this.burnDps = 0;
    }
    if (!this.alive) return;

    this.stateTime += dt;
    const player = g.player;
    const seesPlayer = player.alive && !player.invisible &&
      vdist(this.pos, player.pos) < (this.def.aggroRange || 50) &&
      g.world.lineOfSight(this.aimPoint(_v), player.eye());
    if (seesPlayer) { this.aggro = true; this.lastSeen = g.time; this.lastKnown = v3(player.pos.x, player.pos.y, player.pos.z); }

    if (this.suppress > 0) {
      this.state = 'suppressed';
    } else if (this.state === 'stagger') {
      this.staggerTimer -= dt;
      if (this.staggerTimer <= 0) { this.state = this.aggro ? 'combat' : 'idle'; this.stateTime = 0; }
    } else if (this.aggro) {
      this.state = 'combat';
    }

    this._steer(dt, g, seesPlayer);
    this._attack(dt, g, seesPlayer);
    this._physics(dt, g);
    this._animate(dt);
    if (this.isBoss) this._bossThink(dt, g);
  }

  // ------------------------------------------------------------ movement
  _steer(dt, g, seesPlayer) {
    const player = g.player;
    const ai = this.def.ai;
    let desiredX = 0, desiredZ = 0;
    const speed = this.def.speed * (this.state === 'suppressed' ? 0 : 1) * (this.weaken > 0 ? 0.85 : 1);

    if (this.state === 'stagger' || this.state === 'suppressed') {
      this.vel.x = damp(this.vel.x, 0, 9, dt);
      this.vel.z = damp(this.vel.z, 0, 9, dt);
      return;
    }

    const to = vsub(player.pos, this.pos, _to);
    const dist = Math.hypot(to.x, to.z) || 1;
    const fwdX = to.x / dist, fwdZ = to.z / dist;

    if (!this.aggro) {
      // idle drift around the spawn point
      this.reposTimer -= dt;
      if (this.reposTimer <= 0 || !this.goal) {
        this.reposTimer = randRange(3, 7);
        this.goal = g.world.randomNav(Math.random, { near: this.pos, minDist: 3, maxDist: 16 });
      }
      const gd = vsub(this.goal, this.pos, _goal);
      const gl = Math.hypot(gd.x, gd.z) || 1;
      desiredX = (gd.x / gl) * 0.35; desiredZ = (gd.z / gl) * 0.35;
    } else if (ai === 'melee') {
      desiredX = fwdX; desiredZ = fwdZ;
      if (this.def.swarm) {
        // swarmers fan out so they don't stack into a single column
        const ang = (this.id % 7) / 7 * 1.4 - 0.7;
        const c = Math.cos(ang), s = Math.sin(ang);
        const nx = fwdX * c - fwdZ * s, nz = fwdX * s + fwdZ * c;
        desiredX = lerp(desiredX, nx, 0.6); desiredZ = lerp(desiredZ, nz, 0.6);
      }
      if (dist < this.def.melee.range * 0.75) { desiredX *= -0.4; desiredZ *= -0.4; }
    } else {
      const preferred = this.def.preferredRange ?? (ai === 'sniper' ? 45 : ai === 'caster' ? 22 : 16);
      const err = dist - preferred;
      const approach = clamp(err / 10, -1, 1);
      desiredX = fwdX * approach; desiredZ = fwdZ * approach;

      // strafe perpendicular to the player
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = randRange(0.9, 2.4); this.strafeDir *= -1; }
      const strafe = (this.def.strafe ?? 0.5) * this.strafeDir * (seesPlayer ? 1 : 0.3);
      desiredX += -fwdZ * strafe; desiredZ += fwdX * strafe;

      // break line of sight to reposition when hurt
      if (!seesPlayer && this.lastKnown) {
        const lk = vsub(this.lastKnown, this.pos, _goal);
        const ll = Math.hypot(lk.x, lk.z) || 1;
        desiredX = lerp(desiredX, lk.x / ll, 0.7); desiredZ = lerp(desiredZ, lk.z / ll, 0.7);
      }
    }

    // obstacle avoidance: probe ahead and slide around blockers
    const dl = Math.hypot(desiredX, desiredZ);
    if (dl > 0.001) {
      desiredX /= dl; desiredZ /= dl;
      const probe = 2.2 + this.radius;
      _probeDir.x = desiredX; _probeDir.y = 0; _probeDir.z = desiredZ;
      _probeOrigin.x = this.pos.x; _probeOrigin.y = this.pos.y + this.height * 0.5; _probeOrigin.z = this.pos.z;
      if (g.world.raycast(_probeOrigin, _probeDir, probe)) {
        // try 55° either way, keep the first that clears
        for (const sgn of [this.strafeDir, -this.strafeDir]) {
          const a = 0.95 * sgn;
          const nx = desiredX * Math.cos(a) - desiredZ * Math.sin(a);
          const nz = desiredX * Math.sin(a) + desiredZ * Math.cos(a);
          _probeDir.x = nx; _probeDir.z = nz;
          if (!g.world.raycast(_probeOrigin, _probeDir, probe)) { desiredX = nx; desiredZ = nz; break; }
        }
      }
      // separation from crowded neighbours
      let sx = 0, sz = 0;
      for (const o of g.enemies) {
        if (o === this || !o.alive) continue;
        const ddx = this.pos.x - o.pos.x, ddz = this.pos.z - o.pos.z;
        const d2 = ddx * ddx + ddz * ddz;
        const want = (this.radius + o.radius) * 1.5;
        if (d2 < want * want && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          sx += (ddx / d) * (1 - d / want); sz += (ddz / d) * (1 - d / want);
        }
      }
      desiredX += sx * 1.4; desiredZ += sz * 1.4;
      const fl = Math.hypot(desiredX, desiredZ) || 1;
      desiredX /= fl; desiredZ /= fl;
    }

    const accel = this.def.accel * dt;
    this.vel.x += (desiredX * speed - this.vel.x) * clamp01(accel / Math.max(speed, 0.001));
    this.vel.z += (desiredZ * speed - this.vel.z) * clamp01(accel / Math.max(speed, 0.001));

    // face the player when engaged, otherwise face travel
    const faceX = this.aggro ? -fwdX : -this.vel.x;
    const faceZ = this.aggro ? -fwdZ : -this.vel.z;
    if (Math.hypot(faceX, faceZ) > 0.05) {
      const want = Math.atan2(faceX, faceZ);
      this.yaw += angleDelta(this.yaw, want) * clamp01(dt * (this.aggro ? 9 : 3));
    }
  }

  _physics(dt, g) {
    const world = g.world;
    // XZ move with per-axis resolution against level geometry
    const r = this.radius;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const feet = this.pos.y;

    world.query(Math.min(nx, this.pos.x) - r - 1, Math.min(nz, this.pos.z) - r - 1,
                Math.max(nx, this.pos.x) + r + 1, Math.max(nz, this.pos.z) + r + 1, _near);

    const stepUp = this.flying ? 0 : 0.62;
    for (const b of _near) {
      if (b.maxy <= feet + stepUp || b.miny >= feet + this.height) continue;
      if (nx + r > b.minx && nx - r < b.maxx && this.pos.z + r > b.minz && this.pos.z - r < b.maxz) {
        nx = this.vel.x > 0 ? b.minx - r - 0.001 : b.maxx + r + 0.001;
        this.vel.x = 0;
      }
      if (this.pos.x + r > b.minx && this.pos.x - r < b.maxx && nz + r > b.minz && nz - r < b.maxz) {
        nz = this.vel.z > 0 ? b.minz - r - 0.001 : b.maxz + r + 0.001;
        this.vel.z = 0;
      }
    }
    this.pos.x = nx; this.pos.z = nz;
    world.clampToBounds(this.pos, this.radius + 0.5);

    if (this.flying) {
      const gy = world.groundY(this.pos.x, this.pos.z, this.pos.y + 3);
      const want = gy + this.hoverHeight + Math.sin(this.bobPhase) * 0.28;
      this.pos.y = damp(this.pos.y, want, 4, dt);
    } else {
      const gy = world.groundY(this.pos.x, this.pos.z, this.pos.y + 0.7);
      if (this.pos.y > gy + 0.05) {
        this.vel.y -= 26 * dt;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.grounded = true; }
        else this.grounded = false;
      } else {
        this.pos.y = damp(this.pos.y, gy, 18, dt);
        this.vel.y = 0; this.grounded = true;
      }
    }
  }

  _animate(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * (2.2 + sp * 1.5);
    this.bobPhase += dt * 2.2;
    this.animSpeed = clamp01(sp / Math.max(this.def.speed, 0.01));
  }

  // ------------------------------------------------------------ attacks
  _attack(dt, g, seesPlayer) {
    if (this.state === 'stagger' || this.state === 'suppressed' || !this.aggro) return;
    const player = g.player;
    const def = this.def;
    this.attackTimer -= dt;

    if (def.ai === 'melee') {
      const d = vdist(this.pos, player.pos);
      if (d < def.melee.range && this.attackTimer <= 0) {
        this.attackTimer = def.melee.rate + def.melee.windup;
        this.meleeWindup = def.melee.windup;
        this.state = 'attack';
      }
      if (this.meleeWindup > 0) {
        this.meleeWindup -= dt;
        if (this.meleeWindup <= 0) {
          if (vdist(this.pos, player.pos) < def.melee.range * 1.35) {
            g.damagePlayer(def.melee.damage * this.damageMul, { source: 'melee', pos: this.pos, enemy: this });
          }
          g.fx.burst(this.muzzlePoint(_v), 6, this.faction.accent, { speed: 5, size: 0.07, life: 0.25 });
          g.audio.hit(false);
        }
      }
      return;
    }

    if (!seesPlayer) return;

    if (def.ai === 'sniper') {
      if (this.telegraph > 0) {
        this.telegraph -= dt;
        this.laserTo = player.eye();
        if (this.telegraph <= 0) {
          this._hitscan(g, def.weapon.damage * this.damageMul, def.weapon.range);
          this.attackTimer = def.weapon.rate;
        }
      } else if (this.attackTimer <= 0) {
        this.telegraph = def.weapon.telegraph;
        g.audio.ui('error');
      }
      return;
    }

    if (def.weapon && def.weapon.beam) {
      if (this.attackTimer <= 0) {
        this.attackTimer = def.weapon.rate;
        this._beamTick(g, def.weapon);
      }
      return;
    }

    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstLeft--;
        this.burstTimer = def.weapon.burstDelay || 0.1;
        this._shoot(g, def.weapon);
      }
      return;
    }
    if (this.attackTimer <= 0 && vdist(this.pos, player.pos) < def.weapon.range) {
      this.attackTimer = def.weapon.rate;
      this.burstLeft = def.weapon.burst || 1;
      this.burstTimer = 0;
    }
  }

  _shoot(g, w) {
    const from = this.muzzlePoint(_v);
    const to = g.player.eye(_v2);
    vsub(to, from, _dir); vnorm(_dir, _dir);
    coneSpread(_dir, w.spread || 0.02, Math.random, _dir);
    g.projectiles.spawn({
      pos: from, vel: { x: _dir.x * w.speed, y: _dir.y * w.speed, z: _dir.z * w.speed },
      team: 'enemy', damage: w.damage * this.damageMul, element: this.faction === FACTIONS.hollow ? 'null' : 'ember',
      color: w.color, size: 0.13, trailSize: 0.08, gravity: 0, life: 5,
      splash: w.splash || 0, splashDamage: w.splash ? w.damage * 0.6 * this.damageMul : 0,
      seek: w.seek || 0, source: 'enemyShot', lightRadius: 5,
    });
    g.fx.burst(from, 3, w.color, { speed: 3, size: 0.06, life: 0.16 });
    g.audio.fire(this.rank === 'minor' ? 'smg' : 'auto', 0.8, g.panFor(this.pos));
  }

  _hitscan(g, damage, range) {
    const from = this.muzzlePoint(_v);
    const to = g.player.eye(_v2);
    vsub(to, from, _dir);
    const dist = vlen(_dir);
    vnorm(_dir, _dir);
    const wall = g.world.raycast(from, _dir, Math.min(dist, range));
    _end.x = from.x + _dir.x * (wall ? wall.t : dist);
    _end.y = from.y + _dir.y * (wall ? wall.t : dist);
    _end.z = from.z + _dir.z * (wall ? wall.t : dist);
    g.fx.tracer(from, _end, [1, 0.35, 0.3], 0.14, 0.05);
    if (!wall && dist <= range) {
      g.damagePlayer(damage * this.damageMul, { source: 'sniper', pos: from, enemy: this });
    }
    g.audio.fire('sniper', 1.2, g.panFor(this.pos));
    g.fx.burst(from, 5, [1, 0.4, 0.3], { speed: 6, size: 0.07, life: 0.2 });
  }

  _beamTick(g, w) {
    const from = this.muzzlePoint(_v);
    const to = g.player.eye(_v2);
    vsub(to, from, _dir);
    const dist = vlen(_dir);
    if (dist > w.range) return;
    vnorm(_dir, _dir);
    if (!g.world.lineOfSight(from, to)) return;
    g.fx.tracer(from, to, w.color, 0.12, 0.07);
    g.damagePlayer(w.damage * this.damageMul, { source: 'beam', pos: from, enemy: this, continuous: true });
  }

  // ------------------------------------------------------------ boss logic
  _bossThink(dt, g) {
    const def = this.def;

    // phase gates
    if (def.phases) {
      const frac = this.hp / this.maxHp;
      const next = def.phases[this.phaseIndex + 1];
      if (next && frac <= next.at) {
        this.phaseIndex++;
        this.immune = !!next.immune;
        if (this.onPhase) this.onPhase(this, next, this.phaseIndex);
      }
    }

    if (def.slam) {
      this.slamTimer -= dt;
      if (this.slamTimer <= 0 && vdist(this.pos, g.player.pos) < def.slam.radius * 1.4) {
        this.slamTimer = def.slam.cooldown;
        this.slamWindup = def.slam.windup;
        g.fx.ring(this.pos, def.slam.radius, [1, 0.4, 0.2], def.slam.windup, { from: def.slam.radius * 0.95 });
        g.audio.warn();
      }
      if (this.slamWindup > 0) {
        this.slamWindup -= dt;
        if (this.slamWindup <= 0) {
          g.explode(this.pos, def.slam.radius, def.slam.damage * this.damageMul, 'kinetic',
            { team: 'enemy', source: 'slam' });
          g.fx.addShake(0.9);
        }
      }
    }

    if (def.blink) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && vdist(this.pos, g.player.pos) > 14) {
        this.blinkTimer = def.blink.cooldown;
        const dest = g.world.randomNav(Math.random, { near: g.player.pos, minDist: 8, maxDist: def.blink.range });
        g.fx.burst(this.center(_v), 22, this.faction.accent, { speed: 9, size: 0.11, life: 0.5 });
        this.pos.x = dest.x; this.pos.z = dest.z; this.pos.y = dest.y + 0.05;
        g.fx.burst(this.center(_v), 22, this.faction.accent, { speed: 9, size: 0.11, life: 0.5 });
        g.audio.ability('class', 'null');
      }
    }
  }

  /** Majors can raise a temporary shield wall between themselves and the player. */
  tryWall(g, dt) {
    const def = this.def;
    if (!def.wall) return;
    this.wallTimer -= dt;
    if (this.wallBox) {
      this.wallLife -= dt;
      if (this.wallLife <= 0) { g.world.removeDynamic(this.wallBox); this.wallBox = null; }
      return;
    }
    if (this.wallTimer <= 0 && vdist(this.pos, g.player.pos) < 26) {
      this.wallTimer = def.wall.cooldown;
      this.wallLife = def.wall.duration;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const cx = this.pos.x + fx * 2.2, cz = this.pos.z + fz * 2.2;
      this.wallBox = g.world.addDynamic({
        minx: cx - 1.9, maxx: cx + 1.9, miny: this.pos.y, maxy: this.pos.y + 2.4,
        minz: cz - 0.35, maxz: cz + 0.35, color: this.faction.accent, emissive: 0.7, solid: true,
        yaw: this.yaw, temp: true,
      });
      g.audio.ability('class', 'ember');
    }
  }

  // ------------------------------------------------------------ render
  render(r, g) {
    const f = this.faction;
    const dead = !this.alive;
    const spawn = this.spawnTime > 0 ? 1 - this.spawnTime / 0.55 : 1;
    if (spawn < 0.02) return;

    const walk = Math.sin(this.walkPhase) * (this.animSpeed || 0) * 0.55;
    const walk2 = Math.sin(this.walkPhase + Math.PI) * (this.animSpeed || 0) * 0.55;
    const bob = Math.sin(this.bobPhase) * 0.06;
    const deathTilt = dead ? clamp01(1 - this.deathTimer / 1.1) * 1.35 : 0;
    const flash = this.flash > 0 ? this.flash * 6 : 0;
    const s = this.scale * (this.spawnTime > 0 ? 0.4 + spawn * 0.6 : 1);
    const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);

    const colorFor = (tag) => {
      let base = tag === 'accent' ? f.accent : tag === 'eye' ? f.eye : tag === 'cloth' ? f.cloth : f.body;
      if (tag === 'body' || tag === 'cloth') {
        base = [base[0] * this.tint[0], base[1] * this.tint[1], base[2] * this.tint[2]];
      }
      if (flash > 0) base = [base[0] + flash, base[1] + flash * 0.9, base[2] + flash * 0.8];
      if (this.weaken > 0) base = [base[0] * 0.8, base[1] * 0.7, base[2] * 1.15];
      return base;
    };

    for (const part of this.rig) {
      let ox = part.off[0], oy = part.off[1], oz = part.off[2];
      let extraYaw = 0;
      switch (part.anim) {
        case 'legL': oz += walk * 0.34; oy -= Math.abs(walk) * 0.06; break;
        case 'legR': oz += walk2 * 0.34; oy -= Math.abs(walk2) * 0.06; break;
        case 'armL': oz += walk2 * 0.3; break;
        case 'armR': oz += walk * 0.3; break;
        case 'head': oy += bob * 0.4; break;
        case 'torso': oy += bob; break;
        case 'bob': oy += Math.sin(this.bobPhase * 1.6) * 0.16; break;
        case 'spinL': extraYaw = this.bobPhase * 3; break;
        case 'spinR': extraYaw = -this.bobPhase * 3; break;
        default: break;
      }
      if (deathTilt > 0) { oy *= Math.max(0.15, 1 - deathTilt); oz += deathTilt * 0.5; }

      const px = this.pos.x + (ox * cs + oz * sn) * s;
      const py = this.pos.y + oy * s;
      const pz = this.pos.z + (-ox * sn + oz * cs) * s;
      const em = part.glow ? part.glow * (dead ? 0.2 : 1) : 0;
      r.box(px, py, pz, part.size[0] * s, part.size[1] * s, part.size[2] * s,
        this.yaw + extraYaw, colorFor(part.color), em, false);
    }

    if (!dead) {
      // eye light + shield bubble
      this.headPoint(_v);
      r.addLight(_v, f.eye, 4.5, 0.5);
      if (this.shield > 0) {
        const el = ELEMENTS[this.shieldElement] || ELEMENTS.null;
        const frac = this.shield / this.maxShield;
        const rad = (this.radius + 0.34) * (0.9 + frac * 0.25);
        const segs = 16;
        const yTop = this.pos.y + this.height * 0.55;
        for (let ring = 0; ring < 3; ring++) {
          const ry = yTop + (ring - 1) * this.height * 0.3;
          const rr = rad * Math.cos((ring - 1) * 0.7);
          for (let i = 0; i < segs; i += 2) {
            const a0 = (i / segs) * TAU + this.bobPhase * 0.4;
            const a1 = ((i + 1) / segs) * TAU + this.bobPhase * 0.4;
            _p0.x = this.pos.x + Math.cos(a0) * rr; _p0.y = ry; _p0.z = this.pos.z + Math.sin(a0) * rr;
            _p1.x = this.pos.x + Math.cos(a1) * rr; _p1.y = ry; _p1.z = this.pos.z + Math.sin(a1) * rr;
            r.beam(_p0, _p1, 0.045, el.glow, 0.55 * frac + 0.2);
          }
        }
        r.addLight(this.center(_v), el.glow, 7, 0.7);
      }
      if (this.immune) {
        const segs = 18;
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * TAU + this.bobPhase, a1 = ((i + 0.5) / segs) * TAU + this.bobPhase;
          const rr = this.radius + 0.7;
          _p0.x = this.pos.x + Math.cos(a0) * rr; _p0.y = this.pos.y + 0.2; _p0.z = this.pos.z + Math.sin(a0) * rr;
          _p1.x = this.pos.x + Math.cos(a1) * rr; _p1.y = this.pos.y + this.height; _p1.z = this.pos.z + Math.sin(a1) * rr;
          r.beam(_p0, _p1, 0.05, [0.6, 0.8, 1], 0.5);
        }
      }
      if (this.telegraph > 0 && this.laserTo) {
        const t = 1 - this.telegraph / (this.def.weapon.telegraph || 1);
        r.beam(this.muzzlePoint(_v), this.laserTo, 0.012 + t * 0.02, [1, 0.25, 0.2], 0.35 + t * 0.5);
      }
      if (this.wallBox) {
        const b = this.wallBox;
        r.box((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2, (b.minz + b.maxz) / 2,
          (b.maxx - b.minx) / 2, (b.maxy - b.miny) / 2, (b.maxz - b.minz) / 2,
          0, f.accent, 0.8, true);
      }
      if (this.slamWindup > 0) {
        r.decal(this.pos.x, this.pos.y + 0.08, this.pos.z, this.def.slam.radius, [1, 0.35, 0.15], 0.25);
      }
    }
  }
}

/** Ray/sphere intersection; returns the near hit distance or -1. */
function raySphere(ro, rd, cx, cy, cz, radius, maxT) {
  const ox = ro.x - cx, oy = ro.y - cy, oz = ro.z - cz;
  const b = ox * rd.x + oy * rd.y + oz * rd.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  if (t < 0 || t > maxT) return -1;
  return t;
}

const _v = v3(), _v2 = v3(), _dir = v3(), _to = v3(), _goal = v3(), _end = v3();
const _p0 = v3(), _p1 = v3();
const _probeDir = v3(), _probeOrigin = v3();
const _box = aabb(0, 0, 0, 0, 0, 0);
const _near = [];
