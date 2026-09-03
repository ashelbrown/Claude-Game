// Weapon archetypes, the random perk pool, and hand-authored exotics.
//
// Perks expose optional hook functions that player.js calls at well-known moments.
// A hook receives (w, g, ctx): the weapon instance, the game, and event context.
// Buffs live on the weapon instance so two copies of the same gun track separately.

import { ELEMENT_IDS } from './defs.js';

// ---------------------------------------------------------------- buff helper
export function addBuff(w, id, opts) {
  const rt = (w.rt ||= { buffs: {} });
  const cur = rt.buffs[id];
  const stacks = Math.min(opts.maxStacks || 1, (cur && cur.until > opts.now ? cur.stacks : 0) + (opts.stacks || 1));
  rt.buffs[id] = { stacks, until: opts.now + opts.duration, per: opts.per || 0, kind: opts.kind || 'damage' };
  return stacks;
}
export function buffValue(w, id, now) {
  const b = w.rt && w.rt.buffs && w.rt.buffs[id];
  if (!b || b.until <= now) return 0;
  return b.stacks * b.per;
}
export function buffActive(w, id, now) {
  const b = w.rt && w.rt.buffs && w.rt.buffs[id];
  return !!(b && b.until > now);
}

// ---------------------------------------------------------------- archetypes
// dmg = per-bullet body damage at matched power. rpm drives the fire interval.
export const FAMILIES = {
  auto: {
    id: 'auto', name: 'Auto Rifle', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'auto',
    dmg: 21, rpm: 640, mag: 34, crit: 1.55, reload: 2.2, spread: 0.011, adsSpread: 0.0028,
    recoil: { v: 0.55, h: 0.28 }, zoom: 1.22, adsTime: 0.22, rangeMin: 26, rangeMax: 52, falloff: 0.55,
    desc: 'Steady, forgiving full-auto. The workhorse.',
  },
  smg: {
    id: 'smg', name: 'Submachine Gun', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'smg',
    dmg: 14, rpm: 900, mag: 40, crit: 1.4, reload: 1.9, spread: 0.017, adsSpread: 0.006,
    recoil: { v: 0.42, h: 0.42 }, zoom: 1.15, adsTime: 0.17, rangeMin: 14, rangeMax: 30, falloff: 0.42,
    desc: 'Shreds up close, evaporates at range.',
  },
  pulse: {
    id: 'pulse', name: 'Pulse Rifle', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'pulse',
    dmg: 25, rpm: 390, burst: 3, burstDelay: 0.055, mag: 33, crit: 1.55, reload: 2.3,
    spread: 0.010, adsSpread: 0.0022, recoil: { v: 0.85, h: 0.3 }, zoom: 1.35, adsTime: 0.24,
    rangeMin: 32, rangeMax: 60, falloff: 0.6, desc: 'Three-round bursts. Rewards a steady hand.',
  },
  scout: {
    id: 'scout', name: 'Scout Rifle', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'scout',
    dmg: 44, rpm: 260, mag: 18, crit: 1.7, reload: 2.1, spread: 0.007, adsSpread: 0.0012,
    recoil: { v: 1.1, h: 0.22 }, zoom: 1.7, adsTime: 0.26, rangeMin: 45, rangeMax: 85, falloff: 0.7,
    desc: 'Long-range single fire with real punch.',
  },
  hand: {
    id: 'hand', name: 'Hand Cannon', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'hand',
    dmg: 68, rpm: 150, mag: 10, crit: 1.85, reload: 2.0, spread: 0.012, adsSpread: 0.0016,
    recoil: { v: 2.3, h: 0.55 }, zoom: 1.45, adsTime: 0.23, rangeMin: 28, rangeMax: 48, falloff: 0.62,
    desc: 'Heavy, slow, and enormously satisfying.',
  },
  sidearm: {
    id: 'sidearm', name: 'Sidearm', slotPool: ['kinetic', 'energy'], ammo: 'primary', sound: 'smg',
    dmg: 27, rpm: 450, mag: 20, crit: 1.5, reload: 1.5, spread: 0.013, adsSpread: 0.004,
    recoil: { v: 0.7, h: 0.35 }, zoom: 1.2, adsTime: 0.15, rangeMin: 18, rangeMax: 34, falloff: 0.5,
    desc: 'Fast, light, and always ready.',
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', slotPool: ['kinetic', 'energy', 'power'], ammo: 'special', sound: 'shotgun',
    dmg: 24, pellets: 10, rpm: 75, mag: 6, crit: 1.3, reload: 2.6, spread: 0.085, adsSpread: 0.055,
    recoil: { v: 3.2, h: 0.7 }, zoom: 1.1, adsTime: 0.24, rangeMin: 7, rangeMax: 16, falloff: 0.12,
    desc: 'Ends arguments inside eight metres.',
  },
  sniper: {
    id: 'sniper', name: 'Sniper Rifle', slotPool: ['energy', 'power'], ammo: 'special', sound: 'sniper',
    dmg: 260, rpm: 90, mag: 4, crit: 2.5, reload: 3.0, spread: 0.03, adsSpread: 0.0,
    recoil: { v: 4.0, h: 0.4 }, zoom: 4.2, adsTime: 0.4, rangeMin: 90, rangeMax: 200, falloff: 0.85,
    desc: 'One breath, one shot. Bring a scope and patience.',
  },
  fusion: {
    id: 'fusion', name: 'Fusion Rifle', slotPool: ['energy', 'power'], ammo: 'special', sound: 'fusion',
    dmg: 44, pellets: 7, rpm: 60, chargeTime: 0.58, mag: 7, crit: 1.3, reload: 2.6,
    spread: 0.028, adsSpread: 0.014, recoil: { v: 1.4, h: 0.4 }, zoom: 1.3, adsTime: 0.26,
    rangeMin: 16, rangeMax: 30, falloff: 0.3, desc: 'Charge, then delete whatever is standing there.',
  },
  rocket: {
    id: 'rocket', name: 'Rocket Launcher', slotPool: ['power'], ammo: 'heavy', sound: 'rocket',
    dmg: 420, rpm: 45, mag: 2, crit: 1.0, reload: 3.4, spread: 0.004, adsSpread: 0.002,
    recoil: { v: 3.5, h: 0.3 }, zoom: 1.3, adsTime: 0.3, rangeMin: 200, rangeMax: 400, falloff: 1.0,
    projectile: { speed: 42, radius: 0.35, splash: 6.5, splashDamage: 340, gravity: 0.6, trail: true },
    desc: 'Point at the crowd. Do not stand near the crowd.',
  },
  gl: {
    id: 'gl', name: 'Grenade Launcher', slotPool: ['power', 'energy'], ammo: 'heavy', sound: 'rocket',
    dmg: 190, rpm: 90, mag: 6, crit: 1.0, reload: 2.8, spread: 0.006, adsSpread: 0.003,
    recoil: { v: 2.4, h: 0.3 }, zoom: 1.25, adsTime: 0.26, rangeMin: 200, rangeMax: 400, falloff: 1.0,
    projectile: { speed: 32, radius: 0.3, splash: 5.2, splashDamage: 210, gravity: 9.0, bounce: 2, fuse: 1.6, trail: true },
    desc: 'Lob it, bank it, watch the room clear.',
  },
  mg: {
    id: 'mg', name: 'Machine Gun', slotPool: ['power'], ammo: 'heavy', sound: 'mg',
    dmg: 34, rpm: 450, mag: 75, crit: 1.5, reload: 4.2, spread: 0.014, adsSpread: 0.005,
    recoil: { v: 0.7, h: 0.5 }, zoom: 1.3, adsTime: 0.3, rangeMin: 35, rangeMax: 70, falloff: 0.6,
    desc: 'Sustained fire until the problem stops moving.',
  },
};
export const FAMILY_IDS = Object.keys(FAMILIES);

// ---------------------------------------------------------------- perks
// Column 1 perks are utility, column 2 perks are damage — same as the genre convention.
export const PERKS = {
  // --- column 1
  outlaw: {
    id: 'outlaw', name: 'Outlaw', col: 1,
    desc: 'Precision kills dramatically increase reload speed for 6s.',
    onPrecisionKill: (w, g) => addBuff(w, 'outlaw', { now: g.time, duration: 6, per: 0.7, kind: 'reload' }),
    modReload: (w, g) => 1 / (1 + buffValue(w, 'outlaw', g.time)),
  },
  feedingFrenzy: {
    id: 'feedingFrenzy', name: 'Feeding Frenzy', col: 1,
    desc: 'Each rapid kill stacks up to +50% reload speed.',
    onKill: (w, g) => addBuff(w, 'ff', { now: g.time, duration: 4, per: 0.125, maxStacks: 4, kind: 'reload' }),
    modReload: (w, g) => 1 / (1 + buffValue(w, 'ff', g.time)),
  },
  subsistence: {
    id: 'subsistence', name: 'Subsistence', col: 1,
    desc: 'Kills partially refill the magazine from thin air.',
    onKill: (w, g, ctx) => { ctx.refillMag = Math.max(1, Math.ceil(w.stats.magazine * 0.12)); },
  },
  demolitionist: {
    id: 'demolitionist', name: 'Demolitionist', col: 1,
    desc: 'Kills grant grenade energy.',
    onKill: (w, g) => g.player.chargeAbility('grenade', 0.12),
  },
  pugilist: {
    id: 'pugilist', name: 'Pugilist', col: 1,
    desc: 'Kills grant melee energy.',
    onKill: (w, g) => g.player.chargeAbility('melee', 0.15),
  },
  wellspring: {
    id: 'wellspring', name: 'Wellspring', col: 1,
    desc: 'Kills grant class ability energy.',
    onKill: (w, g) => g.player.chargeAbility('class', 0.14),
  },
  threatDetector: {
    id: 'threatDetector', name: 'Threat Detector', col: 1,
    desc: 'Nearby enemies improve stability and handling.',
    modStability: (w, g) => (g.enemiesWithin(g.player.pos, 12) >= 2 ? 1.45 : 1),
    modHandling: (w, g) => (g.enemiesWithin(g.player.pos, 12) >= 2 ? 1.35 : 1),
  },
  rangefinder: {
    id: 'rangefinder', name: 'Rangefinder', col: 1,
    desc: 'Aiming down sights extends effective range.',
    modRange: (w, g) => (g.player.ads > 0.5 ? 1.3 : 1),
  },
  snapshot: {
    id: 'snapshot', name: 'Snapshot Sights', col: 1,
    desc: 'Much faster aim-down-sights.',
    modHandling: () => 1.6,
  },
  overflow: {
    id: 'overflow', name: 'Overflow', col: 1,
    desc: 'Ammo pickups overfill the magazine to double capacity.',
    onAmmoPickup: (w) => { w.ammo = Math.max(w.ammo, Math.floor(w.stats.magazine * 2)); },
  },

  // --- column 2
  rampage: {
    id: 'rampage', name: 'Rampage', col: 2,
    desc: 'Kills stack up to +33% damage for 4s.',
    onKill: (w, g) => addBuff(w, 'rampage', { now: g.time, duration: 4, per: 0.11, maxStacks: 3 }),
    modDamage: (w, g) => 1 + buffValue(w, 'rampage', g.time),
  },
  killClip: {
    id: 'killClip', name: 'Kill Clip', col: 2,
    desc: 'Reloading after a kill grants +30% damage for 5s.',
    onKill: (w, g) => { w.rt ||= { buffs: {} }; w.rt.killClipArmed = g.time + 3.5; },
    onReload: (w, g) => {
      if (w.rt && w.rt.killClipArmed > g.time) {
        addBuff(w, 'killClip', { now: g.time, duration: 5, per: 0.30 });
        w.rt.killClipArmed = 0;
      }
    },
    modDamage: (w, g) => 1 + buffValue(w, 'killClip', g.time),
  },
  headseeker: {
    id: 'headseeker', name: 'Headseeker', col: 2,
    desc: 'Body shots briefly raise precision damage by 22%.',
    onHit: (w, g, ctx) => { if (!ctx.crit) addBuff(w, 'headseeker', { now: g.time, duration: 1.6, per: 0.22 }); },
    modCrit: (w, g) => 1 + buffValue(w, 'headseeker', g.time),
  },
  firefly: {
    id: 'firefly', name: 'Firefly', col: 2,
    desc: 'Precision kills cause the target to detonate.',
    onPrecisionKill: (w, g, ctx) => g.explode(ctx.pos, 4.6, 90 * g.difficultyDamageScale, w.element, { source: 'perk' }),
  },
  vorpal: {
    id: 'vorpal', name: 'Vorpal Weapon', col: 2,
    desc: '+25% damage against majors, bosses and Supers.',
    modDamage: (w, g, ctx) => (ctx.target && ctx.target.rank !== 'minor' ? 1.25 : 1),
  },
  surrounded: {
    id: 'surrounded', name: 'Surrounded', col: 2,
    desc: '+35% damage while three or more enemies are close.',
    modDamage: (w, g) => (g.enemiesWithin(g.player.pos, 11) >= 3 ? 1.35 : 1),
  },
  underPressure: {
    id: 'underPressure', name: 'Under Pressure', col: 2,
    desc: 'Damage and stability climb as the magazine empties.',
    modDamage: (w) => 1 + 0.18 * (1 - w.ammo / Math.max(1, w.stats.magazine)),
    modStability: (w) => 1 + 0.5 * (1 - w.ammo / Math.max(1, w.stats.magazine)),
  },
  explosivePayload: {
    id: 'explosivePayload', name: 'Explosive Payload', col: 2,
    desc: 'Rounds detonate on impact for area damage.',
    onHit: (w, g, ctx) => g.explode(ctx.pos, 2.4, ctx.damage * 0.28, w.element, { source: 'perk', silent: true }),
  },
  adrenalineJunkie: {
    id: 'adrenalineJunkie', name: 'Adrenaline Junkie', col: 2,
    desc: 'Grenade kills grant up to +30% weapon damage.',
    onGrenadeKill: (w, g) => addBuff(w, 'adren', { now: g.time, duration: 7, per: 0.15, maxStacks: 2 }),
    modDamage: (w, g) => 1 + buffValue(w, 'adren', g.time),
  },
  frenzy: {
    id: 'frenzy', name: 'Frenzy', col: 2,
    desc: 'After 8s in combat: +18% damage and faster reloads.',
    modDamage: (w, g) => (g.player.combatTime > 8 ? 1.18 : 1),
    modReload: (w, g) => (g.player.combatTime > 8 ? 0.7 : 1),
  },
  swashbuckler: {
    id: 'swashbuckler', name: 'Swashbuckler', col: 2,
    desc: 'Melee kills grant maximum stacks of +40% damage.',
    onKill: (w, g) => addBuff(w, 'swash', { now: g.time, duration: 5, per: 0.08, maxStacks: 5 }),
    onMeleeKill: (w, g) => addBuff(w, 'swash', { now: g.time, duration: 5, per: 0.08, stacks: 5, maxStacks: 5 }),
    modDamage: (w, g) => 1 + buffValue(w, 'swash', g.time),
  },
  tripleTap: {
    id: 'tripleTap', name: 'Triple Tap', col: 2,
    desc: 'Every third precision hit returns a round to the magazine.',
    onPrecisionHit: (w, g, ctx) => {
      w.rt ||= { buffs: {} };
      w.rt.tt = (w.rt.tt || 0) + 1;
      if (w.rt.tt >= 3) { w.rt.tt = 0; ctx.refillMag = 1; }
    },
  },
};
export const PERK_IDS = Object.keys(PERKS);
export const PERKS_COL1 = PERK_IDS.filter((id) => PERKS[id].col === 1);
export const PERKS_COL2 = PERK_IDS.filter((id) => PERKS[id].col === 2);

// ---------------------------------------------------------------- exotic weapons
// Each exotic gets one loud, identity-defining trait plus a supporting one.
export const EXOTIC_WEAPONS = [
  {
    id: 'hollow_verdict', name: 'Hollow Verdict', family: 'hand', element: 'ember', slot: 'energy',
    flavor: '"It asks a question. The answer is always the same." — Sundered Codex, fr. 11',
    mods: { dmg: 1.12, mag: 1.3, crit: 1.05 },
    traits: [
      { name: 'Sunspark', desc: 'Precision hits ignite the target; precision kills detonate them in a solar burst.',
        onPrecisionHit: (w, g, ctx) => g.applyBurn(ctx.target, 14, 4),
        onPrecisionKill: (w, g, ctx) => g.explode(ctx.pos, 6.2, 200 * g.difficultyDamageScale, 'ember', { source: 'exotic' }) },
      { name: 'Long Burn', desc: 'Burning targets take 20% more damage from this weapon.',
        modDamage: (w, g, ctx) => (ctx.target && ctx.target.burn > 0 ? 1.2 : 1) },
    ],
  },
  {
    id: 'nine_lives', name: 'Nine Lives', family: 'auto', element: 'surge', slot: 'energy',
    flavor: 'Nine cores. Nine chances. The tenth belongs to whoever is left standing.',
    mods: { rpm: 1.05, mag: 1.5 },
    traits: [
      { name: 'Arc Web', desc: 'Hits chain lightning to a nearby enemy.',
        onHit: (w, g, ctx) => g.chainLightning(ctx.pos, ctx.target, ctx.damage * 0.45, 8, 2) },
      { name: 'Overcharged', desc: 'Sustained fire raises damage by up to 25%.',
        modDamage: (w, g) => 1 + Math.min(0.25, (w.rt?.streak || 0) * 0.02),
        onHit: (w) => { w.rt ||= { buffs: {} }; w.rt.streak = Math.min(12, (w.rt.streak || 0) + 1); } },
    ],
  },
  {
    id: 'gravewell', name: 'Gravewell', family: 'rocket', element: 'null', slot: 'power',
    flavor: 'Fires a hole. The hole insists.',
    mods: { mag: 2, dmg: 0.8 },
    traits: [
      { name: 'Event Horizon', desc: 'Rockets create a singularity that drags enemies in before collapsing.',
        onProjectileImpact: (w, g, ctx) => g.spawnSingularity(ctx.pos, 8, 3.0, 320 * g.difficultyDamageScale) },
      { name: 'Black Hole Sun', desc: 'Enemies killed by the singularity make the next rocket free.',
        onKill: (w, g, ctx) => { if (ctx.source === 'singularity') w.ammo = Math.min(w.stats.magazine, w.ammo + 1); } },
    ],
  },
  {
    id: 'chorus_of_ash', name: 'Chorus of Ash', family: 'sniper', element: 'ember', slot: 'power',
    flavor: 'Every shot is a note. Play the whole song.',
    mods: { mag: 1.5, dmg: 0.85 },
    traits: [
      { name: 'Crescendo', desc: 'Consecutive precision hits stack +18% damage, up to five times.',
        onPrecisionHit: (w, g) => addBuff(w, 'cresc', { now: g.time, duration: 9, per: 0.18, maxStacks: 5 }),
        modDamage: (w, g) => 1 + buffValue(w, 'cresc', g.time) },
      { name: 'Reprise', desc: 'Precision kills return two rounds to the magazine.',
        onPrecisionKill: (w, g, ctx) => { ctx.refillMag = 2; } },
    ],
  },
  {
    id: 'loud_silence', name: 'Loud Silence', family: 'smg', element: 'null', slot: 'kinetic',
    flavor: 'They never hear it. That is rather the point.',
    mods: { mag: 1.25, rpm: 1.05 },
    traits: [
      { name: 'Vanishing Point', desc: 'Kills briefly make you invisible to enemies and refill the magazine.',
        onKill: (w, g) => { g.player.cloak(3.0); w.ammo = w.stats.magazine; } },
      { name: 'From Nowhere', desc: 'The first shot from invisibility deals triple damage.',
        modDamage: (w, g) => (g.player.invisible > 0 ? 3 : 1) },
    ],
  },
  {
    id: 'sunder', name: 'Sunder', family: 'shotgun', element: 'ember', slot: 'energy',
    flavor: 'Shoot. Then hit them with the shotgun.',
    mods: { mag: 1.4, dmg: 0.95 },
    traits: [
      { name: 'One-Two Punch', desc: 'Hitting with every pellet massively empowers your next melee.',
        onHit: (w, g, ctx) => { if (ctx.allPellets) g.player.buffMelee(3.2, 2.0); } },
      { name: 'Molten Shell', desc: 'Empowered melee kills leave a burning pool.',
        onMeleeKill: (w, g, ctx) => g.spawnBurnPool(ctx.pos, 4.5, 6, 42 * g.difficultyDamageScale) },
    ],
  },
  {
    id: 'the_long_answer', name: 'The Long Answer', family: 'scout', element: 'surge', slot: 'kinetic',
    flavor: 'You asked politely twice. This is the third time.',
    mods: { mag: 1.4 },
    traits: [
      { name: 'Escalation', desc: 'Holding the trigger increases fire rate and damage.',
        modDamage: (w) => 1 + Math.min(0.35, (w.rt?.held || 0) * 0.07),
        modRpm: (w) => 1 + Math.min(0.6, (w.rt?.held || 0) * 0.12) },
      { name: 'Cool Head', desc: 'Precision hits do not reset Escalation.', passive: true },
    ],
  },
  {
    id: 'cindergrasp', name: 'Cindergrasp', family: 'fusion', element: 'ember', slot: 'energy',
    flavor: 'Hold it long enough and the floor remembers.',
    mods: { chargeTime: 0.85, mag: 1.3 },
    traits: [
      { name: 'Scorched Earth', desc: 'Bolts leave burning ground where they land.',
        onHit: (w, g, ctx) => { if (ctx.pelletIndex === 0) g.spawnBurnPool(ctx.pos, 3.4, 5, 26 * g.difficultyDamageScale); } },
      { name: 'Kindling', desc: '+30% damage against burning targets.',
        modDamage: (w, g, ctx) => (ctx.target && ctx.target.burn > 0 ? 1.3 : 1) },
    ],
  },
];

// ---------------------------------------------------------------- naming
const ADJ = ['Sundered', 'Hollow', 'Iron', 'Pale', 'Gilded', 'Silent', 'Crimson', 'Vagrant', 'Ashen',
  'Distant', 'Fractured', 'Wintered', 'Molten', 'Errant', 'Solemn', 'Hungry', 'Quiet', 'Radiant',
  'Bitter', 'Wandering', 'Forsaken', 'Perfect', 'Last', 'Old', 'Nameless', 'Patient'];
const NOUN = ['Verdict', 'Sermon', 'Reveille', 'Requiem', 'Covenant', 'Refrain', 'Vigil', 'Ledger',
  'Arbiter', 'Litany', 'Lament', 'Bargain', 'Recital', 'Sentinel', 'Answer', 'Promise', 'Ember',
  'Threnody', 'Cadence', 'Warrant', 'Testament', 'Epitaph', 'Reckoning', 'Halcyon', 'Anthem'];
const PREFIX = ['VX', 'HW', 'ZR', 'MK', 'AR', 'TL', 'KS', 'DV'];

export function weaponName(rng, rarity) {
  if (rarity === 'common' || rarity === 'uncommon') {
    const p = PREFIX[Math.floor(rng() * PREFIX.length)];
    const n = 10 + Math.floor(rng() * 89);
    const noun = NOUN[Math.floor(rng() * NOUN.length)];
    return `${p}-${n} ${noun}`;
  }
  const a = ADJ[Math.floor(rng() * ADJ.length)];
  const n = NOUN[Math.floor(rng() * NOUN.length)];
  return `${a} ${n}`;
}

export const WEAPON_FLAVOR = [
  'Field-stamped, never registered. Someone wanted this one forgotten.',
  'The grip is worn smooth. Three owners. Two of them made it home.',
  'Recovered from a hull that had been drifting for ninety years.',
  'Somebody scratched a tally into the receiver and then stopped counting.',
  'Standard issue, if the standard were set by people who expected to die.',
  'It hums when the shooting starts. Nobody has explained why.',
  'Reliable in vacuum, in rain, and in the places that are neither.',
  '"Keep it loaded. Keep it close. Keep moving." — engraved inside the stock',
  'Built from three broken guns and a stubborn refusal.',
  'The serial number is a date. The date has not happened yet.',
];

export function randomElementFor(slot, rng) {
  if (slot === 'kinetic') return 'kinetic';
  return ELEMENT_IDS[Math.floor(rng() * ELEMENT_IDS.length)];
}
