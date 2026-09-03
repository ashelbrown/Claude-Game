using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>
/// Profile persistence as JSON on disk.
///
/// Only rolled data is written — derived weapon numbers and perk hooks are
/// rebuilt on load from the catalog, so a balance change applies to gear the
/// player already owns instead of leaving stale numbers baked into the save.
/// </summary>
public static class SaveSystem {

    const string FileName = "starfall-profile.json";

    static string Path => System.IO.Path.Combine(Application.persistentDataPath, FileName);

    public static Profile CreateNew(string classId) => Profile.CreateNew(classId);

    // ------------------------------------------------------------- write
    public static bool Save(Profile p) {
        if (p == null) return false;
        try {
            var w = new Json.Writer();
            w.BeginObject();
            w.Field("version", Profile.Version);
            w.Field("classId", p.ClassId);
            w.Field("subclassId", p.SubclassId);
            w.Field("shards", p.Shards);
            w.Field("xp", p.Xp);
            w.Field("level", p.Level);
            w.Field("uidCounter", Loot.PeekUid());

            w.Key("settings").BeginObject();
            w.Field("sensitivity", p.Settings.Sensitivity);
            w.Field("invertY", p.Settings.InvertY);
            w.Field("volume", p.Settings.Volume);
            w.Field("showDamage", p.Settings.ShowDamageNumbers);
            w.EndObject();

            w.Key("stats").BeginObject();
            w.Field("kills", p.Stats.Kills);
            w.Field("deaths", p.Stats.Deaths);
            w.Field("activities", p.Stats.ActivitiesRun);
            w.Field("bossKills", p.Stats.BossKills);
            w.Field("exotics", p.Stats.ExoticsFound);
            w.Field("playTime", p.Stats.PlayTime);
            w.EndObject();

            w.Key("equipped").BeginObject();
            foreach (var kv in p.Equipped) w.Field(((int)kv.Key).ToString(), kv.Value);
            w.EndObject();

            w.Key("inventory").BeginArray();
            for (int i = 0; i < p.Inventory.Count; i++) WriteItem(w, p.Inventory[i]);
            w.EndArray();

            w.EndObject();
            File.WriteAllText(Path, w.ToString());
            return true;
        } catch (Exception e) {
            Debug.LogWarning("STARFALL: could not save profile — " + e.Message);
            return false;
        }
    }

    static void WriteItem(Json.Writer w, Item it) {
        w.BeginObject();
        w.Field("uid", it.Uid);
        w.Field("kind", (int)it.Kind);
        w.Field("rarity", (int)it.Rarity);
        w.Field("slot", (int)it.Slot);
        w.Field("power", it.Power);
        w.Field("name", it.Name);
        w.Field("flavor", it.Flavor);
        w.Field("locked", it.Locked);
        if (!string.IsNullOrEmpty(it.ExoticId)) w.Field("exotic", it.ExoticId);

        if (it.Kind == ItemKind.Weapon) {
            w.Field("family", it.FamilyId);
            w.Field("element", (int)it.Element);
            w.Key("stats").BeginArray();
            w.Value(it.Stats.Impact); w.Value(it.Stats.Range); w.Value(it.Stats.Stability);
            w.Value(it.Stats.Handling); w.Value(it.Stats.Reload); w.Value(it.Stats.Magazine);
            w.EndArray();
            w.Key("perks").BeginArray();
            for (int i = 0; i < it.PerkIds.Count; i++) w.Value(it.PerkIds[i]);
            w.EndArray();
        } else {
            w.Key("armor").BeginArray();
            for (int i = 0; i < Defs.StatCount; i++) w.Value(it.ArmorStats[i]);
            w.EndArray();
        }
        w.EndObject();
    }

    // ------------------------------------------------------------- read
    public static Profile Load() {
        try {
            if (!File.Exists(Path)) return null;
            var root = Json.Parse(File.ReadAllText(Path));
            if (root == null || !root.IsObject) return null;
            if (root["version"] == null || root["version"].AsInt() != Profile.Version) return null;

            var p = new Profile();
            p.ClassId = root["classId"].AsString("choralith");
            if (Catalog.FindClass(p.ClassId) == null) return null;
            p.SubclassId = root["subclassId"].AsString(Catalog.FindClass(p.ClassId).SubclassIds[0]);
            if (Catalog.FindSubclass(p.SubclassId) == null) p.SubclassId = Catalog.FindClass(p.ClassId).SubclassIds[0];
            p.Shards = root["shards"].AsInt(120);
            p.Xp = root["xp"].AsInt();
            p.Level = Mathf.Max(1, root["level"].AsInt(1));
            if (root["uidCounter"] != null) Loot.SeedUid(root["uidCounter"].AsInt());

            var settings = root["settings"];
            if (settings != null) {
                p.Settings.Sensitivity = settings["sensitivity"].AsFloat(2.2f);
                p.Settings.InvertY = settings["invertY"].AsBool();
                p.Settings.Volume = settings["volume"].AsFloat(0.7f);
                p.Settings.ShowDamageNumbers = settings["showDamage"].AsBool(true);
            }

            var stats = root["stats"];
            if (stats != null) {
                p.Stats.Kills = stats["kills"].AsInt();
                p.Stats.Deaths = stats["deaths"].AsInt();
                p.Stats.ActivitiesRun = stats["activities"].AsInt();
                p.Stats.BossKills = stats["bossKills"].AsInt();
                p.Stats.ExoticsFound = stats["exotics"].AsInt();
                p.Stats.PlayTime = stats["playTime"].AsFloat();
            }

            var inventory = root["inventory"];
            if (inventory != null && inventory.IsArray) {
                for (int i = 0; i < inventory.Count; i++) {
                    var item = ReadItem(inventory[i]);
                    if (item != null) p.Inventory.Add(item);
                }
            }

            var equipped = root["equipped"];
            if (equipped != null && equipped.IsObject) {
                foreach (var kv in equipped.Object) {
                    int slotIndex;
                    if (!int.TryParse(kv.Key, out slotIndex)) continue;
                    string uid = kv.Value.AsString();
                    // Drop references to items that no longer exist.
                    if (p.Find(uid) != null) p.Equipped[(Slot)slotIndex] = uid;
                }
            }
            return p;
        } catch (Exception e) {
            Debug.LogWarning("STARFALL: save data was unreadable, starting fresh — " + e.Message);
            return null;
        }
    }

    static Item ReadItem(Json.Node n) {
        if (n == null || !n.IsObject) return null;
        var it = new Item {
            Uid = n["uid"].AsString(Loot.NextUid()),
            Kind = (ItemKind)n["kind"].AsInt(),
            Rarity = (Rarity)n["rarity"].AsInt(),
            Slot = (Slot)n["slot"].AsInt(),
            Power = n["power"].AsInt(Defs.StartPower),
            Name = n["name"].AsString("Unknown"),
            Flavor = n["flavor"].AsString(""),
            Locked = n["locked"].AsBool(),
            ExoticId = n["exotic"] != null ? n["exotic"].AsString() : null,
        };

        if (it.Kind == ItemKind.Weapon) {
            it.FamilyId = n["family"].AsString("auto");
            if (Catalog.FindFamily(it.FamilyId) == null) return null;
            it.Element = (Element)n["element"].AsInt();
            var s = n["stats"];
            it.Stats = new WeaponStats();
            if (s != null && s.Count >= 6) {
                it.Stats.Impact = s[0].AsInt(); it.Stats.Range = s[1].AsInt();
                it.Stats.Stability = s[2].AsInt(); it.Stats.Handling = s[3].AsInt();
                it.Stats.Reload = s[4].AsInt(); it.Stats.Magazine = s[5].AsInt();
            }
            var perks = n["perks"];
            if (perks != null && perks.IsArray) {
                for (int i = 0; i < perks.Count; i++) {
                    string id = perks[i].AsString();
                    if (Catalog.FindPerk(id) != null) it.PerkIds.Add(id);
                }
            }
        } else {
            var a = n["armor"];
            if (a != null) {
                for (int i = 0; i < Defs.StatCount && i < a.Count; i++) it.ArmorStats[i] = a[i].AsInt();
            }
        }
        return it.Rebuild();
    }

    public static void Delete() {
        try { if (File.Exists(Path)) File.Delete(Path); }
        catch (Exception) { /* nothing useful to do */ }
    }

    public static bool Exists() {
        try { return File.Exists(Path); } catch (Exception) { return false; }
    }
}
}
