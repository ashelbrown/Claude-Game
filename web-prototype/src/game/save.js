// Profile persistence in localStorage. Items are stored without their derived
// fields and rebuilt through loot.rehydrate() on load.

import { rehydrate, startingLoadout, computePower, computeStats, seedUid, peekUid } from './loot.js';
import { CLASSES, SUBCLASSES } from '../data/subclasses.js';
import { POWER, SLOT_ORDER, STAT_IDS } from '../data/defs.js';

const KEY = 'starfall.profile.v1';
const VERSION = 1;

const STRIP = ['derived', 'rt', '_hooks', '_hooksFor', 'trait'];

function serializeItem(it) {
  const out = {};
  for (const k of Object.keys(it)) {
    if (STRIP.includes(k)) continue;
    out[k] = it[k];
  }
  return out;
}

export function newProfile(classId, subclassId) {
  const cls = CLASSES[classId] || CLASSES.warden;
  const sub = subclassId && SUBCLASSES[subclassId] ? subclassId : cls.subclasses[0];
  const items = startingLoadout(classId);
  const equipped = {};
  for (const it of items) equipped[it.slot] = it.uid;
  return {
    version: VERSION,
    createdAt: Date.now(),
    classId, subclassId: sub,
    inventory: items,
    equipped,
    shards: 120,
    xp: 0,
    level: 1,
    unlockedSubclasses: [sub],
    stats: { kills: 0, deaths: 0, activitiesRun: 0, bossKills: 0, bestWave: 0, playTime: 0, exoticsFound: 0 },
    settings: { sensitivity: 2.2, invertY: false, volume: 0.7, musicVolume: 0.45, fov: 95, showDamage: true },
    seenTutorial: false,
  };
}

export function save(profile) {
  try {
    const data = {
      ...profile,
      inventory: profile.inventory.map(serializeItem),
      _uid: peekUid(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('STARFALL: could not save profile —', e);
    return false;
  }
}

export function load() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch (e) { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    if (!CLASSES[data.classId]) return null;
    if (!SUBCLASSES[data.subclassId]) data.subclassId = CLASSES[data.classId].subclasses[0];
    data.inventory = (data.inventory || []).map(rehydrate).filter(Boolean);
    // drop equipped references to items that no longer exist
    const byUid = new Map(data.inventory.map((i) => [i.uid, i]));
    for (const slot of Object.keys(data.equipped || {})) {
      if (!byUid.has(data.equipped[slot])) delete data.equipped[slot];
    }
    data.settings = { ...newProfile(data.classId).settings, ...(data.settings || {}) };
    data.stats = { ...newProfile(data.classId).stats, ...(data.stats || {}) };
    if (data._uid) seedUid(data._uid);
    return data;
  } catch (e) {
    console.warn('STARFALL: save data was unreadable, starting fresh —', e);
    return null;
  }
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/** Resolve equipped uids into a slot→item map. */
export function equippedItems(profile) {
  const byUid = new Map(profile.inventory.map((i) => [i.uid, i]));
  const out = {};
  for (const slot of SLOT_ORDER) {
    const uid = profile.equipped[slot];
    if (uid && byUid.has(uid)) out[slot] = byUid.get(uid);
  }
  return out;
}

/** Everything the Player needs, derived from the profile. */
export function loadoutFor(profile) {
  const equipped = equippedItems(profile);
  return {
    classId: profile.classId,
    subclassId: profile.subclassId,
    equipped,
    power: computePower(equipped),
    stats: computeStats(equipped, CLASSES[profile.classId].baseStats),
  };
}

export function addItem(profile, item) {
  profile.inventory.push(item);
  // Keep the vault from growing without bound; auto-shard the worst commons.
  const CAP = 220;
  if (profile.inventory.length > CAP) {
    const equipped = new Set(Object.values(profile.equipped));
    const junk = profile.inventory
      .filter((i) => !equipped.has(i.uid) && !i.locked && (i.rarity === 'common' || i.rarity === 'uncommon'))
      .sort((a, b) => a.power - b.power);
    while (profile.inventory.length > CAP && junk.length) {
      const drop = junk.shift();
      const idx = profile.inventory.indexOf(drop);
      if (idx >= 0) profile.inventory.splice(idx, 1);
    }
  }
  return item;
}

export function removeItem(profile, uid) {
  const i = profile.inventory.findIndex((it) => it.uid === uid);
  if (i >= 0) return profile.inventory.splice(i, 1)[0];
  return null;
}

export const PROFILE_KEY = KEY;
export const STAT_KEYS = STAT_IDS;
export const BASE_POWER = POWER.start;
