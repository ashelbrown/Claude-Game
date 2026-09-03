using System;
using System.Collections.Generic;

namespace Starfall.Core {

/// <summary>Rolled weapon stats, 1-100 each, exactly as the inspector shows them.</summary>
public sealed class WeaponStats {
    public int Impact, Range, Stability, Handling, Reload, Magazine;

    public int Average => (Impact + Range + Stability + Handling + Reload + Magazine) / 6;

    public WeaponStats Clone() => new WeaponStats {
        Impact = Impact, Range = Range, Stability = Stability,
        Handling = Handling, Reload = Reload, Magazine = Magazine
    };
}

/// <summary>Archetype numbers folded together with the rolled stats and exotic mods.</summary>
public sealed class WeaponDerived {
    public float Damage;
    public float CritMultiplier;
    public float Rpm;
    public float ShotInterval;
    public int Magazine;
    public float ReloadTime;
    public float Spread;
    public float AdsSpread;
    public float RecoilVertical;
    public float RecoilHorizontal;
    public float AdsTime;
    public float Zoom;
    public float RangeMin;
    public float RangeMax;
    public float FalloffFloor;
    public int Pellets;
    public int BurstCount;
    public float BurstDelay;
    public float ChargeTime;
    public AmmoType Ammo;
    public ProjectileDef Projectile;   // null for hitscan
    public string SoundFamily;
}

public sealed class ProjectileDef {
    public float Speed;
    public float Radius;
    public float SplashRadius;
    public float SplashDamage;
    public float Gravity;
    public int Bounces;
    public float Fuse;
}

/// <summary>One concrete piece of gear. Weapons and armor share the type.</summary>
public sealed class Item {
    public string Uid;
    public ItemKind Kind;
    public Rarity Rarity;
    public Slot Slot;
    public int Power;
    public string Name;
    public string Flavor;
    public bool Locked;

    // --- weapon
    public string FamilyId;
    public Element Element;
    public WeaponStats Stats;
    public readonly List<string> PerkIds = new List<string>();
    public string ExoticId;               // null unless exotic
    public int Ammo;                      // rounds currently in the magazine

    // --- armor
    public readonly int[] ArmorStats = new int[Defs.StatCount];
    public int ArmorTotal;

    // --- transient, rebuilt on load
    [NonSerialized] public WeaponDerived Derived;
    [NonSerialized] public WeaponRuntime Runtime;
    [NonSerialized] List<PerkDef> _perks;

    public bool IsExotic => Rarity == Rarity.Exotic;
    public bool IsWeapon => Kind == ItemKind.Weapon;

    /// <summary>Rolled perks plus any exotic traits, resolved once and cached.</summary>
    public List<PerkDef> Perks {
        get {
            if (_perks != null) return _perks;
            _perks = new List<PerkDef>();
            if (!string.IsNullOrEmpty(ExoticId)) {
                var ex = Catalog.FindExoticWeapon(ExoticId);
                if (ex != null) _perks.AddRange(ex.Traits);
            }
            for (int i = 0; i < PerkIds.Count; i++) {
                var p = Catalog.FindPerk(PerkIds[i]);
                if (p != null) _perks.Add(p);
            }
            return _perks;
        }
    }

    public void InvalidatePerks() { _perks = null; }

    /// <summary>Rebuild everything transient. Called after generation and after loading.</summary>
    public Item Rebuild() {
        _perks = null;
        if (Kind == ItemKind.Weapon) {
            Derived = Catalog.Derive(this);
            Runtime = Runtime ?? new WeaponRuntime();
            Runtime.Clear();
            if (Ammo <= 0 || Ammo > Derived.Magazine) Ammo = Derived.Magazine;
        } else {
            ArmorTotal = 0;
            for (int i = 0; i < Defs.StatCount; i++) ArmorTotal += ArmorStats[i];
        }
        return this;
    }

    public int GetStat(StatId s) => ArmorStats[(int)s];
    public void SetStat(StatId s, int v) { ArmorStats[(int)s] = v; }

    /// <summary>Display line, e.g. "Legendary · Hand Cannon · Ember".</summary>
    public string Subtitle() {
        if (Kind == ItemKind.Weapon) {
            var fam = Catalog.FindFamily(FamilyId);
            string famName = fam != null ? fam.Name : FamilyId;
            return Defs.Of(Rarity).Name + " · " + famName + " · " + Defs.Of(Element).Name;
        }
        return Defs.Of(Rarity).Name + " · " + Defs.SlotName(Slot);
    }

    /// <summary>Single number for sorting and for flagging an upgrade.</summary>
    public float Score() {
        float rarityBonus;
        switch (Rarity) {
            case Rarity.Uncommon: rarityBonus = 6f; break;
            case Rarity.Rare: rarityBonus = 14f; break;
            case Rarity.Legendary: rarityBonus = 30f; break;
            case Rarity.Exotic: rarityBonus = 46f; break;
            default: rarityBonus = 0f; break;
        }
        if (Kind == ItemKind.Armor) return Power * 2f + ArmorTotal * 1.4f + rarityBonus;
        return Power * 2f + (Stats != null ? Stats.Average * 0.9f : 0f) + PerkIds.Count * 8f + rarityBonus;
    }
}
}
