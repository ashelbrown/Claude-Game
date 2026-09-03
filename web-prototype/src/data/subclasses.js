// Three classes, three elemental subclasses each. Abilities are declared as
// (behavior + parameters) so player.js implements each behavior exactly once.

export const CLASSES = {
  warden: {
    id: 'warden', name: 'Warden', role: 'Frontline Bulwark',
    blurb: 'Walks in first, leaves last. Trades finesse for a wall of armour and a fist the size of an argument.',
    highlights: ['<b>Barricade</b> — deployable cover that actually stops bullets',
                 '<b>Highest health</b> and flinch resistance',
                 'Melee-forward Supers that reward closing distance'],
    classAbility: 'barricade',
    baseStats: { resilience: 22, mobility: 6, recovery: 12, discipline: 10, intellect: 10, strength: 14 },
    jumps: 1, jumpPower: 8.6, moveSpeed: 5.4,
    subclasses: ['emberforge', 'stormguard', 'bulwark'],
  },
  ranger: {
    id: 'ranger', name: 'Ranger', role: 'Mobile Skirmisher',
    blurb: 'Never where the shot lands. Dodges, throws knives, and ends fights from angles nobody covered.',
    highlights: ['<b>Dodge</b> — instant sidestep that reloads your weapon',
                 '<b>Fastest movement</b> and a triple jump',
                 'Precision Supers that delete priority targets'],
    classAbility: 'dodge',
    baseStats: { resilience: 8, mobility: 22, recovery: 12, discipline: 12, intellect: 12, strength: 12 },
    jumps: 3, jumpPower: 7.4, moveSpeed: 6.2,
    subclasses: ['gunslinger', 'bladedancer', 'nightstalker'],
  },
  adept: {
    id: 'adept', name: 'Adept', role: 'Battlefield Caster',
    blurb: 'Bends the field around them. Places wells of healing, throws physics at crowds, and rarely reloads.',
    highlights: ['<b>Rift</b> — a well that heals or empowers whoever stands in it',
                 '<b>Best recovery</b> and ability uptime',
                 'Area-clearing Supers built for crowds'],
    classAbility: 'rift',
    baseStats: { resilience: 12, mobility: 10, recovery: 22, discipline: 16, intellect: 14, strength: 8 },
    jumps: 2, jumpPower: 7.8, moveSpeed: 5.7,
    subclasses: ['dawnblade', 'stormcaller', 'voidwalker'],
  },
};
export const CLASS_IDS = ['warden', 'ranger', 'adept'];

// --- reusable grenade definitions
const GRENADES = {
  firebolt: {
    id: 'firebolt', name: 'Firebolt Grenade', behavior: 'firebolt', element: 'ember',
    desc: 'Bursts into seeking bolts of flame that scorch everything nearby.',
    damage: 95, radius: 6.5, burn: { dps: 22, dur: 5 }, bolts: 4, cooldown: 26, speed: 26, gravity: 12,
  },
  pulse: {
    id: 'pulse', name: 'Pulse Grenade', behavior: 'pulse', element: 'surge',
    desc: 'Sticks where it lands and discharges arc energy in repeating pulses.',
    damage: 52, radius: 5.4, pulses: 5, interval: 0.55, cooldown: 24, speed: 22, gravity: 14,
  },
  vortex: {
    id: 'vortex', name: 'Vortex Grenade', behavior: 'vortex', element: 'null',
    desc: 'Opens a lingering well that grinds down anything inside it.',
    damage: 30, radius: 4.6, duration: 5.5, tick: 0.4, pull: 5, cooldown: 28, speed: 20, gravity: 13,
  },
  tripmine: {
    id: 'tripmine', name: 'Tripmine', behavior: 'tripmine', element: 'ember',
    desc: 'Adheres to any surface and detonates violently on proximity.',
    damage: 260, radius: 5.2, armTime: 0.4, life: 22, cooldown: 30, speed: 42, gravity: 3,
  },
  frag: {
    id: 'frag', name: 'Frag Grenade', behavior: 'frag', element: 'kinetic',
    desc: 'Bounces once, then detonates for heavy direct damage.',
    damage: 190, radius: 5.6, fuse: 1.1, cooldown: 22, speed: 28, gravity: 16, bounce: 2,
  },
};

// --- reusable melee definitions
const MELEES = {
  shoulderCharge: {
    id: 'shoulderCharge', name: 'Shoulder Charge', behavior: 'charge',
    desc: 'Launch forward and detonate on the first thing you reach.',
    damage: 260, range: 7.5, radius: 3.2, cooldown: 16, dashSpeed: 26,
  },
  throwingKnife: {
    id: 'throwingKnife', name: 'Throwing Knife', behavior: 'knife',
    desc: 'A thrown blade. Precision hits ignite the target.',
    damage: 150, critMult: 2.2, cooldown: 13, speed: 55, gravity: 3,
  },
  palmBlast: {
    id: 'palmBlast', name: 'Palm Blast', behavior: 'blast',
    desc: 'A close-range detonation that returns health on impact.',
    damage: 210, range: 5.5, radius: 3.6, cooldown: 15, heal: 60,
  },
  daggerStrike: {
    id: 'daggerStrike', name: 'Dagger Strike', behavior: 'charge',
    desc: 'Short dash strike that refunds melee energy on a kill.',
    damage: 220, range: 6.0, radius: 2.4, cooldown: 12, dashSpeed: 30, refundOnKill: 0.5,
  },
  smokeBomb: {
    id: 'smokeBomb', name: 'Smoke Bomb', behavior: 'knife',
    desc: 'A thrown charge that blinds enemies and hides you.',
    damage: 90, cooldown: 14, speed: 40, gravity: 10, cloak: 4, blind: 4, radius: 5,
  },
};

// --- super behaviors, shared across subclasses
export const SUPERS = {
  hammerBarrage: {
    id: 'hammerBarrage', name: 'Hammer Barrage', behavior: 'projectileBarrage', element: 'ember',
    desc: 'Summon a burning hammer and hurl it. Each throw detonates on impact.',
    duration: 18, casts: 12, castCost: 1, fireRate: 0.55, damage: 480, splash: 5.5, splashDamage: 340,
    speed: 40, gravity: 8, damageResist: 0.4, trail: 'ember',
  },
  fistsOfThunder: {
    id: 'fistsOfThunder', name: 'Fists of Thunder', behavior: 'roamingMelee', element: 'surge',
    desc: 'Become a storm. Dash through enemies and detonate them on contact.',
    duration: 16, damage: 520, radius: 4.6, dashSpeed: 34, speedMult: 1.55, damageResist: 0.55,
    lightArc: true, chain: { damage: 220, range: 8, targets: 3 },
  },
  wardOfDawn: {
    id: 'wardOfDawn', name: 'Ward of Dawn', behavior: 'domeWard', element: 'null',
    desc: 'Raise an indestructible dome. Allies inside are shielded; you leave empowered.',
    duration: 22, radius: 6.5, overshield: 220, damageBuff: 0.35, buffDuration: 12, damageResist: 0.9,
  },
  goldenGun: {
    id: 'goldenGun', name: 'Golden Gun', behavior: 'precisionShots', element: 'ember',
    desc: 'Draw a weapon of pure flame. Three shots. Make them count.',
    duration: 11, shots: 3, damage: 3400, fireRate: 0.6, damageResist: 0.25, splash: 3.2, splashDamage: 400,
  },
  arcBlades: {
    id: 'arcBlades', name: 'Arc Blades', behavior: 'roamingMelee', element: 'surge',
    desc: 'Twin blades of lightning. Everything within reach comes apart.',
    duration: 17, damage: 460, radius: 3.6, dashSpeed: 30, speedMult: 1.7, damageResist: 0.5,
    lightArc: true, refundOnKill: 0.55,
  },
  voidAnchor: {
    id: 'voidAnchor', name: 'Void Anchor', behavior: 'tetherShot', element: 'null',
    desc: 'Fire an anchor that tethers everything nearby, suppressing and weakening it.',
    duration: 12, shots: 3, radius: 12, tetherDuration: 10, weaken: 0.35, damage: 260, fireRate: 0.9,
    damageResist: 0.25,
  },
  skyBlades: {
    id: 'skyBlades', name: 'Sky Blades', behavior: 'projectileBarrage', element: 'ember',
    desc: 'Take flight and rain blades of solar light on everything below.',
    duration: 17, casts: 20, fireRate: 0.32, damage: 300, splash: 4.2, splashDamage: 210,
    speed: 52, gravity: 0.6, damageResist: 0.35, hover: true, trail: 'ember',
  },
  stormTrance: {
    id: 'stormTrance', name: 'Storm Trance', behavior: 'beam', element: 'surge',
    desc: 'Channel a continuous arc beam that leaps between targets.',
    duration: 15, dps: 1150, range: 26, chain: { damage: 320, range: 9, targets: 3 },
    damageResist: 0.4, speedMult: 1.15,
  },
  novaBomb: {
    id: 'novaBomb', name: 'Nova Bomb', behavior: 'novaBomb', element: 'null',
    desc: 'Throw a collapsing star. It ends the conversation.',
    duration: 6, damage: 5200, splash: 11, splashDamage: 3200, speed: 26, gravity: 1.6,
    lingerDuration: 4, lingerDps: 300, damageResist: 0.3, singleCast: true,
  },
};

export const SUBCLASSES = {
  // ---------------- Warden
  emberforge: {
    id: 'emberforge', name: 'Emberforge', classId: 'warden', element: 'ember',
    tagline: 'Burn the line, then hold it.',
    super: 'hammerBarrage', grenade: GRENADES.firebolt, melee: MELEES.shoulderCharge,
    passive: { id: 'sunwarrior', name: 'Sunwarrior', desc: 'Ability kills restore health and briefly boost weapon damage.' },
  },
  stormguard: {
    id: 'stormguard', name: 'Stormguard', classId: 'warden', element: 'surge',
    tagline: 'The shortest distance between you and the problem.',
    super: 'fistsOfThunder', grenade: GRENADES.pulse, melee: MELEES.shoulderCharge,
    passive: { id: 'juggernaut', name: 'Juggernaut', desc: 'Sprinting at full health grants a frontal shield.' },
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', classId: 'warden', element: 'null',
    tagline: 'Nothing gets past. Nothing.',
    super: 'wardOfDawn', grenade: GRENADES.vortex, melee: MELEES.palmBlast,
    passive: { id: 'controlled', name: 'Controlled Demolition', desc: 'Void damage marks targets; killing a marked target heals you.' },
  },
  // ---------------- Ranger
  gunslinger: {
    id: 'gunslinger', name: 'Gunslinger', classId: 'ranger', element: 'ember',
    tagline: 'Three shots, three problems solved.',
    super: 'goldenGun', grenade: GRENADES.tripmine, melee: MELEES.throwingKnife,
    passive: { id: 'lucky', name: 'Practice Makes Perfect', desc: 'Precision kills reduce Super cooldown.' },
  },
  bladedancer: {
    id: 'bladedancer', name: 'Bladedancer', classId: 'ranger', element: 'surge',
    tagline: 'Faster than the trigger pull.',
    super: 'arcBlades', grenade: GRENADES.pulse, melee: MELEES.daggerStrike,
    passive: { id: 'flow', name: 'Flow State', desc: 'Melee kills grant a burst of speed and instant reload.' },
  },
  nightstalker: {
    id: 'nightstalker', name: 'Nightstalker', classId: 'ranger', element: 'null',
    tagline: 'They never see the shot that binds them.',
    super: 'voidAnchor', grenade: GRENADES.vortex, melee: MELEES.smokeBomb,
    passive: { id: 'vanish', name: 'Vanishing Step', desc: 'Dodging makes you briefly invisible.' },
  },
  // ---------------- Adept
  dawnblade: {
    id: 'dawnblade', name: 'Dawnblade', classId: 'adept', element: 'ember',
    tagline: 'Fight from a height they cannot reach.',
    super: 'skyBlades', grenade: GRENADES.firebolt, melee: MELEES.palmBlast,
    passive: { id: 'icarus', name: 'Icarus Dash', desc: 'Airborne accuracy penalties are removed and air control is greatly improved.' },
  },
  stormcaller: {
    id: 'stormcaller', name: 'Stormcaller', classId: 'adept', element: 'surge',
    tagline: 'Weather, weaponised.',
    super: 'stormTrance', grenade: GRENADES.pulse, melee: MELEES.palmBlast,
    passive: { id: 'conduction', name: 'Conduction', desc: 'Arc damage chains to a nearby enemy for a fraction of the damage.' },
  },
  voidwalker: {
    id: 'voidwalker', name: 'Voidwalker', classId: 'adept', element: 'null',
    tagline: 'Feed on the ending of things.',
    super: 'novaBomb', grenade: GRENADES.vortex, melee: MELEES.palmBlast,
    passive: { id: 'devour', name: 'Devour', desc: 'Ability kills fully restore health and refund grenade energy.' },
  },
};

export const CLASS_ABILITIES = {
  barricade: {
    id: 'barricade', name: 'Barricade', cooldown: 32,
    desc: 'Deploy a solid wall of light that blocks incoming fire.',
    width: 3.2, height: 2.4, duration: 16, health: 2400,
  },
  dodge: {
    id: 'dodge', name: 'Dodge', cooldown: 18,
    desc: 'A rapid evasive roll that reloads your equipped weapon.',
    distance: 7.5, time: 0.34, invulnWindow: 0.16,
  },
  rift: {
    id: 'rift', name: 'Rift', cooldown: 34,
    desc: 'Conjure a well of light: heals you over time and empowers your weapons.',
    radius: 3.4, duration: 14, healPerSec: 55, damageBuff: 0.25,
  },
};

export const GRENADE_LIST = GRENADES;
export const MELEE_LIST = MELEES;
