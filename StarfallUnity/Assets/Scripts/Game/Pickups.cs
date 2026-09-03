using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>Ground loot: engrams the player walks over, and ammo bricks.</summary>
public sealed class Pickup : MonoBehaviour {

    GameManager _game;
    Item _item;
    AmmoType _ammo;
    bool _isAmmo;
    float _life = 90f;
    Vector3 _velocity;
    bool _grounded;
    Transform _visual;

    public static void DropEngram(GameManager game, Vector3 position, RewardTier tier) {
        var item = Loot.RollDrop(game.Rng, game.Profile.Power, tier, game.Profile.ClassId);
        var go = Make(game, position, "Engram");
        var p = go.GetComponent<Pickup>();
        p._item = item;
        p.Dress(ArtLibrary.Of(item.Rarity), 0.24f);
    }

    public static void DropAmmo(GameManager game, Vector3 position, AmmoType type) {
        var go = Make(game, position, "Ammo");
        var p = go.GetComponent<Pickup>();
        p._isAmmo = true;
        p._ammo = type;
        p._life = 45f;
        p.Dress(type == AmmoType.Heavy ? new Color(0.75f, 0.55f, 1f) : new Color(0.5f, 0.88f, 0.54f), 0.16f);
    }

    static GameObject Make(GameManager game, Vector3 position, string name) {
        var go = new GameObject(name);
        go.transform.position = position + Vector3.up * 0.4f;
        var p = go.AddComponent<Pickup>();
        p._game = game;
        p._velocity = new Vector3(Random.Range(-2f, 2f), 4f, Random.Range(-2f, 2f));
        return go;
    }

    void Dress(Color color, float scale) {
        var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
        Destroy(visual.GetComponent<Collider>());
        visual.transform.SetParent(transform);
        visual.transform.localPosition = Vector3.zero;
        visual.transform.localScale = Vector3.one * scale;
        visual.GetComponent<Renderer>().sharedMaterial = ArtLibrary.Glow(color, 2.6f);
        _visual = visual.transform;

        var lightGo = new GameObject("Glow");
        lightGo.transform.SetParent(transform);
        lightGo.transform.localPosition = Vector3.up * 0.3f;
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = color;
        l.range = 6f;
        l.intensity = 1.6f;
        l.shadows = LightShadows.None;
    }

    void Update() {
        float dt = Time.deltaTime;
        _life -= dt;
        if (_life <= 0f) { Destroy(gameObject); return; }

        if (!_grounded) {
            _velocity.y -= 22f * dt;
            transform.position += _velocity * dt;
            RaycastHit hit;
            if (Physics.Raycast(transform.position + Vector3.up * 0.3f, Vector3.down, out hit, 0.8f, _game.WorldMask)) {
                transform.position = hit.point + Vector3.up * 0.45f;
                _grounded = true;
            }
        } else {
            transform.position += Vector3.up * Mathf.Sin(Time.time * 2f) * dt * 0.2f;
        }
        if (_visual != null) _visual.Rotate(0f, 90f * dt, 30f * dt);

        var player = _game.Player;
        if (!player.Alive) return;
        if (Vector3.Distance(transform.position, player.transform.position + Vector3.up) > 2.6f) return;

        if (_isAmmo) {
            _game.Weapons.AddReserve(_ammo, _ammo == AmmoType.Heavy ? 3 : 8);
            _game.Audio.AmmoPickup();
        } else {
            _game.GrantItem(_item);
        }
        _game.Effects.Burst(transform.position, 10, Color.white, 4f, 0.07f, 0.35f);
        Destroy(gameObject);
    }
}

public static class Pickups {
    public static void DropEngram(GameManager game, Vector3 position, RewardTier tier) =>
        Pickup.DropEngram(game, position, tier);
    public static void DropAmmo(GameManager game, Vector3 position, AmmoType type) =>
        Pickup.DropAmmo(game, position, type);
}
}
