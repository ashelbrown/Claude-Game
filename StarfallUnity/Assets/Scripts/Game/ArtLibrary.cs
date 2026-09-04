using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// The swap layer between gameplay and art.
///
/// Everything visual is requested through here by logical name, so replacing the
/// procedurally-modelled placeholders with bought or hand-made assets means
/// changing this file and nothing else. Models load from Resources/Art, which
/// avoids prefabs and inspector references entirely — the project runs from a
/// scene containing a single object.
/// </summary>
public static class ArtLibrary {

    // Blender writes every character and weapon with the same material slot
    // order, which is what lets us recolour a known slot at runtime.
    public const int SlotBody = 0;
    public const int SlotDark = 1;
    public const int SlotGrip = 2;
    public const int SlotGlow = 3;

    static readonly Dictionary<string, GameObject> _models = new Dictionary<string, GameObject>();
    static readonly Dictionary<int, Material> _materials = new Dictionary<int, Material>();
    static Shader _litShader;
    static Shader _unlitShader;

    /// <summary>
    /// Built-in "Standard" first, URP second.
    ///
    /// The project ships on the Built-in pipeline deliberately: a URP project
    /// needs a pipeline asset, which cannot be authored outside the editor, and
    /// URP shaders render magenta without one. Trying Standard first means the
    /// project is correct out of the box and still works if you later convert it.
    /// </summary>
    public static Shader LitShader {
        get {
            if (_litShader == null) {
                _litShader = Shader.Find("Standard")
                          ?? Shader.Find("Universal Render Pipeline/Lit")
                          ?? Shader.Find("Diffuse");
            }
            return _litShader;
        }
    }

    public static Shader UnlitShader {
        get {
            if (_unlitShader == null) {
                _unlitShader = Shader.Find("Unlit/Color")
                            ?? Shader.Find("Universal Render Pipeline/Unlit")
                            ?? LitShader;
            }
            return _unlitShader;
        }
    }

    // ------------------------------------------------------------- models
    /// <summary>Load a model by path under Resources/Art, cached. Null if missing.</summary>
    public static GameObject Model(string path) {
        GameObject go;
        if (_models.TryGetValue(path, out go)) return go;
        go = Resources.Load<GameObject>("Art/" + path);
        if (go == null) Debug.LogWarning("STARFALL: missing model Art/" + path);
        _models[path] = go;
        return go;
    }

    public static GameObject WeaponModel(string modelName) => Model("Weapons/" + modelName);
    public static GameObject CharacterModel(string modelName) => Model("Characters/" + modelName);
    public static GameObject PropModel(string modelName) => Model("Props/" + modelName);

    /// <summary>
    /// Instantiate a model under `parent`, keeping the transform the importer
    /// gave it.
    ///
    /// This matters more than it looks. Blender writes the Z-up-to-Y-up axis
    /// conversion onto the model's root transform rather than into the vertex
    /// data, so zeroing that rotation lays every character on its back and points
    /// every gun at the sky. Anything that needs to aim or offset a model should
    /// move the parent, never the model itself.
    /// </summary>
    public static GameObject SpawnLocal(GameObject prefab, Transform parent, string fallbackName = "MissingArt") {
        if (prefab != null) return Object.Instantiate(prefab, parent, false);
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = fallbackName;
        go.transform.SetParent(parent, false);
        SetAllMaterials(go, Flat(new Color(1f, 0f, 1f)));
        return go;
    }

    /// <summary>
    /// Instantiate a model, or a labelled placeholder cube if it is missing.
    /// A missing asset should be obvious in-scene, never a silent hole.
    /// </summary>
    public static GameObject Spawn(GameObject prefab, Vector3 position, Quaternion rotation,
                                   Transform parent, string fallbackName = "MissingArt") {
        GameObject go;
        if (prefab != null) {
            go = Object.Instantiate(prefab, position, rotation, parent);
        } else {
            go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = fallbackName;
            go.transform.SetParent(parent);
            go.transform.position = position;
            go.transform.rotation = rotation;
            SetAllMaterials(go, Flat(new Color(1f, 0f, 1f)));
        }
        return go;
    }

    // ------------------------------------------------------------- materials
    static int Key(Color c, float metallic, float smoothness, bool emissive) {
        int h = Mathf.RoundToInt(c.r * 255) << 24
              | Mathf.RoundToInt(c.g * 255) << 16
              | Mathf.RoundToInt(c.b * 255) << 8
              | Mathf.RoundToInt(c.a * 255);
        h ^= Mathf.RoundToInt(metallic * 97) * 31;
        h ^= Mathf.RoundToInt(smoothness * 89) * 17;
        if (emissive) h ^= 0x5F5F5F;
        return h;
    }

    /// <summary>A cached opaque material. Works on URP/Lit and Built-in Standard alike.</summary>
    public static Material Flat(Color color, float metallic = 0.1f, float smoothness = 0.35f) {
        int key = Key(color, metallic, smoothness, false);
        Material m;
        if (_materials.TryGetValue(key, out m)) return m;
        m = new Material(LitShader);
        // Standard and URP/Lit disagree on property names, so set both spellings.
        m.color = color;
        if (m.HasProperty("_Color")) m.SetColor("_Color", color);
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", color);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", smoothness);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
        _materials[key] = m;
        return m;
    }

    /// <summary>A cached self-lit material, used for element glow and effects.</summary>
    public static Material Glow(Color color, float strength = 2.4f) {
        int key = Key(color, 0f, 0f, true);
        Material m;
        if (_materials.TryGetValue(key, out m)) return m;
        m = new Material(LitShader);
        Color c = color;
        m.color = c;
        if (m.HasProperty("_Color")) m.SetColor("_Color", c);
        if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
        if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.6f);
        if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.6f);
        m.EnableKeyword("_EMISSION");
        Color e = new Color(c.r * strength, c.g * strength, c.b * strength, 1f);
        if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", e);
        _materials[key] = m;
        return m;
    }

    public static Color Of(Element element) {
        var rgb = Defs.Of(element).Color;
        return new Color(rgb.R, rgb.G, rgb.B);
    }

    public static Color Of(Rarity rarity) {
        switch (rarity) {
            case Rarity.Uncommon: return new Color(0.42f, 0.82f, 0.48f);
            case Rarity.Rare: return new Color(0.31f, 0.61f, 1.00f);
            case Rarity.Legendary: return new Color(0.71f, 0.48f, 1.00f);
            case Rarity.Exotic: return new Color(0.96f, 0.83f, 0.25f);
            default: return new Color(0.79f, 0.82f, 0.88f);
        }
    }

    // ------------------------------------------------------------- applying
    public static void SetAllMaterials(GameObject go, Material m) {
        var renderers = go.GetComponentsInChildren<Renderer>();
        for (int i = 0; i < renderers.Length; i++) {
            var mats = new Material[renderers[i].sharedMaterials.Length == 0 ? 1 : renderers[i].sharedMaterials.Length];
            for (int j = 0; j < mats.Length; j++) mats[j] = m;
            renderers[i].sharedMaterials = mats;
        }
    }

    /// <summary>
    /// Overwrite one material slot across a model. Blender guarantees the slot
    /// order, so "slot 3 is the element glow" holds for every asset we ship.
    /// </summary>
    public static void SetSlot(GameObject go, int slot, Material m) {
        var renderers = go.GetComponentsInChildren<Renderer>();
        for (int i = 0; i < renderers.Length; i++) {
            var mats = renderers[i].sharedMaterials;
            if (mats == null || slot >= mats.Length) continue;
            var copy = new Material[mats.Length];
            for (int j = 0; j < mats.Length; j++) copy[j] = mats[j];
            copy[slot] = m;
            renderers[i].sharedMaterials = copy;
        }
    }

    /// <summary>Dress a weapon model: body tinted by rarity, glow strip by element.</summary>
    public static void DressWeapon(GameObject go, Item item) {
        SetSlot(go, SlotBody, Flat(Color.Lerp(new Color(0.30f, 0.32f, 0.38f), Of(item.Rarity),
                                              item.Rarity == Rarity.Exotic ? 0.55f : 0.22f),
                                   0.7f, 0.45f));
        SetSlot(go, SlotDark, Flat(new Color(0.10f, 0.11f, 0.14f), 0.8f, 0.35f));
        SetSlot(go, SlotGrip, Flat(new Color(0.06f, 0.06f, 0.07f), 0.05f, 0.2f));
        SetSlot(go, SlotGlow, Glow(Of(item.Element), 3.0f));
    }

    /// <summary>Dress a character: body/armor from the faction, accent and eye emissive.</summary>
    public static void DressCharacter(GameObject go, Color body, Color armor, Color accent, Color eye) {
        SetSlot(go, 0, Flat(body, 0.35f, 0.35f));
        SetSlot(go, 1, Flat(armor, 0.55f, 0.45f));
        SetSlot(go, 2, Glow(accent, 2.2f));
        SetSlot(go, 3, Glow(eye, 3.4f));
    }

    /// <summary>Drop every cache. Called when returning to the title screen.</summary>
    public static void Clear() {
        _models.Clear();
        _materials.Clear();
    }
}
}
