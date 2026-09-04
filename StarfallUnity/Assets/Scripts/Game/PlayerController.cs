using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// The Choralith. Movement, camera, vitals and the two species traits that
/// replace a conventional jump and death: Disperse (fragment and reform) and
/// Stilling (cryptobiosis instead of dying).
/// </summary>
[RequireComponent(typeof(CharacterController))]
public sealed class PlayerController : MonoBehaviour {

    // ------------------------------------------------------------- tuning
    const float Gravity = 26f;
    const float StandEyeHeight = 1.62f;
    const float CrouchEyeHeight = 1.05f;
    const float SlideEyeHeight = 0.85f;
    const float SprintMultiplier = 1.42f;
    const float CrouchMultiplier = 0.52f;
    const float SlideMultiplier = 1.9f;
    const float AirControl = 0.28f;

    // ------------------------------------------------------------- wiring
    CharacterController _cc;
    public Camera Cam { get; private set; }
    public Transform WeaponSocket { get; private set; }
    GameManager _game;

    // ------------------------------------------------------------- state
    public float Yaw, Pitch;
    public bool Alive { get; private set; } = true;
    public bool Sprinting { get; private set; }
    public bool Crouching { get; private set; }
    public bool Sliding { get; private set; }

    Vector3 _velocity;
    float _eyeHeight = StandEyeHeight;
    float _slideTimer;
    float _bobDistance;
    float _stepTimer;

    // --- Jump, then Disperse: tapping again in mid-air spends a charge to
    // fragment and reform. The species trait becomes the air move rather than
    // replacing the jump outright, which reads far better in the hand.
    public bool CanJump => _cc != null && (_cc.isGrounded || _coyote > 0f);
    float _coyote;
    const float CoyoteTime = 0.12f;

    public int DisperseCharges { get; private set; }
    public int MaxDisperseCharges { get; private set; } = 2;
    float _disperseRecharge;
    public float DisperseCooldown { get; private set; } = 3.2f;

    // --- vitals
    public float Health, MaxHealth = 100f;
    public float Shield, MaxShield = 100f;
    public float Overshield;
    float _shieldDelay = 6f, _healthDelay = 9f, _shieldRegen = 60f, _healthRegen = 14f;
    float _regenTimer;

    // --- Stilling: lethal damage suspends the colony instead of ending it
    public bool Stilled { get; private set; }
    float _stillTimer;
    float _stillCooldown;
    public const float StillDuration = 3f;
    public const float StillCooldownSeconds = 75f;

    // --- misc combat state
    public float Invulnerable;
    public float Invisible;
    public float LastDamageTime = -99f;
    public float LastKillTime = -99f;
    public float DamageResist;
    public int Power = Defs.StartPower;
    public int[] Stats = new int[Defs.StatCount];

    public float CombatSeconds { get; private set; }
    public Vector3 EyePosition => transform.position + Vector3.up * _eyeHeight;
    public Vector3 Forward => Cam != null ? Cam.transform.forward : transform.forward;
    public float HealthFraction => (Health + Shield) / Mathf.Max(1f, MaxHealth + MaxShield);

    // ------------------------------------------------------------- setup
    public void Bind(GameManager game) {
        _game = game;
        _cc = GetComponent<CharacterController>();
        _cc.radius = 0.4f;
        _cc.height = 1.8f;
        _cc.center = new Vector3(0f, 0.9f, 0f);
        _cc.slopeLimit = 52f;
        _cc.stepOffset = 0.55f;     // matches the stepped ramps the level builder emits
        _cc.skinWidth = 0.04f;

        var camGo = new GameObject("PlayerCamera");
        camGo.transform.SetParent(transform);
        Cam = camGo.AddComponent<Camera>();
        Cam.nearClipPlane = 0.05f;
        Cam.farClipPlane = 800f;
        Cam.fieldOfView = 62f;
        camGo.AddComponent<AudioListener>();

        WeaponSocket = new GameObject("WeaponSocket").transform;
        WeaponSocket.SetParent(camGo.transform);
        WeaponSocket.localPosition = new Vector3(0.26f, -0.24f, 0.52f);
        WeaponSocket.localRotation = Quaternion.identity;

        DisperseCharges = MaxDisperseCharges;
    }

    /// <summary>Recompute every derived number from the equipped loadout.</summary>
    public void ApplyLoadout(int power, int[] stats, ClassDef cls) {
        Power = power;
        Stats = stats;
        int res = Defs.Tier(stats[(int)StatId.Resilience]);
        int rec = Defs.Tier(stats[(int)StatId.Recovery]);
        int mob = Defs.Tier(stats[(int)StatId.Mobility]);

        MaxHealth = 130f + res * 7.0f;
        MaxShield = 115f + res * 6.0f;
        _shieldDelay = 6.0f - rec * 0.26f;
        _healthDelay = _shieldDelay + 3.2f;
        _shieldRegen = 52f + rec * 7.5f;
        _healthRegen = 12f + rec * 2.4f;
        MoveSpeed = cls.MoveSpeed * (0.93f + mob * 0.015f);
        JumpPower = cls.JumpPower * (0.96f + mob * 0.008f);
        MaxDisperseCharges = cls.Jumps;
        DisperseCooldown = 3.4f - mob * 0.12f;

        Health = Mathf.Min(Health <= 0f ? MaxHealth : Health, MaxHealth);
        Shield = Mathf.Min(Shield <= 0f ? MaxShield : Shield, MaxShield);
    }

    public float MoveSpeed = 5.9f;
    public float JumpPower = 7.9f;

    public void Respawn(Vector3 position, float yaw) {
        _cc.enabled = false;
        transform.position = position + Vector3.up * 0.2f;
        _cc.enabled = true;
        Yaw = yaw; Pitch = 0f;
        _velocity = Vector3.zero;
        Alive = true;
        Stilled = false;
        Health = MaxHealth; Shield = MaxShield; Overshield = 0f;
        Invulnerable = 1.2f;
        DisperseCharges = MaxDisperseCharges;
        _regenTimer = 0f;
    }

    // ------------------------------------------------------------- frame
    public void Tick(float dt, InputState input, bool acceptInput) {
        Invulnerable = Mathf.Max(0f, Invulnerable - dt);
        Invisible = Mathf.Max(0f, Invisible - dt);
        _stillCooldown = Mathf.Max(0f, _stillCooldown - dt);
        CombatSeconds = (Time.time - Mathf.Max(LastDamageTime, LastKillTime)) < 5f
            ? CombatSeconds + dt : 0f;

        if (Stilled) { TickStilled(dt); return; }
        if (!Alive) return;

        if (acceptInput) Look(dt, input);
        Move(dt, input, acceptInput);
        Vitals(dt);
        UpdateCamera(dt);
    }

    void Look(float dt, InputState input) {
        Yaw += input.LookX;
        Pitch = Mathf.Clamp(Pitch - input.LookY, -87f, 87f);
        transform.rotation = Quaternion.Euler(0f, Yaw, 0f);
    }

    void Move(float dt, InputState input, bool acceptInput) {
        Vector2 wish = acceptInput ? input.Move : Vector2.zero;
        if (wish.sqrMagnitude > 1f) wish = wish.normalized;

        bool grounded = _cc.isGrounded;
        Sprinting = acceptInput && input.Sprint && wish.y > 0.3f && grounded && !input.Aim;

        // Slide: crouching out of a sprint converts speed into a low, fast slide.
        float planarSpeed = new Vector2(_velocity.x, _velocity.z).magnitude;
        if (acceptInput && input.Crouch && !Crouching && grounded &&
            planarSpeed > MoveSpeed * 1.05f && _slideTimer <= 0f) {
            Sliding = true;
            _slideTimer = 0.72f;
        }
        Crouching = acceptInput && input.Crouch;
        if (Sliding) {
            _slideTimer -= dt;
            if (_slideTimer <= 0f || !grounded) Sliding = false;
        }

        float speed = MoveSpeed;
        if (Sprinting) speed *= SprintMultiplier;
        if (Crouching && !Sliding) speed *= CrouchMultiplier;
        if (Sliding) speed *= SlideMultiplier;
        if (input.Aim) speed *= 0.62f;

        Vector3 wishWorld = transform.right * wish.x + transform.forward * wish.y;
        Vector3 target = wishWorld * speed;
        float control = grounded ? (Sliding ? 1.6f : 14f) : AirControl * 14f;
        _velocity.x = Mathf.Lerp(_velocity.x, target.x, 1f - Mathf.Exp(-control * dt));
        _velocity.z = Mathf.Lerp(_velocity.z, target.z, 1f - Mathf.Exp(-control * dt));

        // Disperse charges recover on their own cooldown, independent of jumping.
        if (DisperseCharges < MaxDisperseCharges) {
            _disperseRecharge -= dt;
            if (_disperseRecharge <= 0f) {
                DisperseCharges++;
                _disperseRecharge = DisperseCooldown;
            }
        }
        // Grounded (or just barely airborne) taps jump; anything later Disperses.
        _coyote = grounded ? CoyoteTime : Mathf.Max(0f, _coyote - dt);
        if (acceptInput && input.JumpPressed) {
            if (grounded || _coyote > 0f) Jump();
            else if (DisperseCharges > 0) Disperse(wishWorld);
        }

        if (grounded && _velocity.y < 0f && _jumpGrace <= 0f) _velocity.y = -2f;
        _jumpGrace = Mathf.Max(0f, _jumpGrace - dt);
        _velocity.y -= Gravity * dt;
        if (_velocity.y < -55f) _velocity.y = -55f;

        _cc.Move(_velocity * dt);

        _bobDistance += new Vector2(_velocity.x, _velocity.z).magnitude * dt;
        if (grounded && new Vector2(_velocity.x, _velocity.z).magnitude > 1.5f) {
            _stepTimer -= dt * new Vector2(_velocity.x, _velocity.z).magnitude;
            if (_stepTimer <= 0f) { _stepTimer = 3.4f; _game.Audio.Footstep(); }
        }

        // Never fall out of the level.
        if (transform.position.y < -40f) {
            Respawn(_game.CurrentLevel.PlayerSpawn, Yaw);
            TakeDamage(40f, transform.position, "fall");
        }
    }

    float _jumpGrace;

    void Jump() {
        _velocity.y = JumpPower;
        _coyote = 0f;
        // Stop the grounded check from immediately clamping velocity back down.
        _jumpGrace = 0.1f;
        Sliding = false;
        _game.Audio.Jump();
    }

    /// <summary>
    /// Fragment and reform a short distance away. Directional, and the air move
    /// rather than the jump — you do not arc, you relocate.
    /// </summary>
    void Disperse(Vector3 wishWorld) {
        DisperseCharges--;
        _disperseRecharge = DisperseCooldown;

        Vector3 dir = wishWorld.sqrMagnitude > 0.01f ? wishWorld.normalized : transform.forward;
        const float distance = 6.5f;

        // Stop short of geometry rather than clipping through it.
        Vector3 origin = transform.position + Vector3.up * 0.9f;
        RaycastHit hit;
        float travel = distance;
        if (Physics.Raycast(origin, dir, out hit, distance + 0.6f, _game.WorldMask))
            travel = Mathf.Max(0f, hit.distance - 0.7f);

        _game.Effects.DisperseBurst(transform.position + Vector3.up * 0.9f, _game.ElementColor);
        _cc.Move(dir * travel + Vector3.up * 0.35f);
        _game.Effects.DisperseBurst(transform.position + Vector3.up * 0.9f, _game.ElementColor);
        _game.Audio.Disperse();

        _velocity.x = dir.x * MoveSpeed * 1.1f;
        _velocity.z = dir.z * MoveSpeed * 1.1f;
        _velocity.y = Mathf.Max(_velocity.y, 2.2f);
        Invulnerable = Mathf.Max(Invulnerable, 0.12f);
    }

    void UpdateCamera(float dt) {
        float wishEye = Sliding ? SlideEyeHeight : (Crouching ? CrouchEyeHeight : StandEyeHeight);
        _eyeHeight = Mathf.Lerp(_eyeHeight, wishEye, 1f - Mathf.Exp(-12f * dt));

        float speedFrac = Mathf.Clamp01(new Vector2(_velocity.x, _velocity.z).magnitude / Mathf.Max(1f, MoveSpeed));
        float bob = Mathf.Sin(_bobDistance * 2.4f) * 0.035f * speedFrac * (_cc.isGrounded ? 1f : 0.2f);

        Cam.transform.localPosition = new Vector3(0f, _eyeHeight + bob, 0f);
        Cam.transform.localRotation = Quaternion.Euler(Pitch + _game.Recoil.Pitch, _game.Recoil.Yaw, _game.Recoil.Roll);
    }

    // ------------------------------------------------------------- vitals
    void Vitals(float dt) {
        _regenTimer += dt;
        if (Overshield > 0f) Overshield = Mathf.Max(0f, Overshield - dt * 6f);

        if (_regenTimer > _shieldDelay && Shield < MaxShield) {
            bool wasEmpty = Shield <= 0f;
            Shield = Mathf.Min(MaxShield, Shield + _shieldRegen * dt);
            if (wasEmpty && Shield > 0f) _game.Audio.ShieldUp();
        }
        if (_regenTimer > _healthDelay && Health < MaxHealth) {
            Health = Mathf.Min(MaxHealth, Health + _healthRegen * dt);
        }
    }

    /// <summary>Returns the damage actually taken after every mitigation.</summary>
    public float TakeDamage(float amount, Vector3 from, string source) {
        if (!Alive || Stilled || Invulnerable > 0f) return 0f;

        float dmg = amount * Defs.DamageIn(Power, _game.ActivityPower) * (1f - DamageResist);
        if (dmg <= 0f) return 0f;

        float remaining = dmg;
        if (Overshield > 0f) {
            float used = Mathf.Min(Overshield, remaining);
            Overshield -= used; remaining -= used;
        }
        bool hadShield = Shield > 0f;
        if (remaining > 0f && Shield > 0f) {
            float used = Mathf.Min(Shield, remaining);
            Shield -= used; remaining -= used;
            if (hadShield && Shield <= 0f) _game.Audio.ShieldDown();
        }
        if (remaining > 0f) Health -= remaining;

        _regenTimer = 0f;
        LastDamageTime = Time.time;
        _game.Audio.Hurt(Mathf.Clamp01(dmg / 60f));
        _game.Hud.FlashDamage(DamageAngle(from), Mathf.Clamp01(dmg / 70f));
        _game.Effects.CameraShake(Mathf.Clamp(dmg / 90f, 0.05f, 0.5f));

        if (Health <= 0f) {
            Health = 0f;
            if (CanStill()) EnterStilling();
            else Die();
        }
        return dmg;
    }

    float DamageAngle(Vector3 from) {
        Vector3 d = from - transform.position;
        float world = Mathf.Atan2(d.x, d.z) * Mathf.Rad2Deg;
        return Mathf.DeltaAngle(Yaw, world);
    }

    // ------------------------------------------------------------- stilling
    bool CanStill() => _stillCooldown <= 0f;

    /// <summary>
    /// Cryptobiosis. The colony halts rather than dies: untouchable and unable to
    /// act, then it gets back up. This is the species trait, not a subclass perk.
    /// </summary>
    void EnterStilling() {
        Stilled = true;
        _stillTimer = StillDuration;
        _stillCooldown = StillCooldownSeconds;
        Health = 1f; Shield = 0f;
        _velocity = Vector3.zero;
        _game.Audio.Still();
        _game.Hud.Banner("STILLED", "CRYPTOBIOSIS");
        _game.Effects.StillBurst(transform.position + Vector3.up, _game.ElementColor);
    }

    void TickStilled(float dt) {
        _stillTimer -= dt;
        _velocity.y -= Gravity * dt;
        _cc.Move(new Vector3(0f, _velocity.y, 0f) * dt);
        if (_stillTimer <= 0f) {
            Stilled = false;
            Health = MaxHealth * 0.35f;
            Shield = 0f;
            _regenTimer = 0f;
            Invulnerable = 1f;
            _game.Audio.Revive();
            _game.Hud.Banner("QUORUM RESTORED", "");
        }
    }

    void Die() {
        Alive = false;
        _game.Audio.Die();
        _game.Effects.CameraShake(1f);
        _game.OnPlayerDied();
    }

    // ------------------------------------------------------------- helpers
    public void Heal(float amount) {
        if (!Alive) return;
        float overflow = amount - (MaxHealth - Health);
        Health = Mathf.Min(MaxHealth, Health + amount);
        if (overflow > 0f) Shield = Mathf.Min(MaxShield, Shield + overflow);
    }

    public void AddOvershield(float amount) => Overshield = Mathf.Min(320f, Overshield + amount);
    public void Cloak(float seconds) => Invisible = Mathf.Max(Invisible, seconds);

    /// <summary>Shed costs real maximum health while a facet is detached.</summary>
    public void ApplyHealthPenalty(float fraction) {
        MaxHealth *= (1f - fraction);
        Health = Mathf.Min(Health, MaxHealth);
    }

    public void RemoveHealthPenalty(float fraction) {
        MaxHealth /= (1f - fraction);
    }
}

/// <summary>One frame of player intent, read once and passed down.</summary>
public struct InputState {
    public Vector2 Move;
    public float LookX, LookY;
    public bool Sprint, Crouch, Aim, Fire, FirePressed, ReloadPressed, JumpPressed;
    public bool GrenadePressed, MeleePressed, ClassPressed, SuperPressed;
    public int SlotPressed;      // 1-3, 0 for none
    public float ScrollDelta;
}
}
