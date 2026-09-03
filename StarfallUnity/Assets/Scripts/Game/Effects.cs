using System.Collections.Generic;
using UnityEngine;

namespace Starfall.Game {

/// <summary>Camera recoil and shake, sampled by the player camera each frame.</summary>
public sealed class RecoilState {
    public float Pitch, Yaw, Roll;
    float _velPitch, _velYaw, _shake, _seed;

    public RecoilState() { _seed = Random.value * 100f; }

    public void Kick(float vertical, float horizontal) {
        _velPitch -= vertical;
        _velYaw += horizontal;
    }

    public void Shake(float amount) { _shake = Mathf.Min(1.6f, _shake + amount); }

    public void Tick(float dt) {
        _velPitch = Mathf.Lerp(_velPitch, 0f, 1f - Mathf.Exp(-12f * dt));
        _velYaw = Mathf.Lerp(_velYaw, 0f, 1f - Mathf.Exp(-12f * dt));
        Pitch += _velPitch * dt;
        Yaw += _velYaw * dt;
        Pitch = Mathf.Lerp(Pitch, 0f, 1f - Mathf.Exp(-6.5f * dt));
        Yaw = Mathf.Lerp(Yaw, 0f, 1f - Mathf.Exp(-6.5f * dt));

        _shake = Mathf.Max(0f, _shake - dt * 2.4f);
        float s = _shake * _shake;
        float t = Time.time * 34f;
        Pitch += Mathf.Sin(t * 2.3f + _seed * 1.7f) * 0.8f * s;
        Yaw += Mathf.Sin(t * 1.7f + _seed) * 0.9f * s;
        Roll = Mathf.Sin(t * 1.1f + _seed * 0.7f) * 1.2f * s;
    }
}

/// <summary>
/// All visual effects, built from pooled primitives rather than particle assets.
/// Keeping them procedural means nothing to import and no prefab wiring, and the
/// pool keeps a heavy firefight from allocating.
/// </summary>
public sealed class Effects : MonoBehaviour {

    sealed class Bit {
        public Transform Tr;
        public Renderer Rend;
        public Vector3 Velocity;
        public float Life, MaxLife, StartScale;
        public float Gravity, Drag;
        public bool Active;
    }

    const int PoolSize = 420;
    readonly List<Bit> _pool = new List<Bit>();
    readonly List<TextPop> _texts = new List<TextPop>();
    Transform _root;
    GameManager _game;
    Mesh _cubeMesh;

    public RecoilState Recoil { get; private set; }

    public sealed class TextPop {
        public Vector3 Position;
        public Vector3 Velocity;
        public string Text;
        public Color Color;
        public float Life, MaxLife, Size;
    }
    public IReadOnlyList<TextPop> Texts => _texts;

    public void Bind(GameManager game) {
        _game = game;
        Recoil = new RecoilState();
        _root = new GameObject("Effects").transform;
        _root.SetParent(transform);

        // One shared cube mesh, harvested once, reused by every effect bit.
        var probe = GameObject.CreatePrimitive(PrimitiveType.Cube);
        _cubeMesh = probe.GetComponent<MeshFilter>().sharedMesh;
        Destroy(probe);

        for (int i = 0; i < PoolSize; i++) _pool.Add(NewBit());
    }

    Bit NewBit() {
        var go = new GameObject("fx");
        go.transform.SetParent(_root);
        var mf = go.AddComponent<MeshFilter>();
        mf.sharedMesh = _cubeMesh;
        var mr = go.AddComponent<MeshRenderer>();
        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        mr.receiveShadows = false;
        go.SetActive(false);
        return new Bit { Tr = go.transform, Rend = mr, Active = false };
    }

    Bit Take() {
        for (int i = 0; i < _pool.Count; i++) if (!_pool[i].Active) return _pool[i];
        return null;   // pool exhausted: drop the effect rather than allocate mid-fight
    }

    void Spawn(Vector3 pos, Vector3 vel, Color color, float scale, float life,
               float gravity = 9f, float drag = 1.8f, bool glow = true) {
        var b = Take();
        if (b == null) return;
        b.Active = true;
        b.Tr.gameObject.SetActive(true);
        b.Tr.position = pos;
        b.Tr.localScale = Vector3.one * scale;
        b.Tr.rotation = Random.rotation;
        b.Velocity = vel;
        b.Life = b.MaxLife = life;
        b.StartScale = scale;
        b.Gravity = gravity;
        b.Drag = drag;
        b.Rend.sharedMaterial = glow ? ArtLibrary.Glow(color, 2.6f) : ArtLibrary.Flat(color);
    }

    void Update() {
        float dt = Time.deltaTime;
        if (Recoil != null) Recoil.Tick(dt);

        for (int i = 0; i < _pool.Count; i++) {
            var b = _pool[i];
            if (!b.Active) continue;
            b.Life -= dt;
            if (b.Life <= 0f) {
                b.Active = false;
                b.Tr.gameObject.SetActive(false);
                continue;
            }
            float damp = Mathf.Exp(-b.Drag * dt);
            b.Velocity.x *= damp; b.Velocity.z *= damp;
            b.Velocity.y = b.Velocity.y * damp - b.Gravity * dt;
            b.Tr.position += b.Velocity * dt;
            float t = b.Life / b.MaxLife;
            b.Tr.localScale = Vector3.one * (b.StartScale * Mathf.Max(0.05f, t));
        }

        for (int i = _texts.Count - 1; i >= 0; i--) {
            var t = _texts[i];
            t.Life -= dt;
            if (t.Life <= 0f) { _texts.RemoveAt(i); continue; }
            t.Position += t.Velocity * dt;
            t.Velocity.y -= 3.4f * dt;
            t.Velocity.x *= 0.94f; t.Velocity.z *= 0.94f;
        }
    }

    // ------------------------------------------------------------- recipes
    public void CameraShake(float amount) { if (Recoil != null) Recoil.Shake(amount); }

    /// <summary>Radial spray — impacts, deaths, explosions.</summary>
    public void Burst(Vector3 pos, int count, Color color, float speed, float scale, float life) {
        for (int i = 0; i < count; i++) {
            Vector3 dir = Random.onUnitSphere;
            Spawn(pos + dir * 0.15f, dir * speed * Random.Range(0.35f, 1.1f),
                  color, scale * Random.Range(0.6f, 1.4f), life * Random.Range(0.6f, 1.3f));
        }
    }

    /// <summary>Cone of sparks along a surface normal.</summary>
    public void Impact(Vector3 pos, Vector3 normal, Color color, int count = 6) {
        for (int i = 0; i < count; i++) {
            Vector3 dir = (normal + Random.insideUnitSphere * 0.7f).normalized;
            Spawn(pos, dir * Random.Range(3f, 9f), color, 0.05f, Random.Range(0.15f, 0.35f), 14f, 3f);
        }
    }

    public void MuzzleFlash(Vector3 pos, Color color) {
        Spawn(pos, Vector3.zero, color, 0.16f, 0.06f, 0f, 0f);
    }

    public void Explosion(Vector3 pos, float radius, Color color) {
        Burst(pos, Mathf.Min(46, 14 + (int)(radius * 3f)), color, radius * 1.6f, 0.14f, 0.55f);
        Spawn(pos, Vector3.zero, color, radius * 0.55f, 0.2f, 0f, 8f);
        CameraShake(Mathf.Clamp(radius / 26f, 0.08f, 0.7f));
    }

    /// <summary>The Choralith coming apart and reassembling.</summary>
    public void DisperseBurst(Vector3 pos, Color color) {
        for (int i = 0; i < 14; i++) {
            Vector3 dir = Random.onUnitSphere;
            Spawn(pos + dir * 0.3f, dir * Random.Range(3f, 7f), color,
                  Random.Range(0.05f, 0.12f), Random.Range(0.2f, 0.4f), 3f, 4f);
        }
    }

    public void StillBurst(Vector3 pos, Color color) {
        for (int i = 0; i < 26; i++) {
            Vector3 dir = Random.onUnitSphere;
            Spawn(pos + dir * 0.6f, -dir * Random.Range(1f, 3f), color,
                  Random.Range(0.06f, 0.14f), Random.Range(0.5f, 1.0f), -1f, 1.2f);
        }
    }

    /// <summary>A short-lived beam, used for tracers and chain lightning.</summary>
    public void Tracer(Vector3 a, Vector3 b, Color color, float width = 0.03f) {
        var bit = Take();
        if (bit == null) return;
        Vector3 mid = (a + b) * 0.5f;
        float len = Vector3.Distance(a, b);
        bit.Active = true;
        bit.Tr.gameObject.SetActive(true);
        bit.Tr.position = mid;
        bit.Tr.rotation = len > 0.001f ? Quaternion.LookRotation(b - a) : Quaternion.identity;
        bit.Tr.localScale = new Vector3(width, width, len);
        bit.Velocity = Vector3.zero;
        bit.Life = bit.MaxLife = 0.05f;
        bit.StartScale = width;
        bit.Gravity = 0f; bit.Drag = 0f;
        bit.Rend.sharedMaterial = ArtLibrary.Glow(color, 3.2f);
    }

    public void Lightning(Vector3 a, Vector3 b, Color color, int segments = 5) {
        Vector3 prev = a;
        for (int i = 1; i <= segments; i++) {
            float t = i / (float)segments;
            Vector3 p = Vector3.Lerp(a, b, t) + (i == segments ? Vector3.zero : Random.insideUnitSphere * 0.55f);
            Tracer(prev, p, color, 0.045f);
            prev = p;
        }
    }

    /// <summary>Floating combat text, projected to the screen by the HUD.</summary>
    public void DamageNumber(Vector3 pos, float amount, Color color, bool crit) {
        if (_texts.Count > 80) _texts.RemoveAt(0);
        _texts.Add(new TextPop {
            Position = pos + Random.insideUnitSphere * 0.2f,
            Velocity = new Vector3(Random.Range(-0.5f, 0.5f), 2.2f, Random.Range(-0.5f, 0.5f)),
            Text = Mathf.Round(amount).ToString(),
            Color = color, Life = 1f, MaxLife = 1f, Size = crit ? 21f : 15f
        });
    }

    public void Label(Vector3 pos, string text, Color color) {
        _texts.Add(new TextPop {
            Position = pos, Velocity = Vector3.up * 1.4f, Text = text,
            Color = color, Life = 1.2f, MaxLife = 1.2f, Size = 14f
        });
    }

    public void ClearAll() {
        for (int i = 0; i < _pool.Count; i++) {
            _pool[i].Active = false;
            if (_pool[i].Tr != null) _pool[i].Tr.gameObject.SetActive(false);
        }
        _texts.Clear();
    }
}
}
