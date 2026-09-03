using System;
using System.Collections.Generic;

namespace Starfall.Core {

public sealed class ExoticArmorDef {
    public string Id;
    public string Name;
    public Slot Slot;
    public string ClassId;      // null = any class
    public string Flavor;
    public string TraitName;
    public string TraitDescription;
    public readonly Dictionary<StatId, int> StatBias = new Dictionary<StatId, int>();
}

public static partial class Catalog {

    static readonly string[] ArmorSetNames = {
        "Wildwood", "Ironhaven", "Deepstrike", "Sunwake", "Ashfall", "Nightward", "Palefire",
        "Longwatch", "Sable", "Highwater", "Cinderline", "Stormcall", "Graveline", "Vantage",
        "Terminator", "Quorum", "Stillwater"
    };

    static readonly Dictionary<Slot, string[]> ArmorPieceNames = new Dictionary<Slot, string[]> {
        { Slot.Helmet,    new[] { "Helm", "Cowl", "Mask", "Visor", "Crown", "Lensguard" } },
        { Slot.Arms,      new[] { "Gauntlets", "Grips", "Gloves", "Vambraces", "Wraps" } },
        { Slot.Chest,     new[] { "Plate", "Vest", "Carapace", "Harness", "Cuirass" } },
        { Slot.Legs,      new[] { "Greaves", "Boots", "Strides", "Treads", "Spurs" } },
        { Slot.ClassItem, new[] { "Mark", "Cloak", "Bond", "Sigil", "Standard" } },
    };

    public static readonly string[] ArmorFlavor = {
        "Patched more times than it was ever manufactured.",
        "The plating still carries scoring from something with claws.",
        "Warm to the touch, hours after you take it off.",
        "Fits like it was waiting for you specifically.",
        "Recovered from a pile that nobody wanted to catalogue.",
        "Whoever wore this last got further than anyone expected.",
    };

    public static string RollArmorName(Rng rng, Slot slot) {
        string[] pieces;
        if (!ArmorPieceNames.TryGetValue(slot, out pieces)) pieces = ArmorPieceNames[Slot.Chest];
        return rng.Pick(ArmorSetNames) + " " + rng.Pick(pieces);
    }

    // ------------------------------------------------------------- exotics
    public static readonly ExoticArmorDef[] ExoticArmor = BuildExoticArmor();

    static ExoticArmorDef Ex(string id, string name, Slot slot, string classId, string flavor,
                             string traitName, string traitDesc, params object[] bias) {
        var d = new ExoticArmorDef {
            Id = id, Name = name, Slot = slot, ClassId = classId, Flavor = flavor,
            TraitName = traitName, TraitDescription = traitDesc
        };
        for (int i = 0; i + 1 < bias.Length; i += 2) d.StatBias[(StatId)bias[i]] = (int)bias[i + 1];
        return d;
    }

    static ExoticArmorDef[] BuildExoticArmor() {
        return new[] {
            Ex("quorum_crown", "Quorum Crown", Slot.Helmet, "choralith",
               "Ten lenses, and not one of them agrees with the others.",
               "Wider Spectrum",
               "Polarised Sight reaches further and marks whatever it outlines for +20% damage.",
               StatId.Intellect, 12, StatId.Recovery, 6),

            Ex("shed_harness", "Shed Harness", Slot.Chest, "choralith",
               "The rack is scored where facets have torn free, over and over.",
               "Second Quorum",
               "You may keep two facets Shed at once, and reabsorbing one grants a large overshield.",
               StatId.Resilience, 12, StatId.Strength, 6),

            Ex("stillwater_grips", "Stillwater Grips", Slot.Arms, "choralith",
               "Cold enough that the air around them stops moving.",
               "Held Breath",
               "Stilling triggers at higher health, recovers faster, and blinds nearby enemies.",
               StatId.Resilience, 14, StatId.Discipline, 5),

            Ex("terminator_spurs", "Terminator Spurs", Slot.Legs, "choralith",
               "Built for a world where standing still is how you die.",
               "Stormstep",
               "Disperse gains a second charge and leaves a damaging afterimage.",
               StatId.Mobility, 15, StatId.Intellect, 4),

            Ex("second_wind", "Second Wind", Slot.Legs, null,
               "Built for people who are always almost dead.",
               "Last Stand",
               "While critically wounded, kills grant Super energy and briefly boost damage.",
               StatId.Recovery, 10, StatId.Resilience, 8),

            Ex("vagabond_sigil", "Vagabond Sigil", Slot.ClassItem, null,
               "A road, a rifle, and no intention of stopping.",
               "Wanderlust",
               "Sprinting regenerates all ability energy faster.",
               StatId.Mobility, 10, StatId.Discipline, 6, StatId.Strength, 6),

            Ex("graven_helm", "Graven Helm", Slot.Helmet, null,
               "The visor shows you exactly how much trouble you are in.",
               "Threat Sense",
               "Enemies are outlined through walls and your radar reaches further.",
               StatId.Resilience, 8, StatId.Recovery, 8),

            Ex("stormfeet", "Stormfeet", Slot.Legs, null,
               "Do not stand still in them. They get ideas.",
               "Momentum",
               "Sprinting builds a damage charge released by your next melee.",
               StatId.Mobility, 14, StatId.Strength, 5),

            Ex("ashborne_plate", "Ashborne Plate", Slot.Chest, null,
               "It has never been cleaned. It has never needed to be.",
               "Kindled Bulwark",
               "Ability kills restore health and grant a decaying overshield.",
               StatId.Resilience, 12, StatId.Recovery, 6),

            Ex("astral_coil", "Astral Coil", Slot.Arms, null,
               "Three ideas, thrown at once, in the hope that one lands.",
               "Trine",
               "Your grenades split into three smaller charges.",
               StatId.Discipline, 15, StatId.Intellect, 4),
        };
    }

    static Dictionary<string, ExoticArmorDef> _exoticArmorById;

    public static ExoticArmorDef FindExoticArmor(string id) {
        if (_exoticArmorById == null) {
            _exoticArmorById = new Dictionary<string, ExoticArmorDef>();
            foreach (var e in ExoticArmor) _exoticArmorById[e.Id] = e;
        }
        ExoticArmorDef def;
        return _exoticArmorById.TryGetValue(id, out def) ? def : null;
    }

    public static List<ExoticArmorDef> ExoticArmorFor(string classId, Slot? slot) {
        var outList = new List<ExoticArmorDef>();
        foreach (var e in ExoticArmor) {
            if (e.ClassId != null && e.ClassId != classId) continue;
            if (slot.HasValue && e.Slot != slot.Value) continue;
            outList.Add(e);
        }
        return outList;
    }

    // ------------------------------------------------------------- rolling
    /// <summary>
    /// Roll six stats summing to roughly `budget`, biased toward two spikes.
    /// Spiky armor is what makes a drop worth reading; flat rolls are noise.
    /// </summary>
    public static void RollArmorStats(int[] into, int budget, Rng rng, ExoticArmorDef exotic) {
        int spent = 0;
        for (int i = 0; i < Defs.StatCount; i++) {
            into[i] = 2 + rng.RangeInt(0, 3);
            spent += into[i];
        }

        if (exotic != null) {
            foreach (var kv in exotic.StatBias) {
                int add = (int)Math.Round(kv.Value * rng.Range(0.6f, 1.1f));
                into[(int)kv.Key] += add;
                spent += add;
            }
        }

        var order = new List<int>();
        for (int i = 0; i < Defs.StatCount; i++) order.Add(i);
        rng.Shuffle(order);

        int remaining = Math.Max(0, budget - spent);
        for (int k = 0; k < 2 && remaining > 0; k++) {
            int take = (int)Math.Round(remaining * rng.Range(0.35f, 0.65f));
            into[order[k]] += take;
            remaining -= take;
        }
        int guard = 0;
        while (remaining > 0 && guard++ < 200) {
            int idx = order[rng.RangeInt(0, order.Count - 1)];
            int take = Math.Min(remaining, 1 + rng.RangeInt(0, 2));
            into[idx] += take;
            remaining -= take;
        }
        for (int i = 0; i < Defs.StatCount; i++) {
            if (into[i] < 0) into[i] = 0;
            if (into[i] > 42) into[i] = 42;
        }
    }
}
}
