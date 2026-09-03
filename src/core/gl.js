// Minimal WebGL renderer built for this game: one lit shader, one procedural sky,
// a static level buffer and two per-frame dynamic batches (opaque + additive glow).
//
// Vertex layout (10 floats / 40 bytes): position.xyz | normal.xyz | color.rgb | emissive
// `emissive` blends between the lit result and the raw colour, so 1.0 = unlit/glowing.

import { v3, vsub, vcross, vnorm, vlen } from './math.js';

export const FLOATS_PER_VERT = 10;
export const MAX_LIGHTS = 8;

const LIT_VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
attribute float aEm;
uniform mat4 uViewProj;
varying vec3 vPos;
varying vec3 vNrm;
varying vec3 vCol;
varying float vEm;
void main(){
  vPos = aPos; vNrm = aNrm; vCol = aCol; vEm = aEm;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const LIT_FS = `
precision highp float;
varying vec3 vPos;
varying vec3 vNrm;
varying vec3 vCol;
varying float vEm;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform int uLightCount;
uniform vec3 uLightPos[${MAX_LIGHTS}];
uniform vec3 uLightCol[${MAX_LIGHTS}];
uniform float uLightRad[${MAX_LIGHTS}];
uniform float uExposure;

void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(uCamPos - vPos);
  float ndl = max(dot(N, uSunDir), 0.0);
  // soft wrap keeps unlit faces readable instead of crushing to black
  float wrap = max((dot(N, uSunDir) + 0.35) / 1.35, 0.0);
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5);
  vec3 lit = vCol * (amb + uSunColor * (ndl * 0.75 + wrap * 0.25));

  // specular sheen: cheap Blinn-Phong from the sun only
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 42.0) * 0.22;
  lit += uSunColor * spec;

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 d = uLightPos[i] - vPos;
    float dist = length(d);
    float att = clamp(1.0 - dist / uLightRad[i], 0.0, 1.0);
    att *= att;
    lit += vCol * uLightCol[i] * max(dot(N, d / max(dist, 0.001)), 0.12) * att;
  }

  vec3 col = mix(lit, vCol, vEm) * uExposure;
  float dist = length(uCamPos - vPos);
  float fog = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0) * (1.0 - vEm * 0.55));
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VS = `
precision highp float;
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const SKY_FS = `
precision highp float;
varying vec2 vUv;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uAspect;
uniform float uTanHalfFov;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main(){
  vec3 dir = normalize(uFwd + uRight * (vUv.x * uAspect * uTanHalfFov) + uUp * (vUv.y * uTanHalfFov));
  float h = dir.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.65));
    // star field: quantise the direction into cells and light a sparse few
    vec3 q = floor(dir * 190.0);
    float s = hash(q);
    if (s > 0.9975) {
      float tw = 0.55 + 0.45 * hash(q + 3.7);
      col += vec3(0.85, 0.92, 1.0) * (s - 0.9975) * 400.0 * tw * uStars * clamp(h * 3.0, 0.0, 1.0);
    }
  } else {
    col = mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.5));
  }
  // sun/nebula bloom around the key light
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * pow(sd, 220.0) * 3.0;
  col += uSunColor * pow(sd, 6.0) * 0.16;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile failed: ' + gl.getShaderInfoLog(sh) + '\n' + src);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program link failed: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

/** A growable CPU-side vertex list that mirrors into one GL buffer. */
class Batch {
  constructor(gl, capacityVerts) {
    this.gl = gl;
    this.data = new Float32Array(capacityVerts * FLOATS_PER_VERT);
    this.cap = capacityVerts;
    this.count = 0; // vertices
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
  }
  reset() { this.count = 0; }
  get room() { return this.cap - this.count; }
  upload() {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * FLOATS_PER_VERT));
  }
}

// Unit cube: 6 faces × (normal, 4 corners) — corners are ±1 in local space.
const CUBE_FACES = [
  { n: [0, 0, 1],  c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0],  c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0],  c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

/** Append one (optionally Y-rotated) box into a raw float array. Returns the new write cursor. */
export function emitBox(arr, at, cx, cy, cz, hx, hy, hz, yaw, r, g, b, em) {
  const cs = yaw ? Math.cos(yaw) : 1, sn = yaw ? Math.sin(yaw) : 0;
  for (let f = 0; f < 6; f++) {
    const face = CUBE_FACES[f];
    const nx0 = face.n[0], ny = face.n[1], nz0 = face.n[2];
    const nx = nx0 * cs + nz0 * sn, nz = -nx0 * sn + nz0 * cs;
    // two triangles: 0,1,2 and 0,2,3
    for (let k = 0; k < 6; k++) {
      const ci = k < 3 ? k : (k === 3 ? 0 : k - 1); // 0,1,2, 0,2,3
      const c = face.c[ci];
      const lx = c[0] * hx, ly = c[1] * hy, lz = c[2] * hz;
      const px = lx * cs + lz * sn, pz = -lx * sn + lz * cs;
      arr[at++] = cx + px; arr[at++] = cy + ly; arr[at++] = cz + pz;
      arr[at++] = nx; arr[at++] = ny; arr[at++] = nz;
      arr[at++] = r; arr[at++] = g; arr[at++] = b;
      arr[at++] = em;
    }
  }
  return at;
}

export class Renderer {
  constructor(canvas) {
    const opts = { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts)
      || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.canvas = canvas;
    this.gl = gl;

    this.prog = link(gl, LIT_VS, LIT_FS);
    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aNrm: gl.getAttribLocation(this.prog, 'aNrm'),
      aCol: gl.getAttribLocation(this.prog, 'aCol'),
      aEm: gl.getAttribLocation(this.prog, 'aEm'),
      uViewProj: gl.getUniformLocation(this.prog, 'uViewProj'),
      uCamPos: gl.getUniformLocation(this.prog, 'uCamPos'),
      uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
      uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
      uAmbTop: gl.getUniformLocation(this.prog, 'uAmbTop'),
      uAmbBot: gl.getUniformLocation(this.prog, 'uAmbBot'),
      uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
      uFogDensity: gl.getUniformLocation(this.prog, 'uFogDensity'),
      uLightCount: gl.getUniformLocation(this.prog, 'uLightCount'),
      uLightPos: gl.getUniformLocation(this.prog, 'uLightPos'),
      uLightCol: gl.getUniformLocation(this.prog, 'uLightCol'),
      uLightRad: gl.getUniformLocation(this.prog, 'uLightRad'),
      uExposure: gl.getUniformLocation(this.prog, 'uExposure'),
    };

    this.sky = link(gl, SKY_VS, SKY_FS);
    this.skyLoc = {
      aPos: gl.getAttribLocation(this.sky, 'aPos'),
      uFwd: gl.getUniformLocation(this.sky, 'uFwd'),
      uRight: gl.getUniformLocation(this.sky, 'uRight'),
      uUp: gl.getUniformLocation(this.sky, 'uUp'),
      uAspect: gl.getUniformLocation(this.sky, 'uAspect'),
      uTanHalfFov: gl.getUniformLocation(this.sky, 'uTanHalfFov'),
      uHorizon: gl.getUniformLocation(this.sky, 'uHorizon'),
      uZenith: gl.getUniformLocation(this.sky, 'uZenith'),
      uGround: gl.getUniformLocation(this.sky, 'uGround'),
      uSunDir: gl.getUniformLocation(this.sky, 'uSunDir'),
      uSunColor: gl.getUniformLocation(this.sky, 'uSunColor'),
      uStars: gl.getUniformLocation(this.sky, 'uStars'),
    };
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.opaque = new Batch(gl, 90000);
    this.glow = new Batch(gl, 60000);
    this.staticBuf = gl.createBuffer();
    this.staticCount = 0;

    this.lightPos = new Float32Array(MAX_LIGHTS * 3);
    this.lightCol = new Float32Array(MAX_LIGHTS * 3);
    this.lightRad = new Float32Array(MAX_LIGHTS);
    this.lights = [];

    // Scene look — overwritten per-zone by world.js
    this.env = {
      sunDir: vnorm(v3(0.45, 0.72, 0.3)),
      sunColor: [1.0, 0.88, 0.72],
      ambTop: [0.30, 0.36, 0.50],
      ambBot: [0.10, 0.11, 0.17],
      fogColor: [0.10, 0.14, 0.22],
      fogDensity: 0.010,
      horizon: [0.22, 0.28, 0.42],
      zenith: [0.03, 0.05, 0.12],
      ground: [0.05, 0.06, 0.10],
      stars: 1.0,
      exposure: 1.0,
    };

    this.camRight = v3(1, 0, 0);
    this.camUp = v3(0, 1, 0);
    this.camFwd = v3(0, 0, -1);
    this.camPos = v3();
    this.drawCalls = 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / h;
  }

  /** Upload immutable level geometry. `verts` is a flat Float32Array in the vertex layout. */
  setStatic(verts) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    this.staticCount = verts.length / FLOATS_PER_VERT;
  }

  beginFrame(camPos, camFwd, camRight, camUp) {
    this.opaque.reset();
    this.glow.reset();
    this.lights.length = 0;
    this.drawCalls = 0;
    this.camPos = camPos;
    this.camFwd = camFwd; this.camRight = camRight; this.camUp = camUp;
  }

  addLight(pos, color, radius, intensity = 1) {
    this.lights.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, color, radius, intensity });
  }

  // ------------------------------------------------------------ primitives
  box(cx, cy, cz, hx, hy, hz, yaw, col, em = 0, glow = false) {
    const b = glow ? this.glow : this.opaque;
    if (b.room < 36) return;
    b.count = emitBox(b.data, b.count * FLOATS_PER_VERT, cx, cy, cz, hx, hy, hz, yaw,
      col[0], col[1], col[2], em) / FLOATS_PER_VERT;
  }

  /** Camera-facing quad; always additive. */
  sprite(x, y, z, size, col, alpha = 1) {
    const b = this.glow;
    if (b.room < 6) return;
    const r = this.camRight, u = this.camUp;
    const rx = r.x * size, ry = r.y * size, rz = r.z * size;
    const ux = u.x * size, uy = u.y * size, uz = u.z * size;
    const cr = col[0] * alpha, cg = col[1] * alpha, cb = col[2] * alpha;
    let at = b.count * FLOATS_PER_VERT;
    const d = b.data;
    const push = (px, py, pz) => {
      d[at++] = px; d[at++] = py; d[at++] = pz;
      d[at++] = -this.camFwd.x; d[at++] = -this.camFwd.y; d[at++] = -this.camFwd.z;
      d[at++] = cr; d[at++] = cg; d[at++] = cb; d[at++] = 1;
    };
    const p = (sx, sy) => push(x + rx * sx + ux * sy, y + ry * sx + uy * sy, z + rz * sx + uz * sy);
    p(-1, -1); p(1, -1); p(1, 1);
    p(-1, -1); p(1, 1); p(-1, 1);
    b.count = at / FLOATS_PER_VERT;
  }

  /** Camera-facing ribbon between two world points; additive (tracers, beams, lightning). */
  beam(a, bpt, width, col, alpha = 1) {
    const b = this.glow;
    if (b.room < 6) return;
    vsub(bpt, a, _ax);
    const len = vlen(_ax);
    if (len < 1e-4) return;
    vsub(a, this.camPos, _toCam);
    vcross(_ax, _toCam, _side);
    if (vlen(_side) < 1e-5) return;
    vnorm(_side, _side);
    const sx = _side.x * width, sy = _side.y * width, sz = _side.z * width;
    const cr = col[0] * alpha, cg = col[1] * alpha, cb = col[2] * alpha;
    let at = b.count * FLOATS_PER_VERT;
    const d = b.data;
    const push = (px, py, pz) => {
      d[at++] = px; d[at++] = py; d[at++] = pz;
      d[at++] = -this.camFwd.x; d[at++] = -this.camFwd.y; d[at++] = -this.camFwd.z;
      d[at++] = cr; d[at++] = cg; d[at++] = cb; d[at++] = 1;
    };
    const a0 = [a.x - sx, a.y - sy, a.z - sz], a1 = [a.x + sx, a.y + sy, a.z + sz];
    const b0 = [bpt.x - sx, bpt.y - sy, bpt.z - sz], b1 = [bpt.x + sx, bpt.y + sy, bpt.z + sz];
    push(...a0); push(...a1); push(...b1);
    push(...a0); push(...b1); push(...b0);
    b.count = at / FLOATS_PER_VERT;
  }

  /** Flat quad lying on the ground (ability rings, spawn markers, damage zones). */
  decal(x, y, z, radius, col, alpha = 1) {
    const b = this.glow;
    if (b.room < 6) return;
    const cr = col[0] * alpha, cg = col[1] * alpha, cb = col[2] * alpha;
    let at = b.count * FLOATS_PER_VERT;
    const d = b.data;
    const push = (px, pz) => {
      d[at++] = x + px; d[at++] = y; d[at++] = z + pz;
      d[at++] = 0; d[at++] = 1; d[at++] = 0;
      d[at++] = cr; d[at++] = cg; d[at++] = cb; d[at++] = 1;
    };
    push(-radius, -radius); push(radius, -radius); push(radius, radius);
    push(-radius, -radius); push(radius, radius); push(-radius, radius);
    b.count = at / FLOATS_PER_VERT;
  }

  // ------------------------------------------------------------ frame
  endFrame(viewProj) {
    const gl = this.gl;
    const e = this.env;

    gl.clearColor(e.fogColor[0], e.fogColor[1], e.fogColor[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- sky
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sky);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(this.skyLoc.aPos);
    gl.vertexAttribPointer(this.skyLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(this.skyLoc.uFwd, this.camFwd.x, this.camFwd.y, this.camFwd.z);
    gl.uniform3f(this.skyLoc.uRight, this.camRight.x, this.camRight.y, this.camRight.z);
    gl.uniform3f(this.skyLoc.uUp, this.camUp.x, this.camUp.y, this.camUp.z);
    gl.uniform1f(this.skyLoc.uAspect, this.aspect);
    gl.uniform1f(this.skyLoc.uTanHalfFov, this.tanHalfFov || 0.5);
    gl.uniform3fv(this.skyLoc.uHorizon, e.horizon);
    gl.uniform3fv(this.skyLoc.uZenith, e.zenith);
    gl.uniform3fv(this.skyLoc.uGround, e.ground);
    gl.uniform3f(this.skyLoc.uSunDir, e.sunDir.x, e.sunDir.y, e.sunDir.z);
    gl.uniform3fv(this.skyLoc.uSunColor, e.sunColor);
    gl.uniform1f(this.skyLoc.uStars, e.stars);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(this.skyLoc.aPos);
    gl.enable(gl.DEPTH_TEST);

    // --- shared lit-program state
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uViewProj, false, viewProj);
    gl.uniform3f(this.loc.uCamPos, this.camPos.x, this.camPos.y, this.camPos.z);
    gl.uniform3f(this.loc.uSunDir, e.sunDir.x, e.sunDir.y, e.sunDir.z);
    gl.uniform3fv(this.loc.uSunColor, e.sunColor);
    gl.uniform3fv(this.loc.uAmbTop, e.ambTop);
    gl.uniform3fv(this.loc.uAmbBot, e.ambBot);
    gl.uniform3fv(this.loc.uFogColor, e.fogColor);
    gl.uniform1f(this.loc.uFogDensity, e.fogDensity);
    gl.uniform1f(this.loc.uExposure, e.exposure);
    this._uploadLights();

    // --- opaque: static level, then dynamic entities
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    if (this.staticCount) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
      this._bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.staticCount);
      this.drawCalls++;
    }
    if (this.opaque.count) {
      this.opaque.upload();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.opaque.buf);
      this._bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.opaque.count);
      this.drawCalls++;
    }

    // --- additive glow, depth-tested but not depth-written
    if (this.glow.count) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      this.glow.upload();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.glow.buf);
      this._bindAttribs();
      gl.drawArrays(gl.TRIANGLES, 0, this.glow.count);
      this.drawCalls++;
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _bindAttribs() {
    const gl = this.gl, l = this.loc;
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(l.aPos);
    gl.vertexAttribPointer(l.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(l.aNrm);
    gl.vertexAttribPointer(l.aNrm, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(l.aCol);
    gl.vertexAttribPointer(l.aCol, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(l.aEm);
    gl.vertexAttribPointer(l.aEm, 1, gl.FLOAT, false, stride, 36);
  }

  _uploadLights() {
    // Keep the strongest few lights: score by intensity falling off with distance.
    const cam = this.camPos;
    const ls = this.lights;
    if (ls.length > MAX_LIGHTS) {
      for (const l of ls) {
        const d = Math.hypot(l.pos.x - cam.x, l.pos.y - cam.y, l.pos.z - cam.z);
        l._score = l.intensity * l.radius / (1 + d);
      }
      ls.sort((a, b) => b._score - a._score);
    }
    const n = Math.min(ls.length, MAX_LIGHTS);
    for (let i = 0; i < n; i++) {
      const l = ls[i];
      this.lightPos[i * 3] = l.pos.x; this.lightPos[i * 3 + 1] = l.pos.y; this.lightPos[i * 3 + 2] = l.pos.z;
      this.lightCol[i * 3] = l.color[0] * l.intensity;
      this.lightCol[i * 3 + 1] = l.color[1] * l.intensity;
      this.lightCol[i * 3 + 2] = l.color[2] * l.intensity;
      this.lightRad[i] = Math.max(l.radius, 0.001);
    }
    const gl = this.gl;
    gl.uniform1i(this.loc.uLightCount, n);
    if (n > 0) {
      gl.uniform3fv(this.loc.uLightPos, this.lightPos);
      gl.uniform3fv(this.loc.uLightCol, this.lightCol);
      gl.uniform1fv(this.loc.uLightRad, this.lightRad);
    }
  }
}

const _ax = v3(), _toCam = v3(), _side = v3();

