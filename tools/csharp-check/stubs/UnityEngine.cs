// Hand-written UnityEngine API stubs.
//
// These exist ONLY so the Unity scripts can be compile-checked outside the
// editor (see tools/csharp-check/check.sh). They are never shipped and never
// compiled into the Unity project — Unity supplies the real assemblies.
//
// Signatures mirror the real API for every member the game actually uses. If a
// member is missing here, the checker will flag it, which is the point: it
// forces every API call in the project to be one we deliberately verified.
using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine {

public struct Vector2 {
  public float x, y;
  public Vector2(float x, float y) { this.x = x; this.y = y; }
  public static Vector2 zero => new Vector2(0, 0);
  public static Vector2 one => new Vector2(1, 1);
  public static Vector2 up => new Vector2(0, 1);
  public static Vector2 right => new Vector2(1, 0);
  public float magnitude => Mathf.Sqrt(x * x + y * y);
  public float sqrMagnitude => x * x + y * y;
  public Vector2 normalized { get { float m = magnitude; return m > 1e-6f ? new Vector2(x / m, y / m) : zero; } }
  public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
  public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
  public static Vector2 operator *(Vector2 a, float s) => new Vector2(a.x * s, a.y * s);
  public static Vector2 operator *(float s, Vector2 a) => new Vector2(a.x * s, a.y * s);
  public static Vector2 operator /(Vector2 a, float s) => new Vector2(a.x / s, a.y / s);
  public override string ToString() => x + "," + y;
}

public struct Vector3 {
  public float x, y, z;
  public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
  public Vector3(float x, float y) { this.x = x; this.y = y; this.z = 0; }
  public static Vector3 zero => new Vector3(0, 0, 0);
  public static Vector3 one => new Vector3(1, 1, 1);
  public static Vector3 up => new Vector3(0, 1, 0);
  public static Vector3 down => new Vector3(0, -1, 0);
  public static Vector3 forward => new Vector3(0, 0, 1);
  public static Vector3 back => new Vector3(0, 0, -1);
  public static Vector3 right => new Vector3(1, 0, 0);
  public static Vector3 left => new Vector3(-1, 0, 0);
  public float magnitude => Mathf.Sqrt(x * x + y * y + z * z);
  public float sqrMagnitude => x * x + y * y + z * z;
  public Vector3 normalized { get { float m = magnitude; return m > 1e-6f ? new Vector3(x / m, y / m, z / m) : zero; } }
  public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
  public static float Dot(Vector3 a, Vector3 b) => a.x * b.x + a.y * b.y + a.z * b.z;
  public static Vector3 Cross(Vector3 a, Vector3 b) =>
    new Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  public static Vector3 Normalize(Vector3 v) => v.normalized;
  public static Vector3 Lerp(Vector3 a, Vector3 b, float t) =>
    new Vector3(Mathf.Lerp(a.x, b.x, t), Mathf.Lerp(a.y, b.y, t), Mathf.Lerp(a.z, b.z, t));
  public static Vector3 MoveTowards(Vector3 a, Vector3 b, float d) { var v = b - a; float m = v.magnitude; return m <= d || m < 1e-6f ? b : a + v / m * d; }
  public static Vector3 ClampMagnitude(Vector3 v, float max) { float m = v.magnitude; return m > max ? v / m * max : v; }
  public static Vector3 Reflect(Vector3 dir, Vector3 n) => dir - 2f * Dot(dir, n) * n;
  public static Vector3 Project(Vector3 v, Vector3 n) => n * (Dot(v, n) / Dot(n, n));
  public static Vector3 ProjectOnPlane(Vector3 v, Vector3 n) => v - Project(v, n);
  public static Vector3 Scale(Vector3 a, Vector3 b) => new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
  public static Vector3 Min(Vector3 a, Vector3 b) => new Vector3(Mathf.Min(a.x, b.x), Mathf.Min(a.y, b.y), Mathf.Min(a.z, b.z));
  public static Vector3 Max(Vector3 a, Vector3 b) => new Vector3(Mathf.Max(a.x, b.x), Mathf.Max(a.y, b.y), Mathf.Max(a.z, b.z));
  public static Vector3 SmoothDamp(Vector3 cur, Vector3 target, ref Vector3 vel, float time, float maxSpeed, float dt) => target;
  public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
  public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
  public static Vector3 operator -(Vector3 a) => new Vector3(-a.x, -a.y, -a.z);
  public static Vector3 operator *(Vector3 a, float s) => new Vector3(a.x * s, a.y * s, a.z * s);
  public static Vector3 operator *(float s, Vector3 a) => new Vector3(a.x * s, a.y * s, a.z * s);
  public static Vector3 operator /(Vector3 a, float s) => new Vector3(a.x / s, a.y / s, a.z / s);
  public static bool operator ==(Vector3 a, Vector3 b) => (a - b).sqrMagnitude < 1e-10f;
  public static bool operator !=(Vector3 a, Vector3 b) => !(a == b);
  public override bool Equals(object o) => o is Vector3 v && this == v;
  public override int GetHashCode() => x.GetHashCode() ^ y.GetHashCode() ^ z.GetHashCode();
  public override string ToString() => x + "," + y + "," + z;
}

public struct Vector4 {
  public float x, y, z, w;
  public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
}

public struct Quaternion {
  public float x, y, z, w;
  public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
  public static Quaternion identity => new Quaternion(0, 0, 0, 1);
  public Vector3 eulerAngles { get => Vector3.zero; set { } }
  public static Quaternion Euler(float x, float y, float z) => identity;
  public static Quaternion Euler(Vector3 e) => identity;
  public static Quaternion AngleAxis(float a, Vector3 axis) => identity;
  public static Quaternion LookRotation(Vector3 fwd) => identity;
  public static Quaternion LookRotation(Vector3 fwd, Vector3 up) => identity;
  public static Quaternion Slerp(Quaternion a, Quaternion b, float t) => a;
  public static Quaternion Lerp(Quaternion a, Quaternion b, float t) => a;
  public static Quaternion RotateTowards(Quaternion a, Quaternion b, float d) => a;
  public static Quaternion Inverse(Quaternion q) => identity;
  public static float Angle(Quaternion a, Quaternion b) => 0f;
  public static Quaternion operator *(Quaternion a, Quaternion b) => identity;
  public static Vector3 operator *(Quaternion q, Vector3 v) => v;
}

public struct Color {
  public float r, g, b, a;
  public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
  public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; this.a = 1f; }
  public static Color white => new Color(1, 1, 1);
  public static Color black => new Color(0, 0, 0);
  public static Color clear => new Color(0, 0, 0, 0);
  public static Color red => new Color(1, 0, 0);
  public static Color green => new Color(0, 1, 0);
  public static Color blue => new Color(0, 0, 1);
  public static Color yellow => new Color(1, 0.92f, 0.016f);
  public static Color cyan => new Color(0, 1, 1);
  public static Color gray => new Color(0.5f, 0.5f, 0.5f);
  public static Color Lerp(Color a, Color b, float t) =>
    new Color(Mathf.Lerp(a.r, b.r, t), Mathf.Lerp(a.g, b.g, t), Mathf.Lerp(a.b, b.b, t), Mathf.Lerp(a.a, b.a, t));
  public static Color operator *(Color c, float s) => new Color(c.r * s, c.g * s, c.b * s, c.a * s);
  public static Color operator *(Color a, Color b) => new Color(a.r * b.r, a.g * b.g, a.b * b.b, a.a * b.a);
  public static Color operator +(Color a, Color b) => new Color(a.r + b.r, a.g + b.g, a.b + b.b, a.a + b.a);
  public static implicit operator Color32(Color c) => new Color32((byte)(c.r * 255), (byte)(c.g * 255), (byte)(c.b * 255), (byte)(c.a * 255));
}

public struct Color32 {
  public byte r, g, b, a;
  public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
  public static implicit operator Color(Color32 c) => new Color(c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
}

public struct Rect {
  public float x, y, width, height;
  public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; }
}

public struct Bounds {
  public Vector3 center, extents;
  public Bounds(Vector3 c, Vector3 size) { center = c; extents = size * 0.5f; }
  public Vector3 size { get => extents * 2f; set => extents = value * 0.5f; }
  public Vector3 min => center - extents;
  public Vector3 max => center + extents;
  public bool Contains(Vector3 p) => true;
  public void Encapsulate(Vector3 p) { }
  public void Encapsulate(Bounds b) { }
}

public struct Ray {
  public Vector3 origin, direction;
  public Ray(Vector3 o, Vector3 d) { origin = o; direction = d.normalized; }
  public Vector3 GetPoint(float d) => origin + direction * d;
}

public static class Mathf {
  public const float PI = 3.14159265358979f;
  public const float Infinity = float.PositiveInfinity;
  public const float Deg2Rad = PI / 180f;
  public const float Rad2Deg = 180f / PI;
  public const float Epsilon = 1e-5f;
  public static float Abs(float v) => Math.Abs(v);
  public static int Abs(int v) => Math.Abs(v);
  public static float Sqrt(float v) => (float)Math.Sqrt(v);
  public static float Sin(float v) => (float)Math.Sin(v);
  public static float Cos(float v) => (float)Math.Cos(v);
  public static float Tan(float v) => (float)Math.Tan(v);
  public static float Atan(float v) => (float)Math.Atan(v);
  public static float Atan2(float y, float x) => (float)Math.Atan2(y, x);
  public static float Asin(float v) => (float)Math.Asin(v);
  public static float Acos(float v) => (float)Math.Acos(v);
  public static float Pow(float a, float b) => (float)Math.Pow(a, b);
  public static float Exp(float v) => (float)Math.Exp(v);
  public static float Log(float v) => (float)Math.Log(v);
  public static float Log10(float v) => (float)Math.Log10(v);
  public static float Floor(float v) => (float)Math.Floor(v);
  public static float Ceil(float v) => (float)Math.Ceiling(v);
  public static float Round(float v) => (float)Math.Round(v);
  public static int FloorToInt(float v) => (int)Math.Floor(v);
  public static int CeilToInt(float v) => (int)Math.Ceiling(v);
  public static int RoundToInt(float v) => (int)Math.Round(v);
  public static float Min(float a, float b) => Math.Min(a, b);
  public static int Min(int a, int b) => Math.Min(a, b);
  public static float Max(float a, float b) => Math.Max(a, b);
  public static int Max(int a, int b) => Math.Max(a, b);
  public static float Clamp(float v, float a, float b) => v < a ? a : v > b ? b : v;
  public static int Clamp(int v, int a, int b) => v < a ? a : v > b ? b : v;
  public static float Clamp01(float v) => v < 0 ? 0 : v > 1 ? 1 : v;
  public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
  public static float LerpUnclamped(float a, float b, float t) => a + (b - a) * t;
  public static float InverseLerp(float a, float b, float v) => a == b ? 0 : Clamp01((v - a) / (b - a));
  public static float MoveTowards(float a, float b, float d) => Math.Abs(b - a) <= d ? b : a + Math.Sign(b - a) * d;
  public static float SmoothStep(float a, float b, float t) { t = Clamp01(t); return Lerp(a, b, t * t * (3 - 2 * t)); }
  public static float DeltaAngle(float a, float b) => 0f;
  public static float Repeat(float t, float len) => Clamp(t - Floor(t / len) * len, 0, len);
  public static float PingPong(float t, float len) => len - Abs(Repeat(t, len * 2) - len);
  public static float Sign(float v) => v >= 0 ? 1f : -1f;
  public static float PerlinNoise(float x, float y) => 0.5f;
  public static bool Approximately(float a, float b) => Math.Abs(b - a) < 1e-6f;
  public static float SmoothDamp(float cur, float target, ref float vel, float time, float maxSpeed, float dt) => target;
}

public class Object {
  public string name { get; set; }
  public HideFlags hideFlags { get; set; }
  public static void Destroy(Object o) { }
  public static void Destroy(Object o, float t) { }
  public static void DestroyImmediate(Object o) { }
  public static void DontDestroyOnLoad(Object o) { }
  public static T Instantiate<T>(T original) where T : Object => original;
  public static Object Instantiate(Object o) => o;
  public static T FindObjectOfType<T>() where T : Object => null;
  public static T[] FindObjectsOfType<T>() where T : Object => new T[0];
  public static implicit operator bool(Object o) => !ReferenceEquals(o, null);
}

public enum HideFlags { None = 0, HideAndDontSave = 61, DontSave = 52 }
public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }
public enum Space { World, Self }
public enum CursorLockMode { None, Locked, Confined }
public enum LightType { Spot, Directional, Point, Area }
public enum LightShadows { None, Hard, Soft }
public enum TextAnchor {
  UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter, MiddleRight,
  LowerLeft, LowerCenter, LowerRight
}
public enum FontStyle { Normal, Bold, Italic, BoldAndItalic }
public enum FogMode { Linear = 1, Exponential = 2, ExponentialSquared = 3 }
public enum AudioSpeakerMode { Mono, Stereo }
public enum RuntimePlatform { WindowsPlayer, WindowsEditor, OSXPlayer, LinuxPlayer }
public enum ShadowCastingModeCompat { Off, On }
public enum TextureFormat { RGBA32, RGB24 }
public enum FilterMode { Point, Bilinear, Trilinear }
public enum MeshTopology { Triangles, Lines, Points }
public enum ForceMode { Force, Acceleration, Impulse, VelocityChange }
public enum QueryTriggerInteraction { UseGlobal, Ignore, Collide }
public enum SendMessageOptions { RequireReceiver, DontRequireReceiver }
public enum ScreenMatchMode { MatchWidthOrHeight, Expand, Shrink }

public class Component : Object {
  public Transform transform { get; }
  public GameObject gameObject { get; }
  public string tag { get; set; }
  public T GetComponent<T>() => default(T);
  public Component GetComponent(Type t) => null;
  public T GetComponentInChildren<T>() => default(T);
  public T[] GetComponentsInChildren<T>() => new T[0];
  public T GetComponentInParent<T>() => default(T);
  public bool TryGetComponent<T>(out T c) { c = default(T); return false; }
  public bool CompareTag(string t) => false;
}

public class Behaviour : Component { public bool enabled { get; set; } public bool isActiveAndEnabled { get; } }

public class MonoBehaviour : Behaviour {
  public Coroutine StartCoroutine(IEnumerator routine) => null;
  public void StopCoroutine(Coroutine c) { }
  public void StopAllCoroutines() { }
  public void Invoke(string m, float t) { }
  public void CancelInvoke() { }
  public bool IsInvoking() => false;
  public static void print(object o) { }
}

public class ScriptableObject : Object { }
public class Coroutine : Object { }
public class YieldInstruction { }
public class WaitForSeconds : YieldInstruction { public WaitForSeconds(float s) { } }
public class WaitForEndOfFrame : YieldInstruction { }
public class WaitForFixedUpdate : YieldInstruction { }

public class Transform : Component, IEnumerable {
  public Vector3 position { get; set; }
  public Vector3 localPosition { get; set; }
  public Quaternion rotation { get; set; }
  public Quaternion localRotation { get; set; }
  public Vector3 localScale { get; set; }
  public Vector3 lossyScale { get; }
  public Vector3 eulerAngles { get; set; }
  public Vector3 localEulerAngles { get; set; }
  public Vector3 forward { get; set; }
  public Vector3 right { get; set; }
  public Vector3 up { get; set; }
  public Transform parent { get; set; }
  public Transform root { get; }
  public int childCount { get; }
  public void SetParent(Transform p) { }
  public void SetParent(Transform p, bool worldPositionStays) { }
  public Transform GetChild(int i) => null;
  public Transform Find(string n) => null;
  public void Translate(Vector3 v) { }
  public void Translate(Vector3 v, Space s) { }
  public void Rotate(Vector3 e) { }
  public void Rotate(Vector3 axis, float angle) { }
  public void LookAt(Vector3 target) { }
  public void LookAt(Transform target) { }
  public Vector3 TransformPoint(Vector3 p) => p;
  public Vector3 InverseTransformPoint(Vector3 p) => p;
  public Vector3 TransformDirection(Vector3 d) => d;
  public Vector3 InverseTransformDirection(Vector3 d) => d;
  public void SetPositionAndRotation(Vector3 p, Quaternion r) { }
  public void SetSiblingIndex(int i) { }
  public void DetachChildren() { }
  public IEnumerator GetEnumerator() => null;
}

public class GameObject : Object {
  public GameObject() { }
  public GameObject(string name) { }
  public GameObject(string name, params Type[] components) { }
  public Transform transform { get; }
  public bool activeSelf { get; }
  public bool activeInHierarchy { get; }
  public int layer { get; set; }
  public bool isStatic { get; set; }
  public T AddComponent<T>() where T : Component => default(T);
  public Component AddComponent(Type t) => null;
  public T GetComponent<T>() => default(T);
  public T GetComponentInChildren<T>() => default(T);
  public T[] GetComponentsInChildren<T>() => new T[0];
  public void SetActive(bool v) { }
  public static GameObject CreatePrimitive(PrimitiveType t) => null;
  public static GameObject Find(string n) => null;
  public static GameObject[] FindGameObjectsWithTag(string t) => new GameObject[0];
}

public class Renderer : Component {
  public Material material { get; set; }
  public Material sharedMaterial { get; set; }
  public Material[] materials { get; set; }
  public Material[] sharedMaterials { get; set; }
  public bool enabled { get; set; }
  public Bounds bounds { get; }
  public Rendering.ShadowCastingMode shadowCastingMode { get; set; }
  public bool receiveShadows { get; set; }
  public void SetPropertyBlock(MaterialPropertyBlock b) { }
}
public class MeshRenderer : Renderer { }
public class MeshFilter : Component { public Mesh mesh { get; set; } public Mesh sharedMesh { get; set; } }

public class MaterialPropertyBlock {
  public void SetColor(string n, Color c) { }
  public void SetColor(int id, Color c) { }
  public void SetFloat(string n, float v) { }
  public void Clear() { }
}

public class Mesh : Object {
  public Mesh() { }
  public Vector3[] vertices { get; set; }
  public Vector3[] normals { get; set; }
  public Vector2[] uv { get; set; }
  public Color[] colors { get; set; }
  public Color32[] colors32 { get; set; }
  public int[] triangles { get; set; }
  public int vertexCount { get; }
  public int subMeshCount { get; set; }
  public Bounds bounds { get; set; }
  public UnityEngine.Rendering.IndexFormat indexFormat { get; set; }
  public void Clear() { }
  public void SetVertices(List<Vector3> v) { }
  public void SetNormals(List<Vector3> v) { }
  public void SetColors(List<Color> v) { }
  public void SetUVs(int ch, List<Vector2> v) { }
  public void SetTriangles(List<int> t, int sub) { }
  public void SetTriangles(int[] t, int sub) { }
  public void RecalculateNormals() { }
  public void RecalculateBounds() { }
  public void RecalculateTangents() { }
  public void UploadMeshData(bool markNoLongerReadable) { }
  public void MarkDynamic() { }
  public void CombineMeshes(CombineInstance[] combine, bool mergeSubMeshes) { }
  public void CombineMeshes(CombineInstance[] combine) { }
}

public struct CombineInstance { public Mesh mesh; public Matrix4x4 transform; public int subMeshIndex; }

public struct Matrix4x4 {
  public static Matrix4x4 identity => new Matrix4x4();
  public static Matrix4x4 TRS(Vector3 pos, Quaternion q, Vector3 s) => identity;
  public Vector3 MultiplyPoint3x4(Vector3 p) => p;
}

public class Material : Object {
  public Material(Shader s) { }
  public Material(Material m) { }
  public Color color { get; set; }
  public Shader shader { get; set; }
  public int renderQueue { get; set; }
  public void SetColor(string n, Color c) { }
  public void SetFloat(string n, float v) { }
  public void SetInt(string n, int v) { }
  public void SetTexture(string n, Texture t) { }
  public void SetVector(string n, Vector4 v) { }
  public void EnableKeyword(string k) { }
  public void DisableKeyword(string k) { }
  public bool HasProperty(string n) => true;
  public Color GetColor(string n) => Color.white;
}

public class Shader : Object { public static Shader Find(string name) => null; }
public class Texture : Object { public FilterMode filterMode { get; set; } public int width { get; } public int height { get; } }
public class Texture2D : Texture {
  public Texture2D(int w, int h) { }
  public Texture2D(int w, int h, TextureFormat f, bool mipChain) { }
  public void SetPixel(int x, int y, Color c) { }
  public void SetPixels(Color[] c) { }
  public void Apply() { }
}
public class Sprite : Object {
  public static Sprite Create(Texture2D t, Rect r, Vector2 pivot) => null;
}

public class Camera : Component {
  public static Camera main { get; }
  public float fieldOfView { get; set; }
  public float nearClipPlane { get; set; }
  public float farClipPlane { get; set; }
  public Color backgroundColor { get; set; }
  public CameraClearFlags clearFlags { get; set; }
  public int cullingMask { get; set; }
  public float aspect { get; }
  public int depth { get; set; }
  public Vector3 WorldToScreenPoint(Vector3 p) => p;
  public Vector3 WorldToViewportPoint(Vector3 p) => p;
  public Vector3 ScreenToWorldPoint(Vector3 p) => p;
  public Ray ScreenPointToRay(Vector3 p) => new Ray(Vector3.zero, Vector3.forward);
}
public enum CameraClearFlags { Skybox = 1, SolidColor = 2, Depth = 3, Nothing = 4 }

public class Light : Component {
  public LightType type { get; set; }
  public Color color { get; set; }
  public float intensity { get; set; }
  public float range { get; set; }
  public float spotAngle { get; set; }
  public LightShadows shadows { get; set; }
  public float shadowStrength { get; set; }
}

public class AudioClip : Object {
  public int samples { get; }
  public int channels { get; }
  public int frequency { get; }
  public float length { get; }
  public static AudioClip Create(string name, int lengthSamples, int channels, int frequency, bool stream) => null;
  public bool SetData(float[] data, int offsetSamples) => true;
  public bool GetData(float[] data, int offsetSamples) => true;
}

public class AudioSource : Behaviour {
  public AudioClip clip { get; set; }
  public float volume { get; set; }
  public float pitch { get; set; }
  public bool loop { get; set; }
  public bool playOnAwake { get; set; }
  public bool isPlaying { get; }
  public float spatialBlend { get; set; }
  public float time { get; set; }
  public float minDistance { get; set; }
  public float maxDistance { get; set; }
  public float panStereo { get; set; }
  public AudioRolloffMode rolloffMode { get; set; }
  public AudioMixerGroupStub outputAudioMixerGroup { get; set; }
  public void Play() { }
  public void Stop() { }
  public void Pause() { }
  public void PlayOneShot(AudioClip c) { }
  public void PlayOneShot(AudioClip c, float volumeScale) { }
  public static void PlayClipAtPoint(AudioClip c, Vector3 p) { }
  public static void PlayClipAtPoint(AudioClip c, Vector3 p, float volume) { }
}
public enum AudioRolloffMode { Logarithmic, Linear, Custom }
public class AudioMixerGroupStub : Object { }
public class AudioListener : Behaviour { public static float volume { get; set; } public static bool pause { get; set; } }

public static class Time {
  public static float time { get; }
  public static float deltaTime { get; }
  public static float unscaledDeltaTime { get; }
  public static float unscaledTime { get; }
  public static float fixedDeltaTime { get; set; }
  public static float timeScale { get; set; }
  public static int frameCount { get; }
  public static float smoothDeltaTime { get; }
}

public static class Input {
  public static bool GetKey(KeyCode k) => false;
  public static bool GetKeyDown(KeyCode k) => false;
  public static bool GetKeyUp(KeyCode k) => false;
  public static bool GetMouseButton(int b) => false;
  public static bool GetMouseButtonDown(int b) => false;
  public static bool GetMouseButtonUp(int b) => false;
  public static float GetAxis(string n) => 0f;
  public static float GetAxisRaw(string n) => 0f;
  public static Vector3 mousePosition { get; }
  public static float mouseScrollDeltaY => 0f;
  public static Vector2 mouseScrollDelta { get; }
  public static bool anyKeyDown { get; }
}

public enum KeyCode {
  None = 0, Backspace = 8, Tab = 9, Return = 13, Escape = 27, Space = 32,
  Alpha0 = 48, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Alpha6, Alpha7, Alpha8, Alpha9,
  A = 97, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
  LeftShift = 304, RightShift = 303, LeftControl = 306, RightControl = 305,
  LeftAlt = 308, RightAlt = 307, Mouse0 = 323, Mouse1 = 324, Mouse2 = 325,
  F1 = 282, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
  UpArrow = 273, DownArrow = 274, RightArrow = 275, LeftArrow = 276
}

public static class Cursor { public static CursorLockMode lockState { get; set; } public static bool visible { get; set; } }

public static class Screen {
  public static int width { get; }
  public static int height { get; }
  public static bool fullScreen { get; set; }
  public static void SetResolution(int w, int h, bool fs) { }
}

public static class Application {
  public static string persistentDataPath { get; }
  public static string dataPath { get; }
  public static bool isPlaying { get; }
  public static bool isEditor { get; }
  public static int targetFrameRate { get; set; }
  public static RuntimePlatform platform { get; }
  public static string version { get; }
  public static void Quit() { }
  public static event Action quitting;
}

public static class Debug {
  public static void Log(object o) { }
  public static void LogWarning(object o) { }
  public static void LogError(object o) { }
  public static void LogException(Exception e) { }
  public static void DrawLine(Vector3 a, Vector3 b, Color c) { }
  public static void DrawRay(Vector3 o, Vector3 d, Color c) { }
}

public static class PlayerPrefs {
  public static void SetString(string k, string v) { }
  public static string GetString(string k, string d) => d;
  public static string GetString(string k) => "";
  public static void SetInt(string k, int v) { }
  public static int GetInt(string k, int d) => d;
  public static void SetFloat(string k, float v) { }
  public static float GetFloat(string k, float d) => d;
  public static bool HasKey(string k) => false;
  public static void DeleteKey(string k) { }
  public static void DeleteAll() { }
  public static void Save() { }
}

public static class Resources {
  public static T Load<T>(string path) where T : Object => null;
  public static T GetBuiltinResource<T>(string path) where T : Object => null;
}

public class Font : Object { public static Font CreateDynamicFontFromOSFont(string name, int size) => null; }

public static class QualitySettings { public static int vSyncCount { get; set; } public static int shadowDistance { get; set; } }

public static class RenderSettings {
  public static bool fog { get; set; }
  public static Color fogColor { get; set; }
  public static FogMode fogMode { get; set; }
  public static float fogDensity { get; set; }
  public static float fogStartDistance { get; set; }
  public static float fogEndDistance { get; set; }
  public static Color ambientLight { get; set; }
  public static Color ambientSkyColor { get; set; }
  public static Color ambientEquatorColor { get; set; }
  public static Color ambientGroundColor { get; set; }
  public static AmbientMode ambientMode { get; set; }
  public static float ambientIntensity { get; set; }
  public static Material skybox { get; set; }
  public static Light sun { get; set; }
}
public enum AmbientMode { Skybox = 0, Trilight = 1, Flat = 3, Custom = 4 }

public static class SystemInfo { public static string deviceName { get; } public static string graphicsDeviceName { get; } }

public class Random_ { }
public static class Random {
  public static float value { get; }
  public static float Range(float min, float max) => min;
  public static int Range(int min, int max) => min;
  public static Vector3 insideUnitSphere { get; }
  public static Vector3 onUnitSphere { get; }
  public static Vector2 insideUnitCircle { get; }
  public static Quaternion rotation { get; }
  public static void InitState(int seed) { }
}

public static class LayerMask {
  public static int GetMask(params string[] names) => 0;
  public static int NameToLayer(string n) => 0;
  public static string LayerToName(int l) => "";
}

public class JsonUtility {
  public static string ToJson(object o) => "";
  public static string ToJson(object o, bool pretty) => "";
  public static T FromJson<T>(string s) => default(T);
  public static void FromJsonOverwrite(string s, object o) { }
}

[AttributeUsage(AttributeTargets.Field)] public class SerializeField : Attribute { }
[AttributeUsage(AttributeTargets.Class)] public class SerializableAttribute2 : Attribute { }
[AttributeUsage(AttributeTargets.Class)] public class RequireComponent : Attribute { public RequireComponent(Type t) { } }
[AttributeUsage(AttributeTargets.Class)] public class DisallowMultipleComponent : Attribute { }
[AttributeUsage(AttributeTargets.Class)] public class AddComponentMenu : Attribute { public AddComponentMenu(string m) { } }
[AttributeUsage(AttributeTargets.Class)] public class ExecuteInEditMode : Attribute { }
[AttributeUsage(AttributeTargets.Class)] public class ExecuteAlways : Attribute { }
[AttributeUsage(AttributeTargets.Method)] public class RuntimeInitializeOnLoadMethod : Attribute {
  public RuntimeInitializeOnLoadMethod() { }
  public RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType t) { }
}
public enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad, BeforeSplashScreen, AfterAssembliesLoaded }
[AttributeUsage(AttributeTargets.Field)] public class RangeAttribute : Attribute { public RangeAttribute(float min, float max) { } }
[AttributeUsage(AttributeTargets.Field)] public class HeaderAttribute : Attribute { public HeaderAttribute(string h) { } }
[AttributeUsage(AttributeTargets.Field)] public class TooltipAttribute : Attribute { public TooltipAttribute(string t) { } }

namespace Rendering {
  public enum ShadowCastingMode { Off = 0, On = 1, TwoSided = 2, ShadowsOnly = 3 }
  public enum IndexFormat { UInt16 = 0, UInt32 = 1 }
}

namespace SceneManagement {
  public class Scene { public string name { get; } public bool isLoaded { get; } }
  public static class SceneManager {
    public static Scene GetActiveScene() => new Scene();
    public static void LoadScene(string name) { }
    public static void LoadScene(int index) { }
  }
}
}
