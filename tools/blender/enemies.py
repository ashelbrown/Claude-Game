"""Models, rigs and animates the Severed faction, then exports rigged FBX.

Characters are built from boxes bound rigidly to a bone each — the look is
deliberately hard-edged, and rigid binding keeps blocky limbs crisp instead of
smearing them across joints the way automatic weights would.

Every character exports with the same clip names so one Unity Animator
controller drives all of them: Idle, Walk, Run, Attack, Death.

Material slots are fixed across all characters:
    0 body   1 armor   2 accent (emissive)   3 eye (emissive)

    blender --background --python tools/blender/enemies.py
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

BODY, ARMOR, ACCENT, EYE = 0, 1, 2, 3

CLIP_LEN = {"Idle": 60, "Walk": 32, "Run": 24, "Attack": 26, "Death": 40}


def palette(body, armor, accent, eye):
    return [
        kit.mat("EnemyBody", body, metallic=0.35, roughness=0.62),
        kit.mat("EnemyArmor", armor, metallic=0.55, roughness=0.48),
        kit.mat("EnemyAccent", accent, emission=accent, emit_strength=2.2),
        kit.mat("EnemyEye", eye, emission=eye, emit_strength=3.4),
    ]


# --------------------------------------------------------------------- rig
def proportions(h, bulk=1.0):
    """Anatomical proportions derived from total height.

    Hand-picking widths per character produced slab-chested silhouettes with the
    arms buried inside the torso, so every dimension now comes from height and a
    single bulk multiplier.
    """
    return dict(
        hip_x=h * 0.050 * bulk,        # hip joint offset from midline
        shoulder_x=h * 0.122 * bulk,   # shoulder joint offset
        chest_w=h * 0.180 * bulk,      # chest full width
        chest_d=h * 0.100 * bulk,
        hips_w=h * 0.125 * bulk,
        hips_d=h * 0.092 * bulk,
        arm_r=h * 0.029 * bulk,        # arm limb half-thickness -> full = 2r
        leg_r=h * 0.036 * bulk,
        head=h * 0.098 * bulk,
    )


def humanoid_bones(h, bulk, arms=2):
    """Bone skeleton scaled to total height `h`. Character faces +Y."""
    P = proportions(h, bulk)
    hipw, shx = P["hip_x"], P["shoulder_x"]
    b = [
        dict(name="root",     head=(0, 0, 0),          tail=(0, 0, h * 0.10)),
        dict(name="hips",     head=(0, 0, h * 0.50),   tail=(0, 0, h * 0.60), parent="root"),
        dict(name="spine",    head=(0, 0, h * 0.60),   tail=(0, 0, h * 0.72), parent="hips", connect=True),
        dict(name="chest",    head=(0, 0, h * 0.72),   tail=(0, 0, h * 0.84), parent="spine", connect=True),
        dict(name="head",     head=(0, 0, h * 0.86),   tail=(0, 0, h * 1.00), parent="chest"),
    ]
    for side, sx in (("L", 1), ("R", -1)):
        b += [
            dict(name="upperarm." + side, head=(sx * shx, 0, h * 0.815),
                 tail=(sx * shx * 1.06, 0, h * 0.655), parent="chest"),
            dict(name="forearm." + side, head=(sx * shx * 1.06, 0, h * 0.655),
                 tail=(sx * shx * 1.10, 0, h * 0.505), parent="upperarm." + side, connect=True),
            dict(name="thigh." + side, head=(sx * hipw, 0, h * 0.485),
                 tail=(sx * hipw, 0, h * 0.265), parent="hips"),
            dict(name="shin." + side, head=(sx * hipw, 0, h * 0.265),
                 tail=(sx * hipw, 0, h * 0.045), parent="thigh." + side, connect=True),
        ]
        if arms == 4:
            b += [
                dict(name="upperarm2." + side, head=(sx * shx * 0.82, 0.055, h * 0.700),
                     tail=(sx * shx * 0.94, 0.055, h * 0.580), parent="chest"),
                dict(name="forearm2." + side, head=(sx * shx * 0.94, 0.055, h * 0.580),
                     tail=(sx * shx * 0.98, 0.055, h * 0.460), parent="upperarm2." + side, connect=True),
            ]
    return b


class CharBuilder:
    """Collects boxes, tagging each with the bone it rigidly follows."""

    def __init__(self, mats):
        self.mats = mats
        self.parts = []

    def part(self, name, size, loc, bone, slot=BODY, bevel=0.012, rot=(0, 0, 0)):
        ob = kit.box(name, size, loc, rot, bevel=bevel)
        kit.assign_slots(ob, self.mats, slot)
        kit.vgroup(ob, bone)
        self.parts.append(ob)
        return ob

    def sphere_part(self, name, r, loc, bone, slot=BODY):
        ob = kit.sphere(name, r, loc, segments=12, rings=8)
        kit.assign_slots(ob, self.mats, slot)
        kit.vgroup(ob, bone)
        self.parts.append(ob)
        return ob

    def finish(self, name):
        ob = kit.join(self.parts, name)
        kit.shade_flat(ob)
        return ob


def build_humanoid(spec):
    """Assemble one humanoid character: mesh + armature + clips."""
    h = spec["height"]
    bulk = spec.get("bulk", 1.0)
    arms = spec.get("arms", 2)
    P = proportions(h, bulk)
    hipw, shx = P["hip_x"], P["shoulder_x"]
    armw, legw = P["arm_r"] * 2, P["leg_r"] * 2
    mats = palette(spec["body"], spec["armor"], spec["accent"], spec["eye"])
    c = CharBuilder(mats)

    # --- torso: tapered, not a slab
    c.part("pelvis", (P["hips_w"], P["hips_d"], h * 0.085), (0, 0, h * 0.520), "hips", ARMOR)
    c.part("abdomen", (P["hips_w"] * 0.88, P["hips_d"] * 0.92, h * 0.105),
           (0, 0, h * 0.640), "spine", BODY)
    c.part("chest", (P["chest_w"], P["chest_d"], h * 0.135), (0, 0, h * 0.770), "chest", BODY)
    c.part("chestplate", (P["chest_w"] * 0.74, P["chest_d"] * 0.30, h * 0.095),
           (0, -P["chest_d"] * 0.52, h * 0.775), "chest", ARMOR)
    c.part("core", (P["chest_w"] * 0.20, P["chest_d"] * 0.16, h * 0.020),
           (0, -P["chest_d"] * 0.66, h * 0.790), "chest", ACCENT, bevel=0.005)
    c.part("collar", (P["chest_w"] * 0.52, P["chest_d"] * 0.78, h * 0.030),
           (0, 0, h * 0.845), "chest", ARMOR)
    c.part("backpack", (P["chest_w"] * 0.46, P["chest_d"] * 0.42, h * 0.100),
           (0, P["chest_d"] * 0.60, h * 0.765), "chest", ARMOR)

    # --- head
    hd = P["head"] * spec.get("head_scale", 1.0)
    c.part("neck", (hd * 0.42, hd * 0.42, h * 0.030), (0, 0, h * 0.870), "head", ARMOR)
    c.part("head", (hd * 0.92, hd * 1.00, hd * 0.90), (0, 0, h * 0.930), "head", BODY)
    c.part("visor", (hd * 0.70, hd * 0.16, hd * 0.26),
           (0, -hd * 0.50, h * 0.936), "head", EYE, bevel=hd * 0.05)
    c.part("crest", (hd * 0.22, hd * 0.72, hd * 0.30),
           (0, hd * 0.06, h * 0.930 + hd * 0.56), "head", ARMOR)
    if spec.get("mandibles"):
        for sx in (-1, 1):
            c.part("mandible%d" % sx, (hd * 0.16, hd * 0.44, hd * 0.22),
                   (sx * hd * 0.44, -hd * 0.36, h * 0.898), "head", ARMOR)

    # --- limbs, kept clear of the torso so the silhouette reads
    for side, sx in (("L", 1), ("R", -1)):
        c.part("shoulder." + side, (armw * 1.55, armw * 1.55, armw * 1.25),
               (sx * shx, 0, h * 0.818), "upperarm." + side, ARMOR)
        c.part("upperarm." + side, (armw, armw, h * 0.165),
               (sx * shx * 1.03, 0, h * 0.740), "upperarm." + side, BODY)
        c.part("elbow." + side, (armw * 1.15, armw * 1.15, armw * 1.0),
               (sx * shx * 1.06, 0, h * 0.655), "forearm." + side, ARMOR)
        c.part("forearm." + side, (armw * 0.92, armw * 0.92, h * 0.155),
               (sx * shx * 1.08, 0, h * 0.582), "forearm." + side, ARMOR)
        c.part("hand." + side, (armw * 0.95, armw * 1.15, armw * 1.05),
               (sx * shx * 1.10, -armw * 0.15, h * 0.500), "forearm." + side, BODY)

        c.part("hip." + side, (legw * 1.2, legw * 1.2, legw * 1.0),
               (sx * hipw, 0, h * 0.487), "thigh." + side, ARMOR)
        c.part("thigh." + side, (legw, legw, h * 0.215),
               (sx * hipw, 0, h * 0.385), "thigh." + side, BODY)
        c.part("kneepad." + side, (legw * 1.1, legw * 0.7, legw * 0.9),
               (sx * hipw, -legw * 0.45, h * 0.270), "thigh." + side, ARMOR)
        c.part("shin." + side, (legw * 0.88, legw * 0.88, h * 0.215),
               (sx * hipw, 0, h * 0.165), "shin." + side, ARMOR)
        c.part("foot." + side, (legw * 0.95, legw * 2.1, h * 0.032),
               (sx * hipw, -legw * 0.45, h * 0.030), "shin." + side, ARMOR)

        if arms == 4:
            c.part("upperarm2." + side, (armw * 0.72, armw * 0.72, h * 0.112),
                   (sx * shx * 0.88, 0.055 * bulk, h * 0.642), "upperarm2." + side, BODY)
            c.part("forearm2." + side, (armw * 0.66, armw * 0.66, h * 0.110),
                   (sx * shx * 0.96, 0.055 * bulk, h * 0.520), "forearm2." + side, ARMOR)

    # --- faction trim
    c.part("beltglow", (P["hips_w"] * 0.62, P["hips_d"] * 0.20, h * 0.014),
           (0, -P["hips_d"] * 0.56, h * 0.552), "hips", ACCENT, bevel=0.004)

    mesh = c.finish(spec["name"] + "_mesh")
    arm = kit.armature(spec["name"], humanoid_bones(h, bulk, arms))
    kit.bind_rigid(mesh, arm)
    add_humanoid_clips(arm, spec)
    return arm, mesh


# ---------------------------------------------------------------- animation
def add_humanoid_clips(arm, spec):
    """Author the shared clip set. Angles in degrees; frames at 30 fps."""
    arms4 = spec.get("arms", 2) == 4
    swing = spec.get("swing", 34)
    acts = []

    def sides(prefix, a, b):
        """Mirror a two-pose track onto L/R with opposite phase."""
        return {prefix + ".L": a, prefix + ".R": b}

    # --- Idle: slow breathing, weapon held ready
    idle = {
        "chest": {"rot": [(1, (2, 0, 0)), (30, (-2, 0, 0)), (60, (2, 0, 0))]},
        "head":  {"rot": [(1, (0, 0, 4)), (30, (0, 0, -4)), (60, (0, 0, 4))]},
        "upperarm.L": {"rot": [(1, (-58, 0, 0)), (30, (-62, 0, 0)), (60, (-58, 0, 0))]},
        "upperarm.R": {"rot": [(1, (-58, 0, 0)), (30, (-54, 0, 0)), (60, (-58, 0, 0))]},
        "forearm.L": {"rot": [(1, (-52, 0, 0)), (60, (-52, 0, 0))]},
        "forearm.R": {"rot": [(1, (-52, 0, 0)), (60, (-52, 0, 0))]},
    }
    if arms4:
        idle.update({
            "upperarm2.L": {"rot": [(1, (-24, 0, 0)), (30, (-30, 0, 0)), (60, (-24, 0, 0))]},
            "upperarm2.R": {"rot": [(1, (-24, 0, 0)), (30, (-18, 0, 0)), (60, (-24, 0, 0))]},
        })
    acts.append(kit.action(arm, "Idle", idle, CLIP_LEN["Idle"]))

    # --- Walk / Run share a shape; Run is faster with a longer stride
    for clip, amp, bob in (("Walk", swing, 0.02), ("Run", swing * 1.5, 0.045)):
        n = CLIP_LEN[clip]
        mid, end = n // 2, n
        track = {
            "hips": {"loc": [(1, (0, 0, 0)), (mid // 2, (0, -bob, 0)), (mid, (0, 0, 0)),
                             (mid + mid // 2, (0, -bob, 0)), (end, (0, 0, 0))],
                     "rot": [(1, (0, 0, 6)), (mid, (0, 0, -6)), (end, (0, 0, 6))]},
            "spine": {"rot": [(1, (4 if clip == "Run" else 2, 0, 0)), (end, (4 if clip == "Run" else 2, 0, 0))]},
            "thigh.L": {"rot": [(1, (amp, 0, 0)), (mid, (-amp, 0, 0)), (end, (amp, 0, 0))]},
            "thigh.R": {"rot": [(1, (-amp, 0, 0)), (mid, (amp, 0, 0)), (end, (-amp, 0, 0))]},
            "shin.L": {"rot": [(1, (-6, 0, 0)), (mid // 2, (amp * 0.9, 0, 0)), (mid, (4, 0, 0)), (end, (-6, 0, 0))]},
            "shin.R": {"rot": [(1, (4, 0, 0)), (mid, (-6, 0, 0)), (mid + mid // 2, (amp * 0.9, 0, 0)), (end, (4, 0, 0))]},
            "upperarm.L": {"rot": [(1, (-48 - amp * 0.5, 0, 0)), (mid, (-48 + amp * 0.5, 0, 0)),
                                   (end, (-48 - amp * 0.5, 0, 0))]},
            "upperarm.R": {"rot": [(1, (-48 + amp * 0.5, 0, 0)), (mid, (-48 - amp * 0.5, 0, 0)),
                                   (end, (-48 + amp * 0.5, 0, 0))]},
            "forearm.L": {"rot": [(1, (-46, 0, 0)), (end, (-46, 0, 0))]},
            "forearm.R": {"rot": [(1, (-46, 0, 0)), (end, (-46, 0, 0))]},
            "chest": {"rot": [(1, (0, 0, -5)), (mid, (0, 0, 5)), (end, (0, 0, -5))]},
        }
        if arms4:
            track.update({
                "upperarm2.L": {"rot": [(1, (-20, 0, 0)), (mid, (-32, 0, 0)), (end, (-20, 0, 0))]},
                "upperarm2.R": {"rot": [(1, (-32, 0, 0)), (mid, (-20, 0, 0)), (end, (-32, 0, 0))]},
            })
        acts.append(kit.action(arm, clip, track, n))

    # --- Attack: wind up, strike, recover
    n = CLIP_LEN["Attack"]
    atk = {
        "chest": {"rot": [(1, (0, 0, 0)), (8, (-10, 0, 0)), (13, (14, 0, 0)), (n, (0, 0, 0))]},
        "spine": {"rot": [(1, (0, 0, 0)), (8, (-6, 0, 0)), (13, (10, 0, 0)), (n, (0, 0, 0))]},
        "upperarm.R": {"rot": [(1, (-58, 0, 0)), (8, (-118, 0, 0)), (13, (-8, 0, 0)), (n, (-58, 0, 0))]},
        "forearm.R": {"rot": [(1, (-52, 0, 0)), (8, (-84, 0, 0)), (13, (-14, 0, 0)), (n, (-52, 0, 0))]},
        "upperarm.L": {"rot": [(1, (-58, 0, 0)), (8, (-40, 0, 0)), (13, (-70, 0, 0)), (n, (-58, 0, 0))]},
        "head": {"rot": [(1, (0, 0, 0)), (13, (8, 0, 0)), (n, (0, 0, 0))]},
    }
    if arms4:
        atk.update({
            "upperarm2.R": {"rot": [(1, (-24, 0, 0)), (8, (-70, 0, 0)), (13, (-4, 0, 0)), (n, (-24, 0, 0))]},
            "upperarm2.L": {"rot": [(1, (-24, 0, 0)), (13, (-34, 0, 0)), (n, (-24, 0, 0))]},
        })
    acts.append(kit.action(arm, "Attack", atk, n))

    # --- Death: buckle, then collapse backwards
    n = CLIP_LEN["Death"]
    death = {
        "root": {"rot": [(1, (0, 0, 0)), (12, (-14, 0, 0)), (n, (-88, 0, 0))],
                 "loc": [(1, (0, 0, 0)), (n, (0, -0.10, 0))]},
        "hips": {"rot": [(1, (0, 0, 0)), (10, (18, 0, 0)), (n, (26, 0, 0))]},
        "spine": {"rot": [(1, (0, 0, 0)), (10, (20, 0, 0)), (n, (34, 0, 0))]},
        "chest": {"rot": [(1, (0, 0, 0)), (10, (16, 0, 0)), (n, (28, 0, 0))]},
        "head": {"rot": [(1, (0, 0, 0)), (14, (-26, 0, 0)), (n, (-38, 0, 0))]},
        "upperarm.L": {"rot": [(1, (-58, 0, 0)), (14, (-16, 0, 0)), (n, (16, 0, 0))]},
        "upperarm.R": {"rot": [(1, (-58, 0, 0)), (14, (-12, 0, 0)), (n, (20, 0, 0))]},
        "thigh.L": {"rot": [(1, (0, 0, 0)), (14, (24, 0, 0)), (n, (44, 0, 0))]},
        "thigh.R": {"rot": [(1, (0, 0, 0)), (14, (18, 0, 0)), (n, (38, 0, 0))]},
        "shin.L": {"rot": [(1, (0, 0, 0)), (n, (-52, 0, 0))]},
        "shin.R": {"rot": [(1, (0, 0, 0)), (n, (-46, 0, 0))]},
    }
    acts.append(kit.action(arm, "Death", death, n))

    for a in acts:
        kit.push_to_nla(arm, a)
    return acts


# ------------------------------------------------------------------- drone
def build_drone(spec):
    """The Shank: a hovering core with two thruster pods. No legs, its own rig."""
    mats = palette(spec["body"], spec["armor"], spec["accent"], spec["eye"])
    c = CharBuilder(mats)
    h = spec["height"]
    bones = [
        dict(name="root", head=(0, 0, 0), tail=(0, 0, h * 0.2)),
        dict(name="body", head=(0, 0, h * 0.55), tail=(0, 0, h * 0.9), parent="root"),
        dict(name="pod.L", head=(0.30, 0, h * 0.72), tail=(0.48, 0, h * 0.72), parent="body"),
        dict(name="pod.R", head=(-0.30, 0, h * 0.72), tail=(-0.48, 0, h * 0.72), parent="body"),
    ]
    c.part("hull", (0.34, 0.34, 0.32), (0, 0, h * 0.72), "body", BODY)
    c.part("plate", (0.26, 0.06, 0.24), (0, -0.18, h * 0.72), "body", ARMOR)
    c.part("eye", (0.15, 0.05, 0.10), (0, -0.215, h * 0.73), "body", EYE, bevel=0.014)
    c.part("skirt", (0.22, 0.22, 0.07), (0, 0, h * 0.545), "body", ARMOR)
    c.part("vent", (0.10, 0.10, 0.05), (0, 0, h * 0.50), "body", ACCENT, bevel=0.008)
    for side, sx in (("L", 1), ("R", -1)):
        c.part("arm." + side, (0.12, 0.10, 0.26), (sx * 0.30, 0, h * 0.72), "pod." + side, ARMOR)
        c.part("thruster." + side, (0.09, 0.09, 0.09), (sx * 0.30, 0, h * 0.575), "pod." + side, ACCENT)
    mesh = c.finish(spec["name"] + "_mesh")
    arm = kit.armature(spec["name"], bones)
    kit.bind_rigid(mesh, arm)

    hover = lambda a, b: {"loc": [(1, (0, 0, 0)), (15, (0, a, 0)), (30, (0, 0, 0)),
                                  (45, (0, b, 0)), (60, (0, 0, 0))]}
    acts = [
        kit.action(arm, "Idle", {
            "body": hover(0.05, -0.03),
            "pod.L": {"rot": [(1, (0, 0, 6)), (30, (0, 0, -6)), (60, (0, 0, 6))]},
            "pod.R": {"rot": [(1, (0, 0, -6)), (30, (0, 0, 6)), (60, (0, 0, -6))]},
        }, 60),
        kit.action(arm, "Walk", {
            "body": {"loc": [(1, (0, 0, 0)), (16, (0, 0.04, 0)), (32, (0, 0, 0))],
                     "rot": [(1, (6, 0, 0)), (32, (6, 0, 0))]},
            "pod.L": {"rot": [(1, (0, 0, 14)), (16, (0, 0, -14)), (32, (0, 0, 14))]},
            "pod.R": {"rot": [(1, (0, 0, -14)), (16, (0, 0, 14)), (32, (0, 0, -14))]},
        }, 32),
        kit.action(arm, "Run", {
            "body": {"rot": [(1, (14, 0, 0)), (24, (14, 0, 0))],
                     "loc": [(1, (0, 0, 0)), (12, (0, 0.05, 0)), (24, (0, 0, 0))]},
            "pod.L": {"rot": [(1, (0, 0, 22)), (12, (0, 0, -22)), (24, (0, 0, 22))]},
            "pod.R": {"rot": [(1, (0, 0, -22)), (12, (0, 0, 22)), (24, (0, 0, -22))]},
        }, 24),
        kit.action(arm, "Attack", {
            "body": {"rot": [(1, (0, 0, 0)), (7, (-16, 0, 0)), (12, (10, 0, 0)), (26, (0, 0, 0))]},
            "pod.L": {"rot": [(1, (0, 0, 0)), (12, (0, 0, -24)), (26, (0, 0, 0))]},
            "pod.R": {"rot": [(1, (0, 0, 0)), (12, (0, 0, 24)), (26, (0, 0, 0))]},
        }, 26),
        kit.action(arm, "Death", {
            "root": {"rot": [(1, (0, 0, 0)), (40, (-64, 0, 26))],
                     "loc": [(1, (0, 0, 0)), (40, (0, -0.55, 0))]},
            "body": {"rot": [(1, (0, 0, 0)), (40, (34, 0, 0))]},
            "pod.L": {"rot": [(1, (0, 0, 0)), (40, (0, 0, -70))]},
            "pod.R": {"rot": [(1, (0, 0, 0)), (40, (0, 0, 70))]},
        }, 40),
    ]
    for a in acts:
        kit.push_to_nla(arm, a)
    return arm, mesh


# --------------------------------------------------------------------- cast
SEVERED_BODY = (0.30, 0.26, 0.31)
SEVERED_ARMOR = (0.44, 0.17, 0.15)
SEVERED_ACCENT = (1.00, 0.42, 0.12)
SEVERED_EYE = (1.00, 0.72, 0.22)

CAST = [
    dict(id="husk", name="ENM_Husk", kind="humanoid", height=1.70, bulk=0.88,
         arms=2, swing=44, head_scale=0.92, mandibles=True,
         body=SEVERED_BODY, armor=(0.34, 0.15, 0.14), accent=SEVERED_ACCENT, eye=SEVERED_EYE),
    dict(id="marauder", name="ENM_Marauder", kind="humanoid", height=1.82, bulk=1.0,
         arms=2, swing=32, body=SEVERED_BODY, armor=SEVERED_ARMOR,
         accent=SEVERED_ACCENT, eye=SEVERED_EYE),
    dict(id="lancer", name="ENM_Lancer", kind="humanoid", height=1.95, bulk=1.08,
         arms=4, swing=28, mandibles=True, body=(0.27, 0.24, 0.30), armor=(0.50, 0.20, 0.16),
         accent=SEVERED_ACCENT, eye=SEVERED_EYE),
    dict(id="captain", name="ENM_Captain", kind="humanoid", height=2.45, bulk=1.35,
         arms=4, swing=26, head_scale=1.1, mandibles=True,
         body=(0.24, 0.26, 0.34), armor=(0.20, 0.42, 0.55),
         accent=(0.35, 0.85, 1.0), eye=(0.55, 0.95, 1.0)),
    dict(id="kell", name="ENM_Kell", kind="humanoid", height=4.40, bulk=1.75,
         arms=4, swing=22, head_scale=1.2, mandibles=True,
         body=(0.22, 0.22, 0.30), armor=(0.42, 0.34, 0.14),
         accent=(1.0, 0.75, 0.25), eye=(1.0, 0.85, 0.35)),
    dict(id="shank", name="ENM_Shank", kind="drone", height=1.50,
         body=(0.30, 0.28, 0.32), armor=(0.42, 0.18, 0.14),
         accent=SEVERED_ACCENT, eye=SEVERED_EYE),
]


def build(spec):
    if spec["kind"] == "drone":
        return build_drone(spec)
    return build_humanoid(spec)


def main():
    for spec in CAST:
        kit.reset()
        kit.clear_material_cache()
        arm, mesh = build(spec)
        kit.export_fbx([arm, mesh], spec["name"] + ".fbx", subdir="Characters",
                       with_anim=True, all_actions=False)

    # contact sheet in T-pose-ish rest, scaled to show relative size
    kit.reset()
    kit.clear_material_cache()
    kit.setup_preview_world()
    kit.box("ground", (40, 40, 0.4), (0, 0, -0.2),
            material=kit.mat("Ground", (0.11, 0.115, 0.135), roughness=0.9))
    xs, x = [], 0.0
    for spec in CAST:
        arm, mesh = build(spec)
        kit.rest_pose(arm)
        step = 0.55 + spec["height"] * 0.26
        x += step
        arm.location = (x, 0, 0)
        xs.append(x)
        x += step * 0.15
    mid = (xs[0] + xs[-1]) * 0.5
    kit.three_point_lights(target=(mid, 0, 1.6), scale=4.0)
    kit.render("enemies_sheet.png", cam_loc=(mid, -14.0, 2.55), cam_target=(mid, 0, 2.35),
               res=(1300, 720), samples=52, ortho_scale=12.6)
    print("ENEMIES DONE %d" % len(CAST))


main()
