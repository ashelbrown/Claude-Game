using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// Grenade, melee, Shed and the Super. Cooldowns come from the character's
/// Discipline / Strength / Recovery / Intellect tiers, so armor rolls change how
/// the class actually plays rather than only its numbers.
/// </summary>
public sealed class AbilityController : MonoBehaviour {

    GameManager _game;

    public float GrenadeCharge = 1f, MeleeCharge = 1f, ClassCharge = 1f, SuperEnergy;
    public bool SuperActive { get; private set; }
    public float SuperRemaining { get; private set; }
    public int SuperCastsLeft { get; private set; }

    float _grenadeCooldown = 26f, _meleeCooldown = 15f, _classCooldown = 26f, _superCooldown = 105f;
    float _superFireTimer;
    bool _superWasReady;

    public float EmpowerBonus { get; private set; }
    float _empowerTimer;
    float _meleeBuff = 1f, _meleeBuffTimer;
    float _lungeTimer;
    MeleeDef _pendingLunge;
    float _pendingLungeMultiplier = 1f;

    readonly List<Facet> _facets = new List<Facet>();
    bool _healthPenaltyApplied;

    public SubclassDef Subclass => _game.Subclass;
    public SuperDef Super => Catalog.FindSuper(Subclass.SuperId);
    public ClassAbilityDef ClassAbility => Catalog.Shed;
    public int FacetsOut => _facets.Count;

    public void Bind(GameManager game) { _game = game; }

    public void ResetForActivity() {
        var stats = _game.Player.Stats;
        int disc = Defs.Tier(stats[(int)StatId.Discipline]);
        int str = Defs.Tier(stats[(int)StatId.Strength]);
        int rec = Defs.Tier(stats[(int)StatId.Recovery]);
        int intel = Defs.Tier(stats[(int)StatId.Intellect]);

        _grenadeCooldown = Subclass.Grenade.Cooldown * (1.22f - disc * 0.052f);
        _meleeCooldown = Subclass.Melee.Cooldown * (1.22f - str * 0.052f);
        _classCooldown = ClassAbility.Cooldown * (1.22f - rec * 0.045f);
        _superCooldown = 105f * (1.28f - intel * 0.050f);

        GrenadeCharge = MeleeCharge = ClassCharge = 1f;
        SuperEnergy = 0.25f;
        SuperActive = false;
        EmpowerBonus = 0f;
        ClearAll();
    }

    public void ClearAll() {
        for (int i = _facets.Count - 1; i >= 0; i--) if (_facets[i] != null) Destroy(_facets[i].gameObject);
        _facets.Clear();
        RemoveHealthPenalty();
    }

    // ------------------------------------------------------------- frame
    public void Tick(float dt, InputState input) {
        if (GrenadeCharge < 1f) GrenadeCharge = Mathf.Min(1f, GrenadeCharge + dt / _grenadeCooldown);
        if (MeleeCharge < 1f) MeleeCharge = Mathf.Min(1f, MeleeCharge + dt / _meleeCooldown);
        if (ClassCharge < 1f) ClassCharge = Mathf.Min(1f, ClassCharge + dt / _classCooldown);

        if (_empowerTimer > 0f) { _empowerTimer -= dt; if (_empowerTimer <= 0f) EmpowerBonus = 0f; }
        if (_meleeBuffTimer > 0f) { _meleeBuffTimer -= dt; if (_meleeBuffTimer <= 0f) _meleeBuff = 1f; }

        // prune facets that expired or died on their own
        for (int i = _facets.Count - 1; i >= 0; i--) {
            if (_facets[i] == null || !_facets[i].Alive) { _facets.RemoveAt(i); OnFacetLost(); }
        }

        if (input.GrenadePressed && GrenadeCharge >= 1f) { GrenadeCharge = 0f; ThrowGrenade(); }
        if (input.MeleePressed && MeleeCharge >= 1f) { MeleeCharge = 0f; Melee(); }
        if (input.ClassPressed && (ClassCharge >= 1f || _facets.Count > 0)) UseShed();

        if (_lungeTimer > 0f) TickLunge(dt);

        if (SuperActive) TickSuper(dt, input);
        else {
            SuperEnergy = Mathf.Min(1f, SuperEnergy + dt / _superCooldown);
            if (SuperEnergy >= 1f && !_superWasReady) {
                _superWasReady = true;
                _game.Audio.SuperReady();
                _game.Hud.Banner("SUPER READY", "[X]");
            }
            if (SuperEnergy < 1f) _superWasReady = false;
            if (input.SuperPressed && SuperEnergy >= 1f) CastSuper();
        }
    }

    public void Charge(AbilityKind kind, float fraction) {
        switch (kind) {
            case AbilityKind.Grenade: GrenadeCharge = Mathf.Min(1f, GrenadeCharge + fraction); break;
            case AbilityKind.Melee: MeleeCharge = Mathf.Min(1f, MeleeCharge + fraction); break;
            case AbilityKind.Class: ClassCharge = Mathf.Min(1f, ClassCharge + fraction); break;
            default: SuperEnergy = Mathf.Min(1f, SuperEnergy + fraction); break;
        }
    }

    public void Empower(float amount, float duration) {
        EmpowerBonus = Mathf.Max(EmpowerBonus, amount);
        _empowerTimer = Mathf.Max(_empowerTimer, duration);
    }

    public void BuffMelee(float multiplier, float duration) {
        _meleeBuff = Mathf.Max(_meleeBuff, multiplier);
        _meleeBuffTimer = Mathf.Max(_meleeBuffTimer, duration);
    }

    float AbilityDamage(float baseDamage) =>
        baseDamage * _game.EnemyHealthScale * (1f + EmpowerBonus);

    public void SpawnArea(Vector3 position, AreaKind kind, float radius, float duration,
                          float dps, Element element) {
        AreaEffect.Spawn(_game, position, kind, radius, duration, dps, element);
    }

    // ------------------------------------------------------------- grenade
    void ThrowGrenade() {
        var g = Subclass.Grenade;
        var cam = _game.Player.Cam.transform;
        _game.Audio.Grenade();

        // Astral Coil splits the throw into three weaker charges.
        int count = _game.Profile.HasExoticArmor("astral_coil") ? 3 : 1;
        float scale = count > 1 ? 0.5f : 1f;

        for (int i = 0; i < count; i++) {
            float yaw = count > 1 ? (i - 1) * 7f : 0f;
            Vector3 dir = Quaternion.Euler(0f, yaw, 0f) * cam.forward;
            Vector3 origin = cam.position + dir * 0.5f;

            switch (g.Behavior) {
                case GrenadeBehavior.Firebolt:
                    Projectile.Spawn(_game, origin, dir * g.Speed + Vector3.up * 2f,
                        AbilityDamage(g.Damage * 0.4f * scale), g.Element, ArtLibrary.Of(g.Element),
                        ProjectileTeam.Player, g.Gravity, g.Radius, AbilityDamage(g.Damage * scale),
                        0, -1f, 0.2f, null, "grenade",
                        (point, hit) => SeekingMotes(point, g, scale));
                    break;

                case GrenadeBehavior.Pulse:
                    Projectile.Spawn(_game, origin, dir * g.Speed + Vector3.up * 1.5f,
                        AbilityDamage(g.Damage * 0.3f * scale), g.Element, ArtLibrary.Of(g.Element),
                        ProjectileTeam.Player, g.Gravity, 0f, 0f, 0, -1f, 0.2f, null, "grenade",
                        (point, hit) => AreaEffect.Spawn(_game, point, AreaKind.Pulse, g.Radius,
                            g.Pulses * g.PulseInterval + 0.4f, 0f, g.Element, 0f,
                            g.Pulses, g.PulseInterval, AbilityDamage(g.Damage * scale)));
                    break;

                default: // Vortex
                    Projectile.Spawn(_game, origin, dir * g.Speed + Vector3.up * 1.5f,
                        AbilityDamage(g.Damage * 0.4f * scale), g.Element, ArtLibrary.Of(g.Element),
                        ProjectileTeam.Player, g.Gravity, g.Radius * 0.8f,
                        AbilityDamage(g.Damage * scale), 0, -1f, 0.2f, null, "grenade",
                        (point, hit) => AreaEffect.Spawn(_game, point, AreaKind.Vortex, g.Radius,
                            g.Duration, AbilityDamage(g.Damage * 1.5f * scale) / g.Duration * 2f,
                            g.Element, g.Pull));
                    break;
            }
        }
    }

    void SeekingMotes(Vector3 origin, GrenadeDef g, float scale) {
        for (int i = 0; i < g.SeekingBolts; i++) {
            var target = _game.NearestEnemy(origin, g.Radius * 2.2f);
            if (target == null) break;
            _game.Effects.Lightning(origin, target.Center, ArtLibrary.Of(Element.Ember), 4);
            target.ApplyBurn(g.BurnDps * scale, g.BurnDuration);
            _game.DamageEnemy(target, AbilityDamage(g.Damage * 0.35f * scale), Element.Ember,
                              target.Center, false, "grenade");
            if (target.Alive) continue;
        }
    }

    // ------------------------------------------------------------- melee
    void Melee() {
        var m = Subclass.Melee;
        var cam = _game.Player.Cam.transform;
        float multiplier = _meleeBuff;
        _meleeBuff = 1f; _meleeBuffTimer = 0f;
        _game.Audio.Melee();

        if (m.Behavior == MeleeBehavior.Lunge) {
            _pendingLunge = m;
            _pendingLungeMultiplier = multiplier;
            _lungeTimer = 0.34f;
            _game.Effects.Burst(_game.Player.transform.position + Vector3.up, 14,
                                _game.ElementColor, 6f, 0.09f, 0.4f);
            return;
        }

        var hits = _game.EnemiesInCone(cam.position, cam.forward, m.Range, 0.55f);
        int killed = 0;
        for (int i = 0; i < hits.Count; i++) {
            var result = _game.DamageEnemy(hits[i], AbilityDamage(m.Damage * multiplier),
                                           Subclass.Element, hits[i].Center, false, "melee");
            if (result.Killed) killed++;
            if (m.Behavior == MeleeBehavior.Drain) _game.Player.Heal(m.Heal);
        }
        if (hits.Count > 0) {
            if (m.Heal > 0f && m.Behavior != MeleeBehavior.Drain) _game.Player.Heal(m.Heal);
            _game.Explode(hits[0].Center, m.Radius, AbilityDamage(m.Damage * 0.4f * multiplier),
                          Subclass.Element, "melee");
        }
        if (killed > 0 && m.RefundOnKill > 0f) MeleeCharge = Mathf.Min(1f, MeleeCharge + m.RefundOnKill);
    }

    void TickLunge(float dt) {
        _lungeTimer -= dt;
        var cam = _game.Player.Cam.transform;
        var hits = _game.EnemiesInCone(cam.position, cam.forward, _pendingLunge.Range, 0.4f);
        if (hits.Count == 0 && _lungeTimer > 0f) return;

        int killed = 0;
        for (int i = 0; i < hits.Count; i++) {
            var result = _game.DamageEnemy(hits[i], AbilityDamage(_pendingLunge.Damage * _pendingLungeMultiplier),
                                           Subclass.Element, hits[i].Center, false, "melee");
            if (result.Killed) killed++;
        }
        if (hits.Count > 0) {
            _game.Explode(hits[0].Center, _pendingLunge.Radius,
                          AbilityDamage(_pendingLunge.Damage * 0.5f * _pendingLungeMultiplier),
                          Subclass.Element, "melee");
        }
        if (killed > 0 && _pendingLunge.RefundOnKill > 0f) {
            MeleeCharge = Mathf.Min(1f, MeleeCharge + _pendingLunge.RefundOnKill);
        }
        _lungeTimer = 0f;
        _pendingLunge = null;
    }

    // ------------------------------------------------------------- shed
    /// <summary>
    /// Detach a facet, or reabsorb one already out. The health cost is the whole
    /// point: you are trading part of yourself for a second gun.
    /// </summary>
    void UseShed() {
        int maxFacets = _game.Profile.HasExoticArmor("shed_harness") ? 2 : 1;

        if (_facets.Count > 0 && (_facets.Count >= maxFacets || ClassCharge < 1f)) {
            var facet = _facets[0];
            _facets.RemoveAt(0);
            facet.Recall();
            OnFacetLost();
            _game.Player.AddOvershield(ClassAbility.OvershieldOnRecall);
            _game.Hud.Banner("REABSORBED", "");
            return;
        }
        if (ClassCharge < 1f) return;

        ClassCharge = 0f;
        var cam = _game.Player.Cam.transform;
        Vector3 spawn = _game.Player.transform.position + Vector3.up * 1.4f + cam.forward * 2.2f;
        RaycastHit hit;
        if (Physics.Raycast(_game.Player.transform.position + Vector3.up * 1.4f, cam.forward,
                            out hit, 2.6f, _game.WorldMask)) {
            spawn = hit.point - cam.forward * 0.6f;
        }

        var f = Facet.Spawn(_game, spawn, ClassAbility, Subclass.Element);
        _facets.Add(f);
        ApplyHealthPenalty();
        _game.Audio.Shed();
    }

    void ApplyHealthPenalty() {
        if (_healthPenaltyApplied) return;
        _healthPenaltyApplied = true;
        _game.Player.ApplyHealthPenalty(ClassAbility.HealthCostFraction);
    }

    void RemoveHealthPenalty() {
        if (!_healthPenaltyApplied) return;
        _healthPenaltyApplied = false;
        _game.Player.RemoveHealthPenalty(ClassAbility.HealthCostFraction);
    }

    void OnFacetLost() {
        if (_facets.Count == 0) RemoveHealthPenalty();
    }

    // ------------------------------------------------------------- super
    void CastSuper() {
        var s = Super;
        SuperEnergy = 0f;
        _superWasReady = false;
        SuperActive = true;
        SuperRemaining = s.Duration * (_game.Profile.HasExoticArmor("nightfall_shroud") ? 1.4f : 1f);
        SuperCastsLeft = Mathf.Max(1, s.Casts);
        _superFireTimer = 0f;

        _game.Audio.SuperCast();
        _game.Effects.CameraShake(0.8f);
        _game.Effects.Burst(_game.Player.transform.position + Vector3.up, 60,
                            ArtLibrary.Of(s.Element), 12f, 0.14f, 0.9f);
        _game.Hud.Banner(s.Name.ToUpperInvariant(), "");
        _game.Player.Invulnerable = Mathf.Max(_game.Player.Invulnerable, 0.5f);
        _game.Player.DamageResist = s.DamageResist;

        switch (s.Behavior) {
            case SuperBehavior.FacetSwarm:
                for (int i = 0; i < s.Casts; i++) {
                    var f = Facet.Spawn(_game, _game.Player.transform.position + Vector3.up * 1.7f,
                                        ClassAbility, s.Element, true, i * (Mathf.PI * 2f / s.Casts));
                    _facets.Add(f);
                }
                break;

            case SuperBehavior.LongStill:
                // Rooted, untouchable, dragging everything in before it detonates.
                AreaEffect.Spawn(_game, _game.Player.transform.position, AreaKind.LongStill,
                                 s.Radius, s.Duration, s.Dps, s.Element, s.Pull);
                _game.Player.Invulnerable = s.Duration;
                break;
        }
    }

    void TickSuper(float dt, InputState input) {
        var s = Super;
        SuperRemaining -= dt;
        _superFireTimer -= dt;

        if (Random.value < dt * 30f) {
            _game.Effects.Burst(_game.Player.transform.position + Vector3.up * Random.Range(0.4f, 1.8f),
                                1, ArtLibrary.Of(s.Element), 2f, 0.09f, 0.5f);
        }

        if (s.Behavior == SuperBehavior.ChainLattice && input.Fire) {
            // The lattice damages everything caught inside it, and leaps outward.
            var caught = _game.EnemiesInCone(_game.Player.transform.position, Vector3.up, s.Radius, -1f);
            for (int i = 0; i < caught.Count; i++) {
                _game.Effects.Lightning(_game.Player.transform.position + Vector3.up * 1.4f,
                                        caught[i].Center, ArtLibrary.Of(Element.Surge), 4);
                _game.DamageEnemy(caught[i], AbilityDamage(s.Dps) * dt, Element.Surge,
                                  caught[i].Center, false, "super", true);
                if (caught.Count < 3) {
                    _game.ChainLightning(caught[i].Center, caught[i], AbilityDamage(s.ChainDamage) * dt * 3f,
                                         s.ChainRange, s.ChainTargets);
                }
            }
        }

        if (SuperRemaining <= 0f) EndSuper();
    }

    void EndSuper() {
        SuperActive = false;
        SuperRemaining = 0f;
        _game.Player.DamageResist = 0f;
        // Super facets are temporary; shed facets are not.
        for (int i = _facets.Count - 1; i >= 0; i--) {
            if (_facets[i] == null) { _facets.RemoveAt(i); continue; }
        }
        _game.Effects.Burst(_game.Player.transform.position + Vector3.up, 20,
                            ArtLibrary.Of(Super.Element), 6f, 0.1f, 0.5f);
    }

    // ------------------------------------------------------------- credit
    public void OnKillCredit(Enemy enemy, string source) {
        float gain = enemy.Def.Rank == Rank.Boss ? 0.06f
                   : enemy.Def.Rank == Rank.Ultra ? 0.05f
                   : enemy.Def.Rank == Rank.Major ? 0.035f : 0.011f;
        SuperEnergy = Mathf.Min(1f, SuperEnergy + gain);

        bool abilityKill = source == "grenade" || source == "melee" || source == "super" ||
                           source == "vortex" || source == "burn" || source == "facet";

        switch (Subclass.Id) {
            case "emberchoir":
                if (source == "facet" || abilityKill) { _game.Player.Heal(45f); Empower(0.2f, 6f); }
                break;
            case "stormvoice":
                if (source == "weapon" && Random.value < 0.5f) {
                    _game.ChainLightning(enemy.Center, enemy, AbilityDamage(40f), 8f, 1);
                }
                break;
            case "deepstill":
                if (abilityKill) {
                    _game.Player.Heal(60f);
                    GrenadeCharge = Mathf.Min(1f, GrenadeCharge + 0.3f);
                }
                break;
        }

        if (_game.Profile.HasExoticArmor("second_wind") && _game.Player.HealthFraction < 0.45f) {
            SuperEnergy = Mathf.Min(1f, SuperEnergy + 0.03f);
            Empower(0.25f, 5f);
        }
    }
}
}
