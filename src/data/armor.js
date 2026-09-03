// Armor pieces roll six stats; exotic armor additionally carries a build-defining perk.

import { ARMOR_SLOTS, STAT_IDS } from './defs.js';

export const ARMOR_SET_NAMES = [
  'Wildwood', 'Ironhaven', 'Deepstrike', 'Sunwake', 'Ashfall', 'Nightward', 'Palefire',
  'Longwatch', 'Sable', 'Highwater', 'Cinderline', 'Stormcall', 'Graveline', 'Vantage',
];
export const ARMOR_PIECE_NAMES = {
  helmet: ['Helm', 'Cowl', 'Mask', 'Visor', 'Crown'],
  arms:   ['Gauntlets', 'Grips', 'Gloves', 'Vambraces', 'Wraps'],
  chest:  ['Plate', 'Vest', 'Robes', 'Harness', 'Cuirass'],
  legs:   ['Greaves', 'Boots', 'Strides', 'Treads', 'Leggings'],
  class:  ['Mark', 'Cloak', 'Bond', 'Sigil', 'Standard'],
};

export function armorName(slot, rng) {
  const set = ARMOR_SET_NAMES[Math.floor(rng() * ARMOR_SET_NAMES.length)];
  const pieces = ARMOR_PIECE_NAMES[slot] || ARMOR_PIECE_NAMES.chest;
  return `${set} ${pieces[Math.floor(rng() * pieces.length)]}`;
}

export const ARMOR_FLAVOR = [
  'Patched more times than it was ever manufactured.',
  'The plating still carries scoring from something with claws.',
  'Warm to the touch, hours after you take it off.',
  'Fits like it was waiting for you specifically.',
  'Recovered from a pile that nobody wanted to catalogue.',
  'Whoever wore this last got further than anyone expected.',
];

/**
 * Exotic armor. `classId` of null means any class can wear it.
 * Hooks are called by player.js at the matching moment.
 */
export const EXOTIC_ARMOR = [
  {
    id: 'ashborne_plate', name: 'Ashborne Plate', slot: 'chest', classId: 'warden',
    flavor: 'It has never been cleaned. It has never needed to be.',
    trait: { name: 'Kindled Bulwark', desc: 'Your Barricade heals you and grants an overshield while you stand behind it.' },
    statBias: { resilience: 12, recovery: 6 },
  },
  {
    id: 'wardens_oath', name: "Warden's Oath", slot: 'arms', classId: 'warden',
    flavor: '"I will hold." It is not a request.',
    trait: { name: 'Unbroken', desc: 'Melee kills grant a large overshield and refund melee energy.' },
    statBias: { strength: 14, resilience: 6 },
  },
  {
    id: 'ravenclaw', name: 'Ravenclaw', slot: 'helmet', classId: 'ranger',
    flavor: 'Sees the shot before you do. Rude about it.',
    trait: { name: "Hunter's Mark", desc: 'Dodging reloads your weapon and marks nearby enemies for +20% damage.' },
    statBias: { mobility: 12, intellect: 6 },
  },
  {
    id: 'nightfall_shroud', name: 'Nightfall Shroud', slot: 'chest', classId: 'ranger',
    flavor: 'The dark was here first. It just likes you.',
    trait: { name: 'Longest Night', desc: 'Your Super lasts 40% longer and kills during it extend it further.' },
    statBias: { intellect: 14, mobility: 5 },
  },
  {
    id: 'astral_coil', name: 'Astral Coil', slot: 'arms', classId: 'adept',
    flavor: 'Three ideas, thrown at once, in the hope that one lands.',
    trait: { name: 'Trine', desc: 'Your grenades split into three smaller charges.' },
    statBias: { discipline: 15, intellect: 4 },
  },
  {
    id: 'voidbloom_crown', name: 'Voidbloom Crown', slot: 'helmet', classId: 'adept',
    flavor: 'Something bloomed in here. It has not stopped.',
    trait: { name: 'Feedback Loop', desc: 'Kills with your Super refund Super energy.' },
    statBias: { intellect: 16 },
  },
  {
    id: 'second_wind', name: 'Second Wind', slot: 'legs', classId: null,
    flavor: 'Built for people who are always almost dead.',
    trait: { name: 'Last Stand', desc: 'While critically wounded, kills grant Super energy and briefly boost damage.' },
    statBias: { recovery: 10, resilience: 8 },
  },
  {
    id: 'vagabond_sigil', name: 'Vagabond Sigil', slot: 'class', classId: null,
    flavor: 'A road, a rifle, and no intention of stopping.',
    trait: { name: 'Wanderlust', desc: 'Sprinting regenerates all ability energy faster.' },
    statBias: { mobility: 10, discipline: 6, strength: 6 },
  },
  {
    id: 'graven_helm', name: 'Graven Helm', slot: 'helmet', classId: null,
    flavor: 'The visor shows you exactly how much trouble you are in.',
    trait: { name: 'Threat Sense', desc: 'Enemies are outlined through walls and your radar reaches further.' },
    statBias: { resilience: 8, recovery: 8 },
  },
  {
    id: 'stormfeet', name: 'Stormfeet', slot: 'legs', classId: null,
    flavor: 'Do not stand still in them. They get ideas.',
    trait: { name: 'Momentum', desc: 'Sprinting builds a damage charge released by your next melee.' },
    statBias: { mobility: 14, strength: 5 },
  },
];

/** Roll six stats summing roughly to `budget`, biased toward two "spike" stats. */
export function rollArmorStats(budget, rng, bias = null) {
  const out = {};
  for (const s of STAT_IDS) out[s] = 2 + Math.floor(rng() * 4);
  let spent = STAT_IDS.reduce((a, s) => a + out[s], 0);

  // Bias from an exotic's identity, if any.
  if (bias) {
    for (const k of Object.keys(bias)) {
      const add = Math.round(bias[k] * (0.6 + rng() * 0.5));
      out[k] += add; spent += add;
    }
  }

  // Two random spikes take most of the remaining budget.
  const order = STAT_IDS.slice().sort(() => rng() - 0.5);
  const spikes = order.slice(0, 2);
  let remaining = Math.max(0, budget - spent);
  for (const s of spikes) {
    const take = Math.round(remaining * (0.35 + rng() * 0.3));
    out[s] += take; remaining -= take;
  }
  // Sprinkle the rest.
  let guard = 0;
  while (remaining > 0 && guard++ < 200) {
    const s = order[Math.floor(rng() * order.length)];
    const take = Math.min(remaining, 1 + Math.floor(rng() * 3));
    out[s] += take; remaining -= take;
  }
  for (const s of STAT_IDS) out[s] = Math.max(0, Math.min(42, out[s]));
  return out;
}

export const ARMOR_SLOT_LIST = ARMOR_SLOTS;
