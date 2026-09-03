using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public enum AreaKind { Burn, Vortex, Singularity, Pulse, LongStill }

/// <summary>
/// A lingering zone: burn pools, vortex wells, singularities and the Long Still
/// field. Ticks damage on an interval rather than per frame so the numbers stay
/// legible and frame-rate independent.
/// </summary>
public sealed class AreaEffect : MonoBehaviour {

    GameManager _game;
    AreaKind _kind;
    float _radius, _life, _maxLife, _dps, _tickInterval, _tick, _pull;
    Element _element;
    int _pulsesLeft;
    float _pulseInterval, _pulseTimer, _pulseDamage;
    Transform _visual;

    public static AreaEffect Spawn(GameManager game, Vector3 position, AreaKind kind, float radius,
                                   float duration, float dps, Element element,
                                   float pull = 0f, int pulses = 0, float pulseInterval = 0.5f,
                                   float pulseDamage = 0f) {
        var go = new GameObject("Area_" + kind);
        go.transform.position = position;
        var a = go.AddComponent<AreaEffect>();
        a._game = game;
        a._kind = kind;
        a._radius = radius;
        a._life = a._maxLife = duration;
        a._dps = dps;
        a._tickInterval = 0.35f;
        a._element = element;
        a._pull = pull;
        a._pulsesLeft = pulses;
        a._pulseInterval = pulseInterval;
        a._pulseDamage = pulseDamage;

        var visual = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
        Destroy(visual.GetComponent<Collider>());
        visual.transform.SetParent(go.transform);
        visual.transform.localPosition = Vector3.up * 0.06f;
        visual.transform.localScale = new Vector3(radius * 2f, 0.04f, radius * 2f);
        visual.GetComponent<Renderer>().sharedMaterial = ArtLibrary.Glow(ArtLibrary.Of(element), 1.6f);
        a._visual = visual.transform;

        var lightGo = new GameObject("Glow");
        lightGo.transform.SetParent(go.transform);
        lightGo.transform.localPosition = Vector3.up * 1.2f;
        var l = lightGo.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = ArtLibrary.Of(element);
        l.range = radius * 2.6f;
        l.intensity = 2.2f;
        l.shadows = LightShadows.None;
        return a;
    }

    void Update() {
        float dt = Time.deltaTime;
        _life -= dt;
        if (_life <= 0f) { OnExpire(); Destroy(gameObject); return; }

        if (_visual != null) {
            float pulse = 0.85f + Mathf.Sin(Time.time * 6f) * 0.12f;
            _visual.localScale = new Vector3(_radius * 2f * pulse, 0.04f, _radius * 2f * pulse);
        }

        if (_pulsesLeft > 0) {
            _pulseTimer -= dt;
            if (_pulseTimer <= 0f) {
                _pulsesLeft--;
                _pulseTimer = _pulseInterval;
                _game.Explode(transform.position, _radius, _pulseDamage, _element, "grenade");
                if (_pulsesLeft <= 0) _life = Mathf.Min(_life, 0.25f);
            }
            return;
        }

        if (_pull > 0f) {
            var enemies = _game.Enemies;
            for (int i = 0; i < enemies.Count; i++) {
                var e = enemies[i];
                if (e == null || !e.Alive) continue;
                Vector3 to = transform.position - e.transform.position;
                to.y = 0f;
                float d = to.magnitude;
                if (d > _radius * 1.9f || d < 0.5f) continue;
                e.transform.position += to.normalized * (_pull * (1f - d / (_radius * 1.9f)) * dt);
            }
        }

        _tick -= dt;
        if (_tick > 0f) return;
        _tick = _tickInterval;
        if (_dps <= 0f) return;

        float damage = _dps * _tickInterval;
        var list = _game.Enemies;
        for (int i = 0; i < list.Count; i++) {
            var e = list[i];
            if (e == null || !e.Alive) continue;
            if (Vector3.Distance(e.Center, transform.position) > _radius + e.Def.Radius) continue;
            _game.DamageEnemy(e, damage, _element, e.Center, false, _kind.ToString().ToLowerInvariant(), true);
        }
    }

    void OnExpire() {
        if (_kind == AreaKind.Singularity) {
            _game.Explode(transform.position, _radius * 0.9f, _dps * _maxLife * 0.5f, Element.Null, "singularity");
        } else if (_kind == AreaKind.LongStill) {
            _game.Explode(transform.position, _radius, _dps * _maxLife, Element.Null, "super");
            _game.Effects.CameraShake(1.2f);
        }
    }
}
}
