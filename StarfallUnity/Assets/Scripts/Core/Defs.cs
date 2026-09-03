using System;
using System.Collections.Generic;

namespace Starfall.Core {

public enum Element { Kinetic = 0, Ember = 1, Surge = 2, Null = 3 }
public enum Rarity { Common = 0, Uncommon = 1, Rare = 2, Legendary = 3, Exotic = 4 }
public enum AmmoType { Primary = 0, Special = 1, Heavy = 2 }
public enum Slot { Kinetic = 0, Energy = 1, Power = 2, Helmet = 3, Arms = 4, Chest = 5, Legs = 6, ClassItem = 7 }
public enum ItemKind { Weapon = 0, Armor = 1 }
public enum StatId { Resilience = 0, Mobility = 1, Recovery = 2, Discipline = 3, Intellect = 4, Strength = 5 }
public enum Rank { Minor = 0, Major = 1, Ultra = 2, Boss = 3 }
public enum RewardTier { World = 0, Powerful = 1, Pinnacle = 2 }

public struct Rgb {
    public float R, G, B;
    public Rgb(float r, float g, float b) { R = r; G = g; B = b; }
}

public sealed class ElementDef {
    public Element Id;
    public string Name;
    public Rgb Color;
    public string Hex;
}

public sealed class RarityDef {
    public Rarity Id;
    public string Name;
    public string Hex;
    public float Weight;     // relative drop likelihood
    public int Perks;        // rolled perk count
    public int StatBonus;    // added to every rolled weapon stat
    public int Shards;       // dismantle base value
}

/// <summary>Static tables shared by the loot economy and the combat maths.</summary>
public static class Defs {
    // ---------------------------------------------------------------- elements
    public static readonly ElementDef[] Elements = {
        new ElementDef { Id = Element.Kinetic, Name = "Kinetic", Hex = "#dce1ee", Color = new Rgb(0.86f, 0.88f, 0.94f) },
        new ElementDef { Id = Element.Ember,   Name = "Ember",   Hex = "#ff7a3c", Color = new Rgb(1.00f, 0.45f, 0.15f) },
        new ElementDef { Id = Element.Surge,   Name = "Surge",   Hex = "#4fd7ff", Color = new Rgb(0.30f, 0.82f, 1.00f) },
        new ElementDef { Id = Element.Null,    Name = "Null",    Hex = "#b47dff", Color = new Rgb(0.66f, 0.44f, 1.00f) },
    };
    public static ElementDef Of(Element e) => Elements[(int)e];
    public static readonly Element[] EnergyElements = { Element.Ember, Element.Surge, Element.Null };

    // ---------------------------------------------------------------- rarity
    public static readonly RarityDef[] Rarities = {
        new RarityDef { Id = Rarity.Common,    Name = "Common",    Hex = "#c9d2e0", Weight = 42f,  Perks = 0, StatBonus = 0,  Shards = 1 },
        new RarityDef { Id = Rarity.Uncommon,  Name = "Uncommon",  Hex = "#6ad07a", Weight = 30f,  Perks = 1, StatBonus = 6,  Shards = 2 },
        new RarityDef { Id = Rarity.Rare,      Name = "Rare",      Hex = "#4f9bff", Weight = 19f,  Perks = 2, StatBonus = 12, Shards = 5 },
        new RarityDef { Id = Rarity.Legendary, Name = "Legendary", Hex = "#b57bff", Weight = 8.2f, Perks = 3, StatBonus = 20, Shards = 14 },
        new RarityDef { Id = Rarity.Exotic,    Name = "Exotic",    Hex = "#f5d33f", Weight = 0.8f, Perks = 0, StatBonus = 26, Shards = 40 },
    };
    public static RarityDef Of(Rarity r) => Rarities[(int)r];

    // ---------------------------------------------------------------- slots
    public static readonly Slot[] WeaponSlots = { Slot.Kinetic, Slot.Energy, Slot.Power };
    public static readonly Slot[] ArmorSlots = { Slot.Helmet, Slot.Arms, Slot.Chest, Slot.Legs, Slot.ClassItem };
    public static readonly Slot[] AllSlots = {
        Slot.Kinetic, Slot.Energy, Slot.Power,
        Slot.Helmet, Slot.Arms, Slot.Chest, Slot.Legs, Slot.ClassItem
    };
    public static bool IsWeaponSlot(Slot s) => s == Slot.Kinetic || s == Slot.Energy || s == Slot.Power;

    public static string SlotName(Slot s) {
        switch (s) {
            case Slot.Kinetic: return "Kinetic";
            case Slot.Energy: return "Energy";
            case Slot.Power: return "Power";
            case Slot.Helmet: return "Helmet";
            case Slot.Arms: return "Gauntlets";
            case Slot.Chest: return "Chest Armor";
            case Slot.Legs: return "Leg Armor";
            default: return "Class Item";
        }
    }

    // ---------------------------------------------------------------- stats
    public static readonly StatId[] Stats = {
        StatId.Resilience, StatId.Mobility, StatId.Recovery,
        StatId.Discipline, StatId.Intellect, StatId.Strength
    };
    public const int StatCount = 6;

    public static string StatName(StatId s) {
        switch (s) {
            case StatId.Resilience: return "Resilience";
            case StatId.Mobility: return "Mobility";
            case StatId.Recovery: return "Recovery";
            case StatId.Discipline: return "Discipline";
            case StatId.Intellect: return "Intellect";
            default: return "Strength";
        }
    }

    public static string StatDescription(StatId s) {
        switch (s) {
            case StatId.Resilience: return "Raises maximum health and reduces flinch.";
            case StatId.Mobility: return "Increases movement and strafe speed.";
            case StatId.Recovery: return "Shields recharge sooner and faster.";
            case StatId.Discipline: return "Reduces grenade cooldown.";
            case StatId.Intellect: return "Reduces Super cooldown.";
            default: return "Reduces melee cooldown.";
        }
    }

    /// <summary>Stat tier 0-10 from a 0-100 total. Tiers are what actually drive the curves.</summary>
    public static int Tier(int statValue) {
        int t = statValue / 10;
        return t < 0 ? 0 : (t > 10 ? 10 : t);
    }

    // ---------------------------------------------------------------- power
    public const int StartPower = 100;
    public const int SoftCap = 300;      // world drops stop climbing here
    public const int PowerfulCap = 350;  // "powerful" rewards climb to here
    public const int PinnacleCap = 370;  // pinnacle rewards only

    /// <summary>
    /// Outgoing damage multiplier from the power delta. Being under the
    /// recommended power bites hard; being over helps, with a ceiling.
    /// </summary>
    public static float DamageOut(int playerPower, int activityPower) {
        int d = playerPower - activityPower;
        float m = d >= 0 ? 1f + d * 0.010f : 1f + d * 0.022f;
        return m < 0.20f ? 0.20f : (m > 1.55f ? 1.55f : m);
    }

    /// <summary>Incoming damage multiplier from the power delta.</summary>
    public static float DamageIn(int playerPower, int activityPower) {
        int d = playerPower - activityPower;
        float m = d >= 0 ? 1f - d * 0.007f : 1f - d * 0.020f;
        return m < 0.55f ? 0.55f : (m > 2.6f ? 2.6f : m);
    }

    /// <summary>Experience needed to advance from `level` to the next.</summary>
    public static int XpForLevel(int level) =>
        (int)(600 + level * 340 + Math.Pow(level, 1.75) * 24);

    /// <summary>Power of a dropped item, given the reward tier.</summary>
    public static int DropPower(int playerPower, RewardTier tier, Rng rng) {
        switch (tier) {
            case RewardTier.Pinnacle:
                return Math.Min(PinnacleCap, playerPower + 3 + rng.RangeInt(0, 2));
            case RewardTier.Powerful:
                return Math.Min(PowerfulCap, playerPower + 2 + rng.RangeInt(0, 2));
            default:
                // World drops are mostly sidegrades, hard-stopped at the soft cap.
                return Math.Min(SoftCap, Math.Max(1, playerPower + rng.RangeInt(-3, 2)));
        }
    }

    // Elemental shields: matching element shreds them, mismatched barely dents them.
    public const float ShieldMatchMultiplier = 3.0f;
    public const float ShieldMismatchMultiplier = 0.45f;
}
}
