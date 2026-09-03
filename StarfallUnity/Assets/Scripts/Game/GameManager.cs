using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public enum GameState { Title, Orbit, Playing, Paused, Results }

/// <summary>
/// The hub. Owns the services, the run state, and the combat facade that
/// weapons, abilities and perks all route through — so shields, power scaling
/// and kill credit are applied in exactly one place.
/// </summary>
public sealed class GameManager : MonoBehaviour, IPerkContext {

    // ------------------------------------------------------------- services
    public AudioSynth Audio { get; private set; }
    public Effects Effects { get; private set; }
    public Hud Hud { get; private set; }
    public MenuUI Menus { get; private set; }
    public PlayerController Player { get; private set; }
    public WeaponController Weapons { get; private set; }
    public AbilityController Abilities { get; private set; }
    public Director Director { get; private set; }
    public Profile Profile { get; private set; }

    public RecoilState Recoil => Effects.Recoil;
    public Level CurrentLevel { get; private set; }
    public readonly List<Enemy> Enemies = new List<Enemy>();

    // ------------------------------------------------------------- state
    public GameState State { get; private set; } = GameState.Title;
    public int ActivityPower { get; private set; } = Defs.StartPower;
    public float EnemyHealthScale { get; private set; } = 1f;
    public float EnemyDamageScale { get; private set; } = 1f;
    public ActivityDef Activity { get; private set; }
    public RunStats Run { get; private set; }
    public int WorldMask { get; private set; }

    Transform _levelRoot;
    Light _sun;
    Rng _rng = new Rng(20260903);
    float _respawnTimer;

    public Rng Rng => _rng;
    public SubclassDef Subclass => Catalog.FindSubclass(Profile.SubclassId);
    public ClassDef Class => Catalog.FindClass(Profile.ClassId);
    public Color ElementColor => ArtLibrary.Of(Subclass.Element);
    public bool InActivity => State == GameState.Playing || State == GameState.Paused;

    // ------------------------------------------------------------- lifecycle
    public void Boot() {
        WorldMask = ~0;

        Audio = gameObject.AddComponent<AudioSynth>();
        Audio.Bind();
        Effects = gameObject.AddComponent<Effects>();
        Effects.Bind(this);
        Hud = gameObject.AddComponent<Hud>();
        Hud.Bind(this);
        Menus = gameObject.AddComponent<MenuUI>();
        Menus.Bind(this);

        _levelRoot = new GameObject("Level").transform;

        var sunGo = new GameObject("Sun");
        _sun = sunGo.AddComponent<Light>();
        _sun.type = LightType.Directional;
        _sun.shadows = LightShadows.Soft;
        _sun.shadowStrength = 0.7f;

        var playerGo = new GameObject("Player");
        playerGo.AddComponent<CharacterController>();
        Player = playerGo.AddComponent<PlayerController>();
        Player.Bind(this);
        Weapons = playerGo.AddComponent<WeaponController>();
        Weapons.Bind(this);
        Abilities = playerGo.AddComponent<AbilityController>();
        Abilities.Bind(this);
        playerGo.SetActive(false);

        Profile = SaveSystem.Load();
        State = Profile != null ? GameState.Title : GameState.Title;
        Application.targetFrameRate = 144;
    }

    public void NewProfile(string classId) {
        Profile = SaveSystem.CreateNew(classId);
        SaveSystem.Save(Profile);
        ReturnToOrbit();
    }

    public void ContinueProfile() {
        if (Profile == null) Profile = SaveSystem.CreateNew("choralith");
        ReturnToOrbit();
    }

    public void ReturnToOrbit() {
        ClearActivity();
        State = GameState.Orbit;
        Cursor.lockState = CursorLockMode.None;
        Cursor.visible = true;
        SaveSystem.Save(Profile);
        Menus.Open(MenuScreen.Director);
    }

    void ClearActivity() {
        for (int i = Enemies.Count - 1; i >= 0; i--) if (Enemies[i] != null) Destroy(Enemies[i].gameObject);
        Enemies.Clear();
        Abilities.ClearAll();
        Effects.ClearAll();
        Hud.ClearMarkers();
        Director = null;
        Activity = null;
        if (CurrentLevel != null && CurrentLevel.Root != null) Destroy(CurrentLevel.Root.gameObject);
        CurrentLevel = null;
        Player.gameObject.SetActive(false);
    }

    public void StartActivity(string activityId) {
        var def = Activities.Find(activityId);
        if (def == null) return;
        ClearActivity();
        Activity = def;

        CurrentLevel = def.Generator == "strike"
            ? LevelBuilder.BuildStrike(_levelRoot, def.Palette, def.Seed)
            : LevelBuilder.BuildPatrol(_levelRoot, def.Palette, def.Seed);

        _sun.color = def.Palette.SunColor;
        _sun.intensity = 1.25f;
        _sun.transform.rotation = Quaternion.Euler(def.Palette.SunEuler);

        ActivityPower = def.Power;
        // Enemy health and damage barely scale with the activity: the power delta
        // is what carries difficulty, so a red-bar dies in the same burst at
        // parity whether the activity is 100 or 300.
        float t = (def.Power - Defs.StartPower) / 100f;
        EnemyHealthScale = 1f + t * 0.25f;
        EnemyDamageScale = 1f + t * 0.20f;

        var loadout = Profile.BuildLoadout();
        Player.gameObject.SetActive(true);
        Player.ApplyLoadout(loadout.Power, loadout.Stats, Class);
        Player.Respawn(CurrentLevel.PlayerSpawn, CurrentLevel.PlayerYaw);
        Weapons.EquipFrom(loadout);
        Abilities.ResetForActivity();

        Run = new RunStats { StartTime = Time.time };
        Director = new Director(this, def);
        Director.Start();

        State = GameState.Playing;
        Menus.CloseAll();
        LockCursor(true);
        Hud.Banner(def.Name.ToUpperInvariant(), def.Type.ToUpperInvariant());
        Profile.Stats.ActivitiesRun++;
        SaveSystem.Save(Profile);
    }

    public void LockCursor(bool locked) {
        Cursor.lockState = locked ? CursorLockMode.Locked : CursorLockMode.None;
        Cursor.visible = !locked;
    }

    // ------------------------------------------------------------- loop
    void Update() {
        float dt = Time.deltaTime;

        if (Input.GetKeyDown(KeyCode.Escape)) Menus.Toggle(MenuScreen.Pause);
        if (Input.GetKeyDown(KeyCode.Tab)) Menus.Toggle(MenuScreen.Character);
        if (Input.GetKeyDown(KeyCode.M)) Menus.Toggle(MenuScreen.Director);

        bool menuOpen = Menus.IsOpen;
        State = menuOpen && InActivity ? GameState.Paused
              : (InActivity ? GameState.Playing : State);

        if (!InActivity) return;

        var input = ReadInput(!menuOpen);
        Player.Tick(dt, input, !menuOpen);
        if (!menuOpen && Player.Alive && !Player.Stilled) {
            Weapons.Tick(dt, input);
            Abilities.Tick(dt, input);
        }

        for (int i = Enemies.Count - 1; i >= 0; i--) {
            var e = Enemies[i];
            if (e == null) { Enemies.RemoveAt(i); continue; }
            e.Tick(dt);
        }

        if (Director != null && !menuOpen) Director.Tick(dt);

        if (!Player.Alive) {
            _respawnTimer -= dt;
            if (_respawnTimer <= 0f && Activity != null && !Activity.EndsOnDeath) {
                var spot = CurrentLevel.RandomNav(_rng, Player.transform.position, 24f, 60f);
                Player.Respawn(spot, Player.Yaw);
                Audio.Revive();
                Hud.Banner("REVIVED", "");
            }
        }

        _autosave -= dt;
        if (_autosave <= 0f) { _autosave = 20f; SaveSystem.Save(Profile); }
    }

    float _autosave = 20f;

    InputState ReadInput(bool accept) {
        var s = new InputState();
        if (!accept) return s;
        float mx = 0f, my = 0f;
        if (Input.GetKey(KeyCode.W)) my += 1f;
        if (Input.GetKey(KeyCode.S)) my -= 1f;
        if (Input.GetKey(KeyCode.D)) mx += 1f;
        if (Input.GetKey(KeyCode.A)) mx -= 1f;
        s.Move = new Vector2(mx, my);

        float sens = Profile != null ? Profile.Settings.Sensitivity : 2.2f;
        s.LookX = Input.GetAxisRaw("Mouse X") * sens * 0.12f;
        s.LookY = Input.GetAxisRaw("Mouse Y") * sens * 0.12f * (Profile != null && Profile.Settings.InvertY ? -1f : 1f);

        s.Sprint = Input.GetKey(KeyCode.LeftShift);
        s.Crouch = Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.C);
        s.Aim = Input.GetMouseButton(1);
        s.Fire = Input.GetMouseButton(0);
        s.FirePressed = Input.GetMouseButtonDown(0);
        s.ReloadPressed = Input.GetKeyDown(KeyCode.R);
        s.JumpPressed = Input.GetKeyDown(KeyCode.Space);
        s.GrenadePressed = Input.GetKeyDown(KeyCode.Q);
        s.MeleePressed = Input.GetKeyDown(KeyCode.E);
        s.ClassPressed = Input.GetKeyDown(KeyCode.F);
        s.SuperPressed = Input.GetKeyDown(KeyCode.X);
        if (Input.GetKeyDown(KeyCode.Alpha1)) s.SlotPressed = 1;
        if (Input.GetKeyDown(KeyCode.Alpha2)) s.SlotPressed = 2;
        if (Input.GetKeyDown(KeyCode.Alpha3)) s.SlotPressed = 3;
        s.ScrollDelta = Input.mouseScrollDelta.y;
        return s;
    }

    // ------------------------------------------------------------- spawning
    public Enemy SpawnEnemy(string typeId, Vector3 position) {
        var def = Bestiary.Find(typeId);
        if (def == null) return null;
        var go = new GameObject("Enemy_" + typeId);
        go.transform.position = position;
        var e = go.AddComponent<Enemy>();
        e.Setup(this, def, EnemyHealthScale, EnemyDamageScale);
        Enemies.Add(e);
        return e;
    }

    // ------------------------------------------------------------- combat
    public struct DamageResult {
        public float Dealt;
        public bool Killed;
        public bool ShieldBroken;
        public bool Blocked;
    }

    /// <summary>
    /// The single path damage takes to an enemy. Everything — bullets, splash,
    /// burn ticks, Supers — comes through here so shields and scaling apply once.
    /// </summary>
    public DamageResult DamageEnemy(Enemy enemy, float amount, Element element, Vector3 point,
                                    bool crit = false, string source = "weapon", bool silent = false) {
        var result = new DamageResult();
        if (enemy == null || !enemy.Alive) return result;

        result = enemy.ApplyDamage(amount, element, crit, source);
        if (result.Blocked) {
            Effects.Label(enemy.HeadPoint, "IMMUNE", new Color(0.56f, 0.71f, 0.88f));
            return result;
        }

        if (Profile.Settings.ShowDamageNumbers && source != "burn") {
            Color c = crit ? new Color(1f, 0.88f, 0.54f) : ArtLibrary.Of(element);
            Effects.DamageNumber(point, result.Dealt, c, crit);
        }
        if (!silent) {
            Audio.Hit(crit);
            Effects.Impact(point, Vector3.up, ArtLibrary.Of(element), crit ? 9 : 5);
        }
        if (result.ShieldBroken) {
            Audio.ShieldBreak(point);
            Effects.Explosion(point, 3.5f, ArtLibrary.Of(enemy.Def.ShieldElement));
        }
        if (result.Killed) OnEnemyKilled(enemy, source);
        return result;
    }

    /// <summary>Radial damage with linear falloff.</summary>
    public void Explode(Vector3 position, float radius, float damage, Element element,
                        string source = "explosion", bool hitsPlayer = false) {
        Effects.Explosion(position, radius, ArtLibrary.Of(element));
        Audio.Explode(radius > 7f, position);

        if (hitsPlayer) {
            float d = Vector3.Distance(Player.transform.position + Vector3.up, position);
            if (d < radius + 0.6f) {
                Player.TakeDamage(damage * (1f - Mathf.Clamp01(d / radius) * 0.6f), position, source);
            }
            return;
        }
        for (int i = 0; i < Enemies.Count; i++) {
            var e = Enemies[i];
            if (e == null || !e.Alive) continue;
            float d = Vector3.Distance(e.Center, position);
            if (d > radius + e.Def.Radius) continue;
            float falloff = 1f - Mathf.Clamp01((d - e.Def.Radius) / radius) * 0.65f;
            DamageEnemy(e, damage * falloff, element, e.Center, false, source, true);
        }
    }

    public void OnEnemyKilled(Enemy enemy, string source) {
        Player.LastKillTime = Time.time;
        Run.Kills++;
        Profile.Stats.Kills++;
        Audio.Kill(enemy.Def.Rank != Rank.Minor);
        Effects.Burst(enemy.Center, enemy.Def.Rank == Rank.Minor ? 16 : 38,
                      enemy.Def.AccentColor, enemy.Def.Rank == Rank.Minor ? 6f : 11f, 0.11f, 0.6f);

        Abilities.OnKillCredit(enemy, source);
        Weapons.OnKillCredit(enemy, source);
        if (Director != null) Director.OnEnemyKilled(enemy);
        AddExperience(enemy.Def.Xp);

        if (enemy.Def.Rank != Rank.Minor) Hud.KillFeed(enemy.Def.Name + " defeated");

        float dropChance = enemy.Def.Rank == Rank.Minor ? 0.055f : 0.8f;
        if (_rng.Chance(dropChance)) {
            var tier = enemy.Def.Rank == Rank.Boss ? RewardTier.Powerful
                     : enemy.Def.Rank != Rank.Minor && _rng.Chance(0.3f) ? RewardTier.Powerful
                     : RewardTier.World;
            Pickups.DropEngram(this, enemy.Center, tier);
        }
        if (_rng.Chance(enemy.Def.Rank == Rank.Minor ? 0.14f : 0.9f)) {
            var type = _rng.Chance(enemy.Def.Rank == Rank.Minor ? 0.06f : 0.45f)
                ? AmmoType.Heavy : AmmoType.Special;
            Pickups.DropAmmo(this, enemy.Center, type);
        }
    }

    public void OnPlayerDied() {
        Run.Deaths++;
        Profile.Stats.Deaths++;
        _respawnTimer = 5f;
        if (Activity != null && Activity.EndsOnDeath) FinishActivity(false, "You fell");
        else Hud.Banner("YOU DIED", "REASSEMBLING");
    }

    public void FinishActivity(bool win, string verdict) {
        if (!InActivity) return;
        Run.Won = win;
        Run.Verdict = verdict;
        Run.Duration = Time.time - Run.StartTime;
        if (win && Activity.RewardTier != RewardTier.World) {
            int count = Activity.RewardTier == RewardTier.Pinnacle ? 3 : 2;
            for (int i = 0; i < count; i++) GrantItem(Loot.RollDrop(_rng, Profile.Power, Activity.RewardTier, Profile.ClassId));
        }
        State = GameState.Results;
        LockCursor(false);
        SaveSystem.Save(Profile);
        Menus.Open(MenuScreen.Results);
        if (win) Audio.LevelUp(); else Audio.Warn();
    }

    public void AddExperience(int xp) {
        Profile.Xp += xp;
        Run.Xp += xp;
        int need = Defs.XpForLevel(Profile.Level);
        while (Profile.Xp >= need) {
            Profile.Xp -= need;
            Profile.Level++;
            Profile.Shards += 40;
            Audio.LevelUp();
            Hud.Banner("LEVEL " + Profile.Level, "+40 SHARDS");
            need = Defs.XpForLevel(Profile.Level);
        }
    }

    public Item GrantItem(Item item) {
        Profile.AddItem(item);
        Run.Rewards.Add(item);
        if (item.Rarity == Rarity.Exotic) Profile.Stats.ExoticsFound++;
        Audio.Loot(item.Rarity);
        Hud.LootToast(item);
        return item;
    }

    // ------------------------------------------------------------- queries
    public Enemy NearestEnemy(Vector3 position, float maxDistance) {
        Enemy best = null;
        float bestDist = maxDistance;
        for (int i = 0; i < Enemies.Count; i++) {
            var e = Enemies[i];
            if (e == null || !e.Alive) continue;
            float d = Vector3.Distance(e.Center, position);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return best;
    }

    public List<Enemy> EnemiesInCone(Vector3 origin, Vector3 direction, float range, float minDot) {
        var outList = new List<Enemy>();
        for (int i = 0; i < Enemies.Count; i++) {
            var e = Enemies[i];
            if (e == null || !e.Alive) continue;
            Vector3 to = e.Center - origin;
            float d = to.magnitude;
            if (d > range + e.Def.Radius) continue;
            if (Vector3.Dot(to / Mathf.Max(d, 0.001f), direction) < minDot) continue;
            outList.Add(e);
        }
        return outList;
    }

    // ------------------------------------------------------------- IPerkContext
    public float Time_ => UnityEngine.Time.time;
    float IPerkContext.Time => UnityEngine.Time.time;
    float IPerkContext.DifficultyDamageScale => EnemyHealthScale;
    Vec3 IPerkContext.PlayerPosition => ToCore(Player.transform.position);
    bool IPerkContext.PlayerAiming => Weapons.Aiming > 0.5f;
    float IPerkContext.PlayerCombatSeconds => Player.CombatSeconds;
    bool IPerkContext.PlayerInvisible => Player.Invisible > 0f;

    int IPerkContext.EnemiesWithin(Vec3 position, float radius) {
        Vector3 p = ToUnity(position);
        int n = 0;
        for (int i = 0; i < Enemies.Count; i++) {
            var e = Enemies[i];
            if (e != null && e.Alive && Vector3.Distance(e.Center, p) < radius) n++;
        }
        return n;
    }

    void IPerkContext.ChargeAbility(AbilityKind kind, float fraction) => Abilities.Charge(kind, fraction);
    void IPerkContext.Explode(Vec3 position, float radius, float damage, Element element) =>
        Explode(ToUnity(position), radius, damage, element, "perk");
    void IPerkContext.ApplyBurn(ITarget target, float dps, float duration) {
        var e = target as Enemy;
        if (e != null) e.ApplyBurn(dps, duration);
    }
    void IPerkContext.ChainLightning(Vec3 from, ITarget seed, float damage, float range, int maxTargets) =>
        ChainLightning(ToUnity(from), seed as Enemy, damage, range, maxTargets);
    void IPerkContext.SpawnBurnPool(Vec3 position, float radius, float duration, float dps) =>
        Abilities.SpawnArea(ToUnity(position), AreaKind.Burn, radius, duration, dps, Element.Ember);
    void IPerkContext.SpawnSingularity(Vec3 position, float radius, float duration, float damage) =>
        Abilities.SpawnArea(ToUnity(position), AreaKind.Singularity, radius, duration, damage / duration * 1.6f, Element.Null);
    void IPerkContext.Cloak(float duration) => Player.Cloak(duration);
    void IPerkContext.BuffMelee(float multiplier, float duration) => Abilities.BuffMelee(multiplier, duration);
    void IPerkContext.RefillMagazine(Item weapon, int rounds) => Weapons.RefillMagazine(weapon, rounds);

    public void ChainLightning(Vector3 from, Enemy seed, float damage, float range, int maxTargets) {
        var hit = new HashSet<int>();
        if (seed != null) hit.Add(seed.GetInstanceID());
        Vector3 source = from;
        float dmg = damage;
        for (int i = 0; i < maxTargets; i++) {
            Enemy best = null;
            float bestDist = range;
            for (int j = 0; j < Enemies.Count; j++) {
                var e = Enemies[j];
                if (e == null || !e.Alive || hit.Contains(e.GetInstanceID())) continue;
                float d = Vector3.Distance(e.Center, source);
                if (d < bestDist) { bestDist = d; best = e; }
            }
            if (best == null) break;
            hit.Add(best.GetInstanceID());
            Effects.Lightning(source, best.Center, ArtLibrary.Of(Element.Surge));
            DamageEnemy(best, dmg, Element.Surge, best.Center, false, "chain", true);
            source = best.Center;
            dmg *= 0.75f;
        }
    }

    public static Vec3 ToCore(Vector3 v) => new Vec3(v.x, v.y, v.z);
    public static Vector3 ToUnity(Vec3 v) => new Vector3(v.X, v.Y, v.Z);
}

/// <summary>Per-run tallies, shown on the results screen.</summary>
public sealed class RunStats {
    public float StartTime;
    public float Duration;
    public int Kills, Deaths, Xp, Shards;
    public bool Won;
    public string Verdict = "";
    public readonly List<Item> Rewards = new List<Item>();
}
}
