using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public sealed class ActivityDef {
    public string Id;
    public string Name;
    public string Type;            // Patrol / Strike
    public string Description;
    public string Generator;       // "patrol" or "strike"
    public Palette Palette;
    public int Seed;
    public int Power;
    public RewardTier RewardTier;
    public int UnlockPower;
    public string BossId;
    public bool EndsOnDeath;
}

public static class Activities {

    public static readonly ActivityDef[] All = {
        new ActivityDef {
            Id = "patrol_rustline", Name = "The Rustline", Type = "Patrol",
            Description = "A stripped mining shelf the Severed have made their own. Roam, clear camps, " +
                          "and answer the beacons when they light.",
            Generator = "patrol", Palette = LevelBuilder.Rust, Seed = 20240,
            Power = 100, RewardTier = RewardTier.World, UnlockPower = 0,
        },
        new ActivityDef {
            Id = "patrol_ashfall", Name = "Ashfall Basin", Type = "Patrol",
            Description = "Something under the basin keeps waking up. The Severed dug too deep and are " +
                          "now guarding the hole they made.",
            Generator = "patrol", Palette = LevelBuilder.Ash, Seed = 55501,
            Power = 160, RewardTier = RewardTier.World, UnlockPower = 130,
        },
        new ActivityDef {
            Id = "strike_sundered", Name = "The Sundered Deep", Type = "Strike",
            Description = "Push through three holds and put Vashek down before the Kell finishes " +
                          "rebuilding his crew.",
            Generator = "strike", Palette = LevelBuilder.Steel, Seed = 8801,
            Power = 190, RewardTier = RewardTier.Powerful, UnlockPower = 0, BossId = "kell",
        },
        new ActivityDef {
            Id = "ordeal_sundered", Name = "Ordeal: The Sundered Deep", Type = "Nightfall",
            Description = "The same run at a power you have to earn. Pinnacle rewards, and no second chances.",
            Generator = "strike", Palette = LevelBuilder.Steel, Seed = 8801,
            Power = 290, RewardTier = RewardTier.Pinnacle, UnlockPower = 250, BossId = "kell",
            EndsOnDeath = true,
        },
    };

    public static ActivityDef Find(string id) {
        for (int i = 0; i < All.Length; i++) if (All[i].Id == id) return All[i];
        return null;
    }
}

/// <summary>
/// Runs an activity: what spawns, what the objective says, and when it ends.
/// Patrols keep a living population with beacons to answer; strikes gate three
/// holds behind a clear and finish on the boss.
/// </summary>
public sealed class Director {

    readonly GameManager _game;
    readonly ActivityDef _def;
    readonly Rng _rng;

    public string Objective = "";
    public string Subtitle = "";
    public Enemy Boss { get; private set; }
    public int Score { get; private set; }

    // patrol
    float _spawnTimer;
    Vector3 _beaconPosition;
    int _beaconRequired, _beaconKilled, _beaconsDone;
    bool _beaconActive;

    // strike
    int _stage;
    string _stageState = "clear";
    int _waveIndex;
    float _addTimer = 14f;

    public Director(GameManager game, ActivityDef def) {
        _game = game;
        _def = def;
        _rng = game.Rng;
    }

    public bool IsStrike => _def.Generator == "strike";

    public void Start() {
        if (IsStrike) BeginStage(0);
        else {
            SpawnGroup(10, 26f, 78f);
            NewBeacon();
            Objective = "Patrol";
        }
    }

    public void Tick(float dt) {
        if (IsStrike) TickStrike(dt); else TickPatrol(dt);
    }

    public void OnEnemyKilled(Enemy enemy) {
        Score += enemy.Def.Score;
        if (!IsStrike && _beaconActive &&
            Vector3.Distance(enemy.transform.position, _beaconPosition) < 44f) {
            _beaconKilled++;
        }
        if (enemy == Boss && IsStrike) {
            // let the death animation play before the results screen
            _game.StartCoroutine(FinishAfter(2.6f));
        }
    }

    System.Collections.IEnumerator FinishAfter(float seconds) {
        yield return new WaitForSeconds(seconds);
        _game.FinishActivity(true, "Victory");
    }

    // ------------------------------------------------------------- patrol
    void TickPatrol(float dt) {
        int alive = AliveCount();
        _spawnTimer -= dt;
        if (_spawnTimer <= 0f && alive < 16) {
            _spawnTimer = 2.4f;
            SpawnGroup(Mathf.Min(3, 16 - alive), 34f, 78f);
        }

        float distance = Vector3.Distance(_game.Player.transform.position, _beaconPosition);
        if (!_beaconActive) {
            Objective = "Patrol";
            Subtitle = "Beacon " + Mathf.RoundToInt(distance) + "m — approach to begin";
            if (distance < 22f) {
                _beaconActive = true;
                _game.Audio.Objective();
                _game.Hud.Banner("BEACON ACTIVE", "CLEAR THE AREA");
                SpawnAt(_beaconPosition, 7);
                _game.SpawnEnemy(Bestiary.RollMajor(_rng), ScatterAround(_beaconPosition));
                _game.Hud.SetWaypoint(_beaconPosition, "BEACON");
            }
            return;
        }

        Objective = "Beacon: clear hostiles";
        Subtitle = _beaconKilled + " / " + _beaconRequired;
        if (_beaconKilled < _beaconRequired) return;

        _beaconsDone++;
        _game.Audio.Objective();
        _game.Hud.Banner("BEACON SECURED", "+ REWARD");
        var tier = _beaconsDone % 3 == 0 ? RewardTier.Powerful : RewardTier.World;
        Pickups.DropEngram(_game, _beaconPosition, tier);
        Pickups.DropEngram(_game, _beaconPosition, tier);
        _game.Profile.Shards += tier == RewardTier.Powerful ? 30 : 12;
        NewBeacon();
    }

    void NewBeacon() {
        var regions = _game.CurrentLevel.Regions;
        var region = regions[_rng.RangeInt(0, regions.Count - 1)];
        _beaconPosition = _game.CurrentLevel.RandomNav(_rng, region.Center, 0f, region.Radius * 0.7f, region);
        _beaconRequired = 6 + _rng.RangeInt(0, 4);
        _beaconKilled = 0;
        _beaconActive = false;
        _game.Hud.SetWaypoint(_beaconPosition, "BEACON");
    }

    // ------------------------------------------------------------- strike
    void BeginStage(int index) {
        _stage = index;
        _waveIndex = 0;
        var regions = _game.CurrentLevel.Regions;
        if (index >= regions.Count) return;
        var region = regions[index];

        if (region.Id == "boss") {
            _stageState = "boss";
            Objective = "Defeat the boss";
            var def = Bestiary.Find(_def.BossId);
            Subtitle = def != null ? def.Name : "";
            var spawn = new Vector3(region.Center.x, region.Center.y + 0.5f, region.Center.z - 8f);
            Boss = _game.SpawnEnemy(_def.BossId, spawn);
            _game.Hud.SetBoss(Boss);
            _game.Hud.Banner((def != null ? def.Name : "BOSS").ToUpperInvariant(), "ENGAGE");
            _game.Audio.Warn();
            SpawnInRegion(region, 6);
        } else {
            _stageState = "clear";
            Objective = "Clear the hold (" + (index + 1) + "/3)";
            SpawnWave(region);
        }
        _game.Hud.SetWaypoint(region.Center, region.Id == "boss" ? "BOSS" : "ADVANCE");
    }

    void SpawnWave(Region region) {
        int count = 7 + _stage * 2 + _waveIndex * 2;
        SpawnInRegion(region, count);
        if (_waveIndex >= 1 || _stage >= 1) {
            _game.SpawnEnemy(Bestiary.RollMajor(_rng),
                             _game.CurrentLevel.RandomNav(_rng, region.Center, 10f, region.Radius, region));
        }
        _waveIndex++;
    }

    void TickStrike(float dt) {
        var regions = _game.CurrentLevel.Regions;
        if (_stage >= regions.Count) return;
        var region = regions[_stage];

        if (_stageState == "clear") {
            int inRegion = 0;
            for (int i = 0; i < _game.Enemies.Count; i++) {
                var e = _game.Enemies[i];
                if (e != null && e.Alive &&
                    Vector3.Distance(e.transform.position, region.Center) < region.Radius * 1.8f) inRegion++;
            }
            Subtitle = "Hostiles remaining: " + inRegion;
            if (inRegion > 0) return;

            if (_waveIndex < 2 + _stage) { SpawnWave(region); return; }
            _stageState = "advance";
            Objective = "Advance";
            Subtitle = "The way ahead is clear";
            _game.Hud.Banner("AREA SECURED", "ADVANCE");
            _game.Audio.Objective();
            Pickups.DropEngram(_game, _game.Player.transform.position, RewardTier.World);
            if (_stage + 1 < regions.Count) _game.Hud.SetWaypoint(regions[_stage + 1].Center, "ADVANCE");

        } else if (_stageState == "advance") {
            if (_stage + 1 >= regions.Count) return;
            var next = regions[_stage + 1];
            if (Vector3.Distance(_game.Player.transform.position, next.Center) < next.Radius * 0.85f) {
                BeginStage(_stage + 1);
            }

        } else if (_stageState == "boss") {
            if (Boss == null || !Boss.Alive) return;
            Subtitle = Boss.Immune ? "Barrier up — kill the guards" : Boss.Def.Name;
            // trickle adds so the boss room never goes quiet
            _addTimer -= dt;
            if (_addTimer <= 0f && AliveCount() < 12) {
                _addTimer = 16f;
                SpawnInRegion(region, 4);
            }
        }
    }

    // ------------------------------------------------------------- spawning
    int AliveCount() {
        int n = 0;
        for (int i = 0; i < _game.Enemies.Count; i++) {
            if (_game.Enemies[i] != null && _game.Enemies[i].Alive) n++;
        }
        return n;
    }

    void SpawnGroup(int count, float minDist, float maxDist) {
        for (int i = 0; i < count; i++) {
            var pos = _game.CurrentLevel.RandomNav(_rng, _game.Player.transform.position, minDist, maxDist);
            _game.SpawnEnemy(Bestiary.RollMinor(_rng), pos);
        }
    }

    void SpawnInRegion(Region region, int count) {
        for (int i = 0; i < count; i++) {
            var pos = _game.CurrentLevel.RandomNav(_rng, region.Center, 8f, region.Radius, region);
            _game.SpawnEnemy(Bestiary.RollMinor(_rng), pos);
        }
    }

    void SpawnAt(Vector3 centre, int count) {
        for (int i = 0; i < count; i++) _game.SpawnEnemy(Bestiary.RollMinor(_rng), ScatterAround(centre));
    }

    Vector3 ScatterAround(Vector3 centre) =>
        centre + new Vector3(_rng.Range(-6f, 6f), 0.5f, _rng.Range(-6f, 6f));
}
}
