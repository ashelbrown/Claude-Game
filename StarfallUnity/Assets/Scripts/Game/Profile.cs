using System.Collections.Generic;
using UnityEngine;
using Starfall.Core;

namespace Starfall.Game {

/// <summary>The equipped set, resolved once and handed to the systems that need it.</summary>
public sealed class Loadout {
    public readonly Dictionary<Slot, Item> Equipped = new Dictionary<Slot, Item>();
    public int Power;
    public int[] Stats;

    public Item Get(Slot slot) {
        Item it;
        return Equipped.TryGetValue(slot, out it) ? it : null;
    }
}

public sealed class ProfileSettings {
    public float Sensitivity = 2.2f;
    public bool InvertY;
    public float Volume = 0.7f;
    public bool ShowDamageNumbers = true;
}

public sealed class ProfileStats {
    public int Kills, Deaths, ActivitiesRun, BossKills, ExoticsFound;
    public float PlayTime;
}

/// <summary>The saved character: inventory, equipment, currency and progress.</summary>
public sealed class Profile {
    public const int Version = 1;

    public string ClassId = "choralith";
    public string SubclassId = "emberchoir";
    public int Shards = 120;
    public int Xp;
    public int Level = 1;
    public readonly List<Item> Inventory = new List<Item>();
    public readonly Dictionary<Slot, string> Equipped = new Dictionary<Slot, string>();
    public readonly ProfileSettings Settings = new ProfileSettings();
    public readonly ProfileStats Stats = new ProfileStats();

    const int InventoryCap = 220;

    public int Power => Loot.ComputePower(BuildLoadout().Equipped);

    public Item Find(string uid) {
        if (string.IsNullOrEmpty(uid)) return null;
        for (int i = 0; i < Inventory.Count; i++) if (Inventory[i].Uid == uid) return Inventory[i];
        return null;
    }

    public Loadout BuildLoadout() {
        var loadout = new Loadout();
        foreach (var slot in Defs.AllSlots) {
            string uid;
            if (!Equipped.TryGetValue(slot, out uid)) continue;
            var item = Find(uid);
            if (item != null) loadout.Equipped[slot] = item;
        }
        loadout.Power = Loot.ComputePower(loadout.Equipped);
        loadout.Stats = Loot.ComputeStats(loadout.Equipped, Catalog.FindClass(ClassId));
        return loadout;
    }

    public bool IsEquipped(Item item) {
        if (item == null) return false;
        string uid;
        return Equipped.TryGetValue(item.Slot, out uid) && uid == item.Uid;
    }

    public bool HasExoticArmor(string exoticId) {
        foreach (var slot in Defs.ArmorSlots) {
            string uid;
            if (!Equipped.TryGetValue(slot, out uid)) continue;
            var it = Find(uid);
            if (it != null && it.ExoticId == exoticId) return true;
        }
        return false;
    }

    /// <summary>Equip, unequipping any conflicting exotic first.</summary>
    public Slot? Equip(Item item) {
        if (item == null) return null;
        var loadout = BuildLoadout();
        Slot? conflict = Loot.ExoticConflict(loadout.Equipped, item);
        if (conflict.HasValue) Equipped.Remove(conflict.Value);
        Equipped[item.Slot] = item.Uid;
        return conflict;
    }

    public void AddItem(Item item) {
        Inventory.Add(item);
        if (Inventory.Count <= InventoryCap) return;
        // Auto-shard the worst unlocked junk rather than refusing the drop.
        for (int i = 0; i < Inventory.Count && Inventory.Count > InventoryCap; i++) {
            var it = Inventory[i];
            if (it.Locked || IsEquipped(it)) continue;
            if (it.Rarity != Rarity.Common && it.Rarity != Rarity.Uncommon) continue;
            Shards += Loot.DismantleValue(it);
            Inventory.RemoveAt(i);
            i--;
        }
    }

    public bool Dismantle(Item item) {
        if (item == null || item.Locked || IsEquipped(item)) return false;
        Shards += Loot.DismantleValue(item);
        Inventory.Remove(item);
        return true;
    }

    public int DismantleJunk() {
        int gained = 0, count = 0;
        for (int i = Inventory.Count - 1; i >= 0; i--) {
            var it = Inventory[i];
            if (it.Locked || IsEquipped(it)) continue;
            if (it.Rarity != Rarity.Common && it.Rarity != Rarity.Uncommon) continue;
            gained += Loot.DismantleValue(it);
            Inventory.RemoveAt(i);
            count++;
        }
        Shards += gained;
        return count;
    }

    public bool Infuse(Item target, Item source) {
        if (!Loot.CanInfuse(target, source)) return false;
        int cost = Loot.InfusionCost(target, source);
        if (Shards < cost || source.Locked) return false;
        Shards -= cost;
        target.Power = source.Power;
        Inventory.Remove(source);
        return true;
    }

    public static Profile CreateNew(string classId) {
        var cls = Catalog.FindClass(classId) ?? Catalog.Classes[0];
        var profile = new Profile {
            ClassId = cls.Id,
            SubclassId = cls.SubclassIds[0],
        };
        var rng = new Rng(Random.Range(1, int.MaxValue));
        foreach (var item in Loot.StartingLoadout(cls.Id, rng)) {
            profile.Inventory.Add(item);
            profile.Equipped[item.Slot] = item.Uid;
        }
        return profile;
    }
}
}
