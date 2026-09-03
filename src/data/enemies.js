// Enemy factions and archetypes. Bodies are built from tagged boxes ("rigs")
// that enemy.js animates by tag, so every unit is authored as pure data.

export const FACTIONS = {
  severed: {
    id: 'severed', name: 'The Severed',
    desc: 'Scavenger crews stripping the system for parts, and for anyone still holding them.',
    body: [0.46, 0.40, 0.48], accent: [1.00, 0.48, 0.16], eye: [1.0, 0.72, 0.2], cloth: [0.58, 0.26, 0.26],
  },
  hollow: {
    id: 'hollow', name: 'The Hollow',
    desc: 'Something older than the war, still keeping its appointments.',
    body: [0.40, 0.44, 0.52], accent: [0.60, 0.38, 1.0], eye: [0.78, 0.55, 1.0], cloth: [0.24, 0.26, 0.40],
  },
};

// --- rigs -------------------------------------------------------------------
// off/size are in metres, relative to the unit's feet-centre, before `scale`.
const HUMANOID = [
  { off: [0, 1.52, 0], size: [0.20, 0.20, 0.20], color: 'body', anim: 'head' },
  { off: [0, 1.53, -0.17], size: [0.11, 0.05, 0.04], color: 'eye', glow: 1, anim: 'head' },
  { off: [0, 1.05, 0], size: [0.28, 0.32, 0.19], color: 'body', anim: 'torso' },
  { off: [0, 0.72, 0], size: [0.20, 0.14, 0.15], color: 'cloth', anim: 'torso' },
  { off: [0, 1.16, -0.16], size: [0.16, 0.14, 0.05], color: 'accent', glow: 0.75, anim: 'torso' },
  { off: [-0.36, 1.10, 0], size: [0.09, 0.26, 0.09], color: 'cloth', anim: 'armL' },
  { off: [0.36, 1.10, 0], size: [0.09, 0.26, 0.09], color: 'cloth', anim: 'armR' },
  { off: [-0.14, 0.36, 0], size: [0.10, 0.36, 0.11], color: 'body', anim: 'legL' },
  { off: [0.14, 0.36, 0], size: [0.10, 0.36, 0.11], color: 'body', anim: 'legR' },
];

const HEAVY = [
  { off: [0, 1.94, 0], size: [0.26, 0.24, 0.25], color: 'body', anim: 'head' },
  { off: [0, 1.96, -0.22], size: [0.16, 0.05, 0.05], color: 'eye', glow: 1, anim: 'head' },
  { off: [0, 1.36, 0], size: [0.46, 0.44, 0.30], color: 'body', anim: 'torso' },
  { off: [0, 1.52, -0.26], size: [0.28, 0.20, 0.06], color: 'accent', glow: 0.9, anim: 'torso' },
  { off: [-0.30, 1.72, 0], size: [0.14, 0.14, 0.20], color: 'cloth', anim: 'torso' },
  { off: [0.30, 1.72, 0], size: [0.14, 0.14, 0.20], color: 'cloth', anim: 'torso' },
  { off: [-0.56, 1.34, 0], size: [0.14, 0.34, 0.14], color: 'cloth', anim: 'armL' },
  { off: [0.56, 1.34, 0], size: [0.14, 0.34, 0.14], color: 'cloth', anim: 'armR' },
  { off: [-0.20, 0.46, 0], size: [0.15, 0.46, 0.16], color: 'body', anim: 'legL' },
  { off: [0.20, 0.46, 0], size: [0.15, 0.46, 0.16], color: 'body', anim: 'legR' },
];

const FOURARM = [
  { off: [0, 1.60, 0], size: [0.21, 0.21, 0.21], color: 'body', anim: 'head' },
  { off: [0, 1.61, -0.19], size: [0.13, 0.05, 0.04], color: 'eye', glow: 1, anim: 'head' },
  { off: [0, 1.12, 0], size: [0.32, 0.34, 0.21], color: 'body', anim: 'torso' },
  { off: [0, 1.28, -0.19], size: [0.20, 0.16, 0.05], color: 'accent', glow: 0.85, anim: 'torso' },
  { off: [0, 0.76, 0], size: [0.24, 0.15, 0.17], color: 'cloth', anim: 'torso' },
  { off: [-0.40, 1.24, 0], size: [0.09, 0.24, 0.09], color: 'cloth', anim: 'armL' },
  { off: [0.40, 1.24, 0], size: [0.09, 0.24, 0.09], color: 'cloth', anim: 'armR' },
  { off: [-0.38, 0.94, 0.06], size: [0.07, 0.20, 0.07], color: 'cloth', anim: 'armR' },
  { off: [0.38, 0.94, 0.06], size: [0.07, 0.20, 0.07], color: 'cloth', anim: 'armL' },
  { off: [-0.15, 0.38, 0], size: [0.11, 0.38, 0.12], color: 'body', anim: 'legL' },
  { off: [0.15, 0.38, 0], size: [0.11, 0.38, 0.12], color: 'body', anim: 'legR' },
];

const FLOATER = [
  { off: [0, 1.15, 0], size: [0.30, 0.30, 0.30], color: 'body', anim: 'bob' },
  { off: [0, 1.15, -0.30], size: [0.14, 0.14, 0.05], color: 'eye', glow: 1, anim: 'bob' },
  { off: [-0.40, 1.15, 0], size: [0.10, 0.22, 0.10], color: 'accent', glow: 0.7, anim: 'spinL' },
  { off: [0.40, 1.15, 0], size: [0.10, 0.22, 0.10], color: 'accent', glow: 0.7, anim: 'spinR' },
  { off: [0, 0.86, 0], size: [0.16, 0.06, 0.16], color: 'cloth', anim: 'bob' },
];

const BEAST = [
  { off: [0, 0.86, -0.34], size: [0.20, 0.17, 0.22], color: 'body', anim: 'head' },
  { off: [0, 0.88, -0.54], size: [0.12, 0.04, 0.04], color: 'eye', glow: 1, anim: 'head' },
  { off: [0, 0.82, 0.06], size: [0.26, 0.20, 0.42], color: 'body', anim: 'torso' },
  { off: [0, 0.98, 0.10], size: [0.10, 0.09, 0.30], color: 'accent', glow: 0.8, anim: 'torso' },
  { off: [-0.20, 0.38, -0.26], size: [0.08, 0.38, 0.09], color: 'cloth', anim: 'legL' },
  { off: [0.20, 0.38, -0.26], size: [0.08, 0.38, 0.09], color: 'cloth', anim: 'legR' },
  { off: [-0.20, 0.38, 0.32], size: [0.08, 0.38, 0.09], color: 'cloth', anim: 'legR' },
  { off: [0.20, 0.38, 0.32], size: [0.08, 0.38, 0.09], color: 'cloth', anim: 'legL' },
];

const TITAN_RIG = [
  { off: [0, 3.30, 0], size: [0.46, 0.42, 0.44], color: 'body', anim: 'head' },
  { off: [0, 3.32, -0.40], size: [0.30, 0.09, 0.08], color: 'eye', glow: 1, anim: 'head' },
  { off: [0, 2.20, 0], size: [0.85, 0.80, 0.56], color: 'body', anim: 'torso' },
  { off: [0, 2.55, -0.50], size: [0.50, 0.34, 0.10], color: 'accent', glow: 1, anim: 'torso' },
  { off: [-0.62, 2.85, 0], size: [0.26, 0.26, 0.34], color: 'cloth', anim: 'torso' },
  { off: [0.62, 2.85, 0], size: [0.26, 0.26, 0.34], color: 'cloth', anim: 'torso' },
  { off: [-1.02, 2.20, 0], size: [0.24, 0.62, 0.26], color: 'cloth', anim: 'armL' },
  { off: [1.02, 2.20, 0], size: [0.24, 0.62, 0.26], color: 'cloth', anim: 'armR' },
  { off: [-0.36, 0.76, 0], size: [0.27, 0.76, 0.30], color: 'body', anim: 'legL' },
  { off: [0.36, 0.76, 0], size: [0.27, 0.76, 0.30], color: 'body', anim: 'legR' },
];

export const RIGS = { HUMANOID, HEAVY, FOURARM, FLOATER, BEAST, TITAN_RIG };

// --- archetypes -------------------------------------------------------------
// hp/damage are baselines at power parity; activities scale them.
export const ENEMIES = {
  // ---------------- Severed
  husk: {
    id: 'husk', name: 'Husk', faction: 'severed', rank: 'minor', rig: 'HUMANOID', scale: 0.92,
    hp: 110, speed: 6.4, accel: 26, xp: 26, score: 12, radius: 0.42, height: 1.75, crit: { y: 1.5, r: 0.32 },
    ai: 'melee', melee: { damage: 15, range: 2.2, rate: 1.15, windup: 0.4 },
    aggroRange: 46, tint: [1.0, 0.9, 0.9],
  },
  marauder: {
    id: 'marauder', name: 'Marauder', faction: 'severed', rank: 'minor', rig: 'HUMANOID', scale: 1.0,
    hp: 155, speed: 4.4, accel: 18, xp: 34, score: 16, radius: 0.44, height: 1.8, crit: { y: 1.55, r: 0.32 },
    ai: 'ranged', weapon: { damage: 8, rate: 0.85, burst: 3, burstDelay: 0.12, speed: 46, spread: 0.055, range: 40, color: [1, 0.55, 0.2] },
    strafe: 0.7, coverBias: 0.5, aggroRange: 52,
  },
  lancer: {
    id: 'lancer', name: 'Lancer', faction: 'severed', rank: 'minor', rig: 'FOURARM', scale: 1.05,
    hp: 240, speed: 4.0, accel: 16, xp: 48, score: 24, radius: 0.46, height: 1.9, crit: { y: 1.62, r: 0.32 },
    ai: 'ranged', weapon: { damage: 15, rate: 1.35, burst: 2, burstDelay: 0.18, speed: 58, spread: 0.025, range: 55, color: [1, 0.4, 0.15] },
    strafe: 0.5, coverBias: 0.7, aggroRange: 62,
  },
  reaver: {
    id: 'reaver', name: 'Reaver', faction: 'severed', rank: 'minor', rig: 'FOURARM', scale: 1.08,
    hp: 210, speed: 3.4, accel: 14, xp: 62, score: 30, radius: 0.46, height: 1.95, crit: { y: 1.66, r: 0.32 },
    ai: 'sniper', weapon: { damage: 46, rate: 3.2, telegraph: 1.25, hitscan: true, range: 110, color: [1, 0.25, 0.25] },
    strafe: 0.2, coverBias: 0.9, aggroRange: 110, preferredRange: 40,
  },
  shank: {
    id: 'shank', name: 'Shank', faction: 'severed', rank: 'minor', rig: 'FLOATER', scale: 1.0,
    hp: 90, speed: 5.2, accel: 12, xp: 22, score: 10, radius: 0.42, height: 1.5, flying: true, crit: { y: 1.15, r: 0.34 },
    ai: 'ranged', weapon: { damage: 7, rate: 1.1, burst: 2, burstDelay: 0.14, speed: 40, spread: 0.065, range: 34, color: [1, 0.6, 0.2] },
    strafe: 1.1, aggroRange: 44,
  },
  captain: {
    id: 'captain', name: 'Severed Captain', faction: 'severed', rank: 'major', rig: 'FOURARM', scale: 1.35,
    hp: 1400, shield: 620, shieldElement: 'surge', speed: 4.6, accel: 20, xp: 240, score: 120,
    radius: 0.62, height: 2.5, crit: { y: 2.12, r: 0.4 },
    ai: 'ranged', weapon: { damage: 19, rate: 1.15, burst: 4, burstDelay: 0.09, speed: 52, spread: 0.05, range: 45, color: [0.4, 0.9, 1] },
    blink: { range: 9, cooldown: 5 }, strafe: 0.9, aggroRange: 70, stagger: 0.45,
  },
  // ---------------- Hollow
  gnaw: {
    id: 'gnaw', name: 'Gnaw', faction: 'hollow', rank: 'minor', rig: 'BEAST', scale: 1.0,
    hp: 85, speed: 7.6, accel: 32, xp: 22, score: 10, radius: 0.4, height: 1.1, crit: { y: 0.9, r: 0.3 },
    ai: 'melee', melee: { damage: 12, range: 2.0, rate: 0.95, windup: 0.3 },
    aggroRange: 55, swarm: true,
  },
  chanter: {
    id: 'chanter', name: 'Chanter', faction: 'hollow', rank: 'minor', rig: 'HUMANOID', scale: 1.0,
    hp: 170, speed: 3.8, accel: 15, xp: 36, score: 18, radius: 0.44, height: 1.8, crit: { y: 1.55, r: 0.32 },
    ai: 'ranged', weapon: { damage: 13, rate: 1.25, burst: 1, speed: 34, spread: 0.035, range: 44, color: [0.7, 0.45, 1] },
    strafe: 0.4, coverBias: 0.6, aggroRange: 58,
  },
  veilwitch: {
    id: 'veilwitch', name: 'Veilwitch', faction: 'hollow', rank: 'minor', rig: 'FLOATER', scale: 1.25,
    hp: 380, shield: 180, shieldElement: 'null', speed: 3.2, accel: 10, xp: 90, score: 44,
    radius: 0.5, height: 1.9, flying: true, hover: 1.6, crit: { y: 1.5, r: 0.36 },
    ai: 'caster', weapon: { damage: 18, rate: 2.1, speed: 26, spread: 0.025, range: 46, seek: 0.7, color: [0.75, 0.4, 1] },
    strafe: 0.8, aggroRange: 60,
  },
  hollowKnight: {
    id: 'hollowKnight', name: 'Hollow Knight', faction: 'hollow', rank: 'major', rig: 'HEAVY', scale: 1.3,
    hp: 1800, shield: 500, shieldElement: 'ember', speed: 4.0, accel: 18, xp: 260, score: 130,
    radius: 0.66, height: 2.6, crit: { y: 2.3, r: 0.42 },
    ai: 'ranged', weapon: { damage: 26, rate: 1.5, burst: 1, speed: 38, spread: 0.025, range: 40, splash: 3.0, color: [1, 0.5, 0.2] },
    melee: { damage: 46, range: 3.4, rate: 1.6, windup: 0.5 },
    wall: { duration: 4, cooldown: 12 }, aggroRange: 66, stagger: 0.4,
  },
  colossus: {
    id: 'colossus', name: 'Hollow Colossus', faction: 'hollow', rank: 'ultra', rig: 'TITAN_RIG', scale: 1.0,
    hp: 9000, shield: 2200, shieldElement: 'null', speed: 3.0, accel: 10, xp: 900, score: 500,
    radius: 1.35, height: 4.0, crit: { y: 3.35, r: 0.6 },
    ai: 'boss', weapon: { damage: 13, rate: 0.16, beam: true, range: 40, color: [0.75, 0.4, 1] },
    slam: { damage: 115, radius: 9, cooldown: 8.5, windup: 1.1 },
    aggroRange: 90, stagger: 0.18, immuneToStagger: false,
  },
  // ---------------- named bosses
  kell: {
    id: 'kell', name: 'Vashek, the Sundered Kell', faction: 'severed', rank: 'boss', rig: 'TITAN_RIG', scale: 1.15,
    hp: 30000, shield: 6000, shieldElement: 'surge', speed: 4.6, accel: 16, xp: 3000, score: 2000,
    radius: 1.5, height: 4.6, crit: { y: 3.8, r: 0.66 },
    ai: 'boss', weapon: { damage: 22, rate: 0.85, burst: 5, burstDelay: 0.08, speed: 60, spread: 0.035, range: 60, color: [0.4, 0.9, 1] },
    slam: { damage: 150, radius: 11, cooldown: 9, windup: 1.05 },
    blink: { range: 16, cooldown: 7 },
    phases: [
      { at: 1.00, adds: ['marauder', 'marauder', 'husk', 'husk'], immune: false },
      { at: 0.66, adds: ['lancer', 'lancer', 'captain'], immune: true, immuneUntilAddsDead: true, shout: 'VASHEK RAISES A BARRIER — KILL THE GUARDS' },
      { at: 0.33, adds: ['captain', 'reaver', 'reaver', 'husk', 'husk', 'husk'], immune: true, immuneUntilAddsDead: true, shout: 'THE KELL CALLS EVERY BLADE — CLEAR THE ROOM' },
    ],
    stagger: 0.12,
  },
  warpriest: {
    id: 'warpriest', name: 'The Warpriest of Ash', faction: 'hollow', rank: 'boss', rig: 'TITAN_RIG', scale: 1.05,
    hp: 24000, shield: 5000, shieldElement: 'ember', speed: 3.4, accel: 12, xp: 2600, score: 1800,
    radius: 1.4, height: 4.3, crit: { y: 3.6, r: 0.62 },
    ai: 'boss', weapon: { damage: 16, rate: 0.2, beam: true, range: 46, color: [1, 0.45, 0.2] },
    slam: { damage: 135, radius: 10, cooldown: 8, windup: 1.15 },
    phases: [
      { at: 1.00, adds: ['chanter', 'chanter', 'gnaw', 'gnaw', 'gnaw'], immune: false },
      { at: 0.60, adds: ['veilwitch', 'veilwitch', 'hollowKnight'], immune: true, immuneUntilAddsDead: true, shout: 'THE WARPRIEST IS SHIELDED — DESTROY THE WITCHES' },
      { at: 0.28, adds: ['hollowKnight', 'hollowKnight', 'gnaw', 'gnaw', 'gnaw', 'gnaw'], immune: true, immuneUntilAddsDead: true, shout: 'ASH FLOODS THE CHAMBER — SURVIVE AND CLEAR' },
    ],
    stagger: 0.12,
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES);

/** Which units a faction can field, grouped for spawn tables. */
export const SPAWN_TABLES = {
  severed: {
    minor: [{ id: 'husk', weight: 3 }, { id: 'marauder', weight: 3 }, { id: 'shank', weight: 2 }, { id: 'lancer', weight: 1.6 }],
    special: [{ id: 'reaver', weight: 1 }, { id: 'lancer', weight: 1.4 }],
    major: [{ id: 'captain', weight: 1 }],
  },
  hollow: {
    minor: [{ id: 'gnaw', weight: 3.4 }, { id: 'chanter', weight: 3 }, { id: 'gnaw', weight: 1.4 }],
    special: [{ id: 'veilwitch', weight: 1 }, { id: 'chanter', weight: 1.2 }],
    major: [{ id: 'hollowKnight', weight: 1 }],
  },
};

export const RANK_INFO = {
  minor: { hpMul: 1, name: '', barColor: '#ff5f5f', showBar: false },
  major: { hpMul: 1, name: 'Major', barColor: '#ffd45f', showBar: true },
  ultra: { hpMul: 1, name: 'Ultra', barColor: '#ff9d3c', showBar: true },
  boss:  { hpMul: 1, name: 'Boss',  barColor: '#ff6b3c', showBar: true },
};
