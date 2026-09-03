// Particles, expanding rings, tracers, floating damage text and screen shake.
// World-space text is stored here and projected by the HUD each frame.

import { v3, clamp01, lerp, randRange } from '../core/math.js';

const MAX_PARTICLES = 1400;

export class Effects {
  constructor() {
    this.particles = [];
    this.rings = [];
    this.tracers = [];
    this.texts = [];
    this.shake = 0;
    this.shakeSeed = Math.random() * 1000;
    this.hitmarkers = [];
    this.time = 0;
    // reuse dead particles rather than allocating every shot
    this.pool = [];
  }

  _get() {
    if (this.pool.length) return this.pool.pop();
    return { pos: v3(), vel: v3(), life: 0, max: 1, size: 0.1, color: [1, 1, 1], grav: 0, drag: 0, fade: 1 };
  }

  particle(x, y, z, vx, vy, vz, opts = {}) {
    if (this.particles.length >= MAX_PARTICLES) return;
    const p = this._get();
    p.pos.x = x; p.pos.y = y; p.pos.z = z;
    p.vel.x = vx; p.vel.y = vy; p.vel.z = vz;
    p.max = p.life = opts.life ?? 0.5;
    p.size = opts.size ?? 0.09;
    p.color = opts.color || [1, 1, 1];
    p.grav = opts.gravity ?? 9;
    p.drag = opts.drag ?? 1.6;
    p.fade = opts.fade ?? 1;
    p.shrink = opts.shrink ?? 1;
    this.particles.push(p);
  }

  /** Radial spray — the workhorse for impacts, deaths and explosions. */
  burst(pos, count, color, opts = {}) {
    const speed = opts.speed ?? 6;
    const spread = opts.spread ?? 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(1 - 2 * Math.random());
      const s = speed * (0.3 + Math.random() * 0.9);
      const dx = Math.sin(b) * Math.cos(a), dy = Math.cos(b), dz = Math.sin(b) * Math.sin(a);
      this.particle(
        pos.x + dx * spread * 0.2, pos.y + dy * spread * 0.2, pos.z + dz * spread * 0.2,
        dx * s + (opts.vx || 0), dy * s * (opts.up ?? 1) + (opts.vy || 0), dz * s + (opts.vz || 0),
        { life: (opts.life ?? 0.6) * (0.55 + Math.random() * 0.8), size: (opts.size ?? 0.1) * (0.6 + Math.random()),
          color, gravity: opts.gravity ?? 9, drag: opts.drag ?? 1.8 });
    }
  }

  /** Cone of sparks along a surface normal — bullet impacts. */
  impact(pos, normal, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const s = 3 + Math.random() * 7;
      this.particle(pos.x, pos.y, pos.z,
        (normal.x + randRange(-0.7, 0.7)) * s,
        (normal.y + randRange(-0.7, 0.7)) * s + 1,
        (normal.z + randRange(-0.7, 0.7)) * s,
        { life: 0.18 + Math.random() * 0.25, size: 0.05, color, gravity: 14, drag: 3 });
    }
  }

  /** Expanding, fading ground ring (explosions, ability markers). */
  ring(pos, radius, color, life = 0.45, opts = {}) {
    this.rings.push({
      pos: v3(pos.x, pos.y + (opts.yOffset ?? 0.06), pos.z),
      r0: opts.from ?? 0.4, r1: radius, life, max: life,
      color, vertical: !!opts.vertical, width: opts.width ?? 1,
    });
  }

  /** Short-lived line — bullet tracers, chain lightning, beams. */
  tracer(a, b, color, life = 0.06, width = 0.035) {
    this.tracers.push({ a: v3(a.x, a.y, a.z), b: v3(b.x, b.y, b.z), color, life, max: life, width });
  }

  /** Jagged multi-segment bolt between two points. */
  lightning(a, b, color, segments = 6, life = 0.12) {
    let prev = a;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === segments ? 0 : 0.55;
      const p = v3(
        lerp(a.x, b.x, t) + randRange(-jitter, jitter),
        lerp(a.y, b.y, t) + randRange(-jitter, jitter),
        lerp(a.z, b.z, t) + randRange(-jitter, jitter));
      this.tracer(prev, p, color, life, 0.05);
      prev = p;
    }
  }

  /** Floating combat text, projected to screen space by the HUD. */
  damageText(pos, amount, opts = {}) {
    if (this.texts.length > 90) this.texts.shift();
    this.texts.push({
      pos: v3(pos.x + randRange(-0.2, 0.2), pos.y + randRange(-0.1, 0.2), pos.z + randRange(-0.2, 0.2)),
      vel: v3(randRange(-0.5, 0.5), 2.2 + Math.random(), randRange(-0.5, 0.5)),
      text: opts.text || String(Math.round(amount)),
      color: opts.color || '#ffffff',
      size: opts.size || (opts.crit ? 21 : 15),
      life: opts.life ?? 1.0, max: opts.life ?? 1.0,
      crit: !!opts.crit,
    });
  }

  hitmarker(crit = false, kill = false) {
    this.hitmarkers.push({ life: kill ? 0.4 : 0.22, max: kill ? 0.4 : 0.22, crit, kill });
  }

  addShake(amount) { this.shake = Math.min(1.6, this.shake + amount); }

  /** Sampled camera shake offset — smooth, not jittery noise. */
  shakeOffset(out) {
    const s = this.shake * this.shake;
    const t = this.time * 34;
    out.yaw = Math.sin(t * 1.7 + this.shakeSeed) * 0.016 * s;
    out.pitch = Math.sin(t * 2.3 + this.shakeSeed * 1.7) * 0.014 * s;
    out.roll = Math.sin(t * 1.1 + this.shakeSeed * 0.7) * 0.02 * s;
    return out;
  }

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.4);

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1]; ps.pop();
        if (this.pool.length < 600) this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vel.x *= d; p.vel.z *= d; p.vel.y = p.vel.y * d - p.grav * dt;
      p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
      if (p.pos.y < 0.03) { p.pos.y = 0.03; p.vel.y *= -0.28; p.vel.x *= 0.6; p.vel.z *= 0.6; }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.pos.x += t.vel.x * dt; t.pos.y += t.vel.y * dt; t.pos.z += t.vel.z * dt;
      t.vel.y -= 3.4 * dt;
      t.vel.x *= 0.94; t.vel.z *= 0.94;
    }
    for (let i = this.hitmarkers.length - 1; i >= 0; i--) {
      this.hitmarkers[i].life -= dt;
      if (this.hitmarkers[i].life <= 0) this.hitmarkers.splice(i, 1);
    }
  }

  render(r) {
    for (const p of this.particles) {
      const t = clamp01(p.life / p.max);
      const alpha = Math.pow(t, p.fade);
      r.sprite(p.pos.x, p.pos.y, p.pos.z, p.size * lerp(p.shrink, 1, t), p.color, alpha);
    }
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.max;
      const rad = lerp(ring.r0, ring.r1, Math.sqrt(t));
      const alpha = (1 - t) * 0.9;
      const segs = 26;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        if (ring.vertical) {
          _p0.x = ring.pos.x + Math.cos(a0) * rad; _p0.y = ring.pos.y + Math.sin(a0) * rad; _p0.z = ring.pos.z;
          _p1.x = ring.pos.x + Math.cos(a1) * rad; _p1.y = ring.pos.y + Math.sin(a1) * rad; _p1.z = ring.pos.z;
        } else {
          _p0.x = ring.pos.x + Math.cos(a0) * rad; _p0.y = ring.pos.y; _p0.z = ring.pos.z + Math.sin(a0) * rad;
          _p1.x = ring.pos.x + Math.cos(a1) * rad; _p1.y = ring.pos.y; _p1.z = ring.pos.z + Math.sin(a1) * rad;
        }
        r.beam(_p0, _p1, 0.06 * ring.width, ring.color, alpha);
      }
    }
    for (const t of this.tracers) {
      const a = clamp01(t.life / t.max);
      r.beam(t.a, t.b, t.width, t.color, a);
    }
  }

  clear() {
    this.particles.length = 0; this.rings.length = 0;
    this.tracers.length = 0; this.texts.length = 0;
    this.hitmarkers.length = 0; this.shake = 0;
  }
}

const _p0 = v3(), _p1 = v3();
