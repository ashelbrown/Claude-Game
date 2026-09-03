using System;
using System.Collections.Generic;

namespace Starfall.Core {

/// <summary>
/// Deterministic 32-bit PRNG (mulberry32). Seeded generation matters here: a
/// zone with a given seed must lay out identically every visit, and loot rolls
/// need to be reproducible in tests.
/// </summary>
public sealed class Rng {
    uint _state;

    public Rng(int seed) { _state = unchecked((uint)seed); }
    public Rng() : this(Environment.TickCount) { }

    /// <summary>Uniform float in [0,1).</summary>
    public float Value {
        get {
            unchecked {
                _state += 0x6D2B79F5u;
                uint t = _state;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return ((t ^ (t >> 14)) & 0xFFFFFF) / 16777216f;
            }
        }
    }

    public float Range(float min, float max) => min + Value * (max - min);

    /// <summary>Inclusive integer range, matching how designers think about tables.</summary>
    public int RangeInt(int minInclusive, int maxInclusive) {
        if (maxInclusive <= minInclusive) return minInclusive;
        return minInclusive + (int)(Value * (maxInclusive - minInclusive + 1));
    }

    public bool Chance(float p) => Value < p;

    public T Pick<T>(IList<T> list) {
        if (list == null || list.Count == 0) return default(T);
        return list[Math.Min(list.Count - 1, (int)(Value * list.Count))];
    }

    /// <summary>Weighted pick. `weight` maps an entry to its relative likelihood.</summary>
    public T PickWeighted<T>(IList<T> list, Func<T, float> weight) {
        if (list == null || list.Count == 0) return default(T);
        float total = 0f;
        for (int i = 0; i < list.Count; i++) total += Math.Max(0f, weight(list[i]));
        if (total <= 0f) return list[0];
        float r = Value * total;
        for (int i = 0; i < list.Count; i++) {
            r -= Math.Max(0f, weight(list[i]));
            if (r <= 0f) return list[i];
        }
        return list[list.Count - 1];
    }

    public void Shuffle<T>(IList<T> list) {
        for (int i = list.Count - 1; i > 0; i--) {
            int j = (int)(Value * (i + 1));
            T tmp = list[i]; list[i] = list[j]; list[j] = tmp;
        }
    }
}
}
