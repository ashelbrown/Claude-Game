using System;
using System.Collections.Generic;

namespace Starfall.Core {

public static partial class Catalog {

    // Column 1 perks are utility, column 2 are damage — the genre convention, and
    // it keeps a rolled weapon from stacking two damage perks.
    public static readonly PerkDef[] Perks = {
        // ------------------------------------------------------------ column 1
        new PerkDef { Id = "outlaw", Name = "Outlaw", Column = 1,
            Description = "Precision kills dramatically increase reload speed for 6s.",
            OnPrecisionKill = e => e.Weapon.Runtime.AddBuff("outlaw", e.Ctx.Time, 6f, 0.7f),
            ReloadMultiplier = e => 1f / (1f + e.Weapon.Runtime.BuffValue("outlaw", e.Ctx.Time)) },

        new PerkDef { Id = "feedingFrenzy", Name = "Feeding Frenzy", Column = 1,
            Description = "Each rapid kill stacks up to +50% reload speed.",
            OnKill = e => e.Weapon.Runtime.AddBuff("ff", e.Ctx.Time, 4f, 0.125f, 4),
            ReloadMultiplier = e => 1f / (1f + e.Weapon.Runtime.BuffValue("ff", e.Ctx.Time)) },

        new PerkDef { Id = "subsistence", Name = "Subsistence", Column = 1,
            Description = "Kills partially refill the magazine from thin air.",
            OnKill = e => e.Ctx.RefillMagazine(e.Weapon,
                Math.Max(1, (int)Math.Ceiling(e.Weapon.Derived.Magazine * 0.12f))) },

        new PerkDef { Id = "demolitionist", Name = "Demolitionist", Column = 1,
            Description = "Kills grant grenade energy.",
            OnKill = e => e.Ctx.ChargeAbility(AbilityKind.Grenade, 0.12f) },

        new PerkDef { Id = "pugilist", Name = "Pugilist", Column = 1,
            Description = "Kills grant melee energy.",
            OnKill = e => e.Ctx.ChargeAbility(AbilityKind.Melee, 0.15f) },

        new PerkDef { Id = "wellspring", Name = "Wellspring", Column = 1,
            Description = "Kills grant class ability energy.",
            OnKill = e => e.Ctx.ChargeAbility(AbilityKind.Class, 0.14f) },

        new PerkDef { Id = "threatDetector", Name = "Threat Detector", Column = 1,
            Description = "Nearby enemies improve stability and handling.",
            StabilityMultiplier = e => e.Ctx.EnemiesWithin(e.Ctx.PlayerPosition, 12f) >= 2 ? 1.45f : 1f,
            HandlingMultiplier = e => e.Ctx.EnemiesWithin(e.Ctx.PlayerPosition, 12f) >= 2 ? 1.35f : 1f },

        new PerkDef { Id = "rangefinder", Name = "Rangefinder", Column = 1,
            Description = "Aiming down sights extends effective range.",
            RangeMultiplier = e => e.Ctx.PlayerAiming ? 1.3f : 1f },

        new PerkDef { Id = "snapshot", Name = "Snapshot Sights", Column = 1,
            Description = "Much faster aim-down-sights.",
            HandlingMultiplier = e => 1.6f },

        new PerkDef { Id = "overflow", Name = "Overflow", Column = 1,
            Description = "Ammo pickups overfill the magazine to double capacity.",
            OnAmmoPickup = e => e.Weapon.Ammo = Math.Max(e.Weapon.Ammo, e.Weapon.Derived.Magazine * 2) },

        // ------------------------------------------------------------ column 2
        new PerkDef { Id = "rampage", Name = "Rampage", Column = 2,
            Description = "Kills stack up to +33% damage for 4s.",
            OnKill = e => e.Weapon.Runtime.AddBuff("rampage", e.Ctx.Time, 4f, 0.11f, 3),
            DamageMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("rampage", e.Ctx.Time) },

        new PerkDef { Id = "killClip", Name = "Kill Clip", Column = 2,
            Description = "Reloading after a kill grants +30% damage for 5s.",
            OnKill = e => e.Weapon.Runtime.KillClipArmedUntil = e.Ctx.Time + 3.5f,
            OnReload = e => {
                if (e.Weapon.Runtime.KillClipArmedUntil > e.Ctx.Time) {
                    e.Weapon.Runtime.AddBuff("killClip", e.Ctx.Time, 5f, 0.30f);
                    e.Weapon.Runtime.KillClipArmedUntil = 0f;
                }
            },
            DamageMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("killClip", e.Ctx.Time) },

        new PerkDef { Id = "headseeker", Name = "Headseeker", Column = 2,
            Description = "Body shots briefly raise precision damage by 22%.",
            OnHit = e => { if (!e.Crit) e.Weapon.Runtime.AddBuff("headseeker", e.Ctx.Time, 1.6f, 0.22f); },
            CritMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("headseeker", e.Ctx.Time) },

        new PerkDef { Id = "firefly", Name = "Firefly", Column = 2,
            Description = "Precision kills cause the target to detonate.",
            OnPrecisionKill = e => e.Ctx.Explode(e.Position, 4.6f,
                90f * e.Ctx.DifficultyDamageScale, e.Weapon.Element) },

        new PerkDef { Id = "vorpal", Name = "Vorpal Weapon", Column = 2,
            Description = "+25% damage against majors, bosses and Supers.",
            DamageMultiplier = e => (e.Target != null && e.Target.Rank != Rank.Minor) ? 1.25f : 1f },

        new PerkDef { Id = "surrounded", Name = "Surrounded", Column = 2,
            Description = "+35% damage while three or more enemies are close.",
            DamageMultiplier = e => e.Ctx.EnemiesWithin(e.Ctx.PlayerPosition, 11f) >= 3 ? 1.35f : 1f },

        new PerkDef { Id = "underPressure", Name = "Under Pressure", Column = 2,
            Description = "Damage and stability climb as the magazine empties.",
            DamageMultiplier = e => 1f + 0.18f * (1f - e.Weapon.Ammo / (float)Math.Max(1, e.Weapon.Derived.Magazine)),
            StabilityMultiplier = e => 1f + 0.5f * (1f - e.Weapon.Ammo / (float)Math.Max(1, e.Weapon.Derived.Magazine)) },

        new PerkDef { Id = "explosivePayload", Name = "Explosive Payload", Column = 2,
            Description = "Rounds detonate on impact for area damage.",
            OnHit = e => e.Ctx.Explode(e.Position, 2.4f, e.Damage * 0.28f, e.Weapon.Element) },

        new PerkDef { Id = "adrenalineJunkie", Name = "Adrenaline Junkie", Column = 2,
            Description = "Grenade kills grant up to +30% weapon damage.",
            OnGrenadeKill = e => e.Weapon.Runtime.AddBuff("adren", e.Ctx.Time, 7f, 0.15f, 2),
            DamageMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("adren", e.Ctx.Time) },

        new PerkDef { Id = "frenzy", Name = "Frenzy", Column = 2,
            Description = "After 8s in combat: +18% damage and faster reloads.",
            DamageMultiplier = e => e.Ctx.PlayerCombatSeconds > 8f ? 1.18f : 1f,
            ReloadMultiplier = e => e.Ctx.PlayerCombatSeconds > 8f ? 0.7f : 1f },

        new PerkDef { Id = "swashbuckler", Name = "Swashbuckler", Column = 2,
            Description = "Melee kills grant maximum stacks of +40% damage.",
            OnKill = e => e.Weapon.Runtime.AddBuff("swash", e.Ctx.Time, 5f, 0.08f, 5),
            OnMeleeKill = e => e.Weapon.Runtime.AddBuff("swash", e.Ctx.Time, 5f, 0.08f, 5, 5),
            DamageMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("swash", e.Ctx.Time) },

        new PerkDef { Id = "tripleTap", Name = "Triple Tap", Column = 2,
            Description = "Every third precision hit returns a round to the magazine.",
            OnPrecisionHit = e => {
                var rt = e.Weapon.Runtime;
                rt.TripleTapCounter++;
                if (rt.TripleTapCounter >= 3) { rt.TripleTapCounter = 0; e.Ctx.RefillMagazine(e.Weapon, 1); }
            } },
    };

    static Dictionary<string, PerkDef> _perkById;

    public static PerkDef FindPerk(string id) {
        if (_perkById == null) {
            _perkById = new Dictionary<string, PerkDef>();
            foreach (var p in Perks) _perkById[p.Id] = p;
        }
        PerkDef def;
        return _perkById.TryGetValue(id, out def) ? def : null;
    }

    public static List<PerkDef> PerksInColumn(int column) {
        var outList = new List<PerkDef>();
        foreach (var p in Perks) if (p.Column == column) outList.Add(p);
        return outList;
    }

    // ------------------------------------------------------------- exotics
    // Each exotic carries one loud, identity-defining trait plus a supporting one.
    public static readonly ExoticWeaponDef[] ExoticWeapons = BuildExotics();

    static ExoticWeaponDef[] BuildExotics() {
        var hollowVerdict = new ExoticWeaponDef {
            Id = "hollow_verdict", Name = "Hollow Verdict", FamilyId = "hand",
            Element = Element.Ember, Slot = Slot.Energy,
            Flavor = "\"It asks a question. The answer is always the same.\" — Sundered Codex, fr. 11",
            DamageMod = 1.12f, MagazineMod = 1.3f, CritMod = 1.05f };
        hollowVerdict.Traits.Add(new PerkDef { Id = "x_sunspark", Name = "Sunspark", IsExoticTrait = true,
            Description = "Precision hits ignite the target; precision kills detonate them in a solar burst.",
            OnPrecisionHit = e => e.Ctx.ApplyBurn(e.Target, 14f, 4f),
            OnPrecisionKill = e => e.Ctx.Explode(e.Position, 6.2f, 200f * e.Ctx.DifficultyDamageScale, Element.Ember) });
        hollowVerdict.Traits.Add(new PerkDef { Id = "x_longburn", Name = "Long Burn", IsExoticTrait = true,
            Description = "Burning targets take 20% more damage from this weapon.",
            DamageMultiplier = e => (e.Target != null && e.Target.BurnRemaining > 0f) ? 1.2f : 1f });

        var nineLives = new ExoticWeaponDef {
            Id = "nine_lives", Name = "Nine Lives", FamilyId = "auto",
            Element = Element.Surge, Slot = Slot.Energy,
            Flavor = "Nine cores. Nine chances. The tenth belongs to whoever is left standing.",
            RpmMod = 1.05f, MagazineMod = 1.5f };
        nineLives.Traits.Add(new PerkDef { Id = "x_arcweb", Name = "Arc Web", IsExoticTrait = true,
            Description = "Hits chain lightning to a nearby enemy.",
            OnHit = e => e.Ctx.ChainLightning(e.Position, e.Target, e.Damage * 0.45f, 8f, 2) });
        nineLives.Traits.Add(new PerkDef { Id = "x_overcharged", Name = "Overcharged", IsExoticTrait = true,
            Description = "Sustained fire raises damage by up to 25%.",
            OnHit = e => e.Weapon.Runtime.HitStreak = Math.Min(12, e.Weapon.Runtime.HitStreak + 1),
            DamageMultiplier = e => 1f + Math.Min(0.25f, e.Weapon.Runtime.HitStreak * 0.02f) });

        var gravewell = new ExoticWeaponDef {
            Id = "gravewell", Name = "Gravewell", FamilyId = "rocket",
            Element = Element.Null, Slot = Slot.Power,
            Flavor = "Fires a hole. The hole insists.",
            MagazineMod = 2f, DamageMod = 0.8f };
        gravewell.Traits.Add(new PerkDef { Id = "x_eventhorizon", Name = "Event Horizon", IsExoticTrait = true,
            Description = "Rockets create a singularity that drags enemies in before collapsing.",
            OnProjectileImpact = e => e.Ctx.SpawnSingularity(e.Position, 8f, 3f, 320f * e.Ctx.DifficultyDamageScale) });
        gravewell.Traits.Add(new PerkDef { Id = "x_blackholesun", Name = "Black Hole Sun", IsExoticTrait = true,
            Description = "Enemies killed by the singularity make the next rocket free.",
            OnKill = e => { if (e.Source == "singularity") e.Ctx.RefillMagazine(e.Weapon, 1); } });

        var chorus = new ExoticWeaponDef {
            Id = "chorus_of_ash", Name = "Chorus of Ash", FamilyId = "sniper",
            Element = Element.Ember, Slot = Slot.Power,
            Flavor = "Every shot is a note. Play the whole song.",
            MagazineMod = 1.5f, DamageMod = 0.85f };
        chorus.Traits.Add(new PerkDef { Id = "x_crescendo", Name = "Crescendo", IsExoticTrait = true,
            Description = "Consecutive precision hits stack +18% damage, up to five times.",
            OnPrecisionHit = e => e.Weapon.Runtime.AddBuff("cresc", e.Ctx.Time, 9f, 0.18f, 5),
            DamageMultiplier = e => 1f + e.Weapon.Runtime.BuffValue("cresc", e.Ctx.Time) });
        chorus.Traits.Add(new PerkDef { Id = "x_reprise", Name = "Reprise", IsExoticTrait = true,
            Description = "Precision kills return two rounds to the magazine.",
            OnPrecisionKill = e => e.Ctx.RefillMagazine(e.Weapon, 2) });

        var loudSilence = new ExoticWeaponDef {
            Id = "loud_silence", Name = "Loud Silence", FamilyId = "smg",
            Element = Element.Null, Slot = Slot.Kinetic,
            Flavor = "They never hear it. That is rather the point.",
            MagazineMod = 1.25f, RpmMod = 1.05f };
        loudSilence.Traits.Add(new PerkDef { Id = "x_vanishing", Name = "Vanishing Point", IsExoticTrait = true,
            Description = "Kills briefly make you invisible to enemies and refill the magazine.",
            OnKill = e => { e.Ctx.Cloak(3f); e.Weapon.Ammo = e.Weapon.Derived.Magazine; } });
        loudSilence.Traits.Add(new PerkDef { Id = "x_fromnowhere", Name = "From Nowhere", IsExoticTrait = true,
            Description = "The first shot from invisibility deals triple damage.",
            DamageMultiplier = e => e.Ctx.PlayerInvisible ? 3f : 1f });

        var sunder = new ExoticWeaponDef {
            Id = "sunder", Name = "Sunder", FamilyId = "shotgun",
            Element = Element.Ember, Slot = Slot.Energy,
            Flavor = "Shoot. Then hit them with the shotgun.",
            MagazineMod = 1.4f, DamageMod = 0.95f };
        sunder.Traits.Add(new PerkDef { Id = "x_onetwo", Name = "One-Two Punch", IsExoticTrait = true,
            Description = "Hitting with every pellet massively empowers your next melee.",
            OnHit = e => { if (e.AllPelletsHit) e.Ctx.BuffMelee(3.2f, 2f); } });
        sunder.Traits.Add(new PerkDef { Id = "x_moltenshell", Name = "Molten Shell", IsExoticTrait = true,
            Description = "Empowered melee kills leave a burning pool.",
            OnMeleeKill = e => e.Ctx.SpawnBurnPool(e.Position, 4.5f, 6f, 42f * e.Ctx.DifficultyDamageScale) });

        var longAnswer = new ExoticWeaponDef {
            Id = "the_long_answer", Name = "The Long Answer", FamilyId = "scout",
            Element = Element.Surge, Slot = Slot.Kinetic,
            Flavor = "You asked politely twice. This is the third time.",
            MagazineMod = 1.4f };
        longAnswer.Traits.Add(new PerkDef { Id = "x_escalation", Name = "Escalation", IsExoticTrait = true,
            Description = "Holding the trigger increases fire rate and damage.",
            DamageMultiplier = e => 1f + Math.Min(0.35f, e.Weapon.Runtime.TriggerHeld * 0.07f),
            FireRateMultiplier = e => 1f + Math.Min(0.6f, e.Weapon.Runtime.TriggerHeld * 0.12f) });
        longAnswer.Traits.Add(new PerkDef { Id = "x_coolhead", Name = "Cool Head", IsExoticTrait = true,
            Description = "Precision hits do not reset Escalation." });

        var cindergrasp = new ExoticWeaponDef {
            Id = "cindergrasp", Name = "Cindergrasp", FamilyId = "fusion",
            Element = Element.Ember, Slot = Slot.Energy,
            Flavor = "Hold it long enough and the floor remembers.",
            ChargeMod = 0.85f, MagazineMod = 1.3f };
        cindergrasp.Traits.Add(new PerkDef { Id = "x_scorched", Name = "Scorched Earth", IsExoticTrait = true,
            Description = "Bolts leave burning ground where they land.",
            OnHit = e => { if (e.PelletIndex == 0) e.Ctx.SpawnBurnPool(e.Position, 3.4f, 5f, 26f * e.Ctx.DifficultyDamageScale); } });
        cindergrasp.Traits.Add(new PerkDef { Id = "x_kindling", Name = "Kindling", IsExoticTrait = true,
            Description = "+30% damage against burning targets.",
            DamageMultiplier = e => (e.Target != null && e.Target.BurnRemaining > 0f) ? 1.3f : 1f });

        return new[] { hollowVerdict, nineLives, gravewell, chorus, loudSilence, sunder, longAnswer, cindergrasp };
    }

    static Dictionary<string, ExoticWeaponDef> _exoticById;

    public static ExoticWeaponDef FindExoticWeapon(string id) {
        if (_exoticById == null) {
            _exoticById = new Dictionary<string, ExoticWeaponDef>();
            foreach (var e in ExoticWeapons) _exoticById[e.Id] = e;
        }
        ExoticWeaponDef def;
        return _exoticById.TryGetValue(id, out def) ? def : null;
    }
}
}
