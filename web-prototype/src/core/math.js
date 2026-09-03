// Small math kit: scalars, vec3 (plain {x,y,z}), 4x4 matrices, AABBs, RNG.
// Everything here is allocation-conscious — the hot paths reuse scratch objects.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const sign = Math.sign;

/** Frame-rate independent exponential approach. `rate` = how much of the gap closes per second. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Shortest signed angular difference from a to b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ---------------------------------------------------------------- vec3
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vclone = (a) => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const vcopy = (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const vadd = (a, b, o = v3()) => vset(o, a.x + b.x, a.y + b.y, a.z + b.z);
export const vsub = (a, b, o = v3()) => vset(o, a.x - b.x, a.y - b.y, a.z - b.z);
export const vmul = (a, s, o = v3()) => vset(o, a.x * s, a.y * s, a.z * s);
export const vmad = (a, b, s, o = v3()) => vset(o, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vlen2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const vdist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
};
export const vdistXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function vcross(a, b, o = v3()) {
  const x = a.y * b.z - a.z * b.y;
  const y = a.z * b.x - a.x * b.z;
  const z = a.x * b.y - a.y * b.x;
  return vset(o, x, y, z);
}
export function vnorm(a, o = v3()) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return vset(o, a.x / l, a.y / l, a.z / l);
}
export const vlerp = (a, b, t, o = v3()) =>
  vset(o, lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

/** Unit forward vector from yaw (around +Y, 0 = -Z) and pitch. */
export function dirFromAngles(yaw, pitch, o = v3()) {
  const cp = Math.cos(pitch);
  return vset(o, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

// ---------------------------------------------------------------- mat4 (column-major, WebGL order)
export const mat4 = () => new Float32Array(16);

export function mIdentity(m) {
  m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m;
}

export function mPerspective(m, fovYRad, aspect, near, far) {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  m.fill(0);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) * nf; m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

export function mMul(out, a, b) {
  // out = a * b
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4 + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/** First-person view matrix from eye position + yaw/pitch (no roll). */
export function mViewFPS(m, eye, yaw, pitch, roll = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // camera basis in world space
  let rx = cy, ry = 0, rz = -sy;                 // right
  let ux = sy * sp, uy = cp, uz = cy * sp;       // up
  const fx = -sy * cp, fy = sp, fz = -cy * cp;   // forward
  if (roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
    ux = ux * cr - rx * sr; uy = uy * cr - ry * sr; uz = uz * cr - rz * sr;
    rx = nrx; ry = nry; rz = nrz;
  }
  // view = transpose(basis) * translate(-eye); back vector is -forward
  m[0] = rx; m[4] = ry; m[8] = rz;
  m[1] = ux; m[5] = uy; m[9] = uz;
  m[2] = -fx; m[6] = -fy; m[10] = -fz;
  m[3] = 0; m[7] = 0; m[11] = 0;
  m[12] = -(rx * eye.x + ry * eye.y + rz * eye.z);
  m[13] = -(ux * eye.x + uy * eye.y + uz * eye.z);
  m[14] = (fx * eye.x + fy * eye.y + fz * eye.z);
  m[15] = 1;
  return m;
}

/** Project a world point with a view-projection matrix. Returns false if behind camera. */
export function projectPoint(vp, p, out) {
  const x = vp[0] * p.x + vp[4] * p.y + vp[8] * p.z + vp[12];
  const y = vp[1] * p.x + vp[5] * p.y + vp[9] * p.z + vp[13];
  const w = vp[3] * p.x + vp[7] * p.y + vp[11] * p.z + vp[15];
  if (w <= 0.0001) return false;
  out.x = x / w; out.y = y / w; out.w = w;
  return true;
}

// ---------------------------------------------------------------- AABB
export const aabb = (minx, miny, minz, maxx, maxy, maxz) => ({ minx, miny, minz, maxx, maxy, maxz });

export function aabbFromCenter(c, hx, hy, hz) {
  return aabb(c.x - hx, c.y - hy, c.z - hz, c.x + hx, c.y + hy, c.z + hz);
}

export function aabbOverlap(a, b) {
  return a.minx < b.maxx && a.maxx > b.minx &&
         a.miny < b.maxy && a.maxy > b.miny &&
         a.minz < b.maxz && a.maxz > b.minz;
}

export function pointInAabb(p, b) {
  return p.x >= b.minx && p.x <= b.maxx &&
         p.y >= b.miny && p.y <= b.maxy &&
         p.z >= b.minz && p.z <= b.maxz;
}

/**
 * Ray/AABB intersection (slab method).
 * @returns hit distance along `dir` in [0, maxT], or -1 for a miss.
 */
export function rayAabb(ro, rd, b, maxT) {
  let t0 = 0, t1 = maxT;
  // X
  let inv = 1 / (rd.x || 1e-9);
  let a = (b.minx - ro.x) * inv, c = (b.maxx - ro.x) * inv;
  if (a > c) { const t = a; a = c; c = t; }
  if (a > t0) t0 = a; if (c < t1) t1 = c;
  if (t0 > t1) return -1;
  // Y
  inv = 1 / (rd.y || 1e-9);
  a = (b.miny - ro.y) * inv; c = (b.maxy - ro.y) * inv;
  if (a > c) { const t = a; a = c; c = t; }
  if (a > t0) t0 = a; if (c < t1) t1 = c;
  if (t0 > t1) return -1;
  // Z
  inv = 1 / (rd.z || 1e-9);
  a = (b.minz - ro.z) * inv; c = (b.maxz - ro.z) * inv;
  if (a > c) { const t = a; a = c; c = t; }
  if (a > t0) t0 = a; if (c < t1) t1 = c;
  if (t0 > t1) return -1;
  return t0 >= 0 ? t0 : (t1 >= 0 ? 0 : -1);
}

/** Squared distance from a point to an AABB (0 when inside). */
export function aabbDist2(p, b) {
  const dx = Math.max(b.minx - p.x, 0, p.x - b.maxx);
  const dy = Math.max(b.miny - p.y, 0, p.y - b.maxy);
  const dz = Math.max(b.minz - p.z, 0, p.z - b.maxz);
  return dx * dx + dy * dy + dz * dz;
}

// ---------------------------------------------------------------- random
/** Deterministic 32-bit PRNG. Same seed ⇒ same world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = Math.random;
export const randRange = (a, b, rng = rand) => a + rng() * (b - a);
export const randInt = (a, b, rng = rand) => Math.floor(a + rng() * (b - a + 1));
export const pick = (arr, rng = rand) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Pick from `[{weight, ...}]`. Falls back to the last entry on rounding slop. */
export function weightedPick(entries, rng = rand, weightKey = 'weight') {
  let total = 0;
  for (const e of entries) total += e[weightKey] ?? 1;
  let r = rng() * total;
  for (const e of entries) {
    r -= e[weightKey] ?? 1;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

/** Fisher-Yates, in place. */
export function shuffle(arr, rng = rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/** Random unit vector inside a cone of `spreadRad` around `dir`. */
export function coneSpread(dir, spreadRad, rng = rand, o = v3()) {
  if (spreadRad <= 0) return vcopy(o, dir);
  // Build a basis around dir.
  const up = Math.abs(dir.y) > 0.95 ? _CS_X : _CS_Y;
  vcross(dir, up, _cs1); vnorm(_cs1, _cs1);
  vcross(_cs1, dir, _cs2);
  const ang = rng() * TAU;
  const rad = Math.tan(spreadRad) * Math.sqrt(rng());
  const cx = Math.cos(ang) * rad, cy = Math.sin(ang) * rad;
  vset(o, dir.x + _cs1.x * cx + _cs2.x * cy,
          dir.y + _cs1.y * cx + _cs2.y * cy,
          dir.z + _cs1.z * cx + _cs2.z * cy);
  return vnorm(o, o);
}
const _CS_X = v3(1, 0, 0), _CS_Y = v3(0, 1, 0);
const _cs1 = v3(), _cs2 = v3();

// ---------------------------------------------------------------- misc
export function formatNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function romanize(n) {
  const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out || 'I';
}

/** Mix two #rrggbb-ish [r,g,b] float triples. */
export function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** '#rrggbb' → [r,g,b] in 0..1 */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToCss(c, alpha = 1) {
  const r = Math.round(clamp01(c[0]) * 255), g = Math.round(clamp01(c[1]) * 255), b = Math.round(clamp01(c[2]) * 255);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
