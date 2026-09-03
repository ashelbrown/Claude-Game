// Headless tests for Starfall.Core — the parts that do not need Unity.
//
// Unity cannot be installed in this environment, so this suite is where the
// loot economy, power curves and perk pipeline actually get exercised. Run it
// with tools/core-tests/run.sh.
using System;
using System.Collections.Generic;
using Starfall.Core;

static class Tests {
    static int _passed, _failed;

    static void Check(string label, Action body) {
        try { body(); _passed++; Console.WriteLine("  [pass] " + label); }
        catch (Exception e) {
            _failed++;
            Console.WriteLine("  [FAIL] " + label + "\n         " + e.Message);
        }
    }

    static void Assert(bool cond, string message) {
        if (!cond) throw new Exception(message);
    }

    static void Equal<T>(T actual, T expected, string what) {
        if (!EqualityComparer<T>.Default.Equals(actual, expected))
            throw new Exception(what + ": expected " + expected + ", got " + actual);
    }

    // ---------------------------------------------------------------- fakes
    sealed class FakeTarget : ITarget {
        public Rank Rank { get; set; }
        public float BurnRemaining { get; set; }
        public Vec3 Position { get; set; }
        public bool Alive { get; set; }
        public FakeTarget() { Rank = Rank.Minor; Alive = true; }
    }

    /// <summary>Records everything a perk does so hooks can be asserted on.</summary>
    sealed class FakeContext : IPerkContext {
        public float Time { get; set; }
        public float DifficultyDamageScale { get; set; }
        public Vec3 PlayerPosition { get; set; }
        public bool PlayerAiming { get; set; }
        public float PlayerCombatSeconds { get; set; }
        public bool PlayerInvisible { get; set; }
        public int NearbyEnemies;

        public readonly List<string> Log = new List<string>();
        public float GrenadeCharge, MeleeCharge, ClassCharge;
        public float ExplosionDamage; public int Explosions;
        public int Refills; public int RefilledRounds;
        public float BurnDps; public float CloakSeconds; public float MeleeBuff;
        public int Chains, BurnPools, Singularities;

        public FakeContext() { DifficultyDamageScale = 1f; }

        public int EnemiesWithin(Vec3 position, float radius) => NearbyEnemies;

        public void ChargeAbility(AbilityKind kind, float fraction) {
            Log.Add("charge:" + kind);
            if (kind == AbilityKind.Grenade) GrenadeCharge += fraction;
            else if (kind == AbilityKind.Melee) MeleeCharge += fraction;
            else if (kind == AbilityKind.Class) ClassCharge += fraction;
        }
        public void Explode(Vec3 p, float r, float dmg, Element e) {
            Explosions++; ExplosionDamage += dmg; Log.Add("explode");
        }
        public void ApplyBurn(ITarget t, float dps, float dur) { BurnDps = dps; Log.Add("burn"); }
        public void ChainLightning(Vec3 f, ITarget s, float d, float r, int n) { Chains++; Log.Add("chain"); }
        public void SpawnBurnPool(Vec3 p, float r, float d, float dps) { BurnPools++; Log.Add("pool"); }
        public void SpawnSingularity(Vec3 p, float r, float d, float dmg) { Singularities++; Log.Add("singularity"); }
        public void Cloak(float d) { CloakSeconds = d; Log.Add("cloak"); }
        public void BuffMelee(float m, float d) { MeleeBuff = m; Log.Add("meleebuff"); }
        public void RefillMagazine(Item w, int rounds) {
            Refills++; RefilledRounds += rounds;
            w.Ammo = Math.Min(w.Derived.Magazine, w.Ammo + rounds);
            Log.Add("refill");
        }
    }

    static PerkEvent Event(FakeContext ctx, Item weapon, ITarget target = null, bool crit = false, float dmg = 10f) {
        return new PerkEvent {
            Ctx = ctx, Weapon = weapon, Target = target, Crit = crit,
            Damage = dmg, Position = new Vec3(0, 1, 0), Source = "weapon"
        };
    }

    // ---------------------------------------------------------------- main
    static int Main() {
        Console.WriteLine("\nrng");
        Check("same seed produces the same stream", () => {
            var a = new Rng(1234); var b = new Rng(1234);
            for (int i = 0; i < 200; i++) Equal(a.Value, b.Value, "sample " + i);
        });
        Check("values stay in [0,1) and ranges are respected", () => {
            var r = new Rng(7);
            for (int i = 0; i < 20000; i++) {
                float v = r.Value;
                Assert(v >= 0f && v < 1f, "Value out of range: " + v);
                int n = r.RangeInt(3, 6);
                Assert(n >= 3 && n <= 6, "RangeInt out of range: " + n);
            }
        });
        Check("weighted pick honours the weights", () => {
            var r = new Rng(9);
            var items = new List<float> { 1f, 9f };
            int second = 0;
            for (int i = 0; i < 10000; i++) if (r.PickWeighted(items, x => x) == 9f) second++;
            Assert(second > 8500 && second < 9500, "expected ~90% heavy pick, got " + second / 100f + "%");
        });

        Console.WriteLine("\ncatalog integrity");
        Check("every weapon family derives coherent numbers", () => {
            var rng = new Rng(3);
            foreach (var fam in Catalog.Families) {
                var w = Loot.RollWeapon(rng, 200, Rarity.Legendary, null, fam.Id);
                Assert(w.Derived.Damage > 0f, fam.Id + " damage");
                Assert(w.Derived.Magazine >= 1, fam.Id + " magazine");
                Assert(w.Derived.ShotInterval > 0f, fam.Id + " shot interval");
                Assert(w.Derived.ReloadTime > 0.2f, fam.Id + " reload");
                Assert(fam.ModelName != null && fam.ModelName.StartsWith("WPN_"), fam.Id + " model name");
            }
        });
        Check("every exotic references a real family and carries traits", () => {
            foreach (var ex in Catalog.ExoticWeapons) {
                Assert(Catalog.FindFamily(ex.FamilyId) != null, ex.Id + " family");
                Assert(ex.Traits.Count >= 1, ex.Id + " traits");
                foreach (var t in ex.Traits) Assert(t.IsExoticTrait, ex.Id + " trait flag");
            }
        });
        Check("class, subclasses and supers all resolve", () => {
            var cls = Catalog.FindClass("choralith");
            Assert(cls != null, "choralith class missing");
            Equal(cls.SubclassIds.Length, 3, "subclass count");
            foreach (var id in cls.SubclassIds) {
                var sub = Catalog.FindSubclass(id);
                Assert(sub != null, "missing subclass " + id);
                Assert(Catalog.FindSuper(sub.SuperId) != null, id + " super " + sub.SuperId);
                Assert(sub.Grenade != null && sub.Melee != null, id + " abilities");
                Equal(sub.ClassId, "choralith", id + " class link");
            }
            Assert(Catalog.FindClassAbility(cls.ClassAbilityId) != null, "class ability");
        });
        Check("exotic armor is well formed", () => {
            foreach (var e in Catalog.ExoticArmor) {
                Assert(!string.IsNullOrEmpty(e.TraitName), e.Id + " trait name");
                Assert(!string.IsNullOrEmpty(e.TraitDescription), e.Id + " trait text");
                Assert(Array.IndexOf(Defs.ArmorSlots, e.Slot) >= 0, e.Id + " slot");
            }
        });

        Console.WriteLine("\nloot");
        Check("weapons roll with valid slots, perks and ammo", () => {
            var rng = new Rng(11);
            for (int i = 0; i < 3000; i++) {
                var w = Loot.RollWeapon(rng, 200);
                Assert(w.Kind == ItemKind.Weapon, "kind");
                Assert(w.Ammo == w.Derived.Magazine, "starts loaded");
                Assert(w.PerkIds.Count == Defs.Of(w.Rarity).Perks || w.Rarity == Rarity.Exotic,
                       w.Rarity + " perk count was " + w.PerkIds.Count);
                foreach (var id in w.PerkIds) Assert(Catalog.FindPerk(id) != null, "unknown perk " + id);
                if (w.Rarity != Rarity.Exotic) {
                    Assert(Array.IndexOf(Catalog.FindFamily(w.FamilyId).SlotPool, w.Slot) >= 0,
                           w.FamilyId + " cannot occupy " + w.Slot);
                }
                // Rolled kinetic weapons are always Kinetic damage; exotics are
                // allowed to break that (Loud Silence is a Null-damage kinetic).
                if (w.Rarity != Rarity.Exotic) {
                    Assert(w.Slot != Slot.Kinetic || w.Element == Element.Kinetic,
                           "rolled kinetic-slot weapon had element " + w.Element);
                    Assert(w.Slot == Slot.Kinetic || w.Element != Element.Kinetic,
                           "rolled energy/power weapon had Kinetic element");
                }
            }
        });
        Check("legendary rolls never duplicate a perk", () => {
            var rng = new Rng(29);
            for (int i = 0; i < 4000; i++) {
                var w = Loot.RollWeapon(rng, 200, Rarity.Legendary);
                var seen = new HashSet<string>();
                foreach (var id in w.PerkIds) Assert(seen.Add(id), "duplicate perk " + id);
            }
        });
        Check("armor stats stay capped and match the reported total", () => {
            var rng = new Rng(13);
            for (int i = 0; i < 3000; i++) {
                var a = Loot.RollArmor(rng, 200, "choralith");
                int sum = 0;
                for (int s = 0; s < Defs.StatCount; s++) {
                    Assert(a.ArmorStats[s] >= 0 && a.ArmorStats[s] <= 42,
                           "stat out of range: " + a.ArmorStats[s]);
                    sum += a.ArmorStats[s];
                }
                Equal(sum, a.ArmorTotal, "armor total");
            }
        });
        Check("world drops respect the soft cap; pinnacles exceed it", () => {
            var rng = new Rng(5);
            for (int i = 0; i < 3000; i++) {
                var d = Loot.RollDrop(rng, Defs.SoftCap, RewardTier.World, "choralith");
                Assert(d.Power <= Defs.SoftCap, "world drop overshot: " + d.Power);
            }
            bool sawHigher = false;
            for (int i = 0; i < 1000; i++) {
                var d = Loot.RollDrop(rng, Defs.SoftCap, RewardTier.Pinnacle, "choralith");
                Assert(d.Power <= Defs.PinnacleCap, "pinnacle overshot: " + d.Power);
                if (d.Power > Defs.SoftCap) sawHigher = true;
            }
            Assert(sawHigher, "pinnacle drops should be able to exceed the soft cap");
        });
        Check("rarity distribution is sane and luck shifts it upward", () => {
            var rng = new Rng(99);
            var count = new Dictionary<Rarity, int>();
            foreach (var r in Defs.Rarities) count[r.Id] = 0;
            const int N = 40000;
            for (int i = 0; i < N; i++) count[Loot.RollRarity(rng)]++;
            Assert(count[Rarity.Common] > count[Rarity.Rare], "commons should outnumber rares");
            Assert(count[Rarity.Legendary] > 0 && count[Rarity.Exotic] > 0, "top rarities unreachable");
            Assert(count[Rarity.Exotic] / (float)N < 0.03f,
                   "exotics too common: " + count[Rarity.Exotic] / (float)N);
            int baseTop = count[Rarity.Legendary] + count[Rarity.Exotic];
            int lucky = 0;
            for (int i = 0; i < N; i++) {
                var r = Loot.RollRarity(rng, 1.6f);
                if (r == Rarity.Legendary || r == Rarity.Exotic) lucky++;
            }
            Assert(lucky > baseTop, "luck must raise the top-rarity rate");
        });
        Check("power average, stats and the one-exotic rule", () => {
            var rng = new Rng(17);
            var eq = new Dictionary<Slot, Item>();
            foreach (var it in Loot.StartingLoadout("choralith", rng)) eq[it.Slot] = it;
            Equal(Loot.ComputePower(eq), Defs.StartPower, "starting power");

            var stats = Loot.ComputeStats(eq, Catalog.FindClass("choralith"));
            for (int i = 0; i < Defs.StatCount; i++)
                Assert(stats[i] >= 0 && stats[i] <= 100, "stat " + i + " = " + stats[i]);

            var ex1 = Loot.RollWeapon(rng, 120, Rarity.Exotic, Slot.Energy);
            var ex2 = Loot.RollWeapon(rng, 120, Rarity.Exotic, Slot.Kinetic);
            eq[Slot.Energy] = ex1;
            Equal(Loot.ExoticConflict(eq, ex2), (Slot?)Slot.Energy, "second exotic weapon must conflict");
            Assert(Loot.ExoticConflict(eq, Loot.RollWeapon(rng, 120, Rarity.Legendary)) == null,
                   "legendary must not conflict");
        });
        Check("empty slots drag Power down", () => {
            var rng = new Rng(41);
            var eq = new Dictionary<Slot, Item>();
            foreach (var it in Loot.StartingLoadout("choralith", rng)) eq[it.Slot] = it;
            int full = Loot.ComputePower(eq);
            eq.Remove(Slot.Helmet);
            Assert(Loot.ComputePower(eq) < full, "removing a piece must lower Power");
        });
        Check("infusion rules and dismantle values", () => {
            var rng = new Rng(23);
            var lo = Loot.RollWeapon(rng, 150, Rarity.Rare, Slot.Kinetic, "auto");
            var hi = Loot.RollWeapon(rng, 190, Rarity.Rare, Slot.Kinetic, "scout");
            var other = Loot.RollWeapon(rng, 190, Rarity.Rare, Slot.Power, "rocket");
            Assert(Loot.CanInfuse(lo, hi), "should infuse upward");
            Assert(!Loot.CanInfuse(hi, lo), "must not infuse downward");
            Assert(!Loot.CanInfuse(lo, other), "slots must match");
            Assert(!Loot.CanInfuse(lo, lo), "cannot infuse into itself");
            Equal(Loot.InfusionCost(lo, hi), 12 + 40 * 3, "infusion cost");
            Assert(Loot.DismantleValue(hi) > 0, "dismantle value");
        });

        Console.WriteLine("\npower curves");
        Check("power delta rewards over-levelling and punishes under-levelling", () => {
            Equal(Defs.DamageOut(200, 200), 1f, "parity outgoing");
            Assert(Defs.DamageOut(180, 200) < 1f, "under-levelled deals less");
            Assert(Defs.DamageIn(180, 200) > 1f, "under-levelled takes more");
            Assert(Defs.DamageOut(230, 200) > 1f, "over-levelled deals more");
            Assert(Defs.DamageIn(230, 200) < 1f, "over-levelled takes less");
            Assert(Defs.DamageOut(0, 400) >= 0.20f, "outgoing floor");
            Assert(Defs.DamageIn(9999, 1) >= 0.55f, "incoming floor");
            Assert(Defs.DamageOut(9999, 1) <= 1.55f, "outgoing ceiling");
        });
        Check("stat tiers and xp curve behave", () => {
            Equal(Defs.Tier(0), 0, "tier 0"); Equal(Defs.Tier(55), 5, "tier 5");
            Equal(Defs.Tier(100), 10, "tier 10"); Equal(Defs.Tier(999), 10, "tier clamp");
            for (int lvl = 1; lvl < 60; lvl++)
                Assert(Defs.XpForLevel(lvl + 1) > Defs.XpForLevel(lvl), "xp must rise at " + lvl);
        });

        Console.WriteLine("\nperks");
        Check("Rampage stacks damage and expires", () => {
            var ctx = new FakeContext { Time = 10f };
            var w = Loot.RollWeapon(new Rng(1), 200, Rarity.Rare, Slot.Kinetic, "auto");
            var perk = Catalog.FindPerk("rampage");
            var ev = Event(ctx, w);
            Equal(perk.DamageMultiplier(ev), 1f, "no stacks");
            perk.OnKill(ev); perk.OnKill(ev);
            Assert(Math.Abs(perk.DamageMultiplier(ev) - 1.22f) < 0.001f,
                   "two stacks, got " + perk.DamageMultiplier(ev));
            for (int i = 0; i < 5; i++) perk.OnKill(ev);
            Assert(Math.Abs(perk.DamageMultiplier(ev) - 1.33f) < 0.001f, "should cap at three stacks");
            ctx.Time = 20f;
            Equal(perk.DamageMultiplier(ev), 1f, "buff must expire");
        });
        Check("Kill Clip only pays out on a reload after a kill", () => {
            var ctx = new FakeContext { Time = 5f };
            var w = Loot.RollWeapon(new Rng(2), 200, Rarity.Rare, Slot.Kinetic, "auto");
            var perk = Catalog.FindPerk("killClip");
            var ev = Event(ctx, w);
            perk.OnReload(ev);
            Equal(perk.DamageMultiplier(ev), 1f, "reload alone does nothing");
            perk.OnKill(ev);
            perk.OnReload(ev);
            Assert(Math.Abs(perk.DamageMultiplier(ev) - 1.30f) < 0.001f, "kill then reload arms it");
            ctx.Time = 5f + 6f;
            Equal(perk.DamageMultiplier(ev), 1f, "expires after 5s");
        });
        Check("Vorpal only applies to majors and above", () => {
            var ctx = new FakeContext();
            var w = Loot.RollWeapon(new Rng(3), 200, Rarity.Rare, Slot.Kinetic, "auto");
            var perk = Catalog.FindPerk("vorpal");
            Equal(perk.DamageMultiplier(Event(ctx, w, new FakeTarget { Rank = Rank.Minor })), 1f, "minor");
            Equal(perk.DamageMultiplier(Event(ctx, w, new FakeTarget { Rank = Rank.Boss })), 1.25f, "boss");
        });
        Check("Triple Tap returns a round on every third precision hit", () => {
            var ctx = new FakeContext();
            var w = Loot.RollWeapon(new Rng(4), 200, Rarity.Rare, Slot.Energy, "scout");
            var perk = Catalog.FindPerk("tripleTap");
            var ev = Event(ctx, w);
            perk.OnPrecisionHit(ev); perk.OnPrecisionHit(ev);
            Equal(ctx.Refills, 0, "not yet");
            perk.OnPrecisionHit(ev);
            Equal(ctx.Refills, 1, "third hit refunds");
            Equal(ctx.RefilledRounds, 1, "one round");
        });
        Check("Surrounded reads the live enemy count", () => {
            var ctx = new FakeContext { NearbyEnemies = 2 };
            var w = Loot.RollWeapon(new Rng(5), 200, Rarity.Rare, Slot.Kinetic, "auto");
            var perk = Catalog.FindPerk("surrounded");
            Equal(perk.DamageMultiplier(Event(ctx, w)), 1f, "two enemies is not enough");
            ctx.NearbyEnemies = 3;
            Equal(perk.DamageMultiplier(Event(ctx, w)), 1.35f, "three enemies triggers it");
        });
        Check("ability-charging perks feed the right ability", () => {
            var ctx = new FakeContext();
            var w = Loot.RollWeapon(new Rng(6), 200, Rarity.Rare, Slot.Kinetic, "auto");
            Catalog.FindPerk("demolitionist").OnKill(Event(ctx, w));
            Catalog.FindPerk("pugilist").OnKill(Event(ctx, w));
            Catalog.FindPerk("wellspring").OnKill(Event(ctx, w));
            Assert(ctx.GrenadeCharge > 0f && ctx.MeleeCharge > 0f && ctx.ClassCharge > 0f,
                   "all three abilities should have gained energy");
        });
        Check("every exotic trait fires without throwing", () => {
            var rng = new Rng(77);
            foreach (var ex in Catalog.ExoticWeapons) {
                var ctx = new FakeContext { Time = 3f, DifficultyDamageScale = 1.4f };
                var w = Loot.RollWeapon(rng, 250, Rarity.Exotic, null, null, ex.Id);
                Equal(w.ExoticId, ex.Id, "exotic id");
                Assert(w.Perks.Count >= 1, ex.Id + " resolved no traits");
                var target = new FakeTarget { Rank = Rank.Major, BurnRemaining = 1f };
                var ev = Event(ctx, w, target, true, 40f);
                ev.AllPelletsHit = true;
                ev.Source = "singularity";
                foreach (var t in w.Perks) {
                    if (t.OnHit != null) t.OnHit(ev);
                    if (t.OnPrecisionHit != null) t.OnPrecisionHit(ev);
                    if (t.OnKill != null) t.OnKill(ev);
                    if (t.OnPrecisionKill != null) t.OnPrecisionKill(ev);
                    if (t.OnMeleeKill != null) t.OnMeleeKill(ev);
                    if (t.OnProjectileImpact != null) t.OnProjectileImpact(ev);
                    if (t.OnReload != null) t.OnReload(ev);
                    if (t.OnAmmoPickup != null) t.OnAmmoPickup(ev);
                    if (t.DamageMultiplier != null) Assert(t.DamageMultiplier(ev) > 0f, ex.Id + " damage mul");
                    if (t.FireRateMultiplier != null) Assert(t.FireRateMultiplier(ev) > 0f, ex.Id + " rpm mul");
                    if (t.CritMultiplier != null) Assert(t.CritMultiplier(ev) > 0f, ex.Id + " crit mul");
                }
            }
        });
        Check("every rolled perk fires without throwing", () => {
            var rng = new Rng(88);
            foreach (var p in Catalog.Perks) {
                var ctx = new FakeContext { Time = 2f, NearbyEnemies = 4, PlayerAiming = true,
                                            PlayerCombatSeconds = 12f };
                var w = Loot.RollWeapon(rng, 200, Rarity.Rare, Slot.Kinetic, "auto");
                var ev = Event(ctx, w, new FakeTarget { Rank = Rank.Major }, true, 30f);
                if (p.OnHit != null) p.OnHit(ev);
                if (p.OnPrecisionHit != null) p.OnPrecisionHit(ev);
                if (p.OnKill != null) p.OnKill(ev);
                if (p.OnPrecisionKill != null) p.OnPrecisionKill(ev);
                if (p.OnMeleeKill != null) p.OnMeleeKill(ev);
                if (p.OnGrenadeKill != null) p.OnGrenadeKill(ev);
                if (p.OnReload != null) p.OnReload(ev);
                if (p.OnAmmoPickup != null) p.OnAmmoPickup(ev);
                foreach (var f in new[] { p.DamageMultiplier, p.CritMultiplier, p.ReloadMultiplier,
                                          p.StabilityMultiplier, p.HandlingMultiplier,
                                          p.RangeMultiplier, p.FireRateMultiplier }) {
                    if (f != null) Assert(f(ev) > 0f, p.Id + " returned a non-positive multiplier");
                }
            }
        });
        Check("two copies of a gun track buffs independently", () => {
            var ctx = new FakeContext { Time = 1f };
            var rng = new Rng(31);
            var a = Loot.RollWeapon(rng, 200, Rarity.Rare, Slot.Kinetic, "auto");
            var b = Loot.RollWeapon(rng, 200, Rarity.Rare, Slot.Kinetic, "auto");
            var perk = Catalog.FindPerk("rampage");
            perk.OnKill(Event(ctx, a));
            Assert(perk.DamageMultiplier(Event(ctx, a)) > 1f, "first copy buffed");
            Equal(perk.DamageMultiplier(Event(ctx, b)), 1f, "second copy must be unaffected");
        });

        Console.WriteLine("\n" + _passed + " passed, " + _failed + " failed.\n");
        return _failed == 0 ? 0 : 1;
    }
}
