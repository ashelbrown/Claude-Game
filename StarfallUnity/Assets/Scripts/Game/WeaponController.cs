using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// Gunplay: the three equipped weapons, aiming, firing, reloading, and the perk
/// pipeline. Every multiplier a perk or exotic can contribute is gathered here,
/// so adding a perk never means editing the firing code.
/// </summary>
public sealed class WeaponController : MonoBehaviour {

    GameManager _game;
    readonly Item[] _slots = new Item[3];
    readonly Dictionary<AmmoType, int> _reserves = new Dictionary<AmmoType, int>();
    readonly PerkEvent _event = new PerkEvent();

    GameObject _viewModel;
    Item _viewModelFor;

    public int SlotIndex { get; private set; }
    public Item Current => _slots[SlotIndex];
    public float Aiming { get; private set; }
    public bool Reloading { get; private set; }
    public float ReloadRemaining { get; private set; }
    public float ChargeProgress { get; private set; }

    float _fireTimer, _burstTimer, _swapTimer, _muzzleFlash;
    int _burstQueue;
    float _triggerHeld;

    public void Bind(GameManager game) {
        _game = game;
        _reserves[AmmoType.Primary] = 999;
        _reserves[AmmoType.Special] = 18;
        _reserves[AmmoType.Heavy] = 6;
    }

    public int Reserve(AmmoType type) {
        int v;
        return _reserves.TryGetValue(type, out v) ? v : 0;
    }

    public void AddReserve(AmmoType type, int amount) {
        int cap = type == AmmoType.Heavy ? 8 : type == AmmoType.Special ? 24 : 999;
        _reserves[type] = Mathf.Min(cap, Reserve(type) + amount);
        // "Overflow" and similar perks react to a pickup, not to a reload.
        for (int i = 0; i < _slots.Length; i++) {
            var w = _slots[i];
            if (w == null || w.Derived.Ammo != type) continue;
            _event.Reset(_game, w);
            var perks = w.Perks;
            for (int p = 0; p < perks.Count; p++) if (perks[p].OnAmmoPickup != null) perks[p].OnAmmoPickup(_event);
        }
    }

    public void EquipFrom(Loadout loadout) {
        _slots[0] = loadout.Get(Slot.Kinetic);
        _slots[1] = loadout.Get(Slot.Energy);
        _slots[2] = loadout.Get(Slot.Power);
        for (int i = 0; i < 3; i++) if (_slots[i] != null) _slots[i].Rebuild();
        SlotIndex = _slots[0] != null ? 0 : (_slots[1] != null ? 1 : 2);
        Reloading = false;
        _burstQueue = 0;
        RefreshViewModel();
    }

    // ------------------------------------------------------------- frame
    public void Tick(float dt, InputState input) {
        _swapTimer = Mathf.Max(0f, _swapTimer - dt);
        _muzzleFlash = Mathf.Max(0f, _muzzleFlash - dt);

        HandleSwap(input);
        var w = Current;
        if (w == null) return;
        var d = w.Derived;

        // aim
        float adsSpeed = 1f / Mathf.Max(0.05f, d.AdsTime / Mathf.Max(0.2f, Multiplier(w, MulKind.Handling)));
        Aiming = Mathf.Clamp01(Aiming + (input.Aim ? dt * adsSpeed : -dt * adsSpeed * 1.5f));
        _game.Player.Cam.fieldOfView = Mathf.Lerp(_game.Player.Cam.fieldOfView,
            62f / Mathf.Lerp(1f, d.Zoom, Aiming), 1f - Mathf.Exp(-14f * dt));

        // reload
        if (Reloading) {
            ReloadRemaining -= dt;
            if (ReloadRemaining <= 0f) FinishReload(w);
        } else if ((input.ReloadPressed || w.Ammo <= 0) && w.Ammo < d.Magazine && Reserve(d.Ammo) > 0) {
            StartReload(w);
        }

        _fireTimer -= dt;
        if (_burstQueue > 0) {
            _burstTimer -= dt;
            if (_burstTimer <= 0f) {
                _burstQueue--;
                _burstTimer = d.BurstDelay;
                FireOnce(w);
            }
            return;
        }

        _triggerHeld = input.Fire ? _triggerHeld + dt : 0f;
        if (!string.IsNullOrEmpty(w.ExoticId)) w.Runtime.TriggerHeld = _triggerHeld * 2f;

        // charge weapons hold, then release
        if (d.ChargeTime > 0f) {
            if (input.Fire && !Reloading && w.Ammo > 0 && _swapTimer <= 0f) {
                if (ChargeProgress <= 0f) _game.Audio.Charge();
                ChargeProgress += dt;
                if (ChargeProgress >= d.ChargeTime) {
                    ChargeProgress = 0f;
                    FireOnce(w);
                    _fireTimer = d.ShotInterval;
                }
            } else ChargeProgress = 0f;
            return;
        }

        bool automatic = w.FamilyId == "auto" || w.FamilyId == "smg" ||
                         w.FamilyId == "mg" || w.FamilyId == "sidearm";
        bool wantShot = automatic ? input.Fire : input.FirePressed;
        if (!wantShot || _fireTimer > 0f || Reloading || _swapTimer > 0f) return;

        if (w.Ammo <= 0) {
            if (Reserve(d.Ammo) > 0) StartReload(w); else _game.Audio.DryFire();
            _fireTimer = 0.25f;
            return;
        }

        float rpmMul = Multiplier(w, MulKind.FireRate);
        _fireTimer = d.ShotInterval / Mathf.Max(0.1f, rpmMul);
        if (d.BurstCount > 1) {
            _burstQueue = d.BurstCount - 1;
            _burstTimer = d.BurstDelay;
            _fireTimer += d.BurstDelay * d.BurstCount;
        }
        FireOnce(w);
    }

    void HandleSwap(InputState input) {
        int want = -1;
        if (input.SlotPressed > 0) want = input.SlotPressed - 1;
        else if (Mathf.Abs(input.ScrollDelta) > 0.1f) {
            int dir = input.ScrollDelta > 0f ? 1 : 2;
            for (int k = 1; k <= 3; k++) {
                int idx = (SlotIndex + k * dir) % 3;
                if (_slots[idx] != null) { want = idx; break; }
            }
        }
        if (want < 0 || want > 2 || want == SlotIndex || _slots[want] == null) return;
        SlotIndex = want;
        _swapTimer = 0.35f;
        Reloading = false;
        ChargeProgress = 0f;
        _burstQueue = 0;
        _game.Audio.Reload(1);
        RefreshViewModel();
    }

    // ------------------------------------------------------------- firing
    void FireOnce(Item w) {
        var d = w.Derived;
        if (w.Ammo <= 0) return;
        w.Ammo--;

        Vector3 origin = _game.Player.Cam.transform.position;
        Vector3 aim = _game.Player.Cam.transform.forward;
        float spread = Mathf.Lerp(d.Spread, d.AdsSpread, Aiming)
                     * (_game.Player.Sprinting ? 1.6f : 1f)
                     / Mathf.Max(0.2f, Multiplier(w, MulKind.Stability));

        if (d.Projectile != null) {
            var p = d.Projectile;
            Vector3 dir = Cone(aim, spread);
            float dmg = BaseDamage(w, null);
            Projectile.Spawn(_game, origin + aim * 0.6f, dir * p.Speed, dmg, w.Element,
                             ArtLibrary.Of(w.Element), ProjectileTeam.Player,
                             p.Gravity, p.SplashRadius, p.SplashDamage * DamageScale(w, null),
                             p.Bounces, p.Fuse > 0f ? p.Fuse : -1f, 0.2f, w, "weapon");
        } else {
            int pellets = Mathf.Max(1, d.Pellets);
            int hits = 0;
            bool anyCrit = false, anyKill = false;
            for (int i = 0; i < pellets; i++) {
                if (Hitscan(w, origin, Cone(aim, spread), i, ref anyCrit, ref anyKill)) hits++;
            }
            if (hits > 0) _game.Hud.Hitmarker(anyCrit, anyKill);
            if (pellets > 1 && hits == pellets) {
                _event.Reset(_game, w);
                _event.AllPelletsHit = true;
                _event.Position = GameManager.ToCore(origin);
                var perks = w.Perks;
                for (int p = 0; p < perks.Count; p++) if (perks[p].OnHit != null) perks[p].OnHit(_event);
            }
        }

        float stability = Multiplier(w, MulKind.Stability);
        _game.Effects.Recoil.Kick(d.RecoilVertical / stability * 6f * (Aiming > 0.5f ? 0.62f : 1f),
                                  Random.Range(-1f, 1f) * d.RecoilHorizontal / stability * 6f);
        _game.Effects.CameraShake(Mathf.Clamp(d.Damage / 900f, 0.015f, 0.16f));
        _game.Audio.Fire(d.SoundFamily);
        _muzzleFlash = 0.05f;
        if (_viewModel != null) {
            _game.Effects.MuzzleFlash(_viewModel.transform.position + _viewModel.transform.forward * 0.55f,
                                      ArtLibrary.Of(w.Element));
        }
    }

    bool Hitscan(Item w, Vector3 origin, Vector3 dir, int pelletIndex, ref bool anyCrit, ref bool anyKill) {
        var d = w.Derived;
        float maxRange = Mathf.Max(d.RangeMax * 1.6f, 120f);

        Enemy best = null;
        float bestDist = maxRange;
        bool crit = false;
        var enemies = _game.Enemies;
        for (int i = 0; i < enemies.Count; i++) {
            var e = enemies[i];
            if (e == null || !e.Alive) continue;
            float dist; bool headshot;
            if (!EnemyRayHit(origin, dir, bestDist, e, out dist, out headshot)) continue;
            if (dist < bestDist) { bestDist = dist; best = e; crit = headshot; }
        }

        // WorldMask excludes units, so a hit here is a wall in front of the target.
        RaycastHit wall;
        if (Physics.Raycast(origin, dir, out wall, bestDist, _game.WorldMask)) {
            if (pelletIndex < 3) {
                _game.Effects.Impact(wall.point, wall.normal, new Color(0.9f, 0.85f, 0.75f), 5);
                _game.Effects.Tracer(origin, wall.point, ArtLibrary.Of(w.Element));
            }
            return false;
        }
        if (best == null) {
            if (pelletIndex < 2) _game.Effects.Tracer(origin, origin + dir * 60f, ArtLibrary.Of(w.Element));
            return false;
        }

        Vector3 point = origin + dir * bestDist;
        if (pelletIndex < 3) _game.Effects.Tracer(origin, point, ArtLibrary.Of(w.Element));

        float dmg = BaseDamage(w, best);
        if (bestDist > d.RangeMin) {
            float t = Mathf.Clamp01((bestDist - d.RangeMin) / Mathf.Max(1f, d.RangeMax - d.RangeMin));
            dmg *= Mathf.Lerp(1f, d.FalloffFloor, t);
        }
        if (crit) dmg *= d.CritMultiplier * Multiplier(w, MulKind.Crit, best);

        var result = _game.DamageEnemy(best, dmg, w.Element, point, crit, "weapon");
        anyCrit |= crit;
        anyKill |= result.Killed;

        _event.Reset(_game, w);
        _event.Target = best;
        _event.Position = GameManager.ToCore(point);
        _event.Crit = crit;
        _event.Damage = dmg;
        _event.PelletIndex = pelletIndex;
        var perks = w.Perks;
        for (int i = 0; i < perks.Count; i++) {
            var p = perks[i];
            if (p.OnHit != null) p.OnHit(_event);
            if (crit && p.OnPrecisionHit != null) p.OnPrecisionHit(_event);
            if (result.Killed) {
                if (p.OnKill != null) p.OnKill(_event);
                if (crit && p.OnPrecisionKill != null) p.OnPrecisionKill(_event);
            }
        }
        return true;
    }

    /// <summary>Head sphere first, then a body sphere — precision must be reachable.</summary>
    static bool EnemyRayHit(Vector3 origin, Vector3 dir, float maxDist, Enemy e,
                            out float distance, out bool headshot) {
        distance = 0f; headshot = false;
        float headT = SphereHit(origin, dir, e.HeadPoint, e.Def.HeadRadius, maxDist);
        float bodyT = SphereHit(origin, dir, e.Center, Mathf.Max(e.Def.Radius, e.Def.Height * 0.32f), maxDist);
        if (headT >= 0f && (bodyT < 0f || headT <= bodyT + 0.25f)) { distance = headT; headshot = true; return true; }
        if (bodyT >= 0f) { distance = bodyT; return true; }
        return false;
    }

    static float SphereHit(Vector3 origin, Vector3 dir, Vector3 centre, float radius, float maxDist) {
        Vector3 oc = origin - centre;
        float b = Vector3.Dot(oc, dir);
        float c = Vector3.Dot(oc, oc) - radius * radius;
        float disc = b * b - c;
        if (disc < 0f) return -1f;
        float sq = Mathf.Sqrt(disc);
        float t = -b - sq;
        if (t < 0f) t = -b + sq;
        return (t < 0f || t > maxDist) ? -1f : t;
    }

    static Vector3 Cone(Vector3 dir, float spread) {
        if (spread <= 0f) return dir;
        return (dir + Random.insideUnitSphere * spread).normalized;
    }

    // ------------------------------------------------------------- damage
    enum MulKind { Damage, Crit, Reload, Stability, Handling, Range, FireRate }

    float Multiplier(Item w, MulKind kind, Enemy target = null) {
        _event.Reset(_game, w);
        _event.Target = target;
        float mul = 1f;
        var perks = w.Perks;
        for (int i = 0; i < perks.Count; i++) {
            var p = perks[i];
            System.Func<PerkEvent, float> f;
            switch (kind) {
                case MulKind.Damage: f = p.DamageMultiplier; break;
                case MulKind.Crit: f = p.CritMultiplier; break;
                case MulKind.Reload: f = p.ReloadMultiplier; break;
                case MulKind.Stability: f = p.StabilityMultiplier; break;
                case MulKind.Handling: f = p.HandlingMultiplier; break;
                case MulKind.Range: f = p.RangeMultiplier; break;
                default: f = p.FireRateMultiplier; break;
            }
            if (f != null) mul *= f(_event);
        }
        return mul;
    }

    float DamageScale(Item w, Enemy target) {
        float mul = Multiplier(w, MulKind.Damage, target);
        mul *= 1f + _game.Abilities.EmpowerBonus;
        mul *= Defs.DamageOut(_game.Player.Power, _game.ActivityPower);
        return mul;
    }

    float BaseDamage(Item w, Enemy target) => w.Derived.Damage * DamageScale(w, target);

    // ------------------------------------------------------------- reload
    void StartReload(Item w) {
        if (Reloading) return;
        Reloading = true;
        ReloadRemaining = w.Derived.ReloadTime * Multiplier(w, MulKind.Reload);
        _game.Audio.Reload(0);
    }

    void FinishReload(Item w) {
        Reloading = false;
        var d = w.Derived;
        int need = d.Magazine - w.Ammo;
        if (d.Ammo == AmmoType.Primary) {
            w.Ammo = d.Magazine;
        } else {
            int take = Mathf.Min(need, Reserve(d.Ammo));
            w.Ammo += take;
            _reserves[d.Ammo] = Reserve(d.Ammo) - take;
        }
        _event.Reset(_game, w);
        var perks = w.Perks;
        for (int i = 0; i < perks.Count; i++) if (perks[i].OnReload != null) perks[i].OnReload(_event);
        _game.Audio.Reload(1);
    }

    public void RefillMagazine(Item weapon, int rounds) {
        if (weapon == null || weapon.Derived == null) return;
        weapon.Ammo = Mathf.Min(weapon.Derived.Magazine, weapon.Ammo + rounds);
    }

    // ------------------------------------------------------------- callbacks
    public void OnKillCredit(Enemy enemy, string source) {
        var w = Current;
        if (w == null) return;
        _event.Reset(_game, w);
        _event.Target = enemy;
        _event.Position = GameManager.ToCore(enemy.Center);
        _event.Source = source;
        var perks = w.Perks;
        for (int i = 0; i < perks.Count; i++) {
            var p = perks[i];
            if (source == "melee" && p.OnMeleeKill != null) p.OnMeleeKill(_event);
            if (source == "grenade" && p.OnGrenadeKill != null) p.OnGrenadeKill(_event);
        }
    }

    public void OnProjectileImpact(Item weapon, Vector3 point, Enemy direct) {
        if (weapon == null) return;
        _event.Reset(_game, weapon);
        _event.Target = direct;
        _event.Position = GameManager.ToCore(point);
        var perks = weapon.Perks;
        for (int i = 0; i < perks.Count; i++) {
            if (perks[i].OnProjectileImpact != null) perks[i].OnProjectileImpact(_event);
        }
    }

    // ------------------------------------------------------------- view model
    void RefreshViewModel() {
        var w = Current;
        if (_viewModelFor == w) return;
        _viewModelFor = w;
        if (_viewModel != null) Destroy(_viewModel);
        _viewModel = null;
        if (w == null) return;

        var fam = Catalog.FindFamily(w.FamilyId);
        var prefab = ArtLibrary.WeaponModel(fam != null ? fam.ModelName : "WPN_AutoRifle");
        _viewModel = ArtLibrary.Spawn(prefab, Vector3.zero, Quaternion.identity,
                                      _game.Player.WeaponSocket, "MissingWeapon");
        _viewModel.transform.localPosition = Vector3.zero;
        _viewModel.transform.localRotation = Quaternion.identity;
        ArtLibrary.DressWeapon(_viewModel, w);
        // The view model must never block a shot or a wall check.
        var colliders = _viewModel.GetComponentsInChildren<Collider>();
        for (int i = 0; i < colliders.Length; i++) Destroy(colliders[i]);
        SetLayerRecursive(_viewModel, GameManager.PlayerLayer);
    }

    static void SetLayerRecursive(GameObject go, int layer) {
        go.layer = layer;
        for (int i = 0; i < go.transform.childCount; i++) {
            SetLayerRecursive(go.transform.GetChild(i).gameObject, layer);
        }
    }

    void LateUpdate() {
        if (_viewModel == null || _game == null || !_game.InActivity) return;
        // Ease the weapon toward the hip or the sights.
        Vector3 hip = new Vector3(0.26f, -0.24f, 0.52f);
        Vector3 ads = new Vector3(0f, -0.105f, 0.46f);
        float kick = Mathf.Clamp01(_muzzleFlash / 0.05f) * 0.06f;
        Vector3 target = Vector3.Lerp(hip, ads, Aiming) - Vector3.forward * kick;
        if (Reloading) target += new Vector3(0f, -0.18f, -0.05f);
        _game.Player.WeaponSocket.localPosition =
            Vector3.Lerp(_game.Player.WeaponSocket.localPosition, target, 1f - Mathf.Exp(-16f * Time.deltaTime));
    }
}
}
