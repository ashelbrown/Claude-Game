using System;

namespace Starfall.Core {

/// <summary>
/// Engine-agnostic 3-vector. Core deliberately does not reference UnityEngine so
/// that the loot economy, damage maths and perk hooks can be unit-tested without
/// the editor; the Unity layer converts at the boundary.
/// </summary>
public struct Vec3 {
    public float X, Y, Z;
    public Vec3(float x, float y, float z) { X = x; Y = y; Z = z; }

    public static readonly Vec3 Zero = new Vec3(0, 0, 0);
    public static readonly Vec3 Up = new Vec3(0, 1, 0);

    public float Magnitude => (float)Math.Sqrt(X * X + Y * Y + Z * Z);
    public float SqrMagnitude => X * X + Y * Y + Z * Z;

    public static Vec3 operator +(Vec3 a, Vec3 b) => new Vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
    public static Vec3 operator -(Vec3 a, Vec3 b) => new Vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
    public static Vec3 operator *(Vec3 a, float s) => new Vec3(a.X * s, a.Y * s, a.Z * s);

    public static float Distance(Vec3 a, Vec3 b) {
        float dx = a.X - b.X, dy = a.Y - b.Y, dz = a.Z - b.Z;
        return (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    /// <summary>Horizontal distance — most gameplay ranges ignore height.</summary>
    public static float DistanceXZ(Vec3 a, Vec3 b) {
        float dx = a.X - b.X, dz = a.Z - b.Z;
        return (float)Math.Sqrt(dx * dx + dz * dz);
    }

    public override string ToString() => X.ToString("0.##") + "," + Y.ToString("0.##") + "," + Z.ToString("0.##");
}
}
