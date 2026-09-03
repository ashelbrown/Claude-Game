using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public enum ProjectileTeam { Player, Enemy }

/// <summary>
/// A travelling shot: rockets, grenades, enemy bolts and thrown abilities.
/// Movement is swept with a raycast each step so nothing tunnels through a wall
/// at high speed, and damage routes through the GameManager facade.
/// </summary>
public sealed class Projectile : MonoBehaviour {

    GameManager _game;
    Vector3 _velocity;
    float _damage;
    Element _element;
    Color _color;
    ProjectileTeam _team;
    float _life = 8f;
    float _gravity;
    float _splashRadius, _splashDamage;
    int _bounces;
    float _fuse = -1f;
    Item _weapon;
    string _source = "projectile";
    System.Action<Vector3, Enemy> _onImpact;
    Transform _visual;
    Light _light;

    public static Projectile Spawn(GameManager game, Vector3 position, Vector3 velocity, float damage,
                                   Element element, Color color, ProjectileTeam team,
                                   float gravity = 0f, float splashRadius = 0f, float splashDamage = 0f,
                                   int bounces = 0, float fuse = -1f, float scale = 0.16f,
                                   Item weapon = null, string source = "projectile",
                                   System.Action<Vector3, Enemy> onImpact = null) {
        var go = new GameObject("Projectile");
        go.transform.position = position;
        var p = go.AddComponent<Projectile>();
        p._game = game;
        p._velocity = velocity;
        p._damage = damage;
        p._element = element;
        p._color = color;
        p._team = team;
        p._gravity = gravity;
        p._splashRadius = splashRadius;
        p._splashDamage = splashDamage;
        p._bounces = bounces;
        p._fuse = fuse;
        p._weapon = weapon;
        p._source = source;
        p._onImpact = onImpact;

        var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
        Destroy(visual.GetComponent<Collider>());
        visual.transform.SetParent(go.transform);
        visual.transform.localPosition = Vector3.zero;
        visual.transform.localScale = Vector3.one * scale;
        visual.GetComponent<Renderer>().sharedMaterial = ArtLibrary.Glow(color, 3f);
        p._visual = visual.transform;

        var lightGo = new GameObject("Glow");
        lightGo.transform.SetParent(go.transform);
        lightGo.transform.localPosition = Vector3.zero;
        p._light = lightGo.AddComponent<Light>();
        p._light.type = LightType.Point;
        p._light.color = color;
        p._light.range = 8f;
        p._light.intensity = 2f;
        p._light.shadows = LightShadows.None;
        return p;
    }

    void Update() {
        float dt = Time.deltaTime;
        _life -= dt;
        if (_fuse > 0f) {
            _fuse -= dt;
            if (_fuse <= 0f) { Detonate(transform.position, null); return; }
        }
        if (_life <= 0f) { Detonate(transform.position, null); return; }

        _velocity.y -= _gravity * dt;
        Vector3 step = _velocity * dt;
        float dist = step.magnitude;
        if (dist < 1e-5f) return;
        Vector3 dir = step / dist;

        // enemies (or the player) first, then the world
        if (_team == ProjectileTeam.Player) {
            Enemy best = null;
            float bestDist = dist + 0.3f;
            var enemies = _game.Enemies;
            for (int i = 0; i < enemies.Count; i++) {
                var e = enemies[i];
                if (e == null || !e.Alive) continue;
                float hitDist;
                if (RayHitsEnemy(transform.position, dir, bestDist, e, out hitDist) && hitDist < bestDist) {
                    bestDist = hitDist; best = e;
                }
            }
            if (best != null) {
                Vector3 point = transform.position + dir * bestDist;
                _game.DamageEnemy(best, _damage, _element, point, false, _source);
                Detonate(point, best);
                return;
            }
        } else {
            float toPlayer = DistanceToPlayerHit(transform.position, dir, dist + 0.3f);
            if (toPlayer >= 0f) {
                Vector3 point = transform.position + dir * toPlayer;
                _game.Player.TakeDamage(_damage, transform.position, _source);
                Detonate(point, null);
                return;
            }
        }

        RaycastHit hit;
        if (Physics.Raycast(transform.position, dir, out hit, dist + 0.1f, _game.WorldMask)) {
            if (_bounces > 0) {
                _bounces--;
                _velocity = Vector3.Reflect(_velocity, hit.normal) * 0.55f;
                transform.position = hit.point + hit.normal * 0.1f;
                _game.Audio.Ricochet(hit.point);
                return;
            }
            Detonate(hit.point, null);
            return;
        }

        transform.position += step;
        if (_visual != null) _visual.Rotate(180f * dt, 140f * dt, 0f);
    }

    /// <summary>Approximate the enemy as a capsule-ish sphere pair for the sweep.</summary>
    static bool RayHitsEnemy(Vector3 origin, Vector3 dir, float maxDist, Enemy e, out float distance) {
        distance = 0f;
        Vector3 centre = e.Center;
        float radius = Mathf.Max(e.Def.Radius, e.Def.Height * 0.35f);
        Vector3 oc = origin - centre;
        float b = Vector3.Dot(oc, dir);
        float c = Vector3.Dot(oc, oc) - radius * radius;
        float disc = b * b - c;
        if (disc < 0f) return false;
        float sq = Mathf.Sqrt(disc);
        float t = -b - sq;
        if (t < 0f) t = -b + sq;
        if (t < 0f || t > maxDist) return false;
        distance = t;
        return true;
    }

    float DistanceToPlayerHit(Vector3 origin, Vector3 dir, float maxDist) {
        var p = _game.Player;
        if (!p.Alive) return -1f;
        float d;
        Vector3 centre = p.transform.position + Vector3.up * 0.9f;
        Vector3 oc = origin - centre;
        float b = Vector3.Dot(oc, dir);
        float c = Vector3.Dot(oc, oc) - 0.55f * 0.55f;
        float disc = b * b - c;
        if (disc < 0f) return -1f;
        float sq = Mathf.Sqrt(disc);
        d = -b - sq;
        if (d < 0f) d = -b + sq;
        return (d < 0f || d > maxDist) ? -1f : d;
    }

    void Detonate(Vector3 point, Enemy direct) {
        if (_onImpact != null) _onImpact(point, direct);
        if (_splashRadius > 0f) {
            _game.Explode(point, _splashRadius, _splashDamage, _element, _source,
                          _team == ProjectileTeam.Enemy);
        } else {
            _game.Effects.Burst(point, 8, _color, 5f, 0.07f, 0.3f);
        }
        if (_weapon != null) _game.Weapons.OnProjectileImpact(_weapon, point, direct);
        Destroy(gameObject);
    }
}
}
