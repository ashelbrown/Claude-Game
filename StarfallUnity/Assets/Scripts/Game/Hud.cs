using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// The in-game HUD, drawn with IMGUI.
///
/// IMGUI rather than uGUI on purpose: it needs no Canvas, no EventSystem, no
/// prefabs and no inspector wiring, so the whole interface exists in code and
/// the project runs from an effectively empty scene. Everything is drawn from
/// flat colour rectangles, so there are no sprites to import either.
/// </summary>
public sealed class Hud : MonoBehaviour {

    GameManager _game;
    Texture2D _white;
    GUIStyle _label, _big, _small, _number;

    // --- transient feedback
    sealed class HitmarkerFx { public float Life; public bool Crit, Kill; }
    sealed class Toast { public string Title, Sub; public Color Color; public float Life; }
    sealed class Feed { public string Text; public float Life; }
    sealed class DamageArrow { public float Angle, Life; }

    readonly List<HitmarkerFx> _hitmarkers = new List<HitmarkerFx>();
    readonly List<Toast> _toasts = new List<Toast>();
    readonly List<Feed> _feed = new List<Feed>();
    readonly List<DamageArrow> _arrows = new List<DamageArrow>();

    bool _showControls;
    string _bannerText, _bannerSub;
    float _bannerLife;
    Vector3? _waypoint;
    string _waypointLabel = "";
    Enemy _boss;

    static readonly Color Dim = new Color(0.50f, 0.57f, 0.66f);
    static readonly Color Text = new Color(0.85f, 0.89f, 0.96f);
    static readonly Color Gold = new Color(0.91f, 0.77f, 0.42f);

    public void Bind(GameManager game) {
        _game = game;
        _white = new Texture2D(1, 1);
        _white.SetPixel(0, 0, Color.white);
        _white.Apply();
    }

    void EnsureStyles() {
        if (_label != null) return;
        _label = new GUIStyle { fontSize = 13, alignment = TextAnchor.MiddleLeft, richText = false };
        _label.normal = new GUIStyleState { textColor = Text };
        _small = new GUIStyle(_label) { fontSize = 11 };
        _small.normal = new GUIStyleState { textColor = Dim };
        _big = new GUIStyle(_label) { fontSize = 28, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        _big.normal = new GUIStyleState { textColor = Text };
        _number = new GUIStyle(_label) { fontSize = 34, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleRight };
        _number.normal = new GUIStyleState { textColor = Text };
    }

    // ------------------------------------------------------------- API
    public void Banner(string text, string sub) { _bannerText = text; _bannerSub = sub; _bannerLife = 2.6f; }
    public void Hitmarker(bool crit, bool kill) =>
        _hitmarkers.Add(new HitmarkerFx { Life = kill ? 0.4f : 0.22f, Crit = crit, Kill = kill });
    public void FlashDamage(float angle, float strength) => _arrows.Add(new DamageArrow { Angle = angle, Life = 0.9f });
    public void KillFeed(string text) { _feed.Add(new Feed { Text = text, Life = 3.2f }); if (_feed.Count > 5) _feed.RemoveAt(0); }
    public void SetWaypoint(Vector3 position, string label) { _waypoint = position + Vector3.up * 2f; _waypointLabel = label; }
    public void ClearMarkers() { _waypoint = null; _boss = null; _toasts.Clear(); _feed.Clear(); }
    public void SetBoss(Enemy boss) => _boss = boss;

    public void LootToast(Item item) {
        _toasts.Add(new Toast {
            Title = item.Name, Sub = item.Subtitle() + " · " + item.Power,
            Color = ArtLibrary.Of(item.Rarity), Life = 4.5f
        });
        if (_toasts.Count > 6) _toasts.RemoveAt(0);
    }

    void Update() {
        float dt = Time.deltaTime;
        if (Input.GetKeyDown(KeyCode.F1)) _showControls = !_showControls;
        _bannerLife = Mathf.Max(0f, _bannerLife - dt);
        Tick(_hitmarkers, h => h.Life -= dt, h => h.Life <= 0f);
        Tick(_toasts, t => t.Life -= dt, t => t.Life <= 0f);
        Tick(_feed, f => f.Life -= dt, f => f.Life <= 0f);
        Tick(_arrows, a => a.Life -= dt, a => a.Life <= 0f);
    }

    static void Tick<T>(List<T> list, System.Action<T> step, System.Func<T, bool> dead) {
        for (int i = list.Count - 1; i >= 0; i--) {
            step(list[i]);
            if (dead(list[i])) list.RemoveAt(i);
        }
    }

    // ------------------------------------------------------------- drawing
    void Fill(Rect r, Color c) {
        var prev = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, _white);
        GUI.color = prev;
    }

    void Bar(Rect r, float fraction, Color fill, Color back) {
        Fill(new Rect(r.x - 1f, r.y - 1f, r.width + 2f, r.height + 2f), new Color(0f, 0f, 0f, 0.45f));
        Fill(r, back);
        Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(fraction), r.height), fill);
    }

    void Write(Rect r, string text, GUIStyle style, Color color) {
        var prev = style.normal.textColor;
        style.normal = new GUIStyleState { textColor = color };
        GUI.Label(r, text, style);
        style.normal = new GUIStyleState { textColor = prev };
    }

    void OnGUI() {
        // Menus can still be null for a frame during boot.
        if (_game == null || !_game.InActivity) return;
        if (_game.Menus != null && _game.Menus.IsOpen) return;
        if (_game.Player == null || _game.Player.Cam == null) return;
        EnsureStyles();

        float w = Screen.width, h = Screen.height;
        var player = _game.Player;

        DrawDamageVignette(w, h, player);
        DrawWorldText(w, h);
        DrawEnemyBars(w, h);
        DrawCrosshair(w, h, player);
        DrawVitals(w, h, player);
        DrawAbilities(w, h);
        DrawAmmo(w, h);
        DrawRadar(w, h);
        DrawObjective(w, h);
        DrawBossBar(w, h);
        DrawBanner(w, h);
        DrawFeed(w, h);
        DrawToasts(w, h);
        DrawControls(w, h);
    }

    // Grouped so the two that are unusual for the genre — Disperse instead of a
    // jump, and Shed costing health — sit where they will actually be read.
    static readonly string[,] ControlGroups = {
        { "MOVEMENT", "" },
        { "W A S D", "Move" },
        { "Space", "Disperse — fragment and reform (2 charges)" },
        { "Shift", "Sprint" },
        { "Ctrl / C", "Crouch, or slide out of a sprint" },
        { "", "" },
        { "COMBAT", "" },
        { "Mouse 1", "Fire" },
        { "Mouse 2", "Aim" },
        { "R", "Reload" },
        { "1 2 3", "Kinetic / Energy / Power weapon" },
        { "Wheel", "Cycle weapon" },
        { "", "" },
        { "ABILITIES", "" },
        { "Q", "Grenade" },
        { "E", "Melee" },
        { "F", "Shed a facet — costs health; press again to reabsorb" },
        { "X", "Super" },
        { "", "" },
        { "INTERFACE", "" },
        { "Tab", "Character and inventory" },
        { "M", "Director — choose an activity" },
        { "Esc", "Pause" },
        { "F1", "Close this" },
    };

    void DrawControls(float w, float h) {
        if (!_showControls) {
            var hint = new GUIStyle(_small) { alignment = TextAnchor.MiddleLeft };
            Write(new Rect(42f, h - 26f, 200f, 16f), "F1  CONTROLS", hint, new Color(Dim.r, Dim.g, Dim.b, 0.7f));
            return;
        }

        const float panelW = 470f;
        float rows = ControlGroups.GetLength(0);
        float panelH = rows * 19f + 54f;
        var panel = new Rect((w - panelW) * 0.5f, (h - panelH) * 0.5f, panelW, panelH);

        Fill(panel, new Color(0.02f, 0.03f, 0.05f, 0.92f));
        Fill(new Rect(panel.x, panel.y, panel.width, 1f), Gold);
        Fill(new Rect(panel.x, panel.yMax - 1f, panel.width, 1f), new Color(Gold.r, Gold.g, Gold.b, 0.3f));

        var title = new GUIStyle(_label) { fontStyle = FontStyle.Bold, fontSize = 15 };
        Write(new Rect(panel.x + 22f, panel.y + 14f, panelW - 44f, 20f), "CONTROLS", title, Gold);

        float y = panel.y + 42f;
        var keyStyle = new GUIStyle(_label) { alignment = TextAnchor.MiddleRight, fontStyle = FontStyle.Bold };
        for (int i = 0; i < rows; i++) {
            string key = ControlGroups[i, 0], action = ControlGroups[i, 1];
            if (key.Length == 0 && action.Length == 0) { y += 8f; continue; }
            if (action.Length == 0) {
                // section heading
                Write(new Rect(panel.x + 22f, y, panelW - 44f, 16f), key, _small, Gold);
                Fill(new Rect(panel.x + 22f, y + 16f, panelW - 44f, 1f), new Color(Gold.r, Gold.g, Gold.b, 0.18f));
                y += 21f;
                continue;
            }
            Write(new Rect(panel.x + 22f, y, 110f, 16f), key, keyStyle, Text);
            Write(new Rect(panel.x + 146f, y, panelW - 168f, 16f), action, _small, Dim);
            y += 19f;
        }
    }

    void DrawDamageVignette(float w, float h, PlayerController player) {
        float hurt = Mathf.Clamp01(1f - player.HealthFraction / 0.55f);
        if (hurt > 0.01f) {
            Fill(new Rect(0, 0, w, h), new Color(0.6f, 0.05f, 0.05f, 0.28f * hurt));
        }
        if (player.Stilled) {
            Fill(new Rect(0, 0, w, h), new Color(0.4f, 0.7f, 0.9f, 0.22f));
            Write(new Rect(0, h * 0.42f, w, 40), "STILLED", _big, new Color(0.7f, 0.9f, 1f));
        }
        for (int i = 0; i < _arrows.Count; i++) {
            var a = _arrows[i];
            float alpha = Mathf.Clamp01(a.Life / 0.9f) * 0.75f;
            float rad = a.Angle * Mathf.Deg2Rad;
            float cx = w * 0.5f + Mathf.Sin(rad) * (w * 0.16f);
            float cy = h * 0.5f - Mathf.Cos(rad) * (h * 0.16f);
            Fill(new Rect(cx - 26f, cy - 3f, 52f, 6f), new Color(1f, 0.36f, 0.36f, alpha));
        }
    }

    /// <summary>Floating damage numbers, projected from world space.</summary>
    void DrawWorldText(float w, float h) {
        if (!_game.Profile.Settings.ShowDamageNumbers) return;
        var cam = _game.Player.Cam;
        var texts = _game.Effects.Texts;
        for (int i = 0; i < texts.Count; i++) {
            var t = texts[i];
            Vector3 sp = cam.WorldToScreenPoint(t.Position);
            if (sp.z <= 0.1f) continue;
            float alpha = Mathf.Clamp01(t.Life / t.MaxLife);
            var style = new GUIStyle(_label) {
                fontSize = Mathf.RoundToInt(t.Size), alignment = TextAnchor.MiddleCenter,
                fontStyle = FontStyle.Bold
            };
            Write(new Rect(sp.x - 60f, h - sp.y - 12f, 120f, 24f), t.Text, style,
                  new Color(t.Color.r, t.Color.g, t.Color.b, alpha * alpha));
        }
    }

    void DrawEnemyBars(float w, float h) {
        var cam = _game.Player.Cam;
        var enemies = _game.Enemies;
        bool polarised = true;   // the Choralith always reads recent motion and fire
        for (int i = 0; i < enemies.Count; i++) {
            var e = enemies[i];
            if (e == null || !e.Alive || e == _boss) continue;
            bool recentlyFired = Time.time - e.LastFiredTime < 2.5f;
            bool damaged = e.Health < e.MaxHealth && Time.time - e.LastHitTime < 2.5f;
            bool show = e.Def.Rank != Rank.Minor || damaged || (polarised && recentlyFired);
            if (!show) continue;

            Vector3 sp = cam.WorldToScreenPoint(e.transform.position + Vector3.up * (e.Def.Height + 0.35f));
            if (sp.z <= 0.1f || sp.z > 70f) continue;
            float barW = Mathf.Clamp(74f - sp.z * 0.5f, 28f, 74f);
            float x = sp.x - barW * 0.5f, y = h - sp.y;

            Color fill = e.Def.Rank == Rank.Minor ? new Color(0.91f, 0.38f, 0.30f)
                       : e.Def.Rank == Rank.Major ? new Color(1f, 0.83f, 0.37f)
                       : new Color(1f, 0.62f, 0.24f);
            Bar(new Rect(x, y, barW, 4f), e.Health / e.MaxHealth, fill, new Color(1f, 1f, 1f, 0.12f));
            if (e.MaxShield > 0f && e.Shield > 0f) {
                Bar(new Rect(x, y - 5f, barW, 3f), e.Shield / e.MaxShield,
                    ArtLibrary.Of(e.Def.ShieldElement), new Color(1f, 1f, 1f, 0.1f));
            }
            if (e.Def.Rank != Rank.Minor && sp.z < 45f) {
                var style = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
                Write(new Rect(sp.x - 90f, y - 22f, 180f, 16f), e.Def.Name.ToUpperInvariant(), style, Text);
            }
        }

        if (_waypoint.HasValue) {
            Vector3 sp = cam.WorldToScreenPoint(_waypoint.Value);
            float dist = Vector3.Distance(_game.Player.transform.position, _waypoint.Value);
            var style = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
            if (sp.z > 0.1f && sp.x > 0f && sp.x < w) {
                Fill(new Rect(sp.x - 4f, h - sp.y - 4f, 8f, 8f), Gold);
                Write(new Rect(sp.x - 90f, h - sp.y - 26f, 180f, 16f),
                      _waypointLabel + " " + Mathf.RoundToInt(dist) + "m", style, Gold);
            } else {
                Write(new Rect(w * 0.5f - 90f, 96f, 180f, 16f),
                      "◄ " + _waypointLabel + " " + Mathf.RoundToInt(dist) + "m ►", style, Gold);
            }
        }
    }

    void DrawCrosshair(float w, float h, PlayerController player) {
        float cx = w * 0.5f, cy = h * 0.5f;
        var weapon = _game.Weapons.Current;
        float spread = weapon != null
            ? Mathf.Lerp(weapon.Derived.Spread, weapon.Derived.AdsSpread, _game.Weapons.Aiming) : 0.01f;
        float gap = Mathf.Clamp(6f + spread * 900f + (player.Sprinting ? 8f : 0f), 4f, 40f);

        Color c = new Color(0.91f, 0.93f, 0.99f, 0.85f);
        Fill(new Rect(cx - 1f, cy - gap - 7f, 2f, 7f), c);
        Fill(new Rect(cx - 1f, cy + gap, 2f, 7f), c);
        Fill(new Rect(cx - gap - 7f, cy - 1f, 7f, 2f), c);
        Fill(new Rect(cx + gap, cy - 1f, 7f, 2f), c);
        Fill(new Rect(cx - 1f, cy - 1f, 2f, 2f), c);

        for (int i = 0; i < _hitmarkers.Count; i++) {
            var m = _hitmarkers[i];
            float a = Mathf.Clamp01(m.Life / (m.Kill ? 0.4f : 0.22f));
            Color mc = m.Kill ? new Color(1f, 0.35f, 0.27f, a)
                     : m.Crit ? new Color(1f, 0.88f, 0.54f, a) : new Color(1f, 1f, 1f, a);
            float o = 5f, len = m.Kill ? 9f : 6f;
            Fill(new Rect(cx - o - len, cy - o - len, len, 2f), mc);
            Fill(new Rect(cx + o, cy - o - len, len, 2f), mc);
            Fill(new Rect(cx - o - len, cy + o + len, len, 2f), mc);
            Fill(new Rect(cx + o, cy + o + len, len, 2f), mc);
        }

        if (_game.Weapons.ChargeProgress > 0f && weapon != null) {
            float t = Mathf.Clamp01(_game.Weapons.ChargeProgress / Mathf.Max(0.01f, weapon.Derived.ChargeTime));
            Bar(new Rect(cx - 30f, cy + 34f, 60f, 4f), t, ArtLibrary.Of(weapon.Element), new Color(1f, 1f, 1f, 0.12f));
        }
        if (_game.Weapons.Reloading && weapon != null) {
            float t = 1f - Mathf.Clamp01(_game.Weapons.ReloadRemaining / Mathf.Max(0.01f, weapon.Derived.ReloadTime));
            Bar(new Rect(cx - 30f, cy + 44f, 60f, 4f), t, Gold, new Color(1f, 1f, 1f, 0.12f));
        }
    }

    void DrawVitals(float w, float h, PlayerController player) {
        float x = 42f, y = h - 74f, barW = 250f;
        Bar(new Rect(x, y, barW, 10f), player.Shield / Mathf.Max(1f, player.MaxShield),
            new Color(0.62f, 0.84f, 1f), new Color(1f, 1f, 1f, 0.1f));
        if (player.Overshield > 0f) {
            Bar(new Rect(x, y - 6f, barW, 3f), player.Overshield / 320f, Gold, new Color(1f, 1f, 1f, 0.08f));
        }
        float hf = player.Health / Mathf.Max(1f, player.MaxHealth);
        Bar(new Rect(x, y + 14f, barW, 8f), hf,
            hf > 0.35f ? Text : new Color(1f, 0.42f, 0.42f), new Color(1f, 1f, 1f, 0.1f));

        Write(new Rect(x, y + 28f, 160f, 18f),
              Mathf.Ceil(player.Health) + " / " + Mathf.Round(player.MaxHealth), _small, Dim);
        var right = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
        Write(new Rect(x, y + 28f, barW, 18f), "POWER " + player.Power, right, Gold);

        // Disperse charges: the species' movement resource
        for (int i = 0; i < player.MaxDisperseCharges; i++) {
            bool ready = i < player.DisperseCharges;
            Fill(new Rect(x + i * 16f, y - 16f, 12f, 4f),
                 ready ? _game.ElementColor : new Color(1f, 1f, 1f, 0.15f));
        }
    }

    void DrawAbilities(float w, float h) {
        var ab = _game.Abilities;
        float cx = w * 0.5f, y = h - 66f;
        const float size = 34f, gap = 12f;
        float total = size * 3f + gap * 2f;
        float x = cx - total * 0.5f;

        DrawAbilitySlot(new Rect(x, y, size, size), "Q", ab.GrenadeCharge, ArtLibrary.Of(ab.Subclass.Grenade.Element));
        DrawAbilitySlot(new Rect(x + size + gap, y, size, size), "E", ab.MeleeCharge, _game.ElementColor);
        DrawAbilitySlot(new Rect(x + (size + gap) * 2f, y, size, size), "F",
                        ab.FacetsOut > 0 ? 1f : ab.ClassCharge, Text);

        // super meter
        float sw = total + 60f, sy = y + size + 12f;
        var super = ab.Super;
        float frac = ab.SuperActive
            ? Mathf.Clamp01(ab.SuperRemaining / Mathf.Max(0.01f, super.Duration))
            : ab.SuperEnergy;
        Bar(new Rect(cx - sw * 0.5f, sy, sw, 6f), frac, ArtLibrary.Of(super.Element), new Color(1f, 1f, 1f, 0.1f));
        if (ab.SuperEnergy >= 1f && !ab.SuperActive) {
            var centre = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
            Write(new Rect(cx - sw * 0.5f, sy + 8f, sw, 16f),
                  "[X] " + super.Name.ToUpperInvariant(), centre, ArtLibrary.Of(super.Element));
        }
    }

    void DrawAbilitySlot(Rect r, string key, float charge, Color color) {
        Fill(r, new Color(0f, 0f, 0f, 0.5f));
        float fillH = (r.height - 4f) * Mathf.Clamp01(charge);
        Fill(new Rect(r.x + 2f, r.yMax - 2f - fillH, r.width - 4f, fillH),
             charge >= 1f ? new Color(color.r, color.g, color.b, 0.35f) : new Color(1f, 1f, 1f, 0.1f));
        var centre = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
        Write(r, key, centre, charge >= 1f ? Color.white : Dim);
    }

    void DrawAmmo(float w, float h) {
        var weapon = _game.Weapons.Current;
        float x = w - 42f, y = h - 74f;
        if (weapon == null) {
            Write(new Rect(x - 200f, y, 200f, 24f), "NO WEAPON",
                  new GUIStyle(_small) { alignment = TextAnchor.MiddleRight }, Dim);
            return;
        }
        var d = weapon.Derived;
        Write(new Rect(x - 220f, y + 6f, 160f, 40f), weapon.Ammo.ToString(), _number,
              weapon.Ammo == 0 ? new Color(1f, 0.42f, 0.42f) : Text);
        string reserve = d.Ammo == AmmoType.Primary ? "∞" : _game.Weapons.Reserve(d.Ammo).ToString();
        Write(new Rect(x - 60f, y + 14f, 60f, 24f), "/ " + reserve,
              new GUIStyle(_label) { fontSize = 17, alignment = TextAnchor.MiddleRight }, Dim);

        var right = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
        Write(new Rect(x - 320f, y - 14f, 320f, 16f), weapon.Name.ToUpperInvariant(), right,
              ArtLibrary.Of(weapon.Rarity));
        var fam = Catalog.FindFamily(weapon.FamilyId);
        Write(new Rect(x - 320f, y - 30f, 320f, 16f),
              (fam != null ? fam.Name.ToUpperInvariant() : "") + " · " +
              Defs.Of(weapon.Element).Name.ToUpperInvariant(), right, ArtLibrary.Of(weapon.Element));

        for (int i = 0; i < 3; i++) {
            bool active = _game.Weapons.SlotIndex == i;
            Fill(new Rect(x - 100f + i * 34f, y + 52f, 26f, 3f),
                 active ? Gold : new Color(0.9f, 0.93f, 0.99f, 0.28f));
        }
    }

    /// <summary>Rotating radar. Polarised Sight means enemies show even unfired.</summary>
    void DrawRadar(float w, float h) {
        const float cx = 96f, cy = 96f, radius = 62f;
        float range = 42f;
        Fill(new Rect(cx - radius, cy - radius, radius * 2f, radius * 2f), new Color(0.02f, 0.04f, 0.07f, 0.5f));
        Fill(new Rect(cx - radius, cy - 1f, radius * 2f, 1f), new Color(0.5f, 0.65f, 0.86f, 0.2f));
        Fill(new Rect(cx - 1f, cy - radius, 1f, radius * 2f), new Color(0.5f, 0.65f, 0.86f, 0.2f));

        float yaw = -_game.Player.Yaw * Mathf.Deg2Rad;
        float cos = Mathf.Cos(yaw), sin = Mathf.Sin(yaw);
        var origin = _game.Player.transform.position;
        for (int i = 0; i < _game.Enemies.Count; i++) {
            var e = _game.Enemies[i];
            if (e == null || !e.Alive) continue;
            Vector3 d = e.transform.position - origin;
            float dist = new Vector2(d.x, d.z).magnitude;
            if (dist > range) continue;
            float rx = d.x * cos - d.z * sin, rz = d.x * sin + d.z * cos;
            float sx = cx + (rx / range) * radius, sy = cy + (rz / range) * radius;
            float size = e.Def.Rank == Rank.Minor ? 3f : 5f;
            Color c = e.Def.Rank == Rank.Minor ? new Color(1f, 0.42f, 0.37f)
                    : e.Def.Rank == Rank.Major ? new Color(1f, 0.83f, 0.37f)
                    : new Color(1f, 0.62f, 0.24f);
            Fill(new Rect(sx - size, sy - size, size * 2f, size * 2f), c);
        }
        Fill(new Rect(cx - 3f, cy - 4f, 6f, 8f), Text);
    }

    void DrawObjective(float w, float h) {
        if (_game.Director == null) return;
        var centre = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
        Write(new Rect(0f, 22f, w, 20f), _game.Director.Objective.ToUpperInvariant(), centre, Gold);
        var sub = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
        Write(new Rect(0f, 42f, w, 18f), _game.Director.Subtitle, sub, Dim);
    }

    void DrawBossBar(float w, float h) {
        if (_boss == null || !_boss.Alive) return;
        float barW = Mathf.Min(560f, w * 0.6f);
        float x = (w - barW) * 0.5f, y = 76f;
        var centre = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
        Write(new Rect(0f, y - 20f, w, 18f), _boss.Def.Name.ToUpperInvariant(), centre, Text);
        Bar(new Rect(x, y, barW, 10f), _boss.Health / _boss.MaxHealth,
            _boss.Immune ? new Color(0.37f, 0.50f, 0.66f) : new Color(1f, 0.42f, 0.24f),
            new Color(1f, 1f, 1f, 0.1f));
        if (_boss.MaxShield > 0f && _boss.Shield > 0f) {
            Bar(new Rect(x, y - 6f, barW, 4f), _boss.Shield / _boss.MaxShield,
                ArtLibrary.Of(_boss.Def.ShieldElement), new Color(1f, 1f, 1f, 0.08f));
        }
        if (_boss.Immune) {
            var sub = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
            Write(new Rect(0f, y + 14f, w, 16f), "IMMUNE", sub, new Color(0.56f, 0.71f, 0.88f));
        }
    }

    void DrawBanner(float w, float h) {
        if (_bannerLife <= 0f || string.IsNullOrEmpty(_bannerText)) return;
        float t = _bannerLife / 2.6f;
        float alpha = t > 0.85f ? (1f - t) / 0.15f : Mathf.Clamp01(t / 0.3f);
        Write(new Rect(0f, h * 0.24f, w, 40f), _bannerText, _big, new Color(Text.r, Text.g, Text.b, alpha));
        if (!string.IsNullOrEmpty(_bannerSub)) {
            var sub = new GUIStyle(_label) { alignment = TextAnchor.MiddleCenter, fontSize = 14 };
            Write(new Rect(0f, h * 0.24f + 34f, w, 20f), _bannerSub, sub, new Color(Gold.r, Gold.g, Gold.b, alpha));
        }
    }

    void DrawFeed(float w, float h) {
        var right = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
        float y = 190f;
        for (int i = _feed.Count - 1; i >= 0; i--) {
            float a = Mathf.Clamp01(_feed[i].Life / 0.8f);
            Write(new Rect(w - 342f, y, 300f, 16f), _feed[i].Text, right, new Color(0.66f, 0.72f, 0.80f, a));
            y += 17f;
        }
    }

    void DrawToasts(float w, float h) {
        float y = 24f;
        for (int i = 0; i < _toasts.Count; i++) {
            var t = _toasts[i];
            float a = Mathf.Clamp01(t.Life / 0.6f);
            var rect = new Rect(w - 292f, y, 250f, 40f);
            Fill(rect, new Color(0.03f, 0.05f, 0.08f, 0.82f * a));
            Fill(new Rect(rect.x, rect.y, 3f, rect.height), new Color(t.Color.r, t.Color.g, t.Color.b, a));
            Write(new Rect(rect.x + 10f, rect.y + 4f, rect.width - 14f, 18f), t.Title, _label,
                  new Color(t.Color.r, t.Color.g, t.Color.b, a));
            Write(new Rect(rect.x + 10f, rect.y + 21f, rect.width - 14f, 14f), t.Sub, _small,
                  new Color(Dim.r, Dim.g, Dim.b, a));
            y += 46f;
        }
    }
}
}
