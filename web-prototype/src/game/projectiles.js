// Projectiles (rockets, grenades, enemy bolts, thrown knives) and persistent
// area effects (burn pools, vortex wells, singularities, tethers, rifts).
//
// Everything routes damage through the game facade so perks, shields and
// power-level scaling apply in exactly one place.

import { v3, vsub, vmul, vnorm, vlen, vdist, vdistXZ, clamp01, randRange } from '../core/math.js';
import { ELEMENTS } from '../data/defs.js';

export class ProjectileSystem {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.areas = [];
  }

  clear() { this.list.length = 0; this.areas.length = 0; }

  /**
   * Spawn a projectile.
   * `team` is 'player' or 'enemy' and decides what it can hit.
   */
  spawn(opts) {
    const p = {
      pos: v3(opts.pos.x, opts.pos.y, opts.pos.z),
      prev: v3(opts.pos.x, opts.pos.y, opts.pos.z),
      vel: v3(opts.vel.x, opts.vel.y, opts.vel.z),
      team: opts.team || 'player',
      damage: opts.damage || 0,
      element: opts.element || 'kinetic',
      radius: opts.radius ?? 0.22,
      gravity: opts.gravity ?? 0,
      drag: opts.drag ?? 0,
      life: opts.life ?? 6,
      splash: opts.splash || 0,
      splashDamage: opts.splashDamage || 0,
      color: opts.color || ELEMENTS[opts.element || 'kinetic'].glow,
      trail: opts.trail !== false,
      trailSize: opts.trailSize ?? 0.1,
      seek: opts.seek || 0,
      bounce: opts.bounce || 0,
      fuse: opts.fuse || 0,
      sticky: !!opts.sticky,
      crit: opts.crit || 1,
      light: opts.light !== false,
      lightRadius: opts.lightRadius ?? 7,
      size: opts.size ?? 0.16,
      onImpact: opts.onImpact || null,
      onDetonate: opts.onDetonate || null,
      source: opts.source || 'projectile',
      weapon: opts.weapon || null,
      pierce: opts.pierce || 0,
      hitSet: null,
      spin: Math.random() * 6.28,
      dead: false,
    };
    this.list.push(p);
    return p;
  }

  /** Spawn a lingering area effect. */
  spawnArea(opts) {
    const a = {
      pos: v3(opts.pos.x, opts.pos.y, opts.pos.z),
      kind: opts.kind,
      radius: opts.radius || 3,
      life: opts.duration ?? 4,
      max: opts.duration ?? 4,
      dps: opts.dps || 0,
      tick: opts.tick ?? 0.35,
      timer: 0,
      element: opts.element || 'kinetic',
      color: opts.color || ELEMENTS[opts.element || 'kinetic'].glow,
      team: opts.team || 'player',
      pull: opts.pull || 0,
      burst: opts.burst || 0,
      pulses: opts.pulses || 0,
      pulseInterval: opts.pulseInterval || 0.5,
      pulseTimer: 0,
      weaken: opts.weaken || 0,
      heal: opts.heal || 0,
      damageBuff: opts.damageBuff || 0,
      owner: opts.owner || null,
      onTick: opts.onTick || null,
      onEnd: opts.onEnd || null,
      dead: false,
    };
    this.areas.push(a);
    return a;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      this._stepProjectile(p, dt);
      if (p.dead || p.life <= 0) {
        if (!p.dead && p.fuse > 0) this._detonate(p, p.pos, null);
        this.list.splice(i, 1);
      }
    }
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      this._stepArea(a, dt);
      if (a.dead || a.life <= 0) {
        if (a.onEnd) a.onEnd(a);
        this.areas.splice(i, 1);
      }
    }
    void g;
  }

  _stepProjectile(p, dt) {
    const g = this.g;
    p.life -= dt;
    if (p.fuse > 0) {
      p.fuse -= dt;
      if (p.fuse <= 0) { this._detonate(p, p.pos, null); p.dead = true; return; }
    }
    if (p.sticky && p.stuck) {
      // armed mine: detonate when something walks into it
      const t = p.team === 'player' ? this._nearestEnemy(p.pos, p.triggerRadius || 3.2)
                                    : (vdist(p.pos, g.player.pos) < (p.triggerRadius || 3.2) ? g.player : null);
      if (t && p.armTime <= 0) { this._detonate(p, p.pos, t); p.dead = true; }
      p.armTime -= dt;
      return;
    }

    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;

    if (p.seek > 0) {
      const target = p.team === 'player' ? this._nearestEnemy(p.pos, 26) : g.player;
      if (target && (target.alive !== false)) {
        const tp = target.aimPoint ? target.aimPoint(_seekTmp) : target.pos;
        vsub(tp, p.pos, _dir); vnorm(_dir, _dir);
        const speed = vlen(p.vel);
        p.vel.x += (_dir.x * speed - p.vel.x) * clamp01(p.seek * dt * 3);
        p.vel.y += (_dir.y * speed - p.vel.y) * clamp01(p.seek * dt * 3);
        p.vel.z += (_dir.z * speed - p.vel.z) * clamp01(p.seek * dt * 3);
      }
    }

    p.vel.y -= p.gravity * dt;
    if (p.drag) { const d = Math.exp(-p.drag * dt); p.vel.x *= d; p.vel.y *= d; p.vel.z *= d; }

    const step = vmul(p.vel, dt, _step);
    const dist = vlen(step);
    if (dist < 1e-5) return;
    vnorm(step, _dir);

    // --- entity hit test along the segment
    const hit = this._sweepEntities(p, p.prev, _dir, dist);
    if (hit) {
      _hitPos.x = p.prev.x + _dir.x * hit.t;
      _hitPos.y = p.prev.y + _dir.y * hit.t;
      _hitPos.z = p.prev.z + _dir.z * hit.t;
      this._impact(p, _hitPos, hit.entity, hit.crit);
      if (p.dead) return;
    }

    // --- world hit test
    const wall = this.g.world.raycast(p.prev, _dir, dist + p.radius);
    if (wall) {
      _hitPos.x = p.prev.x + _dir.x * wall.t;
      _hitPos.y = p.prev.y + _dir.y * wall.t;
      _hitPos.z = p.prev.z + _dir.z * wall.t;
      if (p.sticky) {
        p.stuck = true;
        p.pos.x = _hitPos.x - _dir.x * 0.15;
        p.pos.y = _hitPos.y - _dir.y * 0.15;
        p.pos.z = _hitPos.z - _dir.z * 0.15;
        p.vel.x = p.vel.y = p.vel.z = 0;
        if (p.onStick) p.onStick(p);
        return;
      }
      if (p.bounce > 0) {
        p.bounce--;
        const n = boxNormal(wall.box, _hitPos, _norm);
        const dot = p.vel.x * n.x + p.vel.y * n.y + p.vel.z * n.z;
        p.vel.x = (p.vel.x - 2 * dot * n.x) * 0.52;
        p.vel.y = (p.vel.y - 2 * dot * n.y) * 0.52;
        p.vel.z = (p.vel.z - 2 * dot * n.z) * 0.52;
        p.pos.x = _hitPos.x + n.x * 0.12;
        p.pos.y = _hitPos.y + n.y * 0.12;
        p.pos.z = _hitPos.z + n.z * 0.12;
        this.g.fx.burst(p.pos, 3, p.color, { speed: 2.5, size: 0.05, life: 0.2 });
        return;
      }
      this._impact(p, _hitPos, null, false);
      return;
    }

    p.pos.x += step.x; p.pos.y += step.y; p.pos.z += step.z;

    if (p.trail) {
      this.g.fx.particle(p.pos.x, p.pos.y, p.pos.z,
        randRange(-0.4, 0.4), randRange(-0.2, 0.6), randRange(-0.4, 0.4),
        { life: 0.28, size: p.trailSize, color: p.color, gravity: -1.2, drag: 3 });
    }
  }

  _impact(p, pos, entity, crit) {
    const g = this.g;
    if (entity) {
      const dmg = p.damage * (crit ? p.crit : 1);
      if (p.team === 'player') {
        g.damageEnemy(entity, dmg, { crit, element: p.element, pos, source: p.source, weapon: p.weapon });
      } else {
        g.damagePlayer(dmg, { element: p.element, pos, source: p.source });
      }
      if (p.pierce > 0) {
        p.pierce--;
        (p.hitSet ||= new Set()).add(entity.id);
        return;
      }
    }
    this._detonate(p, pos, entity);
    p.dead = true;
  }

  _detonate(p, pos, entity) {
    const g = this.g;
    if (p.onImpact) p.onImpact(p, pos, entity);
    if (p.splash > 0) {
      g.explode(pos, p.splash, p.splashDamage, p.element, {
        team: p.team, source: p.source, weapon: p.weapon, exclude: entity,
      });
    } else {
      g.fx.burst(pos, 8, p.color, { speed: 5, size: 0.07, life: 0.3 });
    }
    if (p.onDetonate) p.onDetonate(p, pos);
  }

  /** Segment test against the opposing team's hurt boxes. */
  _sweepEntities(p, origin, dir, dist) {
    const g = this.g;
    if (p.team === 'player') {
      let best = null;
      for (const e of g.enemies) {
        if (!e.alive || (p.hitSet && p.hitSet.has(e.id))) continue;
        const t = e.rayHit(origin, dir, dist + p.radius, p.radius);
        if (t && (!best || t.t < best.t)) best = { t: t.t, crit: t.crit, entity: e };
      }
      return best;
    }
    const pl = g.player;
    if (!pl.alive) return null;
    const t = pl.rayHit(origin, dir, dist + p.radius, p.radius);
    return t ? { t: t.t, crit: false, entity: pl } : null;
  }

  _nearestEnemy(pos, maxDist) {
    return this.g.nearestEnemy(pos, maxDist);
  }

  // ------------------------------------------------------------ areas
  _stepArea(a, dt) {
    const g = this.g;
    a.life -= dt;
    a.timer -= dt;

    if (a.kind === 'pulse') {
      a.pulseTimer -= dt;
      if (a.pulseTimer <= 0 && a.pulses > 0) {
        a.pulses--;
        a.pulseTimer = a.pulseInterval;
        g.explode(a.pos, a.radius, a.burst, a.element, { team: a.team, source: 'grenade', silent: true });
        g.fx.ring(a.pos, a.radius, a.color, 0.35);
        g.audio.ability('grenade', a.element);
        if (a.pulses <= 0) a.life = Math.min(a.life, 0.2);
      }
      return;
    }

    if (a.pull > 0) {
      for (const e of g.enemies) {
        if (!e.alive) continue;
        const d = vdist(e.pos, a.pos);
        if (d > a.radius * 1.9 || d < 0.4) continue;
        vsub(a.pos, e.pos, _dir); vnorm(_dir, _dir);
        const force = a.pull * (1 - d / (a.radius * 1.9)) * dt;
        e.vel.x += _dir.x * force * 12;
        e.vel.z += _dir.z * force * 12;
        if (e.flying) e.vel.y += _dir.y * force * 6;
      }
    }

    if (a.timer <= 0) {
      a.timer = a.tick;
      const dmg = a.dps * a.tick;
      if (a.team === 'player') {
        for (const e of g.enemies) {
          if (!e.alive) continue;
          if (vdist(e.center(_c), a.pos) > a.radius + e.radius) continue;
          if (dmg > 0) g.damageEnemy(e, dmg, { element: a.element, pos: e.center(_c), source: a.kind, tick: true });
          if (a.weaken > 0) e.applyWeaken(a.weaken, 1.2);
          if (a.kind === 'tether') e.applySuppress(0.8);
        }
      } else if (dmg > 0 && vdist(g.player.pos, a.pos) < a.radius + 0.6) {
        g.damagePlayer(dmg, { element: a.element, pos: a.pos, source: a.kind });
      }
      if (a.heal > 0 && vdistXZ(g.player.pos, a.pos) < a.radius && Math.abs(g.player.pos.y - a.pos.y) < 3) {
        g.player.heal(a.heal * a.tick);
      }
      if (a.onTick) a.onTick(a);
    }

    // Rift / ward buffs refresh while the player stands inside.
    if ((a.damageBuff > 0) && vdistXZ(g.player.pos, a.pos) < a.radius && Math.abs(g.player.pos.y - a.pos.y) < 3.2) {
      g.player.applyEmpower(a.damageBuff, 0.4);
    }

    // ambient particles
    if (Math.random() < dt * 26) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * a.radius;
      g.fx.particle(a.pos.x + Math.cos(ang) * rr, a.pos.y + 0.1, a.pos.z + Math.sin(ang) * rr,
        randRange(-0.3, 0.3), a.kind === 'burn' ? randRange(1, 2.4) : randRange(-0.4, 1.2), randRange(-0.3, 0.3),
        { life: 0.6, size: 0.09, color: a.color, gravity: a.kind === 'burn' ? -2.5 : 1.5, drag: 1.2 });
    }
  }

  // ------------------------------------------------------------ render
  render(r) {
    for (const p of this.list) {
      const c = p.color;
      r.sprite(p.pos.x, p.pos.y, p.pos.z, p.size * 1.8, c, 0.85);
      r.box(p.pos.x, p.pos.y, p.pos.z, p.size * 0.55, p.size * 0.55, p.size * 0.55, p.spin, c, 1, true);
      if (p.light) r.addLight(p.pos, c, p.lightRadius, 1.1);
    }
    for (const a of this.areas) {
      const t = clamp01(a.life / a.max);
      const pulse = 0.72 + Math.sin(a.life * 7) * 0.14;
      if (a.kind === 'ward') {
        // hemispherical shell of glowing segments
        const rings = 5;
        for (let i = 1; i <= rings; i++) {
          const ry = (i / (rings + 1)) * Math.PI * 0.5;
          const rr = Math.cos(ry) * a.radius, yy = Math.sin(ry) * a.radius;
          const segs = 22;
          for (let s = 0; s < segs; s += 2) {
            const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
            _p0.x = a.pos.x + Math.cos(a0) * rr; _p0.y = a.pos.y + yy; _p0.z = a.pos.z + Math.sin(a0) * rr;
            _p1.x = a.pos.x + Math.cos(a1) * rr; _p1.y = a.pos.y + yy; _p1.z = a.pos.z + Math.sin(a1) * rr;
            r.beam(_p0, _p1, 0.07, a.color, 0.6 * t + 0.2);
          }
        }
        r.decal(a.pos.x, a.pos.y + 0.05, a.pos.z, a.radius, a.color, 0.16 * pulse);
      } else {
        r.decal(a.pos.x, a.pos.y + 0.05, a.pos.z, a.radius,
          a.color, (a.kind === 'burn' ? 0.22 : 0.3) * pulse * clamp01(t * 2.5));
        const segs = 20;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
          _p0.x = a.pos.x + Math.cos(a0) * a.radius; _p0.y = a.pos.y + 0.08; _p0.z = a.pos.z + Math.sin(a0) * a.radius;
          _p1.x = a.pos.x + Math.cos(a1) * a.radius; _p1.y = a.pos.y + 0.08; _p1.z = a.pos.z + Math.sin(a1) * a.radius;
          r.beam(_p0, _p1, 0.05, a.color, 0.75 * clamp01(t * 3));
        }
      }
      if (a.kind === 'singularity') {
        const s = 0.8 + Math.sin(a.life * 12) * 0.15;
        r.sprite(a.pos.x, a.pos.y + 1.0, a.pos.z, a.radius * 0.28 * s, a.color, 0.9);
      }
      r.addLight(a.pos, a.color, a.radius * 2.4, a.kind === 'burn' ? 1.0 : 0.85);
    }
  }
}

/** Outward face normal of `box` nearest to `p`. */
export function boxNormal(box, p, out) {
  const cx = (box.minx + box.maxx) / 2, cy = (box.miny + box.maxy) / 2, cz = (box.minz + box.maxz) / 2;
  const hx = (box.maxx - box.minx) / 2, hy = (box.maxy - box.miny) / 2, hz = (box.maxz - box.minz) / 2;
  const dx = (p.x - cx) / (hx || 1e-6), dy = (p.y - cy) / (hy || 1e-6), dz = (p.z - cz) / (hz || 1e-6);
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  out.x = out.y = out.z = 0;
  if (ax >= ay && ax >= az) out.x = Math.sign(dx) || 1;
  else if (ay >= az) out.y = Math.sign(dy) || 1;
  else out.z = Math.sign(dz) || 1;
  return out;
}

const _dir = v3(), _step = v3(), _hitPos = v3(), _norm = v3(), _c = v3(), _seekTmp = v3();
const _p0 = v3(), _p1 = v3();
