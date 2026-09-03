// Shared vocabulary for the loot/combat systems: elements, rarities, ammo,
// character stats and the power-level curves that tie difficulty to gear.

export const ELEMENTS = {
  kinetic: { id: 'kinetic', name: 'Kinetic', color: [0.86, 0.88, 0.94], css: '#dce1ee', glow: [1, 1, 1] },
  ember:   { id: 'ember',   name: 'Ember',   color: [1.0, 0.45, 0.15], css: '#ff7a3c', glow: [1.0, 0.55, 0.18] },
  surge:   { id: 'surge',   name: 'Surge',   color: [0.30, 0.82, 1.0], css: '#4fd7ff', glow: [0.45, 0.9, 1.0] },
  null:    { id: 'null',    name: 'Null',    color: [0.66, 0.44, 1.0], css: '#b47dff', glow: [0.72, 0.5, 1.0] },
};
export const ELEMENT_IDS = ['ember', 'surge', 'null'];

export const RARITY = {
  common:    { id: 'common',    name: 'Common',    css: '#c9d2e0', color: [0.79, 0.82, 0.88], weight: 42, perks: 0, statBonus: 0,  power: -4, shards: 1 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  css: '#6ad07a', color: [0.42, 0.82, 0.48], weight: 30, perks: 1, statBonus: 6,  power: -2, shards: 2 },
  rare:      { id: 'rare',      name: 'Rare',      css: '#4f9bff', color: [0.31, 0.61, 1.0],  weight: 19, perks: 2, statBonus: 12, power: 0,  shards: 5 },
  legendary: { id: 'legendary', name: 'Legendary', css: '#b57bff', color: [0.71, 0.48, 1.0],  weight: 8.2, perks: 3, statBonus: 20, power: 1,  shards: 14 },
  exotic:    { id: 'exotic',    name: 'Exotic',    css: '#f5d33f', color: [0.96, 0.83, 0.25], weight: 0.8, perks: 4, statBonus: 26, power: 2,  shards: 40 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'exotic'];

export const AMMO = {
  primary: { id: 'primary', name: 'Primary', css: '#e8eefc', color: [0.91, 0.93, 0.99], max: 999, pickup: 0 },
  special: { id: 'special', name: 'Special', css: '#7fe08a', color: [0.50, 0.88, 0.54], max: 60,  pickup: 8 },
  heavy:   { id: 'heavy',   name: 'Heavy',   css: '#c08cff', color: [0.75, 0.55, 1.0],  pickup: 12, max: 30 },
};

export const SLOTS = {
  kinetic: { id: 'kinetic', name: 'Kinetic', kind: 'weapon', icon: '◆' },
  energy:  { id: 'energy',  name: 'Energy',  kind: 'weapon', icon: '◇' },
  power:   { id: 'power',   name: 'Power',   kind: 'weapon', icon: '✦' },
  helmet:  { id: 'helmet',  name: 'Helmet',  kind: 'armor',  icon: '⌂' },
  arms:    { id: 'arms',    name: 'Gauntlets', kind: 'armor', icon: '⊐' },
  chest:   { id: 'chest',   name: 'Chest',   kind: 'armor',  icon: '⬔' },
  legs:    { id: 'legs',    name: 'Legs',    kind: 'armor',  icon: '⋔' },
  class:   { id: 'class',   name: 'Class Item', kind: 'armor', icon: '❖' },
};
export const SLOT_ORDER = ['kinetic', 'energy', 'power', 'helmet', 'arms', 'chest', 'legs', 'class'];
export const WEAPON_SLOTS = ['kinetic', 'energy', 'power'];
export const ARMOR_SLOTS = ['helmet', 'arms', 'chest', 'legs', 'class'];

/** The six character stats, in display order. */
export const STATS = [
  { id: 'resilience', name: 'Resilience', desc: 'Raises maximum health and reduces flinch.' },
  { id: 'mobility',   name: 'Mobility',   desc: 'Increases movement and strafe speed.' },
  { id: 'recovery',   name: 'Recovery',   desc: 'Shields recharge sooner and faster.' },
  { id: 'discipline', name: 'Discipline', desc: 'Reduces grenade cooldown.' },
  { id: 'intellect',  name: 'Intellect',  desc: 'Reduces Super cooldown.' },
  { id: 'strength',   name: 'Strength',   desc: 'Reduces melee cooldown.' },
];
export const STAT_IDS = STATS.map((s) => s.id);

// ---------------------------------------------------------------- power curve
export const POWER = {
  start: 100,
  softCap: 300,     // world drops stop climbing here
  powerfulCap: 350, // "powerful" rewards climb to here
  pinnacleCap: 370, // pinnacle rewards only
};

/** Stat tier 0..10 from a 0..100 stat total. */
export const statTier = (v) => Math.max(0, Math.min(10, Math.floor(v / 10)));

/**
 * Destiny-style power delta scaling.
 * Being under the recommended power hurts fast; being over helps, but with a ceiling.
 */
export function powerDamageOut(playerPower, activityPower) {
  const d = playerPower - activityPower;
  const m = d >= 0 ? 1 + d * 0.010 : 1 + d * 0.022;
  return Math.max(0.20, Math.min(1.55, m));
}
export function powerDamageIn(playerPower, activityPower) {
  const d = playerPower - activityPower;
  const m = d >= 0 ? 1 - d * 0.007 : 1 - d * 0.020;
  return Math.max(0.55, Math.min(2.6, m));
}

/** XP required to reach the next character level. */
export function xpForLevel(level) {
  return Math.floor(600 + level * 340 + Math.pow(level, 1.75) * 24);
}

/** How much a drop's power can exceed the player's, given the reward tier. */
export function dropPower(playerPower, tier, rng = Math.random) {
  const p = Math.round(playerPower);
  if (tier === 'pinnacle') {
    return Math.min(POWER.pinnacleCap, p + 3 + Math.floor(rng() * 3));
  }
  if (tier === 'powerful') {
    return Math.min(POWER.powerfulCap, p + 2 + Math.floor(rng() * 3));
  }
  // World drops: mostly sidegrades, occasionally a small bump, hard-stopped at the soft cap.
  const roll = -3 + Math.floor(rng() * 6); // -3..+2
  return Math.min(POWER.softCap, Math.max(1, p + roll));
}

/** Element that counters a shield — matching element shreds it. */
export const SHIELD_MATCH_MULT = 3.0;
export const SHIELD_MISMATCH_MULT = 0.45;

export const CRIT_TEXT_COLOR = '#ffe08a';
