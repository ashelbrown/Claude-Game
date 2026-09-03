using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

public enum MenuScreen { None, Title, Director, Character, Pause, Results }

/// <summary>
/// Title, Director, Character and Results screens, drawn with IMGUI for the same
/// reason as the HUD: no Canvas, no prefabs, nothing to wire in the editor.
/// The inventory pages rather than scrolls, which avoids scroll-view state
/// entirely and reads fine at any resolution.
/// </summary>
public sealed class MenuUI : MonoBehaviour {

    GameManager _game;
    Texture2D _white;
    GUIStyle _label, _title, _heading, _small, _button;

    public MenuScreen Screen_ { get; private set; } = MenuScreen.Title;
    public bool IsOpen => Screen_ != MenuScreen.None;

    Item _selected;
    int _page;
    string _filter = "all";

    static readonly Color Bg = new Color(0.02f, 0.03f, 0.05f, 0.93f);
    static readonly Color Panel = new Color(0.05f, 0.07f, 0.11f, 0.95f);
    static readonly Color Line = new Color(0.49f, 0.65f, 0.86f, 0.22f);
    static readonly Color Text = new Color(0.85f, 0.89f, 0.96f);
    static readonly Color Dim = new Color(0.50f, 0.57f, 0.66f);
    static readonly Color Gold = new Color(0.91f, 0.77f, 0.42f);

    public void Bind(GameManager game) {
        _game = game;
        _white = new Texture2D(1, 1);
        _white.SetPixel(0, 0, Color.white);
        _white.Apply();
    }

    public void Open(MenuScreen screen) {
        Screen_ = screen;
        _game.LockCursor(false);
        if (screen == MenuScreen.Character) { _page = 0; _selected = null; }
    }

    public void CloseAll() {
        Screen_ = MenuScreen.None;
        if (_game.InActivity) _game.LockCursor(true);
    }

    public void Toggle(MenuScreen screen) {
        if (_game.State == GameState.Title || Screen_ == MenuScreen.Results) return;
        if (Screen_ == screen) {
            if (_game.InActivity) CloseAll(); else Open(MenuScreen.Director);
        } else Open(screen);
    }

    void EnsureStyles() {
        if (_label != null) return;
        _label = new GUIStyle { fontSize = 13, alignment = TextAnchor.MiddleLeft };
        _label.normal = new GUIStyleState { textColor = Text };
        _small = new GUIStyle(_label) { fontSize = 11 };
        _small.normal = new GUIStyleState { textColor = Dim };
        _heading = new GUIStyle(_label) { fontSize = 17, fontStyle = FontStyle.Bold };
        _title = new GUIStyle(_label) { fontSize = 44, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        _button = new GUIStyle(_label) { fontSize = 13, alignment = TextAnchor.MiddleCenter };
        _button.normal = new GUIStyleState { textColor = Text };
    }

    // ------------------------------------------------------------- helpers
    void Fill(Rect r, Color c) {
        var prev = GUI.color;
        GUI.color = c;
        GUI.DrawTexture(r, _white);
        GUI.color = prev;
    }

    void Frame(Rect r, Color fill, Color border) {
        Fill(r, fill);
        Fill(new Rect(r.x, r.y, r.width, 1f), border);
        Fill(new Rect(r.x, r.yMax - 1f, r.width, 1f), border);
        Fill(new Rect(r.x, r.y, 1f, r.height), border);
        Fill(new Rect(r.xMax - 1f, r.y, 1f, r.height), border);
    }

    void Write(Rect r, string text, GUIStyle style, Color color) {
        style.normal = new GUIStyleState { textColor = color };
        GUI.Label(r, text, style);
    }

    bool Button(Rect r, string text, Color accent) {
        bool hover = r.Contains(Event.current != null ? Event.current.mousePosition : Vector2.zero);
        Frame(r, hover ? new Color(0.12f, 0.17f, 0.26f, 0.95f) : new Color(0.08f, 0.11f, 0.17f, 0.9f),
              hover ? new Color(accent.r, accent.g, accent.b, 0.8f) : Line);
        Write(r, text, _button, accent);
        return GUI.Button(r, "", new GUIStyle());
    }

    // ------------------------------------------------------------- draw
    void OnGUI() {
        if (_game == null || Screen_ == MenuScreen.None) return;
        EnsureStyles();
        float w = UnityEngine.Screen.width, h = UnityEngine.Screen.height;
        Fill(new Rect(0, 0, w, h), Bg);

        switch (Screen_) {
            case MenuScreen.Title: DrawTitle(w, h); break;
            case MenuScreen.Director: DrawDirector(w, h); break;
            case MenuScreen.Character: DrawCharacter(w, h); break;
            case MenuScreen.Pause: DrawPause(w, h); break;
            case MenuScreen.Results: DrawResults(w, h); break;
        }
    }

    // ------------------------------------------------------------- title
    void DrawTitle(float w, float h) {
        Write(new Rect(0f, h * 0.16f, w, 60f), "STARFALL", _title, Text);
        var centre = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
        Write(new Rect(0f, h * 0.16f + 56f, w, 20f),
              "A LOOTER-SHOOTER IN THE DARK BETWEEN STARS", centre, Dim);

        var cls = Catalog.Classes[0];
        float cardW = 520f, cardH = 210f;
        var card = new Rect((w - cardW) * 0.5f, h * 0.34f, cardW, cardH);
        Frame(card, Panel, Line);
        Write(new Rect(card.x + 20f, card.y + 14f, cardW - 40f, 22f), cls.Name.ToUpperInvariant(), _heading, Text);
        Write(new Rect(card.x + 20f, card.y + 36f, cardW - 40f, 18f), cls.Role.ToUpperInvariant(), _small, Gold);
        var wrap = new GUIStyle(_small) { wordWrap = true, alignment = TextAnchor.UpperLeft };
        Write(new Rect(card.x + 20f, card.y + 60f, cardW - 40f, 44f), cls.Blurb, wrap, Dim);
        for (int i = 0; i < cls.Highlights.Length; i++) {
            string line = cls.Highlights[i].Replace("<b>", "").Replace("</b>", "");
            Write(new Rect(card.x + 20f, card.y + 112f + i * 20f, cardW - 40f, 18f), "· " + line, _small, Text);
        }

        float by = card.yMax + 26f;
        if (SaveSystem.Exists() && _game.Profile != null) {
            if (Button(new Rect(w * 0.5f - 210f, by, 200f, 40f), "CONTINUE", Gold)) {
                _game.Audio.Ui("click");
                _game.ContinueProfile();
            }
            if (Button(new Rect(w * 0.5f + 10f, by, 200f, 40f), "NEW GUARDIAN", new Color(1f, 0.45f, 0.45f))) {
                _game.Audio.Ui("back");
                SaveSystem.Delete();
                _game.NewProfile(cls.Id);
            }
        } else {
            if (Button(new Rect(w * 0.5f - 110f, by, 220f, 44f), "BEGIN", Gold)) {
                _game.Audio.Ui("click");
                _game.NewProfile(cls.Id);
            }
        }

        var foot = new GUIStyle(_small) { alignment = TextAnchor.MiddleCenter };
        Write(new Rect(0f, h - 60f, w, 18f),
              "WASD move · SPACE disperse · SHIFT sprint · CTRL slide · " +
              "Q grenade · E melee · F shed · X super · TAB character · M director", foot, Dim);
    }

    // ------------------------------------------------------------- director
    void DrawDirector(float w, float h) {
        Header(w, "DIRECTOR", "Select a destination");
        var profile = _game.Profile;
        var right = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
        Write(new Rect(0f, 30f, w - 40f, 18f),
              "POWER " + profile.Power + "  ·  LEVEL " + profile.Level + "  ·  " + profile.Shards + " SHARDS",
              right, Gold);

        float cardW = Mathf.Min(420f, (w - 120f) * 0.5f), cardH = 150f;
        float x0 = (w - (cardW * 2f + 20f)) * 0.5f;
        int power = profile.Power;

        for (int i = 0; i < Activities.All.Length; i++) {
            var a = Activities.All[i];
            var r = new Rect(x0 + (i % 2) * (cardW + 20f), 110f + (i / 2) * (cardH + 18f), cardW, cardH);
            bool locked = power < a.UnlockPower;
            Frame(r, Panel, locked ? new Color(0.3f, 0.3f, 0.3f, 0.2f) : Line);

            Write(new Rect(r.x + 16f, r.y + 12f, r.width - 32f, 16f),
                  a.Type.ToUpperInvariant() +
                  (a.RewardTier != RewardTier.World ? " · " + a.RewardTier.ToString().ToUpperInvariant() + " REWARDS" : ""),
                  _small, Gold);
            Write(new Rect(r.x + 16f, r.y + 30f, r.width - 32f, 22f), a.Name.ToUpperInvariant(), _heading,
                  locked ? Dim : Text);
            var wrap = new GUIStyle(_small) { wordWrap = true, alignment = TextAnchor.UpperLeft };
            Write(new Rect(r.x + 16f, r.y + 56f, r.width - 32f, 52f), a.Description, wrap, Dim);

            int delta = power - a.Power;
            string verdict = locked ? "LOCKED — POWER " + a.UnlockPower
                           : delta >= 10 ? "ADVANTAGE"
                           : delta >= -10 ? "MATCHED"
                           : delta >= -40 ? "UNDERLEVELLED" : "SEVERELY UNDERLEVELLED";
            Color vc = locked ? Dim
                     : delta >= 10 ? new Color(0.5f, 0.88f, 0.54f)
                     : delta >= -10 ? Text : new Color(1f, 0.42f, 0.42f);
            Write(new Rect(r.x + 16f, r.yMax - 26f, r.width - 32f, 16f), "RECOMMENDED " + a.Power, _small, Dim);
            var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(r.x + 16f, r.yMax - 26f, r.width - 32f, 16f), verdict, rt, vc);

            if (!locked && GUI.Button(r, "", new GUIStyle())) {
                _game.Audio.Ui("click");
                _game.StartActivity(a.Id);
            }
        }

        Footer(w, h, new[] { "CHARACTER [TAB]", _game.InActivity ? "RESUME [ESC]" : "" });
    }

    // ------------------------------------------------------------- character
    void DrawCharacter(float w, float h) {
        var profile = _game.Profile;
        var loadout = profile.BuildLoadout();
        Header(w, "CHARACTER",
               Catalog.FindClass(profile.ClassId).Name + " · Level " + profile.Level + " · Power " + loadout.Power);

        // --- left: equipment and stats
        float col = 300f;
        var panel = new Rect(40f, 100f, col, h - 180f);
        Frame(panel, Panel, Line);
        Write(new Rect(panel.x + 14f, panel.y + 10f, col - 28f, 18f), "EQUIPMENT", _small, Dim);
        float y = panel.y + 34f;
        foreach (var slot in Defs.AllSlots) {
            var item = loadout.Get(slot);
            var r = new Rect(panel.x + 10f, y, col - 20f, 34f);
            if (item != null && _selected == item) Frame(r, new Color(0.1f, 0.14f, 0.22f, 0.9f), Gold);
            Write(new Rect(r.x + 6f, r.y + 3f, r.width - 60f, 16f),
                  item != null ? item.Name : "Empty", _label,
                  item != null ? ArtLibrary.Of(item.Rarity) : Dim);
            Write(new Rect(r.x + 6f, r.y + 18f, r.width - 60f, 14f), Defs.SlotName(slot).ToUpperInvariant(), _small, Dim);
            var rt = new GUIStyle(_label) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(r.x, r.y + 8f, r.width - 8f, 18f), item != null ? item.Power.ToString() : "—", rt, Gold);
            if (item != null && GUI.Button(r, "", new GUIStyle())) _selected = item;
            y += 36f;
        }

        y += 12f;
        Write(new Rect(panel.x + 14f, y, col - 28f, 18f), "ATTRIBUTES", _small, Dim);
        y += 22f;
        foreach (var stat in Defs.Stats) {
            int v = loadout.Stats[(int)stat];
            Write(new Rect(panel.x + 14f, y, 100f, 16f), Defs.StatName(stat).ToUpperInvariant(), _small, Dim);
            var bar = new Rect(panel.x + 118f, y + 5f, col - 190f, 6f);
            Fill(bar, new Color(1f, 1f, 1f, 0.08f));
            Fill(new Rect(bar.x, bar.y, bar.width * (v / 100f), bar.height), new Color(0.45f, 0.75f, 1f));
            var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(panel.x, y, col - 14f, 16f), v + "  T" + Defs.Tier(v), rt, Text);
            y += 18f;
        }

        y += 14f;
        Write(new Rect(panel.x + 14f, y, col - 28f, 18f), "SUBCLASS", _small, Dim);
        y += 22f;
        var cls = Catalog.FindClass(profile.ClassId);
        for (int i = 0; i < cls.SubclassIds.Length; i++) {
            var sub = Catalog.FindSubclass(cls.SubclassIds[i]);
            var r = new Rect(panel.x + 10f, y, col - 20f, 30f);
            bool active = profile.SubclassId == sub.Id;
            Frame(r, active ? new Color(0.1f, 0.14f, 0.22f, 0.9f) : new Color(0f, 0f, 0f, 0.2f),
                  active ? ArtLibrary.Of(sub.Element) : Line);
            Write(new Rect(r.x + 8f, r.y + 2f, r.width - 16f, 15f), sub.Name, _label, ArtLibrary.Of(sub.Element));
            Write(new Rect(r.x + 8f, r.y + 16f, r.width - 16f, 13f),
                  Catalog.FindSuper(sub.SuperId).Name, _small, Dim);
            if (GUI.Button(r, "", new GUIStyle())) {
                profile.SubclassId = sub.Id;
                _game.Audio.Ui("click");
                SaveSystem.Save(profile);
            }
            y += 32f;
        }

        // --- middle: inventory, paged
        float invX = panel.xMax + 20f;
        float detailW = 300f;
        float invW = w - invX - detailW - 60f;
        var inv = new Rect(invX, 100f, invW, h - 180f);
        Frame(inv, Panel, Line);

        var items = FilteredItems(profile);
        int perPage = Mathf.Max(1, Mathf.FloorToInt((inv.height - 70f) / 46f));
        int pages = Mathf.Max(1, Mathf.CeilToInt(items.Count / (float)perPage));
        _page = Mathf.Clamp(_page, 0, pages - 1);

        string[] filters = { "all", "weapon", "armor", "exotic" };
        for (int i = 0; i < filters.Length; i++) {
            var r = new Rect(inv.x + 10f + i * 84f, inv.y + 10f, 78f, 22f);
            if (Button(r, filters[i].ToUpperInvariant(), _filter == filters[i] ? Gold : Dim)) {
                _filter = filters[i]; _page = 0;
            }
        }
        if (Button(new Rect(inv.xMax - 150f, inv.y + 10f, 140f, 22f), "DISMANTLE JUNK", new Color(1f, 0.5f, 0.5f))) {
            int n = profile.DismantleJunk();
            _game.Audio.Ui("click");
            _game.Hud.Banner("DISMANTLED " + n, "");
            SaveSystem.Save(profile);
        }

        float iy = inv.y + 44f;
        for (int i = _page * perPage; i < items.Count && i < (_page + 1) * perPage; i++) {
            var item = items[i];
            var r = new Rect(inv.x + 10f, iy, inv.width - 20f, 42f);
            bool equipped = profile.IsEquipped(item);
            Frame(r, _selected == item ? new Color(0.11f, 0.15f, 0.24f, 0.95f) : new Color(0f, 0f, 0f, 0.25f),
                  equipped ? Gold : Line);
            Fill(new Rect(r.x, r.y, 3f, r.height), ArtLibrary.Of(item.Rarity));
            Write(new Rect(r.x + 12f, r.y + 4f, r.width - 90f, 17f), item.Name, _label, ArtLibrary.Of(item.Rarity));
            Write(new Rect(r.x + 12f, r.y + 22f, r.width - 90f, 15f), item.Subtitle(), _small, Dim);
            var rt = new GUIStyle(_label) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(r.x, r.y + 12f, r.width - 12f, 18f),
                  (equipped ? "EQUIPPED  " : "") + item.Power, rt, Gold);
            if (GUI.Button(r, "", new GUIStyle())) _selected = item;
            iy += 46f;
        }

        if (pages > 1) {
            if (Button(new Rect(inv.x + 10f, inv.yMax - 30f, 80f, 22f), "◄ PREV", Text)) _page = Mathf.Max(0, _page - 1);
            if (Button(new Rect(inv.x + 96f, inv.yMax - 30f, 80f, 22f), "NEXT ►", Text)) _page = Mathf.Min(pages - 1, _page + 1);
            var ct = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(inv.x, inv.yMax - 30f, inv.width - 12f, 22f),
                  "PAGE " + (_page + 1) + " / " + pages + "   ·   " + items.Count + " ITEMS", ct, Dim);
        }

        DrawItemDetail(new Rect(inv.xMax + 20f, 100f, detailW, h - 180f), profile);
        Footer(w, h, new[] { "DIRECTOR [M]", _game.InActivity ? "RESUME [ESC]" : "" });
    }

    List<Item> FilteredItems(Profile profile) {
        var list = new List<Item>();
        for (int i = 0; i < profile.Inventory.Count; i++) {
            var it = profile.Inventory[i];
            if (_filter == "weapon" && it.Kind != ItemKind.Weapon) continue;
            if (_filter == "armor" && it.Kind != ItemKind.Armor) continue;
            if (_filter == "exotic" && it.Rarity != Rarity.Exotic) continue;
            list.Add(it);
        }
        list.Sort((a, b) => b.Power != a.Power ? b.Power.CompareTo(a.Power) : b.Score().CompareTo(a.Score()));
        return list;
    }

    void DrawItemDetail(Rect r, Profile profile) {
        Frame(r, Panel, Line);
        if (_selected == null) {
            Write(new Rect(r.x + 14f, r.y + 20f, r.width - 28f, 18f), "Select an item", _small, Dim);
            return;
        }
        var item = _selected;
        Write(new Rect(r.x + 14f, r.y + 14f, r.width - 28f, 24f), item.Name, _heading, ArtLibrary.Of(item.Rarity));
        Write(new Rect(r.x + 14f, r.y + 38f, r.width - 28f, 16f),
              item.Subtitle() + " · POWER " + item.Power, _small, Dim);

        float y = r.y + 64f;
        if (item.Kind == ItemKind.Weapon) {
            string[] names = { "IMPACT", "RANGE", "STABILITY", "HANDLING", "RELOAD", "MAGAZINE" };
            int[] values = { item.Stats.Impact, item.Stats.Range, item.Stats.Stability,
                             item.Stats.Handling, item.Stats.Reload, item.Stats.Magazine };
            for (int i = 0; i < names.Length; i++) {
                Write(new Rect(r.x + 14f, y, 90f, 15f), names[i], _small, Dim);
                var bar = new Rect(r.x + 106f, y + 5f, r.width - 160f, 5f);
                Fill(bar, new Color(1f, 1f, 1f, 0.08f));
                Fill(new Rect(bar.x, bar.y, bar.width * (values[i] / 100f), bar.height), new Color(0.45f, 0.75f, 1f));
                var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
                Write(new Rect(r.x, y, r.width - 14f, 15f), values[i].ToString(), rt, Text);
                y += 17f;
            }
            var d = item.Derived;
            y += 6f;
            Write(new Rect(r.x + 14f, y, r.width - 28f, 15f),
                  Mathf.Round(d.Damage) + " dmg · " + Mathf.Round(d.Rpm) + " rpm · " + d.Magazine + " rounds", _small, Dim);
            y += 22f;
            var perks = item.Perks;
            for (int i = 0; i < perks.Count; i++) {
                Write(new Rect(r.x + 14f, y, r.width - 28f, 16f), perks[i].Name, _label,
                      perks[i].IsExoticTrait ? Gold : Text);
                var wrap = new GUIStyle(_small) { wordWrap = true, alignment = TextAnchor.UpperLeft };
                Write(new Rect(r.x + 14f, y + 16f, r.width - 28f, 32f), perks[i].Description, wrap, Dim);
                y += 52f;
            }
        } else {
            foreach (var stat in Defs.Stats) {
                int v = item.GetStat(stat);
                Write(new Rect(r.x + 14f, y, 90f, 15f), Defs.StatName(stat).ToUpperInvariant(), _small, Dim);
                var bar = new Rect(r.x + 106f, y + 5f, r.width - 160f, 5f);
                Fill(bar, new Color(1f, 1f, 1f, 0.08f));
                Fill(new Rect(bar.x, bar.y, bar.width * Mathf.Clamp01(v / 34f), bar.height), new Color(0.45f, 0.75f, 1f));
                var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
                Write(new Rect(r.x, y, r.width - 14f, 15f), v.ToString(), rt, Text);
                y += 17f;
            }
            y += 6f;
            Write(new Rect(r.x + 14f, y, r.width - 28f, 15f), "TOTAL " + item.ArmorTotal, _small, Gold);
            y += 22f;
            if (!string.IsNullOrEmpty(item.ExoticId)) {
                var ex = Catalog.FindExoticArmor(item.ExoticId);
                if (ex != null) {
                    Write(new Rect(r.x + 14f, y, r.width - 28f, 16f), ex.TraitName, _label, Gold);
                    var wrap = new GUIStyle(_small) { wordWrap = true, alignment = TextAnchor.UpperLeft };
                    Write(new Rect(r.x + 14f, y + 16f, r.width - 28f, 44f), ex.TraitDescription, wrap, Dim);
                    y += 64f;
                }
            }
        }

        // --- actions
        float by = r.yMax - 76f;
        if (!profile.IsEquipped(item)) {
            if (Button(new Rect(r.x + 14f, by, 120f, 26f), "EQUIP", Gold)) {
                profile.Equip(item);
                _game.Audio.Pickup();
                if (_game.InActivity) {
                    var lo = profile.BuildLoadout();
                    _game.Player.ApplyLoadout(lo.Power, lo.Stats, Catalog.FindClass(profile.ClassId));
                    _game.Weapons.EquipFrom(lo);
                }
                SaveSystem.Save(profile);
            }
        }
        if (Button(new Rect(r.x + 144f, by, 100f, 26f), item.Locked ? "UNLOCK" : "LOCK", Text)) {
            item.Locked = !item.Locked;
            SaveSystem.Save(profile);
        }
        if (!profile.IsEquipped(item) && !item.Locked) {
            if (Button(new Rect(r.x + 14f, by + 32f, 230f, 26f),
                       "DISMANTLE  +" + Loot.DismantleValue(item), new Color(1f, 0.5f, 0.5f))) {
                profile.Dismantle(item);
                _selected = null;
                _game.Audio.Ui("back");
                SaveSystem.Save(profile);
            }
        }
    }

    // ------------------------------------------------------------- pause
    void DrawPause(float w, float h) {
        var r = new Rect((w - 380f) * 0.5f, (h - 340f) * 0.5f, 380f, 340f);
        Frame(r, Panel, Line);
        Write(new Rect(r.x + 20f, r.y + 16f, r.width - 40f, 24f), "PAUSED", _heading, Text);
        Write(new Rect(r.x + 20f, r.y + 42f, r.width - 40f, 16f),
              _game.Director != null ? _game.Activity.Name + " · " + _game.Director.Objective : "In orbit",
              _small, Dim);

        float y = r.y + 76f;
        if (Button(new Rect(r.x + 20f, y, r.width - 40f, 32f), "RESUME", Gold)) CloseAll();
        y += 38f;
        if (Button(new Rect(r.x + 20f, y, r.width - 40f, 32f), "CHARACTER  [TAB]", Text)) Open(MenuScreen.Character);
        y += 38f;
        if (Button(new Rect(r.x + 20f, y, r.width - 40f, 32f), "DIRECTOR  [M]", Text)) Open(MenuScreen.Director);
        y += 46f;

        var s = _game.Profile.Settings;
        Write(new Rect(r.x + 20f, y, 120f, 16f), "SENSITIVITY", _small, Dim);
        s.Sensitivity = GUI.HorizontalSlider(new Rect(r.x + 140f, y + 4f, r.width - 200f, 12f), s.Sensitivity, 0.4f, 6f);
        var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
        Write(new Rect(r.x, y, r.width - 20f, 16f), s.Sensitivity.ToString("0.0"), rt, Text);
        y += 24f;
        Write(new Rect(r.x + 20f, y, 120f, 16f), "VOLUME", _small, Dim);
        s.Volume = GUI.HorizontalSlider(new Rect(r.x + 140f, y + 4f, r.width - 200f, 12f), s.Volume, 0f, 1f);
        _game.Audio.SetVolume(s.Volume);
        Write(new Rect(r.x, y, r.width - 20f, 16f), Mathf.RoundToInt(s.Volume * 100f) + "%", rt, Text);
        y += 24f;
        s.InvertY = GUI.Toggle(new Rect(r.x + 20f, y, r.width - 40f, 20f), s.InvertY, " Invert Y");
        y += 30f;

        if (Button(new Rect(r.x + 20f, y, r.width - 40f, 30f), "ABANDON ACTIVITY", new Color(1f, 0.45f, 0.45f))) {
            SaveSystem.Save(_game.Profile);
            _game.ReturnToOrbit();
        }
    }

    // ------------------------------------------------------------- results
    void DrawResults(float w, float h) {
        var run = _game.Run;
        var r = new Rect((w - 520f) * 0.5f, (h - 420f) * 0.5f, 520f, 420f);
        Frame(r, Panel, Line);
        Write(new Rect(r.x + 24f, r.y + 18f, r.width - 48f, 28f),
              run.Won ? "ACTIVITY COMPLETE" : "ACTIVITY ENDED", _heading, Text);
        Write(new Rect(r.x + 24f, r.y + 46f, r.width - 48f, 18f), run.Verdict.ToUpperInvariant(), _small,
              run.Won ? new Color(0.5f, 0.88f, 0.54f) : new Color(1f, 0.42f, 0.42f));

        string[,] rows = {
            { "ACTIVITY", _game.Activity != null ? _game.Activity.Name : "—" },
            { "TIME", Mathf.FloorToInt(run.Duration / 60f) + ":" + (Mathf.FloorToInt(run.Duration % 60f)).ToString("00") },
            { "KILLS", run.Kills.ToString() },
            { "DEATHS", run.Deaths.ToString() },
            { "EXPERIENCE", "+" + run.Xp },
        };
        float y = r.y + 78f;
        for (int i = 0; i < rows.GetLength(0); i++) {
            Write(new Rect(r.x + 24f, y, 200f, 18f), rows[i, 0], _small, Dim);
            var rt = new GUIStyle(_label) { alignment = TextAnchor.MiddleRight };
            Write(new Rect(r.x, y, r.width - 24f, 18f), rows[i, 1], rt, Text);
            Fill(new Rect(r.x + 24f, y + 20f, r.width - 48f, 1f), Line);
            y += 26f;
        }

        if (run.Rewards.Count > 0) {
            Write(new Rect(r.x + 24f, y + 6f, r.width - 48f, 18f), "REWARDS", _small, Gold);
            y += 28f;
            for (int i = 0; i < run.Rewards.Count && i < 4; i++) {
                var item = run.Rewards[i];
                Write(new Rect(r.x + 24f, y, r.width - 48f, 18f), item.Name, _label, ArtLibrary.Of(item.Rarity));
                var rt = new GUIStyle(_small) { alignment = TextAnchor.MiddleRight };
                Write(new Rect(r.x, y, r.width - 24f, 18f), item.Subtitle() + " · " + item.Power, rt, Dim);
                y += 22f;
            }
        }

        float by = r.yMax - 48f;
        if (Button(new Rect(r.x + 24f, by, 150f, 32f), run.Won ? "RUN IT AGAIN" : "RETRY", Gold)) {
            _game.StartActivity(_game.Activity.Id);
        }
        if (Button(new Rect(r.x + 184f, by, 150f, 32f), "RETURN TO ORBIT", Text)) _game.ReturnToOrbit();
        if (Button(new Rect(r.x + 344f, by, 150f, 32f), "CHARACTER", Text)) Open(MenuScreen.Character);
    }

    // ------------------------------------------------------------- chrome
    void Header(float w, string title, string subtitle) {
        Fill(new Rect(0f, 0f, w, 70f), new Color(0.03f, 0.05f, 0.08f, 0.9f));
        Fill(new Rect(0f, 70f, w, 1f), Line);
        Write(new Rect(40f, 22f, 400f, 26f), title, _heading, Text);
        Write(new Rect(40f, 46f, 500f, 16f), subtitle, _small, Dim);
    }

    void Footer(float w, float h, string[] hints) {
        Fill(new Rect(0f, h - 44f, w, 1f), Line);
        float x = 40f;
        for (int i = 0; i < hints.Length; i++) {
            if (string.IsNullOrEmpty(hints[i])) continue;
            Write(new Rect(x, h - 34f, 240f, 18f), hints[i], _small, Dim);
            x += 180f;
        }
    }
}
}
