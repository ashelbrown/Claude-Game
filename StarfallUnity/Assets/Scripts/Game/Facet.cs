using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// A shed facet: a piece of the player fighting on its own.
///
/// This is the species' defining mechanic — while it is detached the player is
/// literally smaller, having paid maximum health for the help. Recalling it
/// returns that health plus an overshield, so Shed is a real risk/reward loop
/// rather than a free summon.
/// </summary>
public sealed class Facet : MonoBehaviour {

    GameManager _game;
    ClassAbilityDef _def;
    float _life;
    float _fireTimer;
    float _health;
    Element _element;
    Transform _visual;
    bool _isSuperFacet;
    float _orbitAngle;
    float _orbitRadius = 2.4f;

    public bool Alive { get; private set; } = true;

    public static Facet Spawn(GameManager game, Vector3 position, ClassAbilityDef def, Element element,
                              bool superFacet = false, float orbitPhase = 0f) {
        var go = new GameObject(superFacet ? "SuperFacet" : "Facet");
        go.transform.position = position;
        var f = go.AddComponent<Facet>();
        f._game = game;
        f._def = def;
        f._element = element;
        f._life = def.Duration;
        f._health = def.FacetHealth;
        f._isSuperFacet = superFacet;
        f._orbitAngle = orbitPhase;

        var prefab = ArtLibrary.PropModel("PROP_Facet");
        var model = ArtLibrary.Spawn(prefab, position, Quaternion.identity, go.transform, "Facet");
        model.transform.localPosition = Vector3.zero;
        model.transform.localScale = Vector3.one * (superFacet ? 0.8f : 1f);
        ArtLibrary.SetAllMaterials(model, ArtLibrary.Glow(ArtLibrary.Of(element), 2.2f));
        f._visual = model.transform;

        var lightGo = new GameObject("Glow");
        lightGo.transform.SetParent(go.transform);
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = ArtLibrary.Of(element);
        l.range = 9f;
        l.intensity = 2.4f;
        l.shadows = LightShadows.None;

        game.Effects.Burst(position, 16, ArtLibrary.Of(element), 5f, 0.09f, 0.4f);
        return f;
    }

    void Update() {
        if (!Alive) return;
        float dt = Time.deltaTime;
        _life -= dt;
        if (_life <= 0f) { Expire(); return; }

        var player = _game.Player;

        if (_isSuperFacet) {
            // Super facets orbit the player and fire constantly.
            _orbitAngle += dt * 1.6f;
            Vector3 orbit = player.transform.position + Vector3.up * 1.7f +
                            new Vector3(Mathf.Cos(_orbitAngle), 0f, Mathf.Sin(_orbitAngle)) * _orbitRadius;
            transform.position = Vector3.Lerp(transform.position, orbit, 1f - Mathf.Exp(-8f * dt));
        } else {
            // A shed facet holds position near where it was thrown, drifting a little.
            transform.position += Vector3.up * Mathf.Sin(Time.time * 2.2f) * dt * 0.3f;
        }

        if (_visual != null) _visual.Rotate(0f, 120f * dt, 0f);

        _fireTimer -= dt;
        if (_fireTimer > 0f) return;

        var target = _game.NearestEnemy(transform.position, _def.FacetRange);
        if (target == null) return;
        _fireTimer = _def.FacetFireRate;

        Vector3 dir = (target.Center - transform.position).normalized;
        Projectile.Spawn(_game, transform.position + dir * 0.3f, dir * 46f,
                         _def.FacetDamage * _game.EnemyHealthScale * (_isSuperFacet ? 2.6f : 1f),
                         _element, ArtLibrary.Of(_element), ProjectileTeam.Player,
                         0f, _isSuperFacet ? 3.2f : 0f, _isSuperFacet ? _def.FacetDamage * 1.4f : 0f,
                         0, -1f, 0.12f, null, "facet");
        _game.Effects.MuzzleFlash(transform.position, ArtLibrary.Of(_element));
    }

    public void TakeDamage(float amount) {
        _health -= amount;
        if (_health <= 0f) Expire();
    }

    /// <summary>Reabsorbed deliberately: the player gets the health back, plus a shield.</summary>
    public void Recall() {
        if (!Alive) return;
        Alive = false;
        _game.Effects.Burst(transform.position, 18, ArtLibrary.Of(_element), 6f, 0.09f, 0.45f);
        _game.Audio.Shed();
        Destroy(gameObject);
    }

    void Expire() {
        if (!Alive) return;
        Alive = false;
        _game.Effects.Burst(transform.position, 12, ArtLibrary.Of(_element), 4f, 0.08f, 0.4f);
        Destroy(gameObject);
    }
}
}
