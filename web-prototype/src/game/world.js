// Level construction. Everything is axis-aligned boxes: they collide cheaply,
// raycast cheaply, and bake into one static vertex buffer.
//
// A `Builder` offers a kit of structures (towers, catwalks, stepped ramps,
// debris fields) and each zone generator arranges them with a seeded RNG, so a
// zone looks the same every time you visit it but differs from every other zone.

import { emitBox, FLOATS_PER_VERT } from '../core/gl.js';
import { v3, vnorm, mulberry32, clamp, rayAabb, lerp } from '../core/math.js';

const GRID = 8; // broadphase cell size, metres

export class Builder {
  constructor(rng) {
    this.rng = rng;
    this.boxes = [];
    this.lights = [];
    this.decor = [];
  }
  r(a, b) { return a + this.rng() * (b - a); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  /** Add a solid box by centre + half-extents. */
  box(cx, cy, cz, hx, hy, hz, color, opts = {}) {
    const b = {
      minx: cx - hx, miny: cy - hy, minz: cz - hz,
      maxx: cx + hx, maxy: cy + hy, maxz: cz + hz,
      color, emissive: opts.emissive || 0, solid: opts.solid !== false,
      yaw: opts.yaw || 0,
    };
    this.boxes.push(b);
    return b;
  }
  /** Add a box by min/max corners. */
  span(x0, y0, z0, x1, y1, z1, color, opts) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
      Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2, color, opts);
  }
  light(x, y, z, color, radius, intensity = 1) {
    this.lights.push({ pos: v3(x, y, z), color, radius, intensity });
  }

  // ---------------------------------------------------------- structure kit
  /** Hollow building with a doorway on one side and a walkable roof. */
  building(cx, cz, w, d, h, pal, opts = {}) {
    const t = 0.4;
    const doorSide = opts.doorSide ?? this.ri(0, 3);
    const wall = pal.wall, trim = pal.trim;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doorW = Math.min(2.6, Math.min(w, d) * 0.45);

    const side = (sx0, sz0, sx1, sz1, hasDoor, horizontal) => {
      if (!hasDoor) { this.span(sx0, 0, sz0, sx1, h, sz1, wall); return; }
      if (horizontal) {
        const mid = (sx0 + sx1) / 2;
        this.span(sx0, 0, sz0, mid - doorW / 2, h, sz1, wall);
        this.span(mid + doorW / 2, 0, sz0, sx1, h, sz1, wall);
        this.span(mid - doorW / 2, 2.6, sz0, mid + doorW / 2, h, sz1, wall);
      } else {
        const mid = (sz0 + sz1) / 2;
        this.span(sx0, 0, sz0, sx1, h, mid - doorW / 2, wall);
        this.span(sx0, 0, mid + doorW / 2, sx1, h, sz1, wall);
        this.span(sx0, 2.6, mid - doorW / 2, sx1, h, mid + doorW / 2, wall);
      }
    };
    side(x0, z0 - t, x1, z0, doorSide === 0, true);
    side(x0, z1, x1, z1 + t, doorSide === 1, true);
    side(x0 - t, z0, x0, z1, doorSide === 2, false);
    side(x1, z0, x1 + t, z1, doorSide === 3, false);

    if (opts.roof !== false) {
      this.span(x0 - t, h, z0 - t, x1 + t, h + 0.35, z1 + t, trim);
      // parapet
      const p = 0.55;
      this.span(x0 - t, h + 0.35, z0 - t, x1 + t, h + 0.35 + p, z0, trim);
      this.span(x0 - t, h + 0.35, z1, x1 + t, h + 0.35 + p, z1 + t, trim);
      this.span(x0 - t, h + 0.35, z0, x0, h + 0.35 + p, z1, trim);
      this.span(x1, h + 0.35, z0, x1 + t, h + 0.35 + p, z1, trim);
    }
    if (opts.glow !== false) {
      const gy = h * 0.6;
      this.span(x0, gy, z0 - t - 0.05, x0 + w * 0.3, gy + 0.14, z0 - t, pal.glow, { emissive: 1, solid: false });
      this.light(cx, gy + 1.4, cz - d / 2 - 1, pal.glowLight, 9, 0.7);
    }
    return { cx, cz, w, d, h, roofY: h + 0.35 };
  }

  /** Stepped ramp — AABB-friendly stairs the player and AI can walk up. */
  ramp(x0, z0, x1, z1, y0, y1, width, color) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(3, Math.ceil(len / 0.9));
    const nx = dx / len, nz = dz / len;
    const px = -nz * width / 2, pz = nx * width / 2;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const sx = x0 + dx * t0, sz = z0 + dz * t0;
      const ex = x0 + dx * t1, ez = z0 + dz * t1;
      const top = lerp(y0, y1, t1);
      const cx = (sx + ex) / 2, cz = (sz + ez) / 2;
      const hx = Math.abs(ex - sx) / 2 + Math.abs(px) + 0.12;
      const hz = Math.abs(ez - sz) / 2 + Math.abs(pz) + 0.12;
      this.box(cx, top / 2, cz, hx, top / 2, hz, color);
    }
  }

  /** Tall tower with an accessible platform on top and a light at the peak. */
  tower(cx, cz, r, h, pal) {
    this.box(cx, h / 2, cz, r, h / 2, r, pal.wall);
    this.box(cx, h + 0.25, cz, r + 0.5, 0.25, r + 0.5, pal.trim);
    this.box(cx, h + 0.9, cz, 0.3, 0.65, 0.3, pal.glow, { emissive: 1 });
    this.light(cx, h + 1.4, cz, pal.glowLight, 16, 1.1);
    return { cx, cz, topY: h + 0.5 };
  }

  /** Elevated walkway with railings, connecting two points. */
  catwalk(x0, z0, x1, z1, y, width, pal) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const hx = Math.abs(dx) / 2 + (Math.abs(nz) * width) / 2 + 0.2;
    const hz = Math.abs(dz) / 2 + (Math.abs(nx) * width) / 2 + 0.2;
    this.box(cx, y, cz, hx, 0.22, hz, pal.trim);
    // railings on the long sides
    const rx = -nz * (width / 2), rz = nx * (width / 2);
    for (const s of [-1, 1]) {
      this.box(cx + rx * s, y + 0.62, cz + rz * s,
        Math.abs(dx) / 2 + 0.15, 0.08, Math.abs(dz) / 2 + 0.15, pal.glow, { emissive: 0.6, solid: false });
    }
  }

  /** Scatter of cover-height crates and slabs. */
  debris(cx, cz, radius, count, pal) {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = Math.sqrt(this.rng()) * radius;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const w = this.r(0.7, 1.9), h = this.r(0.6, 1.7), dd = this.r(0.7, 1.9);
      this.box(x, h / 2, z, w / 2, h / 2, dd / 2, this.pick(pal.debris), { yaw: this.r(0, Math.PI) });
    }
  }

  /** Broken arch / gateway; purely visual framing plus two solid legs. */
  arch(cx, cz, span, h, pal, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const off = span / 2;
    for (const sgn of [-1, 1]) {
      const x = cx + c * off * sgn, z = cz - s * off * sgn;
      this.box(x, h / 2, z, 0.6, h / 2, 0.6, pal.wall, { yaw });
    }
    this.box(cx, h + 0.4, cz, Math.abs(c) * (off + 0.6) + 0.6, 0.4, Math.abs(s) * (off + 0.6) + 0.6, pal.trim, { yaw });
    this.box(cx, h + 0.05, cz, Math.abs(c) * off + 0.2, 0.1, Math.abs(s) * off + 0.2, pal.glow, { emissive: 1, solid: false });
    this.light(cx, h - 0.5, cz, pal.glowLight, 14, 0.8);
  }

  /**
   * A raised crater rim around a flat centre, cut by four ramps.
   * Reads as a sunken plaza without needing a hole in the ground plane.
   */
  bowl(cx, cz, r, height, pal) {
    const segs = 28;
    const gaps = [0, 7, 14, 21]; // four ramp openings
    for (let i = 0; i < segs; i++) {
      if (gaps.includes(i)) continue;
      const a = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const mx = Math.cos((a + a2) / 2) * r, mz = Math.sin((a + a2) / 2) * r;
      const arc = (Math.PI * 2 * r) / segs;
      const h = height * (0.75 + 0.25 * Math.sin(i * 1.7));
      this.box(cx + mx, h / 2, cz + mz, arc * 0.62, h / 2, 2.4, pal.wall,
        { yaw: -(a + a2) / 2 });
    }
    for (const gi of gaps) {
      const a = ((gi + 0.5) / segs) * Math.PI * 2;
      this.ramp(cx + Math.cos(a) * (r + 6), cz + Math.sin(a) * (r + 6),
                cx + Math.cos(a) * (r - 1), cz + Math.sin(a) * (r - 1),
                0.01, height * 0.55, 3.4, pal.trim);
    }
    this.box(cx, 0.35, cz, r * 0.42, 0.35, r * 0.42, pal.trim);
    this.light(cx, height + 2.5, cz, pal.glowLight, 24, 0.9);
  }

  /** Perimeter wall around a rectangular play space. */
  perimeter(x0, z0, x1, z1, h, pal) {
    const t = 2.5;
    this.span(x0 - t, 0, z0 - t, x1 + t, h, z0, pal.wall);
    this.span(x0 - t, 0, z1, x1 + t, h, z1 + t, pal.wall);
    this.span(x0 - t, 0, z0, x0, h, z1, pal.wall);
    this.span(x1, 0, z0, x1 + t, h, z1, pal.wall);
  }

  /** Ground plane. */
  floor(x0, z0, x1, z1, color, y = 0) {
    this.span(x0, y - 1.5, z0, x1, y, z1, color);
  }
}

// ---------------------------------------------------------------- palettes
export const PALETTES = {
  rust: {
    floor: [0.20, 0.17, 0.15], floorLow: [0.14, 0.12, 0.11],
    wall: [0.30, 0.25, 0.22], trim: [0.40, 0.33, 0.28],
    glow: [1.0, 0.55, 0.22], glowLight: [1.0, 0.5, 0.18],
    debris: [[0.26, 0.22, 0.2], [0.33, 0.27, 0.23], [0.22, 0.20, 0.20], [0.38, 0.30, 0.22]],
    env: {
      sunDir: vnorm(v3(-0.42, 0.55, -0.72)), sunColor: [1.25, 0.86, 0.56],
      ambTop: [0.36, 0.30, 0.32], ambBot: [0.12, 0.10, 0.12],
      fogColor: [0.24, 0.16, 0.14], fogDensity: 0.0032,
      horizon: [0.52, 0.27, 0.16], zenith: [0.07, 0.07, 0.17], ground: [0.09, 0.06, 0.05],
      stars: 0.5, exposure: 1.06,
    },
  },
  ash: {
    floor: [0.17, 0.18, 0.24], floorLow: [0.11, 0.12, 0.17],
    wall: [0.17, 0.18, 0.24], trim: [0.24, 0.25, 0.33],
    glow: [0.62, 0.40, 1.0], glowLight: [0.55, 0.35, 1.0],
    debris: [[0.16, 0.17, 0.22], [0.20, 0.21, 0.27], [0.12, 0.13, 0.18], [0.24, 0.22, 0.30]],
    env: {
      sunDir: vnorm(v3(0.25, 0.38, 0.62)), sunColor: [0.72, 0.62, 1.05],
      ambTop: [0.26, 0.27, 0.42], ambBot: [0.07, 0.08, 0.13],
      fogColor: [0.08, 0.08, 0.15], fogDensity: 0.0062,
      horizon: [0.16, 0.13, 0.32], zenith: [0.01, 0.02, 0.06], ground: [0.03, 0.03, 0.06],
      stars: 1.3, exposure: 1.12,
    },
  },
  steel: {
    floor: [0.16, 0.18, 0.21], floorLow: [0.11, 0.13, 0.16],
    wall: [0.21, 0.24, 0.28], trim: [0.30, 0.34, 0.40],
    glow: [0.35, 0.85, 1.0], glowLight: [0.3, 0.8, 1.0],
    debris: [[0.19, 0.21, 0.25], [0.24, 0.27, 0.32], [0.15, 0.17, 0.21], [0.28, 0.31, 0.36]],
    env: {
      sunDir: vnorm(v3(0.55, 0.62, -0.35)), sunColor: [0.95, 1.05, 1.20],
      ambTop: [0.30, 0.36, 0.50], ambBot: [0.09, 0.11, 0.16],
      fogColor: [0.09, 0.12, 0.18], fogDensity: 0.0044,
      horizon: [0.20, 0.30, 0.46], zenith: [0.02, 0.04, 0.10], ground: [0.05, 0.06, 0.09],
      stars: 1.0, exposure: 1.08,
    },
  },
};

// ---------------------------------------------------------------- the World
export class World {
  constructor(def, seed = 1) {
    this.def = def;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.boxes = [];
    this.lights = [];
    this.dynamic = [];   // barricades, wards and other temporary solids
    this.palette = PALETTES[def.palette] || PALETTES.steel;
    this.env = this.palette.env;
    this.playerSpawn = v3(0, 1, 0);
    this.playerYaw = 0;
    this.regions = [];      // { id, center, radius, spawns[] }
    this.navPoints = [];    // walkable sample points for AI + spawning
    this.bounds = { x0: -80, z0: -80, x1: 80, z1: 80 };
    this.build();
    this.buildBroadphase();
    this.buildNav();
    this.bakeVerts();
  }

  build() {
    const b = new Builder(this.rng);
    (GENERATORS[this.def.generator] || GENERATORS.arena)(b, this, this.palette);
    this.boxes = b.boxes;
    this.lights = b.lights;
  }

  // ------------------------------------------------------- spatial index
  buildBroadphase() {
    const { x0, z0, x1, z1 } = this.bounds;
    this.gx0 = Math.floor((x0 - 12) / GRID); this.gz0 = Math.floor((z0 - 12) / GRID);
    this.gw = Math.ceil((x1 + 12) / GRID) - this.gx0 + 1;
    this.gh = Math.ceil((z1 + 12) / GRID) - this.gz0 + 1;
    this.grid = new Array(this.gw * this.gh);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    for (const box of this.boxes) {
      if (!box.solid) continue;
      const cx0 = clamp(Math.floor(box.minx / GRID) - this.gx0, 0, this.gw - 1);
      const cx1 = clamp(Math.floor(box.maxx / GRID) - this.gx0, 0, this.gw - 1);
      const cz0 = clamp(Math.floor(box.minz / GRID) - this.gz0, 0, this.gh - 1);
      const cz1 = clamp(Math.floor(box.maxz / GRID) - this.gz0, 0, this.gh - 1);
      for (let z = cz0; z <= cz1; z++) {
        for (let x = cx0; x <= cx1; x++) this.grid[z * this.gw + x].push(box);
      }
    }
  }

  /** Register/remove a temporary solid (player barricade, boss shield wall). */
  addDynamic(box) { this.dynamic.push(box); return box; }
  removeDynamic(box) {
    const i = this.dynamic.indexOf(box);
    if (i >= 0) this.dynamic.splice(i, 1);
  }

  /** Every solid box whose cell overlaps the query AABB (duplicate-free). */
  query(minx, minz, maxx, maxz, out) {
    out.length = 0;
    for (let i = 0; i < this.dynamic.length; i++) {
      const b = this.dynamic[i];
      if (b.maxx < minx || b.minx > maxx || b.maxz < minz || b.minz > maxz) continue;
      out.push(b);
    }
    const cx0 = clamp(Math.floor(minx / GRID) - this.gx0, 0, this.gw - 1);
    const cx1 = clamp(Math.floor(maxx / GRID) - this.gx0, 0, this.gw - 1);
    const cz0 = clamp(Math.floor(minz / GRID) - this.gz0, 0, this.gh - 1);
    const cz1 = clamp(Math.floor(maxz / GRID) - this.gz0, 0, this.gh - 1);
    for (let z = cz0; z <= cz1; z++) {
      for (let x = cx0; x <= cx1; x++) {
        const cell = this.grid[z * this.gw + x];
        for (let i = 0; i < cell.length; i++) {
          const b = cell[i];
          if (out.indexOf(b) === -1) out.push(b);
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------- queries
  /** Highest solid surface at or below `fromY` at (x,z). Returns 0 if nothing found. */
  groundY(x, z, fromY = 200) {
    this.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, _scratch);
    let best = -999;
    for (const b of _scratch) {
      if (x < b.minx || x > b.maxx || z < b.minz || z > b.maxz) continue;
      if (b.maxy <= fromY + 0.05 && b.maxy > best) best = b.maxy;
    }
    return best === -999 ? 0 : best;
  }

  /** Ray vs level. Returns {t, box} for the nearest hit, or null. */
  raycast(origin, dir, maxT) {
    // Walk the broadphase along the ray's XZ footprint (cheap and good enough here).
    const ex = origin.x + dir.x * maxT, ez = origin.z + dir.z * maxT;
    this.query(Math.min(origin.x, ex) - 1, Math.min(origin.z, ez) - 1,
               Math.max(origin.x, ex) + 1, Math.max(origin.z, ez) + 1, _scratch);
    let bestT = maxT, bestBox = null;
    for (const b of _scratch) {
      if (!b.solid) continue;
      const t = rayAabb(origin, dir, b, bestT);
      if (t >= 0 && t < bestT) { bestT = t; bestBox = b; }
    }
    return bestBox ? { t: bestT, box: bestBox } : null;
  }

  /** True when nothing solid blocks the segment a→b. */
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    _dir.x = dx / len; _dir.y = dy / len; _dir.z = dz / len;
    const hit = this.raycast(a, _dir, len - 0.05);
    return !hit;
  }

  /** Clamp a position inside the playable bounds. */
  clampToBounds(p, margin = 1.5) {
    p.x = clamp(p.x, this.bounds.x0 + margin, this.bounds.x1 - margin);
    p.z = clamp(p.z, this.bounds.z0 + margin, this.bounds.z1 - margin);
    return p;
  }

  // ------------------------------------------------------- nav sampling
  buildNav() {
    const step = 4;
    const pts = [];
    for (let x = this.bounds.x0 + 3; x <= this.bounds.x1 - 3; x += step) {
      for (let z = this.bounds.z0 + 3; z <= this.bounds.z1 - 3; z += step) {
        const y = this.groundY(x, z, 60);
        if (y < -8 || y > 24) continue;
        // reject points with something solid right above (inside geometry)
        this.query(x - 0.4, z - 0.4, x + 0.4, z + 0.4, _scratch);
        let blocked = false;
        for (const b of _scratch) {
          if (x < b.minx - 0.4 || x > b.maxx + 0.4 || z < b.minz - 0.4 || z > b.maxz + 0.4) continue;
          if (b.miny < y + 1.9 && b.maxy > y + 0.25) { blocked = true; break; }
        }
        if (!blocked) pts.push(v3(x, y, z));
      }
    }
    this.navPoints = pts;
  }

  /** Random walkable point, optionally near/far from a reference position. */
  randomNav(rng, opts = {}) {
    const { near = null, minDist = 0, maxDist = 1e9, region = null, tries = 40 } = opts;
    let fallback = null;
    for (let i = 0; i < tries; i++) {
      const p = this.navPoints[Math.floor(rng() * this.navPoints.length)];
      if (!p) break;
      if (region) {
        const d = Math.hypot(p.x - region.center.x, p.z - region.center.z);
        if (d > region.radius) continue;
      }
      if (near) {
        const d = Math.hypot(p.x - near.x, p.z - near.z);
        if (d < minDist || d > maxDist) { fallback = fallback || p; continue; }
      }
      return v3(p.x, p.y, p.z);
    }
    const p = fallback || this.navPoints[0] || v3(0, 0, 0);
    return v3(p.x, p.y, p.z);
  }

  // ------------------------------------------------------- geometry bake
  bakeVerts() {
    const verts = new Float32Array(this.boxes.length * 36 * FLOATS_PER_VERT);
    let at = 0;
    for (const b of this.boxes) {
      const cx = (b.minx + b.maxx) / 2, cy = (b.miny + b.maxy) / 2, cz = (b.minz + b.maxz) / 2;
      const hx = (b.maxx - b.minx) / 2, hy = (b.maxy - b.miny) / 2, hz = (b.maxz - b.minz) / 2;
      // A little per-box value variation stops the palette from looking flat.
      const j = 0.90 + ((hashBox(b) % 1000) / 1000) * 0.22;
      at = emitBox(verts, at, cx, cy, cz, hx, hy, hz, b.yaw || 0,
        b.color[0] * j, b.color[1] * j, b.color[2] * j, b.emissive || 0);
    }
    this.verts = verts.subarray(0, at);
  }
}

function hashBox(b) {
  let h = Math.imul(Math.round(b.minx * 7 + 4096), 2654435761) ^
          Math.imul(Math.round(b.minz * 13 + 4096), 2246822519) ^
          Math.imul(Math.round(b.miny * 31 + 4096), 3266489917);
  h ^= h >>> 15;
  return Math.abs(h);
}

const _scratch = [];
const _dir = v3();

// ---------------------------------------------------------------- generators
export const GENERATORS = {
  /** Open patrol zone: buildings, towers, a central pit and a lot of sightlines. */
  patrol(b, world, pal) {
    const S = 92;
    world.bounds = { x0: -S, z0: -S, x1: S, z1: S };
    b.floor(-S - 4, -S - 4, S + 4, S + 4, pal.floor);
    b.perimeter(-S, -S, S, S, 16, pal);

    // Landmark: central sunken plaza
    b.bowl(0, 0, 17, 4.5, pal);
    b.arch(0, -20, 14, 8, pal, 0);
    b.arch(0, 20, 14, 8, pal, 0);

    // Outer ring of buildings
    const ring = 8;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + b.r(-0.15, 0.15);
      const d = b.r(38, 66);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const w = b.r(9, 17), dd = b.r(9, 17), h = b.r(5, 11);
      const bd = b.building(x, z, w, dd, h, pal);
      if (b.rng() < 0.55) {
        b.ramp(x + w / 2 + 5, z, x + w / 2 + 0.6, z, 0.01, bd.roofY, 2.6, pal.trim);
      }
      b.debris(x + b.r(-10, 10), z + b.r(-10, 10), 7, b.ri(3, 7), pal);
    }

    // Towers for verticality and long lines of sight
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const d = 26;
      const t = b.tower(Math.cos(a) * d, Math.sin(a) * d, 2.2, b.r(9, 14), pal);
      b.ramp(Math.cos(a) * (d + 9), Math.sin(a) * (d + 9), Math.cos(a) * (d + 2.6), Math.sin(a) * (d + 2.6),
        0.01, t.topY, 2.4, pal.trim);
    }

    // Catwalks between two tower pairs
    b.catwalk(-26 * Math.cos(0.4), -26 * Math.sin(0.4), 26 * Math.cos(0.4), 26 * Math.sin(0.4), 11.5, 3, pal);

    // Scatter cover
    for (let i = 0; i < 26; i++) {
      b.debris(b.r(-S + 10, S - 10), b.r(-S + 10, S - 10), b.r(3, 8), b.ri(2, 6), pal);
    }

    world.playerSpawn = v3(0, 0.2, S - 16);
    world.playerYaw = 0;
    world.regions = [
      { id: 'north', center: v3(0, 0, -50), radius: 34 },
      { id: 'east', center: v3(52, 0, 0), radius: 34 },
      { id: 'south', center: v3(0, 0, 50), radius: 34 },
      { id: 'west', center: v3(-52, 0, 0), radius: 34 },
      { id: 'centre', center: v3(0, 0, 0), radius: 24 },
    ];
  },

  /** Strike layout: three arenas connected by corridors, ending in a boss chamber. */
  strike(b, world, pal) {
    world.bounds = { x0: -46, z0: -160, x1: 46, z1: 46 };
    b.floor(-52, -170, 52, 52, pal.floor);
    b.perimeter(-46, -160, 46, 46, 18, pal);

    const arenaAt = (cz, style) => {
      if (style === 0) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          b.building(Math.cos(a) * 22, cz + Math.sin(a) * 20, b.r(7, 11), b.r(7, 11), b.r(4.5, 8), pal);
        }
        b.debris(0, cz, 16, 16, pal);
      } else if (style === 1) {
        b.bowl(0, cz, 13, 3.6, pal);
        for (const sx of [-1, 1]) {
          const t = b.tower(sx * 28, cz - 10, 2.0, 9, pal);
          b.ramp(sx * 22, cz - 2, sx * 26, cz - 9, 0.01, t.topY, 2.4, pal.trim);
        }
        b.catwalk(-28, cz - 10, 28, cz - 10, 9.5, 3, pal);
        b.debris(0, cz + 14, 12, 10, pal);
      } else {
        for (let i = 0; i < 7; i++) {
          const x = b.r(-34, 34), z = cz + b.r(-18, 18);
          b.box(x, b.r(2, 5), z, b.r(1.2, 3), b.r(2, 5), b.r(1.2, 3), pal.wall, { yaw: b.r(0, 3.14) });
        }
        b.debris(0, cz, 20, 20, pal);
      }
      b.light(0, 10, cz, pal.glowLight, 40, 0.55);
    };

    // Three combat arenas
    arenaAt(20, 0);
    arenaAt(-40, 1);
    arenaAt(-100, 2);

    // Corridors: narrow the space between arenas so fights stay contained
    const choke = (cz) => {
      b.span(-46, 0, cz - 3, -13, 12, cz + 3, pal.wall);
      b.span(13, 0, cz - 3, 46, 12, cz + 3, pal.wall);
      b.arch(0, cz, 22, 9, pal, 0);
    };
    choke(-8);
    choke(-68);

    // Boss chamber
    b.span(-46, 0, -160, 46, 20, -152, pal.wall);
    for (const sx of [-1, 1]) {
      b.building(sx * 32, -138, 10, 12, 7, pal, { doorSide: sx > 0 ? 2 : 3 });
      b.ramp(sx * 24, -128, sx * 30, -134, 0.01, 7.35, 2.6, pal.trim);
    }
    b.catwalk(-32, -138, 32, -138, 7.6, 3.2, pal);
    b.debris(0, -135, 22, 18, pal);
    b.arch(0, -118, 26, 11, pal, 0);
    b.light(0, 12, -138, pal.glowLight, 48, 0.9);

    world.playerSpawn = v3(0, 0.2, 38);
    world.playerYaw = Math.PI;
    world.regions = [
      { id: 'arena1', center: v3(0, 0, 20), radius: 30, gate: -2 },
      { id: 'arena2', center: v3(0, 0, -40), radius: 30, gate: -62 },
      { id: 'arena3', center: v3(0, 0, -100), radius: 32, gate: -118 },
      { id: 'boss', center: v3(0, 0, -136), radius: 34 },
    ];
  },

  /** Compact horde arena: one bowl, high ground, four spawn alcoves. */
  arena(b, world, pal) {
    const S = 44;
    world.bounds = { x0: -S, z0: -S, x1: S, z1: S };
    b.floor(-S - 4, -S - 4, S + 4, S + 4, pal.floor);
    b.perimeter(-S, -S, S, S, 15, pal);

    // Raised platform ring
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * 27, z = Math.sin(a) * 27;
      b.box(x, 1.6, z, 6.5, 1.6, 6.5, pal.trim);
      b.ramp(Math.cos(a) * 18, Math.sin(a) * 18, Math.cos(a) * 24, Math.sin(a) * 24, 0.01, 3.2, 3.0, pal.trim);
      b.box(x, 4.0, z, 1.0, 0.8, 1.0, pal.glow, { emissive: 1, solid: false });
      b.light(x, 5.2, z, pal.glowLight, 20, 1.0);
    }
    // Centre pillar cluster
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(Math.cos(a) * 7, 3.2, Math.sin(a) * 7, 1.0, 3.2, 1.0, pal.wall);
    }
    b.box(0, 0.6, 0, 4.2, 0.6, 4.2, pal.trim);
    b.light(0, 6, 0, pal.glowLight, 26, 1.1);

    // Spawn alcoves at the cardinal walls
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * (S - 7), z = Math.sin(a) * (S - 7);
      b.arch(x, z, 9, 6.5, pal, a);
      b.light(x, 3, z, pal.glowLight, 14, 0.8);
    }
    b.debris(0, 0, S - 10, 30, pal);

    world.playerSpawn = v3(0, 1.4, 0);
    world.playerYaw = 0;
    world.regions = [{ id: 'arena', center: v3(0, 0, 0), radius: S - 6 }];
  },
};
