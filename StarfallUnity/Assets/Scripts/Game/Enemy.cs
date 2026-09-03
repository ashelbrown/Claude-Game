using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// One enemy unit: steering, combat AI, elemental shields, stagger and the
/// animation hookup.
///
/// Clips ship inside the FBX as takes. Rather than needing an AnimatorController
/// asset (which cannot be authored at runtime), each clip is flipped to legacy
/// and driven through the old Animation component — that keeps the whole project
/// buildable from code with no editor step.
/// </summary>
public sealed class Enemy : MonoBehaviour, ITarget {

    public EnemyDef Def { get; private set; }
    GameManager _game;
    Animation _anim;
    Transform _model;
    CharacterController _cc;

    public bool Alive { get; private set; } = true;
    public float Health, MaxHealth;
    public float Shield, MaxShield;
    public float DamageScale = 1f;

    public Vector3 Center => transform.position + Vector3.up * (Def.Height * 0.5f);
    public Vector3 HeadPoint => transform.position + Vector3.up * Def.HeadHeight;
    public Vector3 EyePoint => transform.position + Vector3.up * Def.EyeHeight;
    public Vector3 MuzzlePoint => transform.position + Vector3.up * Def.EyeHeight + transform.forward * (Def.Radius * 1.3f);

    Rank ITarget.Rank => Def.Rank;
    float ITarget.BurnRemaining => _burnRemaining;
    Vec3 ITarget.Position => GameManager.ToCore(transform.position);
    bool ITarget.Alive => Alive;

    // --- AI state
    enum State { Idle, Combat, Stagger, Dead }
    State _state = State.Idle;
    bool _aggro;
    float _attackTimer, _burstTimer;
    int _burstLeft;
    float _strafeTimer;
    int _strafeDir = 1;
    float _telegraph;
    float _meleeWindup;
    float _staggerTimer, _staggerAccum;
    float _repathTimer;
    Vector3 _goal;
    Vector3 _velocity;

    // --- status
    float _burnRemaining, _burnDps, _burnTick;
    float _weaken, _weakenTimer;
    float _suppress;
    public float LastFiredTime { get; private set; } = -99f;   // read by Polarised Sight
    public float LastHitTime { get; private set; } = -99f;

    // --- boss
    int _phaseIndex;
    public bool Immune { get; set; }
    float _slamTimer, _slamWindup;
    readonly List<Enemy> _phaseAdds = new List<Enemy>();
    public System.Action<Enemy, PhaseDef> OnPhaseChanged;

    string _currentClip = "";
    RaycastHit _losHit;

    // ------------------------------------------------------------- setup
    public void Setup(GameManager game, EnemyDef def, float healthScale, float damageScale) {
        _game = game;
        Def = def;
        DamageScale = damageScale;

        MaxHealth = def.Health * healthScale;
        Health = MaxHealth;
        MaxShield = def.Shield * healthScale;
        Shield = MaxShield;

        _cc = gameObject.AddComponent<CharacterController>();
        _cc.radius = def.Radius;
        _cc.height = def.Height;
        _cc.center = new Vector3(0f, def.Height * 0.5f, 0f);
        _cc.stepOffset = 0.6f;
        _cc.slopeLimit = 55f;

        var prefab = ArtLibrary.CharacterModel(def.ModelName);
        var go = ArtLibrary.Spawn(prefab, transform.position, transform.rotation, transform, def.ModelName);
        SetLayerRecursive(go, GameManager.UnitLayer);
        _model = go.transform;
        _model.localPosition = Vector3.zero;
        _model.localRotation = Quaternion.identity;
        ArtLibrary.DressCharacter(go, def.BodyColor, def.ArmorColor, def.AccentColor, def.EyeColor);
        SetupAnimation(go, def.ModelName);

        _slamTimer = def.SlamCooldown * 0.6f;
        _strafeTimer = Random.Range(0.6f, 2f);
        _attackTimer = Random.Range(0f, 0.6f);
        _goal = transform.position;
        Play("Idle", 0f);
    }

    static void SetLayerRecursive(GameObject go, int layer) {
        go.layer = layer;
        for (int i = 0; i < go.transform.childCount; i++) {
            SetLayerRecursive(go.transform.GetChild(i).gameObject, layer);
        }
    }

    void SetupAnimation(GameObject go, string modelName) {
        // Any Animator that came in with the FBX would need a controller asset, so
        // strip it and use the legacy path instead.
        var animator = go.GetComponent<Animator>();
        if (animator != null) Destroy(animator);

        _anim = go.GetComponent<Animation>();
        if (_anim == null) _anim = go.AddComponent<Animation>();
        _anim.playAutomatically = false;

        var clips = Resources.LoadAll<AnimationClip>("Art/Characters/" + modelName);
        for (int i = 0; i < clips.Length; i++) {
            var clip = clips[i];
            if (clip == null) continue;
            clip.legacy = true;
            string name = CleanClipName(clip.name);
            clip.wrapMode = name == "Death" ? WrapMode.ClampForever : WrapMode.Loop;
            _anim.AddClip(clip, name);
        }
    }

    /// <summary>FBX takes arrive as "ENM_Husk|Walk" or "ArmatureAction.Walk".</summary>
    static string CleanClipName(string raw) {
        if (string.IsNullOrEmpty(raw)) return "Idle";
        int bar = raw.LastIndexOf('|');
        if (bar >= 0) raw = raw.Substring(bar + 1);
        int dot = raw.LastIndexOf('.');
        if (dot >= 0 && dot < raw.Length - 1) raw = raw.Substring(dot + 1);
        return raw;
    }

    void Play(string clip, float fade = 0.18f) {
        if (_anim == null || _currentClip == clip) return;
        _currentClip = clip;
        if (fade > 0f) _anim.CrossFade(clip, fade);
        else _anim.Play(clip);
    }

    // ------------------------------------------------------------- damage
    public GameManager.DamageResult ApplyDamage(float amount, Element element, bool crit, string source) {
        var result = new GameManager.DamageResult();
        if (!Alive) return result;
        if (Immune) { result.Blocked = true; return result; }

        float dmg = amount * (1f + _weaken);

        if (Shield > 0f) {
            // Matching element shreds a shield; anything else barely dents it.
            float mult = element == Def.ShieldElement ? Defs.ShieldMatchMultiplier
                       : element == Element.Kinetic ? 1f
                       : Defs.ShieldMismatchMultiplier;
            float toShield = dmg * mult;
            if (toShield >= Shield) {
                float carry = (toShield - Shield) / Mathf.Max(mult, 0.001f);
                Shield = 0f;
                result.ShieldBroken = true;
                dmg = carry;
            } else {
                Shield -= toShield;
                dmg = 0f;
            }
        }

        float before = Health;
        Health -= dmg;
        result.Dealt = before - Mathf.Max(0f, Health);
        LastHitTime = Time.time;
        _aggro = true;

        // Enough burst damage briefly interrupts anything that is not a boss.
        _staggerAccum += (amount / MaxHealth) * Def.StaggerResistance;
        if (_staggerAccum > 0.12f && Def.Rank == Rank.Minor && _state != State.Dead) {
            _staggerAccum = 0f;
            _staggerTimer = Mathf.Min(0.55f, 0.18f + amount / MaxHealth);
            _state = State.Stagger;
        }

        if (Health <= 0f) { Die(); result.Killed = true; }
        return result;
    }

    public void ApplyBurn(float dps, float duration) {
        _burnDps = Mathf.Max(_burnDps, dps);
        _burnRemaining = Mathf.Max(_burnRemaining, duration);
    }
    public void ApplyWeaken(float amount, float duration) {
        _weaken = Mathf.Max(_weaken, amount);
        _weakenTimer = Mathf.Max(_weakenTimer, duration);
    }
    public void Suppress(float duration) => _suppress = Mathf.Max(_suppress, duration);

    void Die() {
        if (!Alive) return;
        Alive = false;
        _state = State.Dead;
        Health = 0f;
        Play("Death", 0.1f);
        if (_cc != null) _cc.enabled = false;
        Destroy(gameObject, 4f);
    }

    // ------------------------------------------------------------- tick
    public void Tick(float dt) {
        if (!Alive) return;

        if (_weakenTimer > 0f) { _weakenTimer -= dt; if (_weakenTimer <= 0f) _weaken = 0f; }
        if (_suppress > 0f) _suppress -= dt;
        if (_burnRemaining > 0f) {
            _burnRemaining -= dt;
            _burnTick -= dt;
            if (_burnTick <= 0f) {
                _burnTick = 0.4f;
                _game.DamageEnemy(this, _burnDps * 0.4f, Element.Ember, Center, false, "burn", true);
                if (!Alive) return;
            }
            if (_burnRemaining <= 0f) _burnDps = 0f;
        }

        var player = _game.Player;
        bool sees = player.Alive && player.Invisible <= 0f && !player.Stilled &&
                    Vector3.Distance(transform.position, player.transform.position) < Def.AggroRange &&
                    HasLineOfSight(player.EyePosition);
        if (sees) _aggro = true;

        if (_state == State.Stagger) {
            _staggerTimer -= dt;
            if (_staggerTimer <= 0f) _state = _aggro ? State.Combat : State.Idle;
        } else if (_suppress > 0f) {
            // suppressed: rooted and silent
        } else if (_aggro) {
            _state = State.Combat;
        }

        Steer(dt, player, sees);
        if (_state != State.Stagger && _suppress <= 0f) Attack(dt, player, sees);
        if (Def.Brain == EnemyBrain.Boss) BossTick(dt, player);
        Animate();
    }

    bool HasLineOfSight(Vector3 target) {
        Vector3 from = EyePoint;
        Vector3 to = target - from;
        float dist = to.magnitude;
        if (dist < 0.1f) return true;
        // WorldMask excludes units, so anything hit here is level geometry.
        return !Physics.Raycast(from, to / dist, out _losHit, dist - 0.4f, _game.WorldMask);
    }

    void Steer(float dt, PlayerController player, bool sees) {
        if (_state == State.Stagger || _suppress > 0f) {
            _velocity.x = Mathf.Lerp(_velocity.x, 0f, 1f - Mathf.Exp(-9f * dt));
            _velocity.z = Mathf.Lerp(_velocity.z, 0f, 1f - Mathf.Exp(-9f * dt));
            ApplyMotion(dt);
            return;
        }

        Vector3 toPlayer = player.transform.position - transform.position;
        toPlayer.y = 0f;
        float dist = Mathf.Max(0.01f, toPlayer.magnitude);
        Vector3 fwd = toPlayer / dist;
        Vector3 wish;

        if (!_aggro) {
            _repathTimer -= dt;
            if (_repathTimer <= 0f) {
                _repathTimer = Random.Range(3f, 7f);
                _goal = _game.CurrentLevel.RandomNav(_game.Rng, transform.position, 3f, 16f);
            }
            Vector3 toGoal = _goal - transform.position;
            toGoal.y = 0f;
            wish = toGoal.sqrMagnitude > 1f ? toGoal.normalized * 0.35f : Vector3.zero;
        } else if (Def.Brain == EnemyBrain.Melee) {
            wish = fwd;
            if (dist < Def.MeleeRange * 0.75f) wish *= -0.4f;
        } else {
            float preferred = Def.PreferredRange > 0f ? Def.PreferredRange : 16f;
            wish = fwd * Mathf.Clamp((dist - preferred) / 10f, -1f, 1f);
            _strafeTimer -= dt;
            if (_strafeTimer <= 0f) { _strafeTimer = Random.Range(0.9f, 2.4f); _strafeDir = -_strafeDir; }
            wish += new Vector3(-fwd.z, 0f, fwd.x) * (0.55f * _strafeDir * (sees ? 1f : 0.3f));
        }

        // avoid walking into geometry, and keep units from stacking up
        if (wish.sqrMagnitude > 0.001f) {
            wish = wish.normalized;
            float probe = 2.2f + Def.Radius;
            if (Physics.Raycast(transform.position + Vector3.up * (Def.Height * 0.5f), wish, probe, _game.WorldMask)) {
                for (int s = 0; s < 2; s++) {
                    float a = 55f * (s == 0 ? _strafeDir : -_strafeDir);
                    Vector3 alt = Quaternion.Euler(0f, a, 0f) * wish;
                    if (!Physics.Raycast(transform.position + Vector3.up * (Def.Height * 0.5f), alt, probe, _game.WorldMask)) {
                        wish = alt; break;
                    }
                }
            }
            Vector3 separation = Vector3.zero;
            var enemies = _game.Enemies;
            for (int i = 0; i < enemies.Count; i++) {
                var o = enemies[i];
                if (o == null || o == this || !o.Alive) continue;
                Vector3 d = transform.position - o.transform.position;
                d.y = 0f;
                float want = (Def.Radius + o.Def.Radius) * 1.5f;
                float len = d.magnitude;
                if (len < want && len > 0.01f) separation += (d / len) * (1f - len / want);
            }
            wish = (wish + separation * 1.4f).normalized;
        }

        float speed = Def.Speed * (_weaken > 0f ? 0.85f : 1f);
        Vector3 target = wish * speed;
        float accel = Def.Acceleration * dt / Mathf.Max(speed, 0.01f);
        _velocity.x = Mathf.Lerp(_velocity.x, target.x, Mathf.Clamp01(accel));
        _velocity.z = Mathf.Lerp(_velocity.z, target.z, Mathf.Clamp01(accel));
        ApplyMotion(dt);

        Vector3 face = _aggro ? fwd : new Vector3(_velocity.x, 0f, _velocity.z);
        if (face.sqrMagnitude > 0.01f) {
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(face.normalized),
                                                  1f - Mathf.Exp(-(_aggro ? 9f : 3f) * dt));
        }
    }

    void ApplyMotion(float dt) {
        if (_cc == null || !_cc.enabled) return;
        _velocity.y = _cc.isGrounded ? -2f : _velocity.y - 26f * dt;
        _cc.Move(_velocity * dt);
    }

    void Animate() {
        if (!Alive) return;
        float speed = new Vector2(_velocity.x, _velocity.z).magnitude;
        if (_meleeWindup > 0f || _telegraph > 0f) Play("Attack");
        else if (speed > Def.Speed * 0.65f) Play("Run");
        else if (speed > 0.6f) Play("Walk");
        else Play("Idle");
    }

    // ------------------------------------------------------------- attacks
    void Attack(float dt, PlayerController player, bool sees) {
        if (!_aggro) return;
        _attackTimer -= dt;

        if (Def.Brain == EnemyBrain.Melee) {
            float dist = Vector3.Distance(transform.position, player.transform.position);
            if (_meleeWindup > 0f) {
                _meleeWindup -= dt;
                if (_meleeWindup <= 0f) {
                    if (Vector3.Distance(transform.position, player.transform.position) < Def.MeleeRange * 1.35f) {
                        player.TakeDamage(Def.MeleeDamage * DamageScale, transform.position, "melee");
                    }
                    _game.Effects.Burst(MuzzlePoint, 6, Def.AccentColor, 5f, 0.07f, 0.25f);
                }
            } else if (dist < Def.MeleeRange && _attackTimer <= 0f) {
                _attackTimer = Def.MeleeInterval + Def.MeleeWindup;
                _meleeWindup = Def.MeleeWindup;
                Play("Attack", 0.06f);
            }
            return;
        }

        if (!sees) return;

        if (Def.Brain == EnemyBrain.Sniper) {
            if (_telegraph > 0f) {
                _telegraph -= dt;
                _game.Effects.Tracer(MuzzlePoint, player.EyePosition, new Color(1f, 0.3f, 0.25f), 0.015f);
                if (_telegraph <= 0f) {
                    Hitscan(player);
                    _attackTimer = Def.FireInterval;
                }
            } else if (_attackTimer <= 0f) {
                _telegraph = Def.TelegraphTime;
                _game.Audio.Warn();
            }
            return;
        }

        if (_burstLeft > 0) {
            _burstTimer -= dt;
            if (_burstTimer <= 0f) {
                _burstLeft--;
                _burstTimer = Def.BurstInterval;
                FireProjectile(player);
            }
            return;
        }
        if (_attackTimer <= 0f && Vector3.Distance(transform.position, player.transform.position) < Def.WeaponRange) {
            _attackTimer = Def.FireInterval;
            _burstLeft = Mathf.Max(1, Def.BurstCount);
            _burstTimer = 0f;
        }
    }

    void FireProjectile(PlayerController player) {
        Vector3 from = MuzzlePoint;
        Vector3 dir = (player.EyePosition - from).normalized;
        dir = (dir + Random.insideUnitSphere * Def.Spread).normalized;
        Projectile.Spawn(_game, from, dir * Def.ProjectileSpeed, Def.WeaponDamage * DamageScale,
                         Element.Ember, Def.AccentColor, ProjectileTeam.Enemy);
        _game.Effects.MuzzleFlash(from, Def.AccentColor);
        _game.Audio.Fire("smg", from);
        LastFiredTime = Time.time;
    }

    void Hitscan(PlayerController player) {
        Vector3 from = MuzzlePoint;
        Vector3 to = player.EyePosition;
        float dist = Vector3.Distance(from, to);
        RaycastHit hit;
        bool blocked = Physics.Raycast(from, (to - from).normalized, out hit, dist - 0.3f, _game.WorldMask);
        _game.Effects.Tracer(from, blocked ? hit.point : to, new Color(1f, 0.35f, 0.3f), 0.05f);
        if (!blocked) player.TakeDamage(Def.WeaponDamage * DamageScale, from, "sniper");
        _game.Audio.Fire("sniper", from);
        LastFiredTime = Time.time;
    }

    // ------------------------------------------------------------- boss
    void BossTick(float dt, PlayerController player) {
        if (Def.Phases != null && _phaseIndex < Def.Phases.Length) {
            var next = Def.Phases[_phaseIndex];
            if (Health / MaxHealth <= next.AtHealthFraction) {
                _phaseIndex++;
                EnterPhase(next);
            }
        }
        if (Immune && _phaseAdds.Count > 0) {
            bool anyAlive = false;
            for (int i = 0; i < _phaseAdds.Count; i++) {
                if (_phaseAdds[i] != null && _phaseAdds[i].Alive) { anyAlive = true; break; }
            }
            if (!anyAlive) {
                Immune = false;
                _phaseAdds.Clear();
                _game.Hud.Banner("BARRIER DOWN", "DAMAGE THE BOSS");
                _game.Audio.Objective();
            }
        }

        if (Def.SlamRadius > 0f) {
            _slamTimer -= dt;
            if (_slamWindup > 0f) {
                _slamWindup -= dt;
                if (_slamWindup <= 0f) {
                    _game.Explode(transform.position, Def.SlamRadius, Def.SlamDamage * DamageScale,
                                  Element.Kinetic, "slam", true);
                    _game.Effects.CameraShake(0.9f);
                }
            } else if (_slamTimer <= 0f &&
                       Vector3.Distance(transform.position, player.transform.position) < Def.SlamRadius * 1.4f) {
                _slamTimer = Def.SlamCooldown;
                _slamWindup = Def.SlamWindup;
                _game.Audio.Warn();
                _game.Effects.Burst(transform.position, 20, new Color(1f, 0.4f, 0.2f), 6f, 0.12f, Def.SlamWindup);
            }
        }
    }

    void EnterPhase(PhaseDef phase) {
        _phaseAdds.Clear();
        if (!string.IsNullOrEmpty(phase.Shout)) {
            _game.Hud.Banner(phase.Shout, "");
            _game.Audio.Warn();
        }
        if (phase.Adds != null) {
            var region = _game.CurrentLevel.Regions[_game.CurrentLevel.Regions.Count - 1];
            for (int i = 0; i < phase.Adds.Length; i++) {
                var pos = _game.CurrentLevel.RandomNav(_game.Rng, region.Center, 6f, region.Radius * 0.8f, region);
                var add = _game.SpawnEnemy(phase.Adds[i], pos);
                if (add != null) _phaseAdds.Add(add);
            }
        }
        Immune = phase.ImmuneUntilAddsDead;
        if (OnPhaseChanged != null) OnPhaseChanged(this, phase);
    }
}
}
