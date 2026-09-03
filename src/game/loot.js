// Item generation and derived stats. Deliberately free of DOM/WebGL references
// so the whole loot economy can be exercised headlessly (see tools/selftest.mjs).

import {
  RARITY, RARITY_ORDER, POWER, dropPower, WEAPON_SLOTS, ARMOR_SLOTS, STAT_IDS,
} from '../data/defs.js';
import {
  FAMILIES, FAMILY_IDS, PERKS, PERKS_COL1, PERKS_COL2, EXOTIC_WEAPONS,
  weaponName, WEAPON_FLAVOR, randomElementFor,
} from '../data/weapons.js';
import { EXOTIC_ARMOR, armorName, ARMOR_FLAVOR, rollArmorStats } from '../data/armor.js';

let UID = 1;
export const nextUid = () => 'i' + (UID++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
export const seedUid = (n) => { UID = Math.max(UID, n | 0); };
export const peekUid = () => UID;

const rnd = (rng, a, b) => a + rng() * (b - a);
const rndInt = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
const pickW = (list, rng) => {
  let t = 0; for (const e of list) t += e.weight;
  let r = rng() * t;
  for (const e of list) { r -= e.weight; if (r <= 0) return e; }
  return list[list.length - 1];
};

/** Rarity roll, with luck shifting weight toward the top of the table. */
export function rollRarity(rng, luck = 0, allowExotic = true) {
  const table = RARITY_ORDER
    .filter((r) => allowExotic || r !== 'exotic')
    .map((r, i) => ({ id: r, weight: RARITY[r].weight * (1 + luck * i * 0.55) }));
  return pickW(table, rng).id;
}

// ---------------------------------------------------------------- weapons
export function rollWeaponStats(rarity, rng) {
  const bonus = RARITY[rarity].statBonus;
  const roll = () => Math.max(1, Math.min(100, Math.round(rnd(rng, 12, 68) + bonus + rnd(rng, -8, 8))));
  return {
    impact: roll(), range: roll(), stability: roll(),
    handling: roll(), reload: roll(), magazine: roll(),
  };
}

export function rollWeapon(opts = {}) {
  const rng = opts.rng || Math.random;
  const rarity = opts.rarity || rollRarity(rng, opts.luck || 0);
  const power = opts.power ?? POWER.start;

  if (rarity === 'exotic') {
    const pool = opts.exoticId
      ? EXOTIC_WEAPONS.filter((e) => e.id === opts.exoticId)
      : EXOTIC_WEAPONS.filter((e) => !opts.slot || e.slot === opts.slot);
    const ex = pool.length ? pool[Math.floor(rng() * pool.length)] : EXOTIC_WEAPONS[0];
    return finishWeapon({
      uid: nextUid(), kind: 'weapon', rarity: 'exotic', exoticId: ex.id,
      family: ex.family, slot: ex.slot, element: ex.element, name: ex.name,
      flavor: ex.flavor, power, perks: [],
      stats: rollWeaponStats('exotic', rng),
    });
  }

  let family = opts.family;
  if (!family) {
    const allowed = opts.slot
      ? FAMILY_IDS.filter((f) => FAMILIES[f].slotPool.includes(opts.slot))
      : FAMILY_IDS;
    family = allowed[Math.floor(rng() * allowed.length)];
  }
  const fam = FAMILIES[family];
  const slot = opts.slot || fam.slotPool[Math.floor(rng() * fam.slotPool.length)];

  const perkCount = RARITY[rarity].perks;
  const perks = [];
  if (perkCount >= 1) perks.push(PERKS_COL1[Math.floor(rng() * PERKS_COL1.length)]);
  if (perkCount >= 2) perks.push(PERKS_COL2[Math.floor(rng() * PERKS_COL2.length)]);
  if (perkCount >= 3) {
    // Legendary+ get an extra roll from either column, never a duplicate.
    const extra = (rng() < 0.5 ? PERKS_COL1 : PERKS_COL2).filter((p) => !perks.includes(p));
    if (extra.length) perks.push(extra[Math.floor(rng() * extra.length)]);
  }

  return finishWeapon({
    uid: nextUid(), kind: 'weapon', rarity, family, slot,
    element: opts.element || randomElementFor(slot, rng),
    name: opts.name || weaponName(rng, rarity),
    flavor: WEAPON_FLAVOR[Math.floor(rng() * WEAPON_FLAVOR.length)],
    power, perks, stats: rollWeaponStats(rarity, rng),
  });
}

function finishWeapon(item) {
  item.ammoType = FAMILIES[item.family].ammo;
  item.derived = weaponDerived(item);
  item.ammo = item.derived.magazine;
  item.rt = { buffs: {} };
  return item;
}

/** Turn a weapon's archetype + rolled stats + exotic mods into concrete numbers. */
export function weaponDerived(item) {
  const fam = FAMILIES[item.family];
  const s = item.stats;
  const ex = item.exoticId ? EXOTIC_WEAPONS.find((e) => e.id === item.exoticId) : null;
  const mods = (ex && ex.mods) || {};

  const impactMul = 0.90 + (s.impact / 100) * 0.22;
  const magMul = 0.80 + (s.magazine / 100) * 0.55;
  const reloadMul = 1.32 - (s.reload / 100) * 0.62;
  const stabilityMul = 1.30 - (s.stability / 100) * 0.70;
  const handlingMul = 1.30 - (s.handling / 100) * 0.62;
  const rangeMul = 0.82 + (s.range / 100) * 0.55;

  return {
    damage: fam.dmg * impactMul * (mods.dmg || 1),
    crit: fam.crit * (mods.crit || 1),
    rpm: fam.rpm * (mods.rpm || 1),
    shotInterval: 60 / (fam.rpm * (mods.rpm || 1)),
    magazine: Math.max(1, Math.round(fam.mag * magMul * (mods.mag || 1))),
    reloadTime: fam.reload * reloadMul * (mods.reload || 1),
    spread: fam.spread * stabilityMul,
    adsSpread: fam.adsSpread * stabilityMul,
    recoilV: fam.recoil.v * stabilityMul,
    recoilH: fam.recoil.h * stabilityMul,
    adsTime: fam.adsTime * handlingMul * (mods.adsTime || 1),
    zoom: fam.zoom,
    rangeMin: fam.rangeMin * rangeMul,
    rangeMax: fam.rangeMax * rangeMul,
    falloff: fam.falloff,
    pellets: fam.pellets || 1,
    burst: fam.burst || 1,
    burstDelay: fam.burstDelay || 0,
    chargeTime: (fam.chargeTime || 0) * (mods.chargeTime || 1),
    projectile: fam.projectile || null,
    ammoType: fam.ammo,
    sound: fam.sound,
  };
}

// ---------------------------------------------------------------- armor
export function rollArmor(opts = {}) {
  const rng = opts.rng || Math.random;
  const rarity = opts.rarity || rollRarity(rng, opts.luck || 0);
  const power = opts.power ?? POWER.start;
  const classId = opts.classId || null;

  if (rarity === 'exotic') {
    const pool = EXOTIC_ARMOR.filter((e) =>
      (!e.classId || e.classId === classId) && (!opts.slot || e.slot === opts.slot) &&
      (!opts.exoticId || e.id === opts.exoticId));
    const src = pool.length ? pool : EXOTIC_ARMOR.filter((e) => !e.classId || e.classId === classId);
    const ex = src[Math.floor(rng() * src.length)] || EXOTIC_ARMOR[0];
    const item = {
      uid: nextUid(), kind: 'armor', rarity: 'exotic', exoticId: ex.id, slot: ex.slot,
      name: ex.name, flavor: ex.flavor, power, classId,
      stats: rollArmorStats(34, rng, ex.statBias), trait: ex.trait,
    };
    item.total = STAT_IDS.reduce((a, k) => a + item.stats[k], 0);
    return item;
  }

  const slot = opts.slot || ARMOR_SLOTS[Math.floor(rng() * ARMOR_SLOTS.length)];
  const budget = { common: 14, uncommon: 18, rare: 23, legendary: 30 }[rarity] ?? 16;
  const item = {
    uid: nextUid(), kind: 'armor', rarity, slot, classId,
    name: armorName(slot, rng),
    flavor: ARMOR_FLAVOR[Math.floor(rng() * ARMOR_FLAVOR.length)],
    power, stats: rollArmorStats(budget + rndInt(rng, -2, 4), rng),
  };
  item.total = STAT_IDS.reduce((a, k) => a + item.stats[k], 0);
  return item;
}

// ---------------------------------------------------------------- drops
/**
 * One loot drop.
 * `tier` is 'world' | 'powerful' | 'pinnacle'; `luck` biases rarity upward.
 */
export function rollDrop(opts = {}) {
  const rng = opts.rng || Math.random;
  const playerPower = opts.playerPower ?? POWER.start;
  const tier = opts.tier || 'world';
  const power = dropPower(playerPower, tier, rng);
  const wantArmor = opts.forceKind === 'armor' || (opts.forceKind !== 'weapon' && rng() < 0.45);

  let rarity = opts.rarity;
  if (!rarity) {
    const luck = (opts.luck || 0) + (tier === 'pinnacle' ? 1.6 : tier === 'powerful' ? 0.7 : 0);
    rarity = rollRarity(rng, luck, opts.allowExotic !== false);
  }
  return wantArmor
    ? rollArmor({ rng, rarity, power, classId: opts.classId, slot: opts.slot })
    : rollWeapon({ rng, rarity, power, slot: opts.slot, family: opts.family });
}

// ---------------------------------------------------------------- economy
export const dismantleValue = (item) =>
  Math.round(RARITY[item.rarity].shards * (1 + item.power / 260));

/** Raise `target`'s power to `source`'s, consuming shards. Returns a result object. */
export function infuseCost(target, source) {
  const delta = Math.max(0, Math.round(source.power - target.power));
  return { delta, shards: 12 + delta * 3 };
}

export function canInfuse(target, source) {
  if (!target || !source || target.uid === source.uid) return false;
  if (target.kind !== source.kind) return false;
  if (target.kind === 'weapon' && source.slot !== target.slot) return false;
  if (target.kind === 'armor' && source.slot !== target.slot) return false;
  return source.power > target.power;
}

/** Average power across the eight equipped slots — the character's Power level. */
export function computePower(equipped) {
  const slots = [...WEAPON_SLOTS, ...ARMOR_SLOTS];
  let total = 0, count = 0;
  for (const s of slots) {
    const it = equipped[s];
    if (it) { total += it.power; count++; }
    else count++; // an empty slot still drags the average down
  }
  return count ? Math.floor(total / count) : POWER.start;
}

/** Sum the six character stats over equipped armor, capped at 100 each. */
export function computeStats(equipped, classBase) {
  const out = {};
  for (const k of STAT_IDS) out[k] = classBase ? (classBase[k] || 0) : 0;
  for (const s of ARMOR_SLOTS) {
    const it = equipped[s];
    if (!it || !it.stats) continue;
    for (const k of STAT_IDS) out[k] += it.stats[k] || 0;
  }
  for (const k of STAT_IDS) out[k] = Math.max(0, Math.min(100, Math.round(out[k])));
  return out;
}

/** True if equipping `item` would break the one-exotic-per-category rule. */
export function exoticConflict(equipped, item) {
  if (!item || item.rarity !== 'exotic') return null;
  const group = item.kind === 'weapon' ? WEAPON_SLOTS : ARMOR_SLOTS;
  for (const s of group) {
    const cur = equipped[s];
    if (cur && cur.rarity === 'exotic' && cur.uid !== item.uid && s !== item.slot) return s;
  }
  return null;
}

/** A rough one-number quality score, used for sorting and for the "new best" flag. */
export function itemScore(item) {
  if (!item) return 0;
  const rarityBonus = { common: 0, uncommon: 6, rare: 14, legendary: 30, exotic: 46 }[item.rarity] || 0;
  if (item.kind === 'armor') return item.power * 2 + (item.total || 0) * 1.4 + rarityBonus;
  const s = item.stats;
  const statAvg = (s.impact + s.range + s.stability + s.handling + s.reload + s.magazine) / 6;
  return item.power * 2 + statAvg * 0.9 + (item.perks?.length || 0) * 8 + rarityBonus;
}

/** Human-readable subtitle, e.g. "Legendary · Hand Cannon · Ember". */
export function itemSubtitle(item) {
  if (item.kind === 'weapon') {
    const fam = FAMILIES[item.family];
    const el = item.element === 'kinetic' ? 'Kinetic' : item.element[0].toUpperCase() + item.element.slice(1);
    return `${RARITY[item.rarity].name} · ${fam.name} · ${el}`;
  }
  const slotName = { helmet: 'Helmet', arms: 'Gauntlets', chest: 'Chest Armor', legs: 'Leg Armor', class: 'Class Item' }[item.slot];
  return `${RARITY[item.rarity].name} · ${slotName}`;
}

export function weaponPerkList(item) {
  const out = [];
  if (item.exoticId) {
    const ex = EXOTIC_WEAPONS.find((e) => e.id === item.exoticId);
    if (ex) for (const t of ex.traits) out.push({ name: t.name, desc: t.desc, exotic: true, hooks: t });
  }
  for (const pid of item.perks || []) {
    const p = PERKS[pid];
    if (p) out.push({ name: p.name, desc: p.desc, exotic: false, hooks: p });
  }
  return out;
}

/** All hook-carrying objects for an equipped weapon (exotic traits + rolled perks). */
export function weaponHooks(item) {
  if (!item) return [];
  if (item._hooks && item._hooksFor === item.uid) return item._hooks;
  const hooks = weaponPerkList(item).map((p) => p.hooks);
  item._hooks = hooks; item._hooksFor = item.uid;
  return hooks;
}

/** Rebuild transient fields after a save is loaded (derived stats, runtime state). */
export function rehydrate(item) {
  if (!item) return item;
  if (item.kind === 'weapon') {
    item.derived = weaponDerived(item);
    item.rt = { buffs: {} };
    if (item.ammo == null || item.ammo > item.derived.magazine) item.ammo = item.derived.magazine;
    item.ammoType = FAMILIES[item.family].ammo;
    item._hooks = null;
  } else if (item.kind === 'armor') {
    item.total = STAT_IDS.reduce((a, k) => a + (item.stats[k] || 0), 0);
    if (item.exoticId) {
      const ex = EXOTIC_ARMOR.find((e) => e.id === item.exoticId);
      if (ex) item.trait = ex.trait;
    }
  }
  return item;
}

/** The starter kit a brand new character receives. */
export function startingLoadout(classId, rng = Math.random) {
  const p = POWER.start;
  const items = [
    rollWeapon({ rng, rarity: 'uncommon', power: p, slot: 'kinetic', family: 'auto', name: 'Standard Issue AR' }),
    rollWeapon({ rng, rarity: 'uncommon', power: p, slot: 'energy', family: 'sidearm', name: 'Service Sidearm' }),
    rollWeapon({ rng, rarity: 'uncommon', power: p, slot: 'power', family: 'rocket', name: 'Salvaged Launcher' }),
  ];
  for (const s of ARMOR_SLOTS) {
    items.push(rollArmor({ rng, rarity: 'uncommon', power: p, classId, slot: s }));
  }
  return items;
}
