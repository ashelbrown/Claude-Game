using System;
using System.Collections.Generic;

namespace Starfall.Core {

public enum SuperBehavior {
    /// <summary>Shed every facet at once as an autonomous attacking swarm.</summary>
    FacetSwarm,
    /// <summary>Facets hold a moving lightning lattice that damages what it encloses.</summary>
    ChainLattice,
    /// <summary>Full cryptobiosis: rooted and invulnerable while a null field drags in and detonates.</summary>
    LongStill,
}

public enum GrenadeBehavior { Firebolt, Pulse, Vortex }
public enum MeleeBehavior { Lunge, Blast, Drain }
public enum ClassAbilityBehavior { Shed }

public sealed class GrenadeDef {
    public string Id, Name, Description;
    public GrenadeBehavior Behavior;
    public Element Element;
    public float Damage, Radius, Cooldown, Speed, Gravity;
    public float BurnDps, BurnDuration;
    public int Pulses; public float PulseInterval;
    public float Duration, TickInterval, Pull;
    public int SeekingBolts;
}

public sealed class MeleeDef {
    public string Id, Name, Description;
    public MeleeBehavior Behavior;
    public float Damage, Range, Radius, Cooldown, DashSpeed, Heal, RefundOnKill;
}

public sealed class SuperDef {
    public string Id, Name, Description;
    public SuperBehavior Behavior;
    public Element Element;
    public float Duration, Damage, Radius, DamageResist;
    public int Casts;
    public float FireRate, ProjectileSpeed, SplashRadius, SplashDamage;
    public float ChainRange, ChainDamage; public int ChainTargets;
    public float Dps, Pull;
}

public sealed class ClassAbilityDef {
    public string Id, Name, Description;
    public ClassAbilityBehavior Behavior;
    public float Cooldown, Duration, HealthCostFraction, OvershieldOnRecall;
    public float FacetDamage, FacetFireRate, FacetRange, FacetHealth;
}

public sealed class SubclassDef {
    public string Id, Name, Tagline, ClassId;
    public Element Element;
    public string SuperId;
    public GrenadeDef Grenade;
    public MeleeDef Melee;
    public string PassiveName, PassiveDescription;
}

public sealed class ClassDef {
    public string Id, Name, Role, Blurb;
    public string ModelName;
    public string[] Highlights;
    public string ClassAbilityId;
    public int[] BaseStats = new int[Defs.StatCount];
    public int Jumps;            // Disperse charges for the Choralith
    public float JumpPower, MoveSpeed;
    public string[] SubclassIds;
}

public static partial class Catalog {

    // --------------------------------------------------------------- abilities
    public static readonly ClassAbilityDef Shed = new ClassAbilityDef {
        Id = "shed", Name = "Shed", Behavior = ClassAbilityBehavior.Shed,
        Description = "Detach a facet of yourself. It fights on its own and draws fire; " +
                      "your maximum health drops while it is out. Reabsorb it for the health back and an overshield.",
        Cooldown = 26f, Duration = 18f, HealthCostFraction = 0.18f, OvershieldOnRecall = 120f,
        FacetDamage = 16f, FacetFireRate = 0.55f, FacetRange = 26f, FacetHealth = 260f,
    };

    static readonly GrenadeDef CinderSwarm = new GrenadeDef {
        Id = "cinder_swarm", Name = "Cinder Swarm", Behavior = GrenadeBehavior.Firebolt,
        Element = Element.Ember,
        Description = "Bursts into seeking motes of flame that scorch everything nearby.",
        Damage = 95f, Radius = 6.5f, Cooldown = 26f, Speed = 26f, Gravity = 12f,
        BurnDps = 22f, BurnDuration = 5f, SeekingBolts = 4,
    };

    static readonly GrenadeDef LatticeNode = new GrenadeDef {
        Id = "lattice_node", Name = "Lattice Node", Behavior = GrenadeBehavior.Pulse,
        Element = Element.Surge,
        Description = "Adheres where it lands and discharges arc energy in repeating pulses.",
        Damage = 52f, Radius = 5.4f, Cooldown = 24f, Speed = 22f, Gravity = 14f,
        Pulses = 5, PulseInterval = 0.55f,
    };

    static readonly GrenadeDef Stillwell = new GrenadeDef {
        Id = "stillwell", Name = "Stillwell", Behavior = GrenadeBehavior.Vortex,
        Element = Element.Null,
        Description = "Opens a lingering well that drags in and grinds down anything inside it.",
        Damage = 30f, Radius = 4.6f, Cooldown = 28f, Speed = 20f, Gravity = 13f,
        Duration = 5.5f, TickInterval = 0.4f, Pull = 5f,
    };

    static readonly MeleeDef Ashgrasp = new MeleeDef {
        Id = "ashgrasp", Name = "Ashgrasp", Behavior = MeleeBehavior.Lunge,
        Description = "Launch forward and ignite the first thing you reach.",
        Damage = 260f, Range = 7.5f, Radius = 3.2f, Cooldown = 16f, DashSpeed = 26f,
    };

    static readonly MeleeDef StaticShed = new MeleeDef {
        Id = "static_shed", Name = "Static Shed", Behavior = MeleeBehavior.Blast,
        Description = "Discharge a facet's stored charge in a close arc burst.",
        Damage = 210f, Range = 5.5f, Radius = 3.6f, Cooldown = 14f, Heal = 40f,
    };

    static readonly MeleeDef QuorumStrike = new MeleeDef {
        Id = "quorum_strike", Name = "Quorum Strike", Behavior = MeleeBehavior.Drain,
        Description = "Tear a facet from the target. Heals you, and refunds itself on a kill.",
        Damage = 230f, Range = 5.0f, Radius = 2.8f, Cooldown = 15f, Heal = 90f, RefundOnKill = 0.5f,
    };

    public static readonly SuperDef[] Supers = {
        new SuperDef { Id = "pyre_chorus", Name = "Pyre Chorus", Behavior = SuperBehavior.FacetSwarm,
            Element = Element.Ember,
            Description = "Shed every facet at once. Six burning facets orbit you and fire on their own.",
            Duration = 18f, Damage = 150f, Radius = 3.5f, DamageResist = 0.45f, Casts = 6,
            FireRate = 0.42f, ProjectileSpeed = 44f, SplashRadius = 3.6f, SplashDamage = 120f },

        new SuperDef { Id = "chain_quorum", Name = "Chain Quorum", Behavior = SuperBehavior.ChainLattice,
            Element = Element.Surge,
            Description = "Your facets hold a lattice of lightning. Everything caught inside it comes apart.",
            Duration = 16f, Damage = 900f, Radius = 9f, DamageResist = 0.5f,
            Dps = 900f, ChainRange = 9f, ChainDamage = 260f, ChainTargets = 3 },

        new SuperDef { Id = "the_long_still", Name = "The Long Still", Behavior = SuperBehavior.LongStill,
            Element = Element.Null,
            Description = "Enter full cryptobiosis: rooted and untouchable while a null field drags everything in, then detonates.",
            Duration = 9f, Damage = 4200f, Radius = 13f, DamageResist = 1f,
            Dps = 260f, Pull = 7f, SplashRadius = 13f, SplashDamage = 4200f },
    };

    static Dictionary<string, SuperDef> _superById;

    public static SuperDef FindSuper(string id) {
        if (_superById == null) {
            _superById = new Dictionary<string, SuperDef>();
            foreach (var s in Supers) _superById[s.Id] = s;
        }
        SuperDef def;
        return _superById.TryGetValue(id, out def) ? def : null;
    }

    // --------------------------------------------------------------- subclasses
    public static readonly SubclassDef[] Subclasses = {
        new SubclassDef { Id = "emberchoir", Name = "Emberchoir", ClassId = "choralith",
            Element = Element.Ember, SuperId = "pyre_chorus",
            Tagline = "Burn from every direction at once.",
            Grenade = CinderSwarm, Melee = Ashgrasp,
            PassiveName = "Kindled Quorum",
            PassiveDescription = "Facet kills restore health and briefly raise your weapon damage." },

        new SubclassDef { Id = "stormvoice", Name = "Stormvoice", ClassId = "choralith",
            Element = Element.Surge, SuperId = "chain_quorum",
            Tagline = "The storm your species was born inside.",
            Grenade = LatticeNode, Melee = StaticShed,
            PassiveName = "Conduction",
            PassiveDescription = "Arc damage chains to a nearby enemy for a fraction of the damage." },

        new SubclassDef { Id = "deepstill", Name = "Deepstill", ClassId = "choralith",
            Element = Element.Null, SuperId = "the_long_still",
            Tagline = "Outlast it. Then take what is left.",
            Grenade = Stillwell, Melee = QuorumStrike,
            PassiveName = "Cryptobiosis",
            PassiveDescription = "Lethal damage instead stills you: three seconds untouchable, then you rise at low health." },
    };

    static Dictionary<string, SubclassDef> _subclassById;

    public static SubclassDef FindSubclass(string id) {
        if (_subclassById == null) {
            _subclassById = new Dictionary<string, SubclassDef>();
            foreach (var s in Subclasses) _subclassById[s.Id] = s;
        }
        SubclassDef def;
        return _subclassById.TryGetValue(id, out def) ? def : null;
    }

    // --------------------------------------------------------------- classes
    public static readonly ClassDef[] Classes = {
        new ClassDef {
            Id = "choralith", Name = "Choralith", Role = "Colonial Skirmisher",
            ModelName = "PC_Choralith",
            Blurb = "Not one creature but a quorum of them, from the storm-belt of a world that never turns. " +
                    "It fights by taking itself apart.",
            Highlights = new[] {
                "<b>Shed</b> — detach a facet that fights for you, at the cost of your own health",
                "<b>Disperse</b> — fragment and reform instead of jumping",
                "<b>Polarised Sight</b> — sees anything that recently moved or fired, through walls",
            },
            ClassAbilityId = "shed",
            Jumps = 2, JumpPower = 7.9f, MoveSpeed = 5.9f,
            SubclassIds = new[] { "emberchoir", "stormvoice", "deepstill" },
        },
    };

    static Catalog() {
        // Class base stats, kept out of the initialiser above for readability.
        var chor = Classes[0];
        chor.BaseStats[(int)StatId.Resilience] = 12;
        chor.BaseStats[(int)StatId.Mobility]   = 16;
        chor.BaseStats[(int)StatId.Recovery]   = 14;
        chor.BaseStats[(int)StatId.Discipline] = 12;
        chor.BaseStats[(int)StatId.Intellect]  = 12;
        chor.BaseStats[(int)StatId.Strength]   = 10;
    }

    static Dictionary<string, ClassDef> _classById;

    public static ClassDef FindClass(string id) {
        if (_classById == null) {
            _classById = new Dictionary<string, ClassDef>();
            foreach (var c in Classes) _classById[c.Id] = c;
        }
        ClassDef def;
        return _classById.TryGetValue(id, out def) ? def : null;
    }

    public static ClassAbilityDef FindClassAbility(string id) => id == "shed" ? Shed : null;
}
}
