using System;
using System.Collections.Generic;

namespace Starfall.Core {

/// <summary>
/// Item generation and the economy around it. Deliberately free of engine
/// references so the whole loot loop can be exercised headlessly.
/// </summary>
public static class Loot {

    static int _uid = 1;
    public static string NextUid() => "i" + (_uid++).ToString("x");
    public static void SeedUid(int n) { if (n > _uid) _uid = n; }
    public static int PeekUid() => _uid;

    // ------------------------------------------------------------- rarity
    /// <summary>Rarity roll. `luck` shifts weight toward the top of the table.</summary>
    public static Rarity RollRarity(Rng rng, float luck = 0f, bool allowExotic = true) {
        float total = 0f;
        var weights = new float[Defs.Rarities.Length];
        for (int i = 0; i < Defs.Rarities.Length; i++) {
            if (!allowExotic && Defs.Rarities[i].Id == Rarity.Exotic) { weights[i] = 0f; continue; }
            weights[i] = Defs.Rarities[i].Weight * (1f + luck * i * 0.55f);
            total += weights[i];
        }
        float r = rng.Value * total;
        for (int i = 0; i < weights.Length; i++) {
            r -= weights[i];
            if (r <= 0f) return Defs.Rarities[i].Id;
        }
        return Rarity.Common;
    }

    // ------------------------------------------------------------- weapons
    public static WeaponStats RollWeaponStats(Rarity rarity, Rng rng) {
        int bonus = Defs.Of(rarity).StatBonus;
        Func<int> roll = () => {
            int v = (int)Math.Round(rng.Range(12f, 68f) + bonus + rng.Range(-8f, 8f));
            return v < 1 ? 1 : (v > 100 ? 100 : v);
        };
        return new WeaponStats {
            Impact = roll(), Range = roll(), Stability = roll(),
            Handling = roll(), Reload = roll(), Magazine = roll()
        };
    }

    public static Item RollWeapon(Rng rng, int power, Rarity? forceRarity = null, Slot? forceSlot = null,
                                  string forceFamily = null, string forceExotic = null,
                                  string forceName = null, float luck = 0f) {
        Rarity rarity = forceRarity ?? RollRarity(rng, luck);

        if (rarity == Rarity.Exotic) {
            var pool = new List<ExoticWeaponDef>();
            foreach (var e in Catalog.ExoticWeapons) {
                if (forceExotic != null && e.Id != forceExotic) continue;
                if (forceSlot.HasValue && e.Slot != forceSlot.Value) continue;
                pool.Add(e);
            }
            if (pool.Count == 0) pool.AddRange(Catalog.ExoticWeapons);
            var ex = rng.Pick(pool);
            var exotic = new Item {
                Uid = NextUid(), Kind = ItemKind.Weapon, Rarity = Rarity.Exotic,
                FamilyId = ex.FamilyId, Slot = ex.Slot, Element = ex.Element,
                Name = ex.Name, Flavor = ex.Flavor, ExoticId = ex.Id, Power = power,
                Stats = RollWeaponStats(Rarity.Exotic, rng)
            };
            return exotic.Rebuild();
        }

        WeaponFamily fam = forceFamily != null ? Catalog.FindFamily(forceFamily) : null;
        Slot slot;
        if (fam == null) {
            var candidates = forceSlot.HasValue
                ? Catalog.FamiliesForSlot(forceSlot.Value)
                : new List<WeaponFamily>(Catalog.Families);
            if (candidates.Count == 0) candidates = new List<WeaponFamily>(Catalog.Families);
            fam = rng.Pick(candidates);
        }
        slot = forceSlot ?? rng.Pick(fam.SlotPool);

        var item = new Item {
            Uid = NextUid(), Kind = ItemKind.Weapon, Rarity = rarity,
            FamilyId = fam.Id, Slot = slot, Power = power,
            Name = forceName ?? Catalog.RollWeaponName(rng, rarity),
            Flavor = rng.Pick(Catalog.WeaponFlavor),
            Element = slot == Slot.Kinetic ? Element.Kinetic : rng.Pick(Defs.EnergyElements),
            Stats = RollWeaponStats(rarity, rng)
        };

        int perkCount = Defs.Of(rarity).Perks;
        var col1 = Catalog.PerksInColumn(1);
        var col2 = Catalog.PerksInColumn(2);
        if (perkCount >= 1) item.PerkIds.Add(rng.Pick(col1).Id);
        if (perkCount >= 2) item.PerkIds.Add(rng.Pick(col2).Id);
        if (perkCount >= 3) {
            // Legendary gets a third roll from either column, never a duplicate.
            var extra = new List<PerkDef>();
            foreach (var p in (rng.Value < 0.5f ? col1 : col2)) {
                if (!item.PerkIds.Contains(p.Id)) extra.Add(p);
            }
            if (extra.Count > 0) item.PerkIds.Add(rng.Pick(extra).Id);
        }
        return item.Rebuild();
    }

    // ------------------------------------------------------------- armor
    public static Item RollArmor(Rng rng, int power, string classId, Rarity? forceRarity = null,
                                 Slot? forceSlot = null, float luck = 0f) {
        Rarity rarity = forceRarity ?? RollRarity(rng, luck);

        if (rarity == Rarity.Exotic) {
            var pool = Catalog.ExoticArmorFor(classId, forceSlot);
            if (pool.Count == 0) pool = Catalog.ExoticArmorFor(classId, null);
            if (pool.Count == 0) pool = new List<ExoticArmorDef>(Catalog.ExoticArmor);
            var ex = rng.Pick(pool);
            var exotic = new Item {
                Uid = NextUid(), Kind = ItemKind.Armor, Rarity = Rarity.Exotic,
                Slot = ex.Slot, Name = ex.Name, Flavor = ex.Flavor, ExoticId = ex.Id, Power = power
            };
            Catalog.RollArmorStats(exotic.ArmorStats, 34, rng, ex);
            return exotic.Rebuild();
        }

        Slot slot = forceSlot ?? rng.Pick(Defs.ArmorSlots);
        int budget;
        switch (rarity) {
            case Rarity.Uncommon: budget = 18; break;
            case Rarity.Rare: budget = 23; break;
            case Rarity.Legendary: budget = 30; break;
            default: budget = 14; break;
        }
        var item = new Item {
            Uid = NextUid(), Kind = ItemKind.Armor, Rarity = rarity, Slot = slot, Power = power,
            Name = Catalog.RollArmorName(rng, slot),
            Flavor = rng.Pick(Catalog.ArmorFlavor)
        };
        Catalog.RollArmorStats(item.ArmorStats, budget + rng.RangeInt(-2, 4), rng, null);
        return item.Rebuild();
    }

    // ------------------------------------------------------------- drops
    public static Item RollDrop(Rng rng, int playerPower, RewardTier tier, string classId,
                                float luck = 0f, ItemKind? forceKind = null) {
        int power = Defs.DropPower(playerPower, tier, rng);
        float tierLuck = luck + (tier == RewardTier.Pinnacle ? 1.6f : tier == RewardTier.Powerful ? 0.7f : 0f);
        Rarity rarity = RollRarity(rng, tierLuck);
        bool armor = forceKind.HasValue ? forceKind.Value == ItemKind.Armor : rng.Value < 0.45f;
        return armor
            ? RollArmor(rng, power, classId, rarity)
            : RollWeapon(rng, power, rarity);
    }

    // ------------------------------------------------------------- economy
    public static int DismantleValue(Item item) =>
        (int)Math.Round(Defs.Of(item.Rarity).Shards * (1f + item.Power / 260f));

    public static bool CanInfuse(Item target, Item source) {
        if (target == null || source == null || target.Uid == source.Uid) return false;
        if (target.Kind != source.Kind) return false;
        if (target.Slot != source.Slot) return false;
        return source.Power > target.Power;
    }

    public static int InfusionCost(Item target, Item source) {
        int delta = Math.Max(0, source.Power - target.Power);
        return 12 + delta * 3;
    }

    /// <summary>Character Power: the average across all eight slots. Empty slots drag it down.</summary>
    public static int ComputePower(IDictionary<Slot, Item> equipped) {
        int total = 0;
        foreach (var slot in Defs.AllSlots) {
            Item it;
            if (equipped.TryGetValue(slot, out it) && it != null) total += it.Power;
        }
        return total / Defs.AllSlots.Length;
    }

    /// <summary>Sum the six stats over equipped armor plus the class base, capped at 100.</summary>
    public static int[] ComputeStats(IDictionary<Slot, Item> equipped, ClassDef cls) {
        var outStats = new int[Defs.StatCount];
        if (cls != null) for (int i = 0; i < Defs.StatCount; i++) outStats[i] = cls.BaseStats[i];
        foreach (var slot in Defs.ArmorSlots) {
            Item it;
            if (!equipped.TryGetValue(slot, out it) || it == null) continue;
            for (int i = 0; i < Defs.StatCount; i++) outStats[i] += it.ArmorStats[i];
        }
        for (int i = 0; i < Defs.StatCount; i++) {
            if (outStats[i] < 0) outStats[i] = 0;
            if (outStats[i] > 100) outStats[i] = 100;
        }
        return outStats;
    }

    /// <summary>
    /// Which equipped slot would conflict if `item` were equipped — only one
    /// exotic weapon and one exotic armor piece may be worn at a time.
    /// </summary>
    public static Slot? ExoticConflict(IDictionary<Slot, Item> equipped, Item item) {
        if (item == null || item.Rarity != Rarity.Exotic) return null;
        var group = item.Kind == ItemKind.Weapon ? Defs.WeaponSlots : Defs.ArmorSlots;
        foreach (var slot in group) {
            if (slot == item.Slot) continue;
            Item cur;
            if (equipped.TryGetValue(slot, out cur) && cur != null &&
                cur.Rarity == Rarity.Exotic && cur.Uid != item.Uid) {
                return slot;
            }
        }
        return null;
    }

    /// <summary>The starter kit a brand new Guardian receives.</summary>
    public static List<Item> StartingLoadout(string classId, Rng rng) {
        int p = Defs.StartPower;
        var items = new List<Item> {
            RollWeapon(rng, p, Rarity.Uncommon, Slot.Kinetic, "auto", forceName: "Standard Issue AR"),
            RollWeapon(rng, p, Rarity.Uncommon, Slot.Energy, "sidearm", forceName: "Service Sidearm"),
            RollWeapon(rng, p, Rarity.Uncommon, Slot.Power, "rocket", forceName: "Salvaged Launcher"),
        };
        foreach (var slot in Defs.ArmorSlots) {
            items.Add(RollArmor(rng, p, classId, Rarity.Uncommon, slot));
        }
        return items;
    }
}
}
