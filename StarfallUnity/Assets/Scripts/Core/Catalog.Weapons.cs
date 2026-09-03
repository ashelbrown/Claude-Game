using System;
using System.Collections.Generic;

namespace Starfall.Core {

/// <summary>An archetype: the numbers every weapon of this kind starts from.</summary>
public sealed class WeaponFamily {
    public string Id;
    public string Name;
    public string Description;
    public string ModelName;          // FBX under Assets/Art/Weapons
    public AmmoType Ammo;
    public string SoundFamily;
    public Slot[] SlotPool;

    public float Damage;              // per bullet, body shot, at power parity
    public float Rpm;
    public int Magazine;
    public float Crit;
    public float ReloadTime;
    public float Spread;
    public float AdsSpread;
    public float RecoilVertical;
    public float RecoilHorizontal;
    public float Zoom;
    public float AdsTime;
    public float RangeMin;
    public float RangeMax;
    public float FalloffFloor;
    public int Pellets = 1;
    public int BurstCount = 1;
    public float BurstDelay;
    public float ChargeTime;
    public ProjectileDef Projectile;
}

public sealed class ExoticWeaponDef {
    public string Id;
    public string Name;
    public string FamilyId;
    public Element Element;
    public Slot Slot;
    public string Flavor;
    public float DamageMod = 1f, RpmMod = 1f, MagazineMod = 1f, CritMod = 1f, ChargeMod = 1f;
    public readonly List<PerkDef> Traits = new List<PerkDef>();
}

public static partial class Catalog {

    // ------------------------------------------------------------- families
    // Tuned in the browser prototype under playtest, then carried over intact.
    public static readonly WeaponFamily[] Families = {
        new WeaponFamily { Id = "auto", Name = "Auto Rifle", ModelName = "WPN_AutoRifle",
            Description = "Steady, forgiving full-auto. The workhorse.",
            Ammo = AmmoType.Primary, SoundFamily = "auto", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 21f, Rpm = 640f, Magazine = 34, Crit = 1.55f, ReloadTime = 2.2f,
            Spread = 0.011f, AdsSpread = 0.0028f, RecoilVertical = 0.55f, RecoilHorizontal = 0.28f,
            Zoom = 1.22f, AdsTime = 0.22f, RangeMin = 26f, RangeMax = 52f, FalloffFloor = 0.55f },

        new WeaponFamily { Id = "smg", Name = "Submachine Gun", ModelName = "WPN_SMG",
            Description = "Shreds up close, evaporates at range.",
            Ammo = AmmoType.Primary, SoundFamily = "smg", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 14f, Rpm = 900f, Magazine = 40, Crit = 1.4f, ReloadTime = 1.9f,
            Spread = 0.017f, AdsSpread = 0.006f, RecoilVertical = 0.42f, RecoilHorizontal = 0.42f,
            Zoom = 1.15f, AdsTime = 0.17f, RangeMin = 14f, RangeMax = 30f, FalloffFloor = 0.42f },

        new WeaponFamily { Id = "pulse", Name = "Pulse Rifle", ModelName = "WPN_PulseRifle",
            Description = "Three-round bursts. Rewards a steady hand.",
            Ammo = AmmoType.Primary, SoundFamily = "pulse", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 25f, Rpm = 390f, Magazine = 33, Crit = 1.55f, ReloadTime = 2.3f,
            Spread = 0.010f, AdsSpread = 0.0022f, RecoilVertical = 0.85f, RecoilHorizontal = 0.3f,
            Zoom = 1.35f, AdsTime = 0.24f, RangeMin = 32f, RangeMax = 60f, FalloffFloor = 0.6f,
            BurstCount = 3, BurstDelay = 0.055f },

        new WeaponFamily { Id = "scout", Name = "Scout Rifle", ModelName = "WPN_ScoutRifle",
            Description = "Long-range single fire with real punch.",
            Ammo = AmmoType.Primary, SoundFamily = "scout", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 44f, Rpm = 260f, Magazine = 18, Crit = 1.7f, ReloadTime = 2.1f,
            Spread = 0.007f, AdsSpread = 0.0012f, RecoilVertical = 1.1f, RecoilHorizontal = 0.22f,
            Zoom = 1.7f, AdsTime = 0.26f, RangeMin = 45f, RangeMax = 85f, FalloffFloor = 0.7f },

        new WeaponFamily { Id = "hand", Name = "Hand Cannon", ModelName = "WPN_HandCannon",
            Description = "Heavy, slow, and enormously satisfying.",
            Ammo = AmmoType.Primary, SoundFamily = "hand", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 68f, Rpm = 150f, Magazine = 10, Crit = 1.85f, ReloadTime = 2.0f,
            Spread = 0.012f, AdsSpread = 0.0016f, RecoilVertical = 2.3f, RecoilHorizontal = 0.55f,
            Zoom = 1.45f, AdsTime = 0.23f, RangeMin = 28f, RangeMax = 48f, FalloffFloor = 0.62f },

        new WeaponFamily { Id = "sidearm", Name = "Sidearm", ModelName = "WPN_Sidearm",
            Description = "Fast, light, and always ready.",
            Ammo = AmmoType.Primary, SoundFamily = "smg", SlotPool = new[] { Slot.Kinetic, Slot.Energy },
            Damage = 27f, Rpm = 450f, Magazine = 20, Crit = 1.5f, ReloadTime = 1.5f,
            Spread = 0.013f, AdsSpread = 0.004f, RecoilVertical = 0.7f, RecoilHorizontal = 0.35f,
            Zoom = 1.2f, AdsTime = 0.15f, RangeMin = 18f, RangeMax = 34f, FalloffFloor = 0.5f },

        new WeaponFamily { Id = "shotgun", Name = "Shotgun", ModelName = "WPN_Shotgun",
            Description = "Ends arguments inside eight metres.",
            Ammo = AmmoType.Special, SoundFamily = "shotgun",
            SlotPool = new[] { Slot.Kinetic, Slot.Energy, Slot.Power },
            Damage = 24f, Rpm = 75f, Magazine = 6, Crit = 1.3f, ReloadTime = 2.6f,
            Spread = 0.085f, AdsSpread = 0.055f, RecoilVertical = 3.2f, RecoilHorizontal = 0.7f,
            Zoom = 1.1f, AdsTime = 0.24f, RangeMin = 7f, RangeMax = 16f, FalloffFloor = 0.12f,
            Pellets = 10 },

        new WeaponFamily { Id = "sniper", Name = "Sniper Rifle", ModelName = "WPN_SniperRifle",
            Description = "One breath, one shot. Bring a scope and patience.",
            Ammo = AmmoType.Special, SoundFamily = "sniper", SlotPool = new[] { Slot.Energy, Slot.Power },
            Damage = 260f, Rpm = 90f, Magazine = 4, Crit = 2.5f, ReloadTime = 3.0f,
            Spread = 0.03f, AdsSpread = 0f, RecoilVertical = 4.0f, RecoilHorizontal = 0.4f,
            Zoom = 4.2f, AdsTime = 0.4f, RangeMin = 90f, RangeMax = 200f, FalloffFloor = 0.85f },

        new WeaponFamily { Id = "fusion", Name = "Fusion Rifle", ModelName = "WPN_FusionRifle",
            Description = "Charge, then delete whatever is standing there.",
            Ammo = AmmoType.Special, SoundFamily = "fusion", SlotPool = new[] { Slot.Energy, Slot.Power },
            Damage = 44f, Rpm = 60f, Magazine = 7, Crit = 1.3f, ReloadTime = 2.6f,
            Spread = 0.028f, AdsSpread = 0.014f, RecoilVertical = 1.4f, RecoilHorizontal = 0.4f,
            Zoom = 1.3f, AdsTime = 0.26f, RangeMin = 16f, RangeMax = 30f, FalloffFloor = 0.3f,
            Pellets = 7, ChargeTime = 0.58f },

        new WeaponFamily { Id = "rocket", Name = "Rocket Launcher", ModelName = "WPN_RocketLauncher",
            Description = "Point at the crowd. Do not stand near the crowd.",
            Ammo = AmmoType.Heavy, SoundFamily = "rocket", SlotPool = new[] { Slot.Power },
            Damage = 420f, Rpm = 45f, Magazine = 2, Crit = 1.0f, ReloadTime = 3.4f,
            Spread = 0.004f, AdsSpread = 0.002f, RecoilVertical = 3.5f, RecoilHorizontal = 0.3f,
            Zoom = 1.3f, AdsTime = 0.3f, RangeMin = 200f, RangeMax = 400f, FalloffFloor = 1f,
            Projectile = new ProjectileDef { Speed = 42f, Radius = 0.35f, SplashRadius = 6.5f,
                SplashDamage = 340f, Gravity = 0.6f } },

        new WeaponFamily { Id = "gl", Name = "Grenade Launcher", ModelName = "WPN_GrenadeLauncher",
            Description = "Lob it, bank it, watch the room clear.",
            Ammo = AmmoType.Heavy, SoundFamily = "rocket", SlotPool = new[] { Slot.Power, Slot.Energy },
            Damage = 190f, Rpm = 90f, Magazine = 6, Crit = 1.0f, ReloadTime = 2.8f,
            Spread = 0.006f, AdsSpread = 0.003f, RecoilVertical = 2.4f, RecoilHorizontal = 0.3f,
            Zoom = 1.25f, AdsTime = 0.26f, RangeMin = 200f, RangeMax = 400f, FalloffFloor = 1f,
            Projectile = new ProjectileDef { Speed = 32f, Radius = 0.3f, SplashRadius = 5.2f,
                SplashDamage = 210f, Gravity = 9f, Bounces = 2, Fuse = 1.6f } },

        new WeaponFamily { Id = "mg", Name = "Machine Gun", ModelName = "WPN_MachineGun",
            Description = "Sustained fire until the problem stops moving.",
            Ammo = AmmoType.Heavy, SoundFamily = "mg", SlotPool = new[] { Slot.Power },
            Damage = 34f, Rpm = 450f, Magazine = 75, Crit = 1.5f, ReloadTime = 4.2f,
            Spread = 0.014f, AdsSpread = 0.005f, RecoilVertical = 0.7f, RecoilHorizontal = 0.5f,
            Zoom = 1.3f, AdsTime = 0.3f, RangeMin = 35f, RangeMax = 70f, FalloffFloor = 0.6f },
    };

    static Dictionary<string, WeaponFamily> _familyById;

    public static WeaponFamily FindFamily(string id) {
        if (_familyById == null) {
            _familyById = new Dictionary<string, WeaponFamily>();
            foreach (var f in Families) _familyById[f.Id] = f;
        }
        WeaponFamily fam;
        return _familyById.TryGetValue(id, out fam) ? fam : null;
    }

    public static List<WeaponFamily> FamiliesForSlot(Slot slot) {
        var outList = new List<WeaponFamily>();
        foreach (var f in Families) {
            foreach (var s in f.SlotPool) if (s == slot) { outList.Add(f); break; }
        }
        return outList;
    }

    // ------------------------------------------------------------- derive
    /// <summary>Fold archetype numbers, rolled stats and exotic mods into final values.</summary>
    public static WeaponDerived Derive(Item item) {
        var fam = FindFamily(item.FamilyId);
        if (fam == null) throw new InvalidOperationException("unknown weapon family: " + item.FamilyId);
        var s = item.Stats ?? new WeaponStats();
        var ex = string.IsNullOrEmpty(item.ExoticId) ? null : FindExoticWeapon(item.ExoticId);

        float dmgMod = ex != null ? ex.DamageMod : 1f;
        float rpmMod = ex != null ? ex.RpmMod : 1f;
        float magMod = ex != null ? ex.MagazineMod : 1f;
        float critMod = ex != null ? ex.CritMod : 1f;
        float chargeMod = ex != null ? ex.ChargeMod : 1f;

        float impact = 0.90f + (s.Impact / 100f) * 0.22f;
        float magazine = 0.80f + (s.Magazine / 100f) * 0.55f;
        float reload = 1.32f - (s.Reload / 100f) * 0.62f;
        float stability = 1.30f - (s.Stability / 100f) * 0.70f;
        float handling = 1.30f - (s.Handling / 100f) * 0.62f;
        float range = 0.82f + (s.Range / 100f) * 0.55f;

        float rpm = fam.Rpm * rpmMod;
        return new WeaponDerived {
            Damage = fam.Damage * impact * dmgMod,
            CritMultiplier = fam.Crit * critMod,
            Rpm = rpm,
            ShotInterval = 60f / Math.Max(1f, rpm),
            Magazine = Math.Max(1, (int)Math.Round(fam.Magazine * magazine * magMod)),
            ReloadTime = fam.ReloadTime * reload,
            Spread = fam.Spread * stability,
            AdsSpread = fam.AdsSpread * stability,
            RecoilVertical = fam.RecoilVertical * stability,
            RecoilHorizontal = fam.RecoilHorizontal * stability,
            AdsTime = fam.AdsTime * handling,
            Zoom = fam.Zoom,
            RangeMin = fam.RangeMin * range,
            RangeMax = fam.RangeMax * range,
            FalloffFloor = fam.FalloffFloor,
            Pellets = fam.Pellets,
            BurstCount = fam.BurstCount,
            BurstDelay = fam.BurstDelay,
            ChargeTime = fam.ChargeTime * chargeMod,
            Ammo = fam.Ammo,
            Projectile = fam.Projectile,
            SoundFamily = fam.SoundFamily,
        };
    }

    // ------------------------------------------------------------- naming
    static readonly string[] Adjectives = {
        "Sundered", "Hollow", "Iron", "Pale", "Gilded", "Silent", "Crimson", "Vagrant", "Ashen",
        "Distant", "Fractured", "Wintered", "Molten", "Errant", "Solemn", "Hungry", "Quiet",
        "Radiant", "Bitter", "Wandering", "Forsaken", "Perfect", "Last", "Nameless", "Patient"
    };
    static readonly string[] Nouns = {
        "Verdict", "Sermon", "Reveille", "Requiem", "Covenant", "Refrain", "Vigil", "Ledger",
        "Arbiter", "Litany", "Lament", "Bargain", "Recital", "Sentinel", "Answer", "Promise",
        "Ember", "Threnody", "Cadence", "Warrant", "Testament", "Epitaph", "Reckoning", "Anthem"
    };
    static readonly string[] Prefixes = { "VX", "HW", "ZR", "MK", "AR", "TL", "KS", "DV" };

    public static string RollWeaponName(Rng rng, Rarity rarity) {
        if (rarity == Rarity.Common || rarity == Rarity.Uncommon) {
            return rng.Pick(Prefixes) + "-" + rng.RangeInt(10, 98) + " " + rng.Pick(Nouns);
        }
        return rng.Pick(Adjectives) + " " + rng.Pick(Nouns);
    }

    public static readonly string[] WeaponFlavor = {
        "Field-stamped, never registered. Someone wanted this one forgotten.",
        "The grip is worn smooth. Three owners. Two of them made it home.",
        "Recovered from a hull that had been drifting for ninety years.",
        "Somebody scratched a tally into the receiver and then stopped counting.",
        "Standard issue, if the standard were set by people who expected to die.",
        "It hums when the shooting starts. Nobody has explained why.",
        "Reliable in vacuum, in rain, and in the places that are neither.",
        "\"Keep it loaded. Keep it close. Keep moving.\" — engraved inside the stock",
        "Built from three broken guns and a stubborn refusal.",
        "The serial number is a date. The date has not happened yet.",
    };
}
}
