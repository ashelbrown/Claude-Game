using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public sealed class Palette {
    public Color Floor, Wall, Trim, Glow;
    public Color[] Debris;
    public Color SunColor, FogColor, AmbientSky, AmbientEquator, AmbientGround;
    public float FogDensity;
    public Vector3 SunEuler;
}

public sealed class Region {
    public string Id;
    public Vector3 Center;
    public float Radius;
}

/// <summary>A generated zone: geometry, walkable sample points and spawn data.</summary>
public sealed class Level {
    public Transform Root;
    public Vector3 PlayerSpawn;
    public float PlayerYaw;
    public Bounds Bounds;
    public readonly List<Region> Regions = new List<Region>();
    public readonly List<Vector3> NavPoints = new List<Vector3>();
    public Palette Palette;

    /// <summary>A walkable point, optionally constrained by distance and region.</summary>
    public Vector3 RandomNav(Rng rng, Vector3 near, float minDist, float maxDist, Region region = null) {
        Vector3 fallback = PlayerSpawn;
        if (NavPoints.Count == 0) return fallback;
        for (int attempt = 0; attempt < 48; attempt++) {
            var p = NavPoints[rng.RangeInt(0, NavPoints.Count - 1)];
            if (region != null) {
                float rd = Vector3.Distance(new Vector3(p.x, region.Center.y, p.z), region.Center);
                if (rd > region.Radius) continue;
            }
            float d = Vector3.Distance(new Vector3(p.x, near.y, p.z), near);
            if (d < minDist || d > maxDist) { fallback = p; continue; }
            return p;
        }
        return fallback;
    }
}

/// <summary>
/// Builds zones out of boxes. Everything is generated, so a zone is defined by a
/// seed rather than an authored scene — but the shapes come from a kit of
/// hand-tuned structures (buildings, stepped ramps, towers, catwalks) so the
/// result reads as a place rather than as noise.
/// </summary>
public static class LevelBuilder {

    public static readonly Palette Rust = new Palette {
        Floor = new Color(0.20f, 0.17f, 0.15f), Wall = new Color(0.30f, 0.25f, 0.22f),
        Trim = new Color(0.40f, 0.33f, 0.28f), Glow = new Color(1.0f, 0.55f, 0.22f),
        Debris = new[] { new Color(0.26f, 0.22f, 0.20f), new Color(0.33f, 0.27f, 0.23f),
                         new Color(0.22f, 0.20f, 0.20f), new Color(0.38f, 0.30f, 0.22f) },
        SunColor = new Color(1.00f, 0.78f, 0.55f), FogColor = new Color(0.24f, 0.16f, 0.14f),
        AmbientSky = new Color(0.36f, 0.30f, 0.32f), AmbientEquator = new Color(0.22f, 0.18f, 0.18f),
        AmbientGround = new Color(0.12f, 0.10f, 0.12f),
        FogDensity = 0.0075f, SunEuler = new Vector3(28f, 140f, 0f),
    };

    public static readonly Palette Ash = new Palette {
        Floor = new Color(0.17f, 0.18f, 0.24f), Wall = new Color(0.17f, 0.18f, 0.24f),
        Trim = new Color(0.24f, 0.25f, 0.33f), Glow = new Color(0.62f, 0.40f, 1.0f),
        Debris = new[] { new Color(0.16f, 0.17f, 0.22f), new Color(0.20f, 0.21f, 0.27f),
                         new Color(0.12f, 0.13f, 0.18f), new Color(0.24f, 0.22f, 0.30f) },
        SunColor = new Color(0.62f, 0.56f, 0.95f), FogColor = new Color(0.08f, 0.08f, 0.15f),
        AmbientSky = new Color(0.26f, 0.27f, 0.42f), AmbientEquator = new Color(0.14f, 0.15f, 0.24f),
        AmbientGround = new Color(0.06f, 0.06f, 0.10f),
        FogDensity = 0.013f, SunEuler = new Vector3(22f, -40f, 0f),
    };

    public static readonly Palette Steel = new Palette {
        Floor = new Color(0.16f, 0.18f, 0.21f), Wall = new Color(0.21f, 0.24f, 0.28f),
        Trim = new Color(0.30f, 0.34f, 0.40f), Glow = new Color(0.35f, 0.85f, 1.0f),
        Debris = new[] { new Color(0.19f, 0.21f, 0.25f), new Color(0.24f, 0.27f, 0.32f),
                         new Color(0.15f, 0.17f, 0.21f), new Color(0.28f, 0.31f, 0.36f) },
        SunColor = new Color(0.90f, 0.95f, 1.10f), FogColor = new Color(0.09f, 0.12f, 0.18f),
        AmbientSky = new Color(0.30f, 0.36f, 0.50f), AmbientEquator = new Color(0.18f, 0.21f, 0.28f),
        AmbientGround = new Color(0.07f, 0.08f, 0.11f),
        FogDensity = 0.009f, SunEuler = new Vector3(40f, 25f, 0f),
    };

    // ------------------------------------------------------------- primitives
    static Transform _root;
    static Palette _pal;
    static Rng _rng;

    static GameObject Box(Vector3 center, Vector3 size, Color color, float yaw = 0f, bool solid = true) {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.transform.SetParent(_root);
        go.transform.position = center;
        go.transform.localScale = size;
        if (yaw != 0f) go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
        go.GetComponent<Renderer>().sharedMaterial = ArtLibrary.Flat(color, 0.05f, 0.18f);
        if (!solid) {
            var col = go.GetComponent<Collider>();
            if (col != null) Object.Destroy(col);
        }
        go.isStatic = true;
        return go;
    }

    static GameObject GlowBox(Vector3 center, Vector3 size, Color color, float yaw = 0f) {
        var go = Box(center, size, color, yaw, false);
        go.GetComponent<Renderer>().sharedMaterial = ArtLibrary.Glow(color, 2.0f);
        return go;
    }

    /// <summary>Box specified by opposite corners, which is how walls read naturally.</summary>
    static GameObject Span(float x0, float y0, float z0, float x1, float y1, float z1, Color c) {
        return Box(new Vector3((x0 + x1) * 0.5f, (y0 + y1) * 0.5f, (z0 + z1) * 0.5f),
                   new Vector3(Mathf.Abs(x1 - x0), Mathf.Abs(y1 - y0), Mathf.Abs(z1 - z0)), c);
    }

    static void PointLight(Vector3 pos, Color color, float range, float intensity) {
        var go = new GameObject("Light");
        go.transform.SetParent(_root);
        go.transform.position = pos;
        var l = go.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = color;
        l.range = range;
        l.intensity = intensity;
        l.shadows = LightShadows.None;
    }

    // ------------------------------------------------------------- kit
    /// <summary>Stepped ramp — walkable by the CharacterController's step offset.</summary>
    static void Ramp(Vector3 from, Vector3 to, float topY, float width, Color c) {
        Vector3 d = to - from;
        float len = new Vector2(d.x, d.z).magnitude;
        int steps = Mathf.Max(3, Mathf.CeilToInt(len / 0.9f));
        for (int i = 0; i < steps; i++) {
            float t1 = (i + 1) / (float)steps;
            Vector3 a = from + d * (i / (float)steps);
            Vector3 b = from + d * t1;
            float h = Mathf.Lerp(0.02f, topY, t1);
            Vector3 mid = (a + b) * 0.5f;
            float sx = Mathf.Abs(b.x - a.x) + width * Mathf.Abs(d.normalized.z) + 0.25f;
            float sz = Mathf.Abs(b.z - a.z) + width * Mathf.Abs(d.normalized.x) + 0.25f;
            Box(new Vector3(mid.x, h * 0.5f, mid.z), new Vector3(sx, h, sz), c);
        }
    }

    /// <summary>Hollow building with a doorway and a walkable roof.</summary>
    static float Building(float cx, float cz, float w, float d, float h, int doorSide) {
        const float t = 0.4f;
        float x0 = cx - w * 0.5f, x1 = cx + w * 0.5f;
        float z0 = cz - d * 0.5f, z1 = cz + d * 0.5f;
        float doorW = Mathf.Min(2.6f, Mathf.Min(w, d) * 0.45f);

        // walls, one of which is broken by a doorway
        for (int side = 0; side < 4; side++) {
            bool hasDoor = side == doorSide;
            bool horizontal = side < 2;
            float a0 = horizontal ? x0 : z0, a1 = horizontal ? x1 : z1;
            float fixedLo = horizontal ? (side == 0 ? z0 - t : z1) : (side == 2 ? x0 - t : x1);
            float fixedHi = fixedLo + t;
            if (!hasDoor) {
                if (horizontal) Span(a0, 0, fixedLo, a1, h, fixedHi, _pal.Wall);
                else Span(fixedLo, 0, a0, fixedHi, h, a1, _pal.Wall);
                continue;
            }
            float mid = (a0 + a1) * 0.5f;
            if (horizontal) {
                Span(a0, 0, fixedLo, mid - doorW * 0.5f, h, fixedHi, _pal.Wall);
                Span(mid + doorW * 0.5f, 0, fixedLo, a1, h, fixedHi, _pal.Wall);
                Span(mid - doorW * 0.5f, 2.6f, fixedLo, mid + doorW * 0.5f, h, fixedHi, _pal.Wall);
            } else {
                Span(fixedLo, 0, a0, fixedHi, h, mid - doorW * 0.5f, _pal.Wall);
                Span(fixedLo, 0, mid + doorW * 0.5f, fixedHi, h, a1, _pal.Wall);
                Span(fixedLo, 2.6f, mid - doorW * 0.5f, fixedHi, h, mid + doorW * 0.5f, _pal.Wall);
            }
        }

        float roofY = h + 0.35f;
        Span(x0 - t, h, z0 - t, x1 + t, roofY, z1 + t, _pal.Trim);
        const float parapet = 0.55f;
        Span(x0 - t, roofY, z0 - t, x1 + t, roofY + parapet, z0, _pal.Trim);
        Span(x0 - t, roofY, z1, x1 + t, roofY + parapet, z1 + t, _pal.Trim);
        Span(x0 - t, roofY, z0, x0, roofY + parapet, z1, _pal.Trim);
        Span(x1, roofY, z0, x1 + t, roofY + parapet, z1, _pal.Trim);

        GlowBox(new Vector3(cx - w * 0.2f, h * 0.6f, z0 - t - 0.06f),
                new Vector3(w * 0.3f, 0.14f, 0.06f), _pal.Glow);
        PointLight(new Vector3(cx, h * 0.6f + 1.4f, cz - d * 0.5f - 1f), _pal.Glow, 12f, 1.6f);
        return roofY;
    }

    static float Tower(float cx, float cz, float r, float h) {
        Box(new Vector3(cx, h * 0.5f, cz), new Vector3(r * 2f, h, r * 2f), _pal.Wall);
        Box(new Vector3(cx, h + 0.25f, cz), new Vector3(r * 2f + 1f, 0.5f, r * 2f + 1f), _pal.Trim);
        GlowBox(new Vector3(cx, h + 0.9f, cz), new Vector3(0.6f, 1.3f, 0.6f), _pal.Glow);
        PointLight(new Vector3(cx, h + 1.4f, cz), _pal.Glow, 20f, 2.2f);
        return h + 0.5f;
    }

    static void Catwalk(Vector3 a, Vector3 b, float y, float width) {
        Vector3 d = b - a;
        Vector3 n = new Vector3(d.x, 0f, d.z).normalized;
        Vector3 mid = (a + b) * 0.5f;
        float sx = Mathf.Abs(d.x) + Mathf.Abs(n.z) * width + 0.4f;
        float sz = Mathf.Abs(d.z) + Mathf.Abs(n.x) * width + 0.4f;
        Box(new Vector3(mid.x, y, mid.z), new Vector3(sx, 0.44f, sz), _pal.Trim);
        Vector3 side = new Vector3(-n.z, 0f, n.x) * (width * 0.5f);
        for (int s = -1; s <= 1; s += 2) {
            GlowBox(new Vector3(mid.x + side.x * s, y + 0.62f, mid.z + side.z * s),
                    new Vector3(Mathf.Abs(d.x) + 0.3f, 0.16f, Mathf.Abs(d.z) + 0.3f), _pal.Glow);
        }
    }

    static void Debris(float cx, float cz, float radius, int count) {
        for (int i = 0; i < count; i++) {
            float a = _rng.Range(0f, Mathf.PI * 2f);
            float dist = Mathf.Sqrt(_rng.Value) * radius;
            float w = _rng.Range(0.7f, 1.9f), h = _rng.Range(0.6f, 1.7f), d = _rng.Range(0.7f, 1.9f);
            Box(new Vector3(cx + Mathf.Cos(a) * dist, h * 0.5f, cz + Mathf.Sin(a) * dist),
                new Vector3(w, h, d), _rng.Pick(_pal.Debris), _rng.Range(0f, 180f));
        }
    }

    static void Arch(float cx, float cz, float span, float h, float yawDeg) {
        float rad = yawDeg * Mathf.Deg2Rad;
        float c = Mathf.Cos(rad), s = Mathf.Sin(rad);
        for (int sgn = -1; sgn <= 1; sgn += 2) {
            Box(new Vector3(cx + c * span * 0.5f * sgn, h * 0.5f, cz - s * span * 0.5f * sgn),
                new Vector3(1.2f, h, 1.2f), _pal.Wall, yawDeg);
        }
        Box(new Vector3(cx, h + 0.4f, cz),
            new Vector3(Mathf.Abs(c) * (span + 1.2f) + 1.2f, 0.8f, Mathf.Abs(s) * (span + 1.2f) + 1.2f),
            _pal.Trim, yawDeg);
        GlowBox(new Vector3(cx, h + 0.05f, cz),
                new Vector3(Mathf.Abs(c) * span + 0.4f, 0.2f, Mathf.Abs(s) * span + 0.4f), _pal.Glow, yawDeg);
        PointLight(new Vector3(cx, h - 0.5f, cz), _pal.Glow, 16f, 1.6f);
    }

    /// <summary>Raised crater rim cut by four ramps — elevation without a hole in the floor.</summary>
    static void Bowl(float cx, float cz, float r, float height) {
        const int segs = 28;
        var gaps = new HashSet<int> { 0, 7, 14, 21 };
        for (int i = 0; i < segs; i++) {
            if (gaps.Contains(i)) continue;
            float a0 = (i / (float)segs) * Mathf.PI * 2f;
            float a1 = ((i + 1) / (float)segs) * Mathf.PI * 2f;
            float am = (a0 + a1) * 0.5f;
            float arc = (Mathf.PI * 2f * r) / segs;
            float h = height * (0.75f + 0.25f * Mathf.Sin(i * 1.7f));
            Box(new Vector3(cx + Mathf.Cos(am) * r, h * 0.5f, cz + Mathf.Sin(am) * r),
                new Vector3(arc * 1.24f, h, 4.8f), _pal.Wall, -am * Mathf.Rad2Deg);
        }
        foreach (int gi in gaps) {
            float a = ((gi + 0.5f) / segs) * Mathf.PI * 2f;
            Ramp(new Vector3(cx + Mathf.Cos(a) * (r + 6f), 0f, cz + Mathf.Sin(a) * (r + 6f)),
                 new Vector3(cx + Mathf.Cos(a) * (r - 1f), 0f, cz + Mathf.Sin(a) * (r - 1f)),
                 height * 0.55f, 3.4f, _pal.Trim);
        }
        Box(new Vector3(cx, 0.35f, cz), new Vector3(r * 0.84f, 0.7f, r * 0.84f), _pal.Trim);
        PointLight(new Vector3(cx, height + 2.5f, cz), _pal.Glow, 26f, 2.0f);
    }

    static void Perimeter(float x0, float z0, float x1, float z1, float h) {
        const float t = 2.5f;
        Span(x0 - t, 0, z0 - t, x1 + t, h, z0, _pal.Wall);
        Span(x0 - t, 0, z1, x1 + t, h, z1 + t, _pal.Wall);
        Span(x0 - t, 0, z0, x0, h, z1, _pal.Wall);
        Span(x1, 0, z0, x1 + t, h, z1, _pal.Wall);
    }

    // ------------------------------------------------------------- zones
    public static Level BuildPatrol(Transform parent, Palette palette, int seed) {
        var level = Begin(parent, palette, seed, "Zone_Patrol");
        const float S = 78f;
        level.Bounds = new Bounds(Vector3.zero, new Vector3(S * 2f, 40f, S * 2f));

        Span(-S - 6, -1.5f, -S - 6, S + 6, 0f, S + 6, _pal.Floor);
        Perimeter(-S, -S, S, S, 16f);

        Bowl(0f, 0f, 17f, 4.5f);
        Arch(0f, -20f, 14f, 8f, 0f);
        Arch(0f, 20f, 14f, 8f, 0f);

        const int ring = 7;
        for (int i = 0; i < ring; i++) {
            float a = (i / (float)ring) * Mathf.PI * 2f + _rng.Range(-0.15f, 0.15f);
            float dist = _rng.Range(36f, 60f);
            float x = Mathf.Cos(a) * dist, z = Mathf.Sin(a) * dist;
            float w = _rng.Range(9f, 16f), d = _rng.Range(9f, 16f), h = _rng.Range(5f, 10f);
            float roof = Building(x, z, w, d, h, _rng.RangeInt(0, 3));
            if (_rng.Chance(0.55f)) {
                Ramp(new Vector3(x + w * 0.5f + 5f, 0f, z), new Vector3(x + w * 0.5f + 0.6f, 0f, z),
                     roof, 2.6f, _pal.Trim);
            }
            Debris(x + _rng.Range(-10f, 10f), z + _rng.Range(-10f, 10f), 7f, _rng.RangeInt(3, 7));
        }

        for (int i = 0; i < 4; i++) {
            float a = (i / 4f) * Mathf.PI * 2f + 0.4f;
            const float dist = 26f;
            float tx = Mathf.Cos(a) * dist, tz = Mathf.Sin(a) * dist;
            float top = Tower(tx, tz, 2.2f, _rng.Range(9f, 13f));
            Ramp(new Vector3(Mathf.Cos(a) * (dist + 9f), 0f, Mathf.Sin(a) * (dist + 9f)),
                 new Vector3(Mathf.Cos(a) * (dist + 2.6f), 0f, Mathf.Sin(a) * (dist + 2.6f)),
                 top, 2.4f, _pal.Trim);
        }

        for (int i = 0; i < 22; i++) {
            Debris(_rng.Range(-S + 10f, S - 10f), _rng.Range(-S + 10f, S - 10f),
                   _rng.Range(3f, 8f), _rng.RangeInt(2, 6));
        }

        level.PlayerSpawn = new Vector3(0f, 1.2f, S - 16f);
        level.PlayerYaw = 180f;
        level.Regions.Add(new Region { Id = "north", Center = new Vector3(0, 0, -48), Radius = 32 });
        level.Regions.Add(new Region { Id = "east", Center = new Vector3(48, 0, 0), Radius = 32 });
        level.Regions.Add(new Region { Id = "south", Center = new Vector3(0, 0, 48), Radius = 32 });
        level.Regions.Add(new Region { Id = "west", Center = new Vector3(-48, 0, 0), Radius = 32 });
        level.Regions.Add(new Region { Id = "centre", Center = Vector3.zero, Radius = 24 });
        return Finish(level);
    }

    public static Level BuildStrike(Transform parent, Palette palette, int seed) {
        var level = Begin(parent, palette, seed, "Zone_Strike");
        level.Bounds = new Bounds(new Vector3(0, 0, -57), new Vector3(92, 40, 206));

        Span(-52, -1.5f, -170, 52, 0f, 52, _pal.Floor);
        Perimeter(-46, -160, 46, 46, 18f);

        BuildArena(0f, 20f, 0);
        BuildArena(0f, -40f, 1);
        BuildArena(0f, -100f, 2);
        Choke(-8f);
        Choke(-68f);

        // boss chamber
        Span(-46, 0, -160, 46, 20, -152, _pal.Wall);
        for (int sgn = -1; sgn <= 1; sgn += 2) {
            Building(sgn * 32f, -138f, 10f, 12f, 7f, sgn > 0 ? 2 : 3);
            Ramp(new Vector3(sgn * 24f, 0, -128f), new Vector3(sgn * 30f, 0, -134f), 7.35f, 2.6f, _pal.Trim);
        }
        Catwalk(new Vector3(-32, 0, -138), new Vector3(32, 0, -138), 7.6f, 3.2f);
        Debris(0f, -135f, 22f, 18);
        Arch(0f, -118f, 26f, 11f, 0f);
        PointLight(new Vector3(0, 12, -138), _pal.Glow, 48f, 2.4f);

        level.PlayerSpawn = new Vector3(0f, 1.2f, 38f);
        level.PlayerYaw = 180f;
        level.Regions.Add(new Region { Id = "arena1", Center = new Vector3(0, 0, 20), Radius = 30 });
        level.Regions.Add(new Region { Id = "arena2", Center = new Vector3(0, 0, -40), Radius = 30 });
        level.Regions.Add(new Region { Id = "arena3", Center = new Vector3(0, 0, -100), Radius = 32 });
        level.Regions.Add(new Region { Id = "boss", Center = new Vector3(0, 0, -136), Radius = 34 });
        return Finish(level);
    }

    static void BuildArena(float cx, float cz, int style) {
        if (style == 0) {
            for (int i = 0; i < 5; i++) {
                float a = (i / 5f) * Mathf.PI * 2f;
                Building(cx + Mathf.Cos(a) * 22f, cz + Mathf.Sin(a) * 20f,
                         _rng.Range(7f, 11f), _rng.Range(7f, 11f), _rng.Range(4.5f, 8f), _rng.RangeInt(0, 3));
            }
            Debris(cx, cz, 16f, 16);
        } else if (style == 1) {
            Bowl(cx, cz, 13f, 3.6f);
            for (int sgn = -1; sgn <= 1; sgn += 2) {
                float top = Tower(cx + sgn * 28f, cz - 10f, 2.0f, 9f);
                Ramp(new Vector3(cx + sgn * 22f, 0, cz - 2f), new Vector3(cx + sgn * 26f, 0, cz - 9f),
                     top, 2.4f, _pal.Trim);
            }
            Catwalk(new Vector3(cx - 28f, 0, cz - 10f), new Vector3(cx + 28f, 0, cz - 10f), 9.5f, 3f);
            Debris(cx, cz + 14f, 12f, 10);
        } else {
            for (int i = 0; i < 7; i++) {
                float h = _rng.Range(2f, 5f);
                Box(new Vector3(cx + _rng.Range(-34f, 34f), h, cz + _rng.Range(-18f, 18f)),
                    new Vector3(_rng.Range(2.4f, 6f), h * 2f, _rng.Range(2.4f, 6f)),
                    _pal.Wall, _rng.Range(0f, 180f));
            }
            Debris(cx, cz, 20f, 20);
        }
        PointLight(new Vector3(cx, 10f, cz), _pal.Glow, 44f, 1.4f);
    }

    /// <summary>Narrow the corridor between arenas so fights stay contained.</summary>
    static void Choke(float cz) {
        Span(-46, 0, cz - 3, -13, 12, cz + 3, _pal.Wall);
        Span(13, 0, cz - 3, 46, 12, cz + 3, _pal.Wall);
        Arch(0f, cz, 22f, 9f, 0f);
    }

    // ------------------------------------------------------------- lifecycle
    static Level Begin(Transform parent, Palette palette, int seed, string name) {
        var go = new GameObject(name);
        go.transform.SetParent(parent);
        _root = go.transform;
        _pal = palette;
        _rng = new Rng(seed);
        return new Level { Root = _root, Palette = palette };
    }

    static Level Finish(Level level) {
        ApplyEnvironment(level.Palette);
        SampleNav(level);
        return level;
    }

    public static void ApplyEnvironment(Palette p) {
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = p.FogColor;
        RenderSettings.fogDensity = p.FogDensity;
        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = p.AmbientSky;
        RenderSettings.ambientEquatorColor = p.AmbientEquator;
        RenderSettings.ambientGroundColor = p.AmbientGround;
    }

    /// <summary>
    /// Sample walkable ground on a grid by raycasting down. Used for spawning and
    /// for AI repositioning — cheaper and more predictable than a navmesh bake,
    /// and it needs no editor step.
    /// </summary>
    static void SampleNav(Level level) {
        const float step = 4f;
        var b = level.Bounds;
        for (float x = b.min.x + 4f; x <= b.max.x - 4f; x += step) {
            for (float z = b.min.z + 4f; z <= b.max.z - 4f; z += step) {
                RaycastHit hit;
                if (!Physics.Raycast(new Vector3(x, 60f, z), Vector3.down, out hit, 120f)) continue;
                if (hit.point.y < -6f || hit.point.y > 26f) continue;
                // reject points with no headroom — inside geometry, not on top of it
                if (Physics.Raycast(hit.point + Vector3.up * 0.4f, Vector3.up, 1.8f)) continue;
                level.NavPoints.Add(hit.point + Vector3.up * 0.1f);
            }
        }
    }
}
}
