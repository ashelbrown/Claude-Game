using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public enum EnemyBrain { Melee, Ranged, Sniper, Boss }

public sealed class EnemyDef {
    public string Id;
    public string Name;
    public string ModelName;
    public Rank Rank;
    public EnemyBrain Brain;

    public float Health;
    public float Shield;
    public Element ShieldElement = Element.Null;
    public float Speed, Acceleration;
    public float Radius, Height, EyeHeight, HeadHeight, HeadRadius;
    public int Xp, Score;
    public float AggroRange, PreferredRange;
    public float StaggerResistance = 1f;

    // ranged
    public float WeaponDamage, FireInterval, ProjectileSpeed, Spread, WeaponRange;
    public int BurstCount = 1;
    public float BurstInterval;
    public float TelegraphTime;      // snipers wind up a visible beam first
    public bool Hitscan;

    // melee
    public float MeleeDamage, MeleeRange, MeleeInterval, MeleeWindup;

    // boss
    public float SlamDamage, SlamRadius, SlamCooldown, SlamWindup;
    public PhaseDef[] Phases;

    public Color BodyColor, ArmorColor, AccentColor, EyeColor;
}

public sealed class PhaseDef {
    public float AtHealthFraction;
    public string[] Adds;
    public bool ImmuneUntilAddsDead;
    public string Shout;
}

/// <summary>The Severed: the faction the vertical slice ships with.</summary>
public static class Bestiary {

    static readonly Color SeveredBody = new Color(0.46f, 0.40f, 0.48f);
    static readonly Color SeveredArmor = new Color(0.58f, 0.26f, 0.26f);
    static readonly Color SeveredAccent = new Color(1.00f, 0.48f, 0.16f);
    static readonly Color SeveredEye = new Color(1.00f, 0.72f, 0.22f);

    public static readonly EnemyDef[] All = {
        new EnemyDef {
            Id = "husk", Name = "Husk", ModelName = "ENM_Husk", Rank = Rank.Minor, Brain = EnemyBrain.Melee,
            Health = 110f, Speed = 6.4f, Acceleration = 26f,
            Radius = 0.42f, Height = 1.70f, EyeHeight = 1.30f, HeadHeight = 1.52f, HeadRadius = 0.30f,
            Xp = 26, Score = 12, AggroRange = 46f,
            MeleeDamage = 11f, MeleeRange = 2.2f, MeleeInterval = 1.35f, MeleeWindup = 0.4f,
            BodyColor = SeveredBody, ArmorColor = new Color(0.44f, 0.20f, 0.19f),
            AccentColor = SeveredAccent, EyeColor = SeveredEye,
        },
        new EnemyDef {
            Id = "marauder", Name = "Marauder", ModelName = "ENM_Marauder", Rank = Rank.Minor, Brain = EnemyBrain.Ranged,
            Health = 155f, Speed = 4.4f, Acceleration = 18f,
            Radius = 0.44f, Height = 1.82f, EyeHeight = 1.45f, HeadHeight = 1.66f, HeadRadius = 0.30f,
            Xp = 34, Score = 16, AggroRange = 52f, PreferredRange = 16f,
            WeaponDamage = 5f, FireInterval = 1.15f, BurstCount = 3, BurstInterval = 0.12f,
            ProjectileSpeed = 46f, Spread = 0.06f, WeaponRange = 40f,
            BodyColor = SeveredBody, ArmorColor = SeveredArmor,
            AccentColor = SeveredAccent, EyeColor = SeveredEye,
        },
        new EnemyDef {
            Id = "lancer", Name = "Lancer", ModelName = "ENM_Lancer", Rank = Rank.Minor, Brain = EnemyBrain.Ranged,
            Health = 240f, Speed = 4.0f, Acceleration = 16f,
            Radius = 0.46f, Height = 1.95f, EyeHeight = 1.56f, HeadHeight = 1.78f, HeadRadius = 0.30f,
            Xp = 48, Score = 24, AggroRange = 62f, PreferredRange = 22f,
            WeaponDamage = 9f, FireInterval = 1.7f, BurstCount = 2, BurstInterval = 0.18f,
            ProjectileSpeed = 58f, Spread = 0.025f, WeaponRange = 55f,
            BodyColor = new Color(0.42f, 0.38f, 0.46f), ArmorColor = new Color(0.62f, 0.28f, 0.20f),
            AccentColor = SeveredAccent, EyeColor = SeveredEye,
        },
        new EnemyDef {
            Id = "shank", Name = "Shank", ModelName = "ENM_Shank", Rank = Rank.Minor, Brain = EnemyBrain.Ranged,
            Health = 90f, Speed = 5.2f, Acceleration = 12f,
            Radius = 0.42f, Height = 1.50f, EyeHeight = 1.15f, HeadHeight = 1.15f, HeadRadius = 0.32f,
            Xp = 22, Score = 10, AggroRange = 44f, PreferredRange = 14f,
            WeaponDamage = 4f, FireInterval = 1.4f, BurstCount = 2, BurstInterval = 0.14f,
            ProjectileSpeed = 40f, Spread = 0.065f, WeaponRange = 34f,
            BodyColor = SeveredBody, ArmorColor = new Color(0.52f, 0.24f, 0.20f),
            AccentColor = SeveredAccent, EyeColor = SeveredEye,
        },
        new EnemyDef {
            Id = "captain", Name = "Severed Captain", ModelName = "ENM_Captain", Rank = Rank.Major, Brain = EnemyBrain.Ranged,
            Health = 1400f, Shield = 620f, ShieldElement = Element.Surge,
            Speed = 4.6f, Acceleration = 20f,
            Radius = 0.62f, Height = 2.45f, EyeHeight = 2.00f, HeadHeight = 2.24f, HeadRadius = 0.38f,
            Xp = 240, Score = 120, AggroRange = 70f, PreferredRange = 18f, StaggerResistance = 0.45f,
            WeaponDamage = 12f, FireInterval = 1.4f, BurstCount = 4, BurstInterval = 0.09f,
            ProjectileSpeed = 52f, Spread = 0.05f, WeaponRange = 45f,
            BodyColor = new Color(0.34f, 0.40f, 0.52f), ArmorColor = new Color(0.24f, 0.50f, 0.64f),
            AccentColor = new Color(0.35f, 0.85f, 1f), EyeColor = new Color(0.55f, 0.95f, 1f),
        },
        new EnemyDef {
            Id = "kell", Name = "Vashek, the Sundered Kell", ModelName = "ENM_Kell",
            Rank = Rank.Boss, Brain = EnemyBrain.Boss,
            Health = 24000f, Shield = 4200f, ShieldElement = Element.Surge,
            Speed = 4.2f, Acceleration = 16f,
            Radius = 1.5f, Height = 4.40f, EyeHeight = 3.55f, HeadHeight = 4.05f, HeadRadius = 0.62f,
            Xp = 3000, Score = 2000, AggroRange = 90f, PreferredRange = 20f, StaggerResistance = 0.12f,
            WeaponDamage = 13f, FireInterval = 1.0f, BurstCount = 5, BurstInterval = 0.08f,
            ProjectileSpeed = 60f, Spread = 0.035f, WeaponRange = 60f,
            SlamDamage = 110f, SlamRadius = 11f, SlamCooldown = 9f, SlamWindup = 1.2f,
            Phases = new[] {
                new PhaseDef { AtHealthFraction = 0.66f, ImmuneUntilAddsDead = true,
                    Adds = new[] { "lancer", "lancer", "captain" },
                    Shout = "VASHEK RAISES A BARRIER — KILL THE GUARDS" },
                new PhaseDef { AtHealthFraction = 0.33f, ImmuneUntilAddsDead = true,
                    Adds = new[] { "captain", "lancer", "lancer", "husk", "husk", "husk" },
                    Shout = "THE KELL CALLS EVERY BLADE — CLEAR THE ROOM" },
            },
            BodyColor = new Color(0.34f, 0.32f, 0.40f), ArmorColor = new Color(0.62f, 0.50f, 0.22f),
            AccentColor = new Color(1f, 0.75f, 0.25f), EyeColor = new Color(1f, 0.85f, 0.35f),
        },
    };

    static Dictionary<string, EnemyDef> _byId;

    public static EnemyDef Find(string id) {
        if (_byId == null) {
            _byId = new Dictionary<string, EnemyDef>();
            foreach (var d in All) _byId[d.Id] = d;
        }
        EnemyDef def;
        return _byId.TryGetValue(id, out def) ? def : null;
    }

    /// <summary>Weighted spawn table for trash and specialists.</summary>
    public static string RollMinor(Rng rng) {
        float r = rng.Value;
        if (r < 0.34f) return "husk";
        if (r < 0.64f) return "marauder";
        if (r < 0.84f) return "shank";
        return "lancer";
    }

    public static string RollMajor(Rng rng) => "captain";
}
}
