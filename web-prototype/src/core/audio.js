// Everything you hear is synthesised at runtime — no audio files to ship.
// A small WebAudio toolkit (noise bursts, swept oscillators, filtered impacts)
// plus a generative ambient bed that leans into combat intensity.

export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.enabled = true;
    this.volume = 0.7;
    this.musicVolume = 0.45;
    this.intensity = 0;      // 0 = calm, 1 = heavy combat
    this._targetIntensity = 0;
    this._started = false;
    this._voices = 0;        // crude polyphony budget
    this._lastVoiceReset = 0;
  }

  /** Must be called from a user gesture (browsers block audio otherwise). */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1;
    this.sfxGain.connect(this.master);

    // A touch of reverb keeps the arenas from sounding like a closet.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.9, 2.4);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.26;
    this.reverbGain.connect(this.master);
    this.reverb.connect(this.reverbGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    this.noiseBuf = this._noise(2.0);
    this._startAmbient();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }

  _noise(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  get t() { return this.ctx.currentTime; }

  /** Rate-limit simultaneous voices so a rocket volley can't blow out the mix. */
  _budget() {
    const now = performance.now();
    if (now - this._lastVoiceReset > 60) { this._voices = 0; this._lastVoiceReset = now; }
    if (this._voices > 14) return false;
    this._voices++;
    return true;
  }

  _ready() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  /** Core one-shot: noise or oscillator into a filter into an ADSR-ish gain. */
  _shot(opts) {
    if (!this._ready() || !this._budget()) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const {
      type = 'noise', freq = 220, freqEnd = freq, wave = 'sawtooth',
      dur = 0.16, attack = 0.004, gain = 0.3, filter = 'lowpass',
      cutoff = 2200, cutoffEnd = cutoff, q = 1, pan = 0, send = 0.12, curve = 2,
    } = opts;

    let src;
    if (type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
    } else {
      src = ctx.createOscillator();
      src.type = wave;
      src.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== freq) src.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + dur);
    }

    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.frequency.setValueAtTime(Math.max(cutoff, 20), t0);
    if (cutoffEnd !== cutoff) flt.frequency.exponentialRampToValueAtTime(Math.max(cutoffEnd, 20), t0 + dur);
    flt.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0.0001, t0 + attack, dur / (curve * 3));

    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(flt); flt.connect(g);
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfxGain); }
    else g.connect(this.sfxGain);
    if (send > 0) {
      const sg = ctx.createGain(); sg.gain.value = send;
      g.connect(sg); sg.connect(this.reverb);
    }

    src.start(t0);
    src.stop(t0 + dur + 0.35);
  }

  // ------------------------------------------------------------- weapons
  /** `family` picks the character; `pitch` lets similar guns sound distinct. */
  fire(family, pitch = 1, pan = 0) {
    if (!this._ready()) return;
    switch (family) {
      case 'auto':
        this._shot({ type: 'noise', dur: 0.09, gain: 0.20, cutoff: 3400 * pitch, cutoffEnd: 700, q: 2, pan });
        this._shot({ type: 'osc', wave: 'square', freq: 190 * pitch, freqEnd: 62, dur: 0.08, gain: 0.16, cutoff: 1400, pan });
        break;
      case 'smg':
        this._shot({ type: 'noise', dur: 0.06, gain: 0.15, cutoff: 4600 * pitch, cutoffEnd: 1100, q: 1.6, pan });
        this._shot({ type: 'osc', wave: 'square', freq: 260 * pitch, freqEnd: 95, dur: 0.05, gain: 0.11, cutoff: 1900, pan });
        break;
      case 'hand':
        this._shot({ type: 'noise', dur: 0.24, gain: 0.34, cutoff: 2600 * pitch, cutoffEnd: 300, q: 1.2, pan, send: 0.3 });
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 150 * pitch, freqEnd: 40, dur: 0.2, gain: 0.26, cutoff: 900, pan });
        break;
      case 'pulse':
        this._shot({ type: 'noise', dur: 0.07, gain: 0.19, cutoff: 3900 * pitch, cutoffEnd: 900, q: 3, pan });
        this._shot({ type: 'osc', wave: 'square', freq: 320 * pitch, freqEnd: 120, dur: 0.06, gain: 0.13, cutoff: 2200, pan });
        break;
      case 'scout':
        this._shot({ type: 'noise', dur: 0.18, gain: 0.28, cutoff: 3000 * pitch, cutoffEnd: 420, q: 1.4, pan, send: 0.28 });
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 210 * pitch, freqEnd: 55, dur: 0.16, gain: 0.2, cutoff: 1200, pan });
        break;
      case 'shotgun':
        this._shot({ type: 'noise', dur: 0.34, gain: 0.42, cutoff: 2000 * pitch, cutoffEnd: 180, q: 0.9, pan, send: 0.34 });
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 110 * pitch, freqEnd: 32, dur: 0.28, gain: 0.3, cutoff: 700, pan });
        break;
      case 'sniper':
        this._shot({ type: 'noise', dur: 0.5, gain: 0.4, cutoff: 5200 * pitch, cutoffEnd: 260, q: 1.1, pan, send: 0.45 });
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 240 * pitch, freqEnd: 30, dur: 0.4, gain: 0.3, cutoff: 1000, pan });
        break;
      case 'fusion':
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 90, freqEnd: 900 * pitch, dur: 0.42, gain: 0.2, cutoff: 900, cutoffEnd: 5000, q: 6, pan });
        this._shot({ type: 'noise', dur: 0.3, gain: 0.22, cutoff: 900, cutoffEnd: 6000, q: 4, pan, send: 0.35 });
        break;
      case 'rocket':
        this._shot({ type: 'noise', dur: 0.6, gain: 0.4, cutoff: 1400, cutoffEnd: 160, q: 0.8, pan, send: 0.4 });
        this._shot({ type: 'osc', wave: 'sawtooth', freq: 300, freqEnd: 60, dur: 0.5, gain: 0.24, cutoff: 800, pan });
        break;
      case 'mg':
        this._shot({ type: 'noise', dur: 0.11, gain: 0.26, cutoff: 2600 * pitch, cutoffEnd: 420, q: 1.6, pan });
        this._shot({ type: 'osc', wave: 'square', freq: 130 * pitch, freqEnd: 44, dur: 0.1, gain: 0.2, cutoff: 900, pan });
        break;
      default:
        this._shot({ type: 'noise', dur: 0.1, gain: 0.2, cutoff: 3000, cutoffEnd: 600, pan });
    }
  }

  charge(sec = 0.5) {
    this._shot({ type: 'osc', wave: 'triangle', freq: 120, freqEnd: 780, dur: sec, gain: 0.12, cutoff: 1400, cutoffEnd: 4200, q: 5, attack: 0.05 });
  }

  dryFire() { this._shot({ type: 'noise', dur: 0.05, gain: 0.12, cutoff: 1800, cutoffEnd: 400, q: 6 }); }

  reload(stage = 0) {
    const f = [1, 1.35, 0.8][stage % 3];
    this._shot({ type: 'noise', dur: 0.07, gain: 0.16, cutoff: 2400 * f, cutoffEnd: 500, q: 4 });
  }

  // ------------------------------------------------------------- impacts
  hit(crit = false) {
    this._shot({ type: 'noise', dur: crit ? 0.1 : 0.06, gain: crit ? 0.2 : 0.12,
      cutoff: crit ? 5200 : 2600, cutoffEnd: 900, q: 3, send: 0.06 });
    if (crit) this._shot({ type: 'osc', wave: 'sine', freq: 1500, freqEnd: 2400, dur: 0.09, gain: 0.1, cutoff: 6000 });
  }

  ricochet() { this._shot({ type: 'osc', wave: 'sine', freq: 2400, freqEnd: 700, dur: 0.13, gain: 0.06, cutoff: 6000, q: 3 }); }

  kill(major = false) {
    this._shot({ type: 'noise', dur: major ? 0.5 : 0.22, gain: major ? 0.3 : 0.18,
      cutoff: 1800, cutoffEnd: 140, q: 1.2, send: 0.4 });
    if (major) this._shot({ type: 'osc', wave: 'sawtooth', freq: 200, freqEnd: 40, dur: 0.6, gain: 0.2, cutoff: 700 });
  }

  explode(big = false) {
    this._shot({ type: 'noise', dur: big ? 1.1 : 0.6, gain: big ? 0.5 : 0.35,
      cutoff: big ? 1200 : 1600, cutoffEnd: 90, q: 0.8, send: 0.5, curve: 3 });
    this._shot({ type: 'osc', wave: 'sine', freq: big ? 120 : 180, freqEnd: 24, dur: big ? 0.9 : 0.5, gain: 0.36, cutoff: 400 });
  }

  shieldBreak(element) {
    const base = element === 'ember' ? 520 : element === 'surge' ? 900 : 320;
    this._shot({ type: 'osc', wave: 'square', freq: base, freqEnd: base * 3, dur: 0.3, gain: 0.22, cutoff: 3000, q: 4, send: 0.4 });
    this._shot({ type: 'noise', dur: 0.35, gain: 0.2, cutoff: 5000, cutoffEnd: 700, q: 2, send: 0.4 });
  }

  // ------------------------------------------------------------- player state
  hurt(severity = 1) {
    this._shot({ type: 'noise', dur: 0.22, gain: 0.16 * severity, cutoff: 900, cutoffEnd: 160, q: 1.5 });
    this._shot({ type: 'osc', wave: 'sine', freq: 160, freqEnd: 70, dur: 0.25, gain: 0.14 * severity, cutoff: 400 });
  }
  shieldDown() { this._shot({ type: 'osc', wave: 'sawtooth', freq: 900, freqEnd: 180, dur: 0.4, gain: 0.16, cutoff: 2400, q: 3, send: 0.3 }); }
  shieldUp() { this._shot({ type: 'osc', wave: 'sine', freq: 420, freqEnd: 1050, dur: 0.35, gain: 0.11, cutoff: 4000, attack: 0.06 }); }
  die() {
    this._shot({ type: 'osc', wave: 'sawtooth', freq: 300, freqEnd: 28, dur: 1.6, gain: 0.3, cutoff: 1400, cutoffEnd: 120, send: 0.6, curve: 4 });
    this._shot({ type: 'noise', dur: 1.4, gain: 0.22, cutoff: 900, cutoffEnd: 60, send: 0.6, curve: 4 });
  }
  revive() {
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() =>
      this._shot({ type: 'osc', wave: 'triangle', freq: f, freqEnd: f, dur: 0.5, gain: 0.1, cutoff: 5000, attack: 0.02, send: 0.4 }), i * 90));
  }

  // ------------------------------------------------------------- abilities
  ability(kind, element = 'null') {
    const tone = element === 'ember' ? 1.0 : element === 'surge' ? 1.5 : 0.7;
    if (kind === 'grenade') {
      this._shot({ type: 'osc', wave: 'triangle', freq: 300 * tone, freqEnd: 900 * tone, dur: 0.22, gain: 0.14, cutoff: 3000, attack: 0.01 });
    } else if (kind === 'melee') {
      this._shot({ type: 'noise', dur: 0.2, gain: 0.24, cutoff: 3200, cutoffEnd: 300, q: 2, send: 0.3 });
      this._shot({ type: 'osc', wave: 'square', freq: 420 * tone, freqEnd: 90, dur: 0.18, gain: 0.16, cutoff: 1800 });
    } else if (kind === 'class') {
      this._shot({ type: 'osc', wave: 'sine', freq: 180 * tone, freqEnd: 620 * tone, dur: 0.7, gain: 0.15, cutoff: 3000, attack: 0.1, send: 0.5 });
    }
  }

  superCast(element = 'null') {
    if (!this._ready()) return;
    const base = element === 'ember' ? 174 : element === 'surge' ? 220 : 146;
    [1, 1.5, 2, 3].forEach((mult, i) => {
      setTimeout(() => this._shot({
        type: 'osc', wave: i > 1 ? 'sawtooth' : 'triangle',
        freq: base * mult, freqEnd: base * mult * 1.02,
        dur: 1.4, gain: 0.13, cutoff: 3600, attack: 0.03, send: 0.6,
      }), i * 55);
    });
    this._shot({ type: 'noise', dur: 1.3, gain: 0.25, cutoff: 300, cutoffEnd: 7000, q: 2, attack: 0.25, send: 0.6 });
  }

  superReady() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() =>
      this._shot({ type: 'osc', wave: 'sine', freq: f, dur: 0.6, gain: 0.12, cutoff: 6000, attack: 0.01, send: 0.5 }), i * 110));
  }

  // ------------------------------------------------------------- UI / loot
  pickup() { this._shot({ type: 'osc', wave: 'sine', freq: 880, freqEnd: 1320, dur: 0.14, gain: 0.09, cutoff: 6000 }); }
  ammoPickup() { this._shot({ type: 'osc', wave: 'triangle', freq: 520, freqEnd: 780, dur: 0.12, gain: 0.08, cutoff: 5000 }); }

  /** Loot chime scales with rarity — exotics get the big arpeggio. */
  loot(rarity) {
    const sets = {
      common: [523], uncommon: [523, 659], rare: [523, 659, 784],
      legendary: [523, 659, 784, 1046], exotic: [392, 523, 659, 784, 1046, 1318],
    };
    const notes = sets[rarity] || sets.common;
    const gain = rarity === 'exotic' ? 0.15 : rarity === 'legendary' ? 0.12 : 0.09;
    notes.forEach((f, i) => setTimeout(() => this._shot({
      type: 'osc', wave: rarity === 'exotic' ? 'triangle' : 'sine',
      freq: f, dur: 0.7, gain, cutoff: 7000, attack: 0.008, send: 0.5,
    }), i * (rarity === 'exotic' ? 90 : 70)));
  }

  levelUp() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() =>
      this._shot({ type: 'osc', wave: 'triangle', freq: f, dur: 0.8, gain: 0.11, cutoff: 7000, send: 0.55 }), i * 80));
  }

  ui(kind = 'click') {
    if (kind === 'click') this._shot({ type: 'osc', wave: 'square', freq: 1200, freqEnd: 1800, dur: 0.04, gain: 0.05, cutoff: 5000 });
    else if (kind === 'back') this._shot({ type: 'osc', wave: 'square', freq: 700, freqEnd: 420, dur: 0.06, gain: 0.05, cutoff: 4000 });
    else if (kind === 'error') this._shot({ type: 'osc', wave: 'square', freq: 220, freqEnd: 160, dur: 0.16, gain: 0.07, cutoff: 2000 });
    else if (kind === 'open') this._shot({ type: 'noise', dur: 0.18, gain: 0.06, cutoff: 900, cutoffEnd: 4000, q: 2 });
  }

  objective() {
    [392, 523, 784].forEach((f, i) => setTimeout(() =>
      this._shot({ type: 'osc', wave: 'sine', freq: f, dur: 0.9, gain: 0.1, cutoff: 6000, attack: 0.03, send: 0.6 }), i * 130));
  }

  warn() {
    this._shot({ type: 'osc', wave: 'square', freq: 300, freqEnd: 300, dur: 0.5, gain: 0.09, cutoff: 1600 });
    setTimeout(() => this._shot({ type: 'osc', wave: 'square', freq: 240, dur: 0.5, gain: 0.09, cutoff: 1600 }), 200);
  }

  // ------------------------------------------------------------- ambient bed
  _startAmbient() {
    if (this._started) return;
    this._started = true;
    const ctx = this.ctx;

    // Two detuned saw drones through a slow filter = spacey pad.
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 400;
    this.padFilter.Q.value = 1.5;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.musicGain);
    const rvb = ctx.createGain(); rvb.gain.value = 0.5;
    this.padGain.connect(rvb); rvb.connect(this.reverb);

    this.padOscs = [];
    [55, 82.4, 110, 164.8].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i > 1 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain();
      g.gain.value = i > 1 ? 0.06 : 0.13;
      o.connect(g); g.connect(this.padFilter);
      o.start();
      this.padOscs.push({ o, g, base: f });
    });

    // A slow LFO on the filter so the bed breathes.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.06;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 180;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.padFilter.frequency);
    this.lfo.start();

    this._pulseTimer = 0;
  }

  /** Call once per frame. Drives the combat-intensity music response. */
  update(dt, intensity) {
    if (!this._ready() || !this.padGain) return;
    this._targetIntensity = intensity;
    this.intensity += (this._targetIntensity - this.intensity) * Math.min(1, dt * 0.7);
    const i = this.intensity;
    this.padGain.gain.value += (0.22 + i * 0.5 - this.padGain.gain.value) * Math.min(1, dt * 2);
    this.padFilter.frequency.value = 320 + i * 1400;
    for (const p of this.padOscs) p.o.detune.value = (Math.random() - 0.5) * 4 + i * 10;

    // Combat adds a heartbeat pulse; the hotter the fight, the faster it drives.
    if (i > 0.18) {
      this._pulseTimer -= dt;
      if (this._pulseTimer <= 0) {
        this._pulseTimer = 1.0 - i * 0.55;
        this._shot({ type: 'osc', wave: 'sine', freq: 62, freqEnd: 40, dur: 0.28, gain: 0.06 + i * 0.1, cutoff: 300, send: 0.1 });
        if (i > 0.6) this._shot({ type: 'noise', dur: 0.08, gain: 0.03 + i * 0.04, cutoff: 6000, cutoffEnd: 2000, q: 2 });
      }
    }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
