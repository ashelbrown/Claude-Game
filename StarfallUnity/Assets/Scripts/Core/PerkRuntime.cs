using System;
using System.Collections.Generic;

namespace Starfall.Core {

public enum AbilityKind { Grenade, Melee, Class, Super }

/// <summary>What a perk is allowed to know about, and do to, the running game.</summary>
public interface IPerkContext {
    float Time { get; }
    /// <summary>Scales flat ability damage with the activity, so abilities stay relevant.</summary>
    float DifficultyDamageScale { get; }
    Vec3 PlayerPosition { get; }
    bool PlayerAiming { get; }
    float PlayerCombatSeconds { get; }
    bool PlayerInvisible { get; }

    int EnemiesWithin(Vec3 position, float radius);
    void ChargeAbility(AbilityKind kind, float fraction);
    void Explode(Vec3 position, float radius, float damage, Element element);
    void ApplyBurn(ITarget target, float dps, float duration);
    void ChainLightning(Vec3 from, ITarget seed, float damage, float range, int maxTargets);
    void SpawnBurnPool(Vec3 position, float radius, float duration, float dps);
    void SpawnSingularity(Vec3 position, float radius, float duration, float damage);
    void Cloak(float duration);
    void BuffMelee(float multiplier, float duration);
    void RefillMagazine(Item weapon, int rounds);
}

/// <summary>The minimum an enemy must expose for perks to reason about it.</summary>
public interface ITarget {
    Rank Rank { get; }
    float BurnRemaining { get; }
    Vec3 Position { get; }
    bool Alive { get; }
}

/// <summary>Context handed to every perk hook for one event.</summary>
public sealed class PerkEvent {
    public IPerkContext Ctx;
    public Item Weapon;
    public ITarget Target;
    public Vec3 Position;
    public bool Crit;
    public float Damage;
    public bool AllPelletsHit;
    public int PelletIndex;
    public string Source;      // "weapon", "grenade", "melee", "super", ...

    public void Reset(IPerkContext ctx, Item weapon) {
        Ctx = ctx; Weapon = weapon; Target = null; Position = Vec3.Zero;
        Crit = false; Damage = 0f; AllPelletsHit = false; PelletIndex = 0; Source = "weapon";
    }
}

/// <summary>A stacking, expiring modifier owned by one weapon instance.</summary>
public struct Buff {
    public int Stacks;
    public float Until;
    public float PerStack;
}

/// <summary>
/// Per-instance weapon state: magazine, buffs and small perk counters. Lives on
/// the item so two copies of the same gun track independently.
/// </summary>
public sealed class WeaponRuntime {
    public readonly Dictionary<string, Buff> Buffs = new Dictionary<string, Buff>();
    public float KillClipArmedUntil;
    public int TripleTapCounter;
    public int HitStreak;         // exotic: Nine Lives overcharge
    public float TriggerHeld;     // exotic: The Long Answer escalation

    public int AddBuff(string id, float now, float duration, float perStack, int maxStacks = 1, int add = 1) {
        Buff b;
        int stacks = add;
        if (Buffs.TryGetValue(id, out b) && b.Until > now) stacks = b.Stacks + add;
        if (stacks > maxStacks) stacks = maxStacks;
        Buffs[id] = new Buff { Stacks = stacks, Until = now + duration, PerStack = perStack };
        return stacks;
    }

    public float BuffValue(string id, float now) {
        Buff b;
        if (!Buffs.TryGetValue(id, out b) || b.Until <= now) return 0f;
        return b.Stacks * b.PerStack;
    }

    public bool BuffActive(string id, float now) {
        Buff b;
        return Buffs.TryGetValue(id, out b) && b.Until > now;
    }

    public void Clear() {
        Buffs.Clear();
        KillClipArmedUntil = 0f; TripleTapCounter = 0; HitStreak = 0; TriggerHeld = 0f;
    }
}

/// <summary>
/// One perk or exotic trait. Hooks are optional delegates; the weapon pipeline
/// calls whichever are present, so adding a perk never means touching the
/// firing code.
/// </summary>
public sealed class PerkDef {
    public string Id;
    public string Name;
    public string Description;
    public int Column;           // 1 = utility, 2 = damage (genre convention)
    public bool IsExoticTrait;

    public Action<PerkEvent> OnHit;
    public Action<PerkEvent> OnPrecisionHit;
    public Action<PerkEvent> OnKill;
    public Action<PerkEvent> OnPrecisionKill;
    public Action<PerkEvent> OnMeleeKill;
    public Action<PerkEvent> OnGrenadeKill;
    public Action<PerkEvent> OnReload;
    public Action<PerkEvent> OnAmmoPickup;
    public Action<PerkEvent> OnProjectileImpact;

    public Func<PerkEvent, float> DamageMultiplier;
    public Func<PerkEvent, float> CritMultiplier;
    public Func<PerkEvent, float> ReloadMultiplier;
    public Func<PerkEvent, float> StabilityMultiplier;
    public Func<PerkEvent, float> HandlingMultiplier;
    public Func<PerkEvent, float> RangeMultiplier;
    public Func<PerkEvent, float> FireRateMultiplier;
}
}
