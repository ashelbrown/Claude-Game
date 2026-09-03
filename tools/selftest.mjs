// Headless checks for the parts of the game that don't need a browser:
// loot generation, derived weapon stats, power/stat maths and save round-trips.
import assert from 'node:assert/strict';

import { mulberry32, rayAabb, aabb, v3, vnorm, mViewFPS, mPerspective, mMul, mat4, projectPoint } from '../src/core/math.js';
import { POWER, STAT_IDS, RARITY_ORDER, powerDamageOut, powerDamageIn, statTier } from '../src/data/defs.js';
import { FAMILIES, PERKS, EXOTIC_WEAPONS } from '../src/data/weapons.js';
import { EXOTIC_ARMOR } from '../src/data/armor.js';
import { SUBCLASSES, CLASSES, SUPERS, CLASS_ABILITIES } from '../src/data/subclasses.js';
import { ENEMIES, SPAWN_TABLES, RIGS } from '../src/data/enemies.js';
import {
  rollWeapon, rollArmor, rollDrop, rollRarity, weaponDerived, computePower, computeStats,
  exoticConflict, itemScore, itemSubtitle, startingLoadout, rehydrate, canInfuse, infuseCost,
  dismantleValue, weaponPerkList,
} from '../src/game/loot.js';

let checks = 0;
const ok = (label, fn) => { fn(); checks++; console.log('  ✓ ' + label); };

console.log('\nmath');
ok('ray hits an axis-aligned box in front of the origin', () => {
  const t = rayAabb(v3(0, 0, 0), v3(0, 0, -1), aabb(-1, -1, -12, 1, 1, -10), 100);
  assert.ok(t > 9.9 && t < 10.1, 'expected ~10, got ' + t);
});
ok('ray misses a box that is off-axis', () => {
  assert.equal(rayAabb(v3(0, 0, 0), v3(0, 0, -1), aabb(5, -1, -12, 7, 1, -10), 100), -1);
});
ok('view/projection places a point ahead of the camera on screen', () => {
  const view = mViewFPS(mat4(), v3(0, 1.6, 0), 0, 0);
  const proj = mPerspective(mat4(), 1.3, 1.6, 0.1, 500);
  const vp = mMul(mat4(), proj, view);
  const out = { x: 0, y: 0, w: 0 };
  assert.equal(projectPoint(vp, v3(0, 1.6, -10), out), true);
  assert.ok(Math.abs(out.x) < 1e-5 && Math.abs(out.y) < 1e-5, 'centre point should project to origin');
  assert.equal(projectPoint(vp, v3(0, 1.6, 10), out), false, 'points behind the camera must be rejected');
});
ok('seeded rng is deterministic', () => {
  const a = mulberry32(1234), b = mulberry32(1234);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

console.log('\ndata integrity');
ok('every subclass points at a real class, super and element', () => {
  for (const sc of Object.values(SUBCLASSES)) {
    assert.ok(CLASSES[sc.classId], sc.id + ' has an unknown class');
    assert.ok(SUPERS[sc.super], sc.id + ' has an unknown super ' + sc.super);
    assert.ok(sc.grenade && sc.grenade.behavior, sc.id + ' is missing a grenade');
    assert.ok(sc.melee && sc.melee.behavior, sc.id + ' is missing a melee');
  }
  for (const c of Object.values(CLASSES)) {
    assert.ok(CLASS_ABILITIES[c.classAbility], c.id + ' has an unknown class ability');
    assert.equal(c.subclasses.length, 3);
    for (const s of c.subclasses) assert.ok(SUBCLASSES[s], c.id + ' references missing subclass ' + s);
  }
});
ok('every enemy has a rig, and spawn tables reference real enemies', () => {
  for (const e of Object.values(ENEMIES)) {
    assert.ok(RIGS[e.rig], e.id + ' has an unknown rig ' + e.rig);
    assert.ok(e.hp > 0 && e.radius > 0 && e.height > 0, e.id + ' has bad dimensions');
    assert.ok(e.crit && typeof e.crit.y === 'number', e.id + ' is missing a crit box');
  }
  for (const table of Object.values(SPAWN_TABLES)) {
    for (const group of Object.values(table)) {
      for (const entry of group) assert.ok(ENEMIES[entry.id], 'spawn table references ' + entry.id);
    }
  }
});
ok('every exotic weapon uses a real family and slot', () => {
  for (const ex of EXOTIC_WEAPONS) {
    assert.ok(FAMILIES[ex.family], ex.id + ' family ' + ex.family);
    assert.ok(['kinetic', 'energy', 'power'].includes(ex.slot), ex.id + ' slot');
    assert.ok(ex.traits.length >= 1, ex.id + ' needs at least one trait');
  }
  for (const ex of EXOTIC_ARMOR) {
    assert.ok(['helmet', 'arms', 'chest', 'legs', 'class'].includes(ex.slot), ex.id + ' slot');
    assert.ok(ex.trait && ex.trait.name, ex.id + ' trait');
  }
});
ok('boss phase tables reference spawnable adds', () => {
  for (const e of Object.values(ENEMIES)) {
    if (!e.phases) continue;
    for (const ph of e.phases) for (const a of ph.adds || []) assert.ok(ENEMIES[a], e.id + ' add ' + a);
  }
});

console.log('\nloot');
ok('a weapon rolls with coherent derived stats', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 400; i++) {
    const w = rollWeapon({ rng, power: 200 });
    assert.ok(w.derived.damage > 0, 'damage');
    assert.ok(w.derived.magazine >= 1, 'magazine');
    assert.ok(w.derived.reloadTime > 0.2, 'reload');
    assert.ok(w.derived.shotInterval > 0, 'shot interval');
    assert.equal(w.ammo, w.derived.magazine);
    assert.ok(FAMILIES[w.family].slotPool.includes(w.slot) || w.rarity === 'exotic', 'slot fits family');
    assert.ok(w.perks.length === (w.rarity === 'exotic' ? 0 : Math.min(3, w.perks.length)));
    for (const p of w.perks) assert.ok(PERKS[p], 'unknown perk ' + p);
  }
});
ok('armor rolls stay inside the stat cap and sum to the reported total', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 400; i++) {
    const a = rollArmor({ rng, power: 200, classId: 'ranger' });
    const sum = STAT_IDS.reduce((t, k) => t + a.stats[k], 0);
    assert.equal(sum, a.total);
    for (const k of STAT_IDS) assert.ok(a.stats[k] >= 0 && a.stats[k] <= 42, k + '=' + a.stats[k]);
  }
});
ok('world drops never exceed the soft cap; pinnacles climb past it', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 500; i++) {
    const d = rollDrop({ rng, playerPower: POWER.softCap, tier: 'world' });
    assert.ok(d.power <= POWER.softCap, 'world drop overshot soft cap: ' + d.power);
  }
  let sawHigher = false;
  for (let i = 0; i < 200; i++) {
    const d = rollDrop({ rng, playerPower: POWER.softCap, tier: 'pinnacle' });
    assert.ok(d.power <= POWER.pinnacleCap);
    if (d.power > POWER.softCap) sawHigher = true;
  }
  assert.ok(sawHigher, 'pinnacle drops should be able to exceed the soft cap');
});
ok('rarity distribution is sane and luck shifts it upward', () => {
  const rng = mulberry32(99);
  const count = {}; for (const r of RARITY_ORDER) count[r] = 0;
  for (let i = 0; i < 20000; i++) count[rollRarity(rng)]++;
  assert.ok(count.common > count.rare, 'commons should outnumber rares');
  assert.ok(count.legendary > 0 && count.exotic > 0, 'top rarities must be reachable');
  assert.ok(count.exotic / 20000 < 0.05, 'exotics should stay rare: ' + count.exotic / 20000);
  let lucky = 0;
  for (let i = 0; i < 20000; i++) { const r = rollRarity(rng, 1.6); if (r === 'legendary' || r === 'exotic') lucky++; }
  assert.ok(lucky / 20000 > (count.legendary + count.exotic) / 20000, 'luck must help');
});
ok('power average and one-exotic rule behave', () => {
  const rng = mulberry32(5);
  const eq = {};
  for (const it of startingLoadout('warden', rng)) eq[it.slot] = it;
  assert.equal(computePower(eq), POWER.start);
  const ex1 = rollWeapon({ rng, rarity: 'exotic', power: 120, slot: 'energy' });
  const ex2 = rollWeapon({ rng, rarity: 'exotic', power: 120, slot: 'kinetic' });
  eq.energy = ex1;
  assert.equal(exoticConflict(eq, ex2), 'energy', 'a second exotic weapon must conflict');
  assert.equal(exoticConflict(eq, rollWeapon({ rng, rarity: 'legendary', power: 120 })), null);
});
ok('character stats sum armor plus the class base and cap at 100', () => {
  const rng = mulberry32(21);
  const eq = {};
  for (const it of startingLoadout('adept', rng)) eq[it.slot] = it;
  const st = computeStats(eq, CLASSES.adept.baseStats);
  for (const k of STAT_IDS) assert.ok(st[k] >= 0 && st[k] <= 100, k + '=' + st[k]);
  assert.ok(st.recovery >= CLASSES.adept.baseStats.recovery, 'class base should be included');
  assert.equal(statTier(100), 10); assert.equal(statTier(0), 0); assert.equal(statTier(55), 5);
});
ok('power delta scaling rewards over-levelling and punishes under-levelling', () => {
  assert.ok(powerDamageOut(200, 200) === 1);
  assert.ok(powerDamageOut(180, 200) < 1 && powerDamageIn(180, 200) > 1);
  assert.ok(powerDamageOut(230, 200) > 1 && powerDamageIn(230, 200) < 1);
  assert.ok(powerDamageOut(0, 400) >= 0.2, 'outgoing damage has a floor');
  assert.ok(powerDamageIn(9999, 1) >= 0.55, 'incoming damage has a floor');
});
ok('infusion rules and dismantle values', () => {
  const rng = mulberry32(13);
  const lo = rollWeapon({ rng, rarity: 'rare', power: 150, slot: 'kinetic', family: 'auto' });
  const hi = rollWeapon({ rng, rarity: 'rare', power: 190, slot: 'kinetic', family: 'scout' });
  const other = rollWeapon({ rng, rarity: 'rare', power: 190, slot: 'power', family: 'rocket' });
  assert.equal(canInfuse(lo, hi), true);
  assert.equal(canInfuse(hi, lo), false, 'cannot infuse downward');
  assert.equal(canInfuse(lo, other), false, 'slots must match');
  assert.equal(canInfuse(lo, lo), false);
  assert.equal(infuseCost(lo, hi).delta, 40);
  assert.ok(dismantleValue(hi) > 0);
});
ok('items survive a JSON save/load round trip', () => {
  const rng = mulberry32(17);
  const w = rollWeapon({ rng, rarity: 'exotic', power: 240 });
  const a = rollArmor({ rng, rarity: 'exotic', power: 240, classId: 'warden' });
  const revivedW = rehydrate(JSON.parse(JSON.stringify(w)));
  const revivedA = rehydrate(JSON.parse(JSON.stringify(a)));
  assert.equal(revivedW.derived.magazine, w.derived.magazine);
  assert.ok(weaponPerkList(revivedW).length >= 2, 'exotic traits must survive the round trip');
  assert.equal(revivedA.total, a.total);
  assert.ok(revivedA.trait && revivedA.trait.name, 'exotic armor trait must be restored');
});
ok('subtitles and scores are produced for every rarity', () => {
  const rng = mulberry32(23);
  for (const r of RARITY_ORDER) {
    const w = rollWeapon({ rng, rarity: r, power: 200 });
    const a = rollArmor({ rng, rarity: r, power: 200, classId: 'ranger' });
    assert.ok(itemSubtitle(w).length > 4 && itemSubtitle(a).length > 4);
    assert.ok(itemScore(w) > 0 && itemScore(a) > 0);
  }
});

console.log(`\n${checks} checks passed.\n`);
