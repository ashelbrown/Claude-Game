"""The Choralith: a colonial species from the terminator zone of Threnos.

Design notes that drive the geometry:
  · It is a colony, not an individual — four detachable facet pods ride a dorsal
    rack, and the pod is exported separately because the Shed ability spawns it
    as an autonomous entity.
  · It reads polarisation rather than colour — no eyes, a banded ring of lenses.
  · It evolved braced against permanent storm-force wind — low-slung centre of
    mass, long digitigrade legs, no upright human posture.

Exports:
    PC_Choralith.fbx   rigged character, clips Idle/Walk/Run/Attack/Death/Shed
    PROP_Facet.fbx     one detachable facet pod

    blender --background --python tools/blender/choralith.py
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

BODY, PLATE, GLOW, LENS = 0, 1, 2, 3

H = 2.05          # standing height, metres
CHITIN = (0.72, 0.70, 0.64)
PLATEC = (0.30, 0.31, 0.34)
INNER = (0.35, 0.90, 0.82)     # bioluminescence between the plates
LENSC = (0.62, 0.86, 1.00)


def palette():
    return [
        kit.mat("ChoraChitin", CHITIN, metallic=0.15, roughness=0.38),
        kit.mat("ChoraPlate", PLATEC, metallic=0.62, roughness=0.42),
        kit.mat("ChoraGlow", INNER, emission=INNER, emit_strength=2.6),
        kit.mat("ChoraLens", LENSC, emission=LENSC, emit_strength=3.2),
    ]


def bones():
    """Digitigrade legs, a stalk spine, a lens ring and a four-pod dorsal rack."""
    hip_x = H * 0.075
    sh_x = H * 0.105
    b = [
        dict(name="root",  head=(0, 0, 0),         tail=(0, 0, H * 0.08)),
        dict(name="hips",  head=(0, 0, H * 0.455), tail=(0, 0, H * 0.545), parent="root"),
        dict(name="spine", head=(0, 0, H * 0.545), tail=(0, -0.02, H * 0.655), parent="hips", connect=True),
        dict(name="chest", head=(0, -0.02, H * 0.655), tail=(0, -0.05, H * 0.775), parent="spine", connect=True),
        dict(name="neck",  head=(0, -0.05, H * 0.775), tail=(0, -0.09, H * 0.865), parent="chest", connect=True),
        dict(name="lensring", head=(0, -0.09, H * 0.865), tail=(0, -0.13, H * 0.955), parent="neck", connect=True),
    ]
    for side, sx in (("L", 1), ("R", -1)):
        b += [
            # arms: long, three-segment, hanging forward of the body
            dict(name="upperarm." + side, head=(sx * sh_x, -0.02, H * 0.760),
                 tail=(sx * sh_x * 1.20, 0.02, H * 0.600), parent="chest"),
            dict(name="forearm." + side, head=(sx * sh_x * 1.20, 0.02, H * 0.600),
                 tail=(sx * sh_x * 1.28, -0.06, H * 0.455), parent="upperarm." + side, connect=True),
            dict(name="hand." + side, head=(sx * sh_x * 1.28, -0.06, H * 0.455),
                 tail=(sx * sh_x * 1.30, -0.11, H * 0.395), parent="forearm." + side, connect=True),
            # digitigrade leg: femur down-forward, tibia down-back, long metatarsal, small foot
            dict(name="thigh." + side, head=(sx * hip_x, 0.02, H * 0.455),
                 tail=(sx * hip_x, -0.10, H * 0.300), parent="hips"),
            dict(name="shin." + side, head=(sx * hip_x, -0.10, H * 0.300),
                 tail=(sx * hip_x, 0.09, H * 0.150), parent="thigh." + side, connect=True),
            dict(name="meta." + side, head=(sx * hip_x, 0.09, H * 0.150),
                 tail=(sx * hip_x, -0.04, H * 0.030), parent="shin." + side, connect=True),
            dict(name="toe." + side, head=(sx * hip_x, -0.04, H * 0.030),
                 tail=(sx * hip_x, -0.16, H * 0.020), parent="meta." + side, connect=True),
        ]
    # four facet pods on a dorsal rack
    for i, (px, pz) in enumerate([(-1, 0.79), (1, 0.79), (-1, 0.68), (1, 0.68)]):
        b.append(dict(name="pod%d" % i, head=(px * H * 0.085, 0.10, H * pz),
                      tail=(px * H * 0.135, 0.18, H * pz), parent="chest"))
    # trailing sensory cilia
    for i in range(4):
        x = (-1.5 + i) * H * 0.035
        b.append(dict(name="cilium%d" % i, head=(x, 0.06, H * 0.855),
                      tail=(x, 0.22, H * 0.80), parent="lensring"))
    return b


class Build:
    def __init__(self, mats):
        self.mats = mats
        self.parts = []

    def p(self, name, size, loc, bone, slot=BODY, bevel=0.010, rot=(0, 0, 0)):
        ob = kit.box(name, size, loc, rot, bevel=bevel)
        kit.assign_slots(ob, self.mats, slot)
        kit.vgroup(ob, bone)
        self.parts.append(ob)
        return ob

    def cyl(self, name, r, d, loc, bone, slot=BODY, rot=(0, 0, 0), verts=14):
        ob = kit.cylinder(name, r, d, loc, rot, verts=verts)
        kit.assign_slots(ob, self.mats, slot)
        kit.vgroup(ob, bone)
        self.parts.append(ob)
        return ob

    def sph(self, name, r, loc, bone, slot=BODY):
        ob = kit.sphere(name, r, loc, segments=14, rings=9)
        kit.assign_slots(ob, self.mats, slot)
        kit.vgroup(ob, bone)
        self.parts.append(ob)
        return ob

    def done(self, name):
        ob = kit.join(self.parts, name)
        kit.shade_flat(ob)
        return ob


def facet_parts(b, bone, cx, cy, cz, s=1.0, slot_body=PLATE):
    """One facet pod. Also used standalone for the exported Shed drone."""
    b.p("pod_hull", (0.16 * s, 0.24 * s, 0.16 * s), (cx, cy, cz), bone, slot_body, bevel=0.022 * s)
    b.p("pod_fin", (0.05 * s, 0.20 * s, 0.11 * s), (cx, cy + 0.11 * s, cz + 0.05 * s), bone, slot_body,
        bevel=0.012 * s)
    b.p("pod_core", (0.075 * s, 0.05 * s, 0.075 * s), (cx, cy - 0.12 * s, cz), bone, GLOW, bevel=0.014 * s)
    b.p("pod_rib", (0.185 * s, 0.03 * s, 0.03 * s), (cx, cy - 0.02 * s, cz + 0.075 * s), bone, BODY,
        bevel=0.006 * s)


def build_character():
    mats = palette()
    b = Build(mats)
    hip_x, sh_x = H * 0.075, H * 0.105

    # --- pelvis and stalk spine: narrow, forward-leaning, low centre of mass
    b.p("pelvis", (H * 0.135, H * 0.115, H * 0.075), (0, 0.01, H * 0.480), "hips", PLATE, bevel=0.024)
    b.p("pelvis_glow", (H * 0.055, H * 0.02, H * 0.012), (0, -0.055, H * 0.470), "hips", GLOW, bevel=0.004)
    b.p("abdomen", (H * 0.115, H * 0.100, H * 0.095), (0, -0.005, H * 0.595), "spine", BODY, bevel=0.026)
    b.p("thorax", (H * 0.150, H * 0.120, H * 0.110), (0, -0.030, H * 0.710), "chest", BODY, bevel=0.030)
    b.p("sternum", (H * 0.090, H * 0.030, H * 0.085), (0, -0.088, H * 0.712), "chest", PLATE, bevel=0.014)
    # light bleeds out between the carapace plates
    for i, z in enumerate((0.672, 0.706, 0.740)):
        b.p("seam%d" % i, (H * 0.115, H * 0.012, H * 0.010), (0, -0.090, H * z), "chest", GLOW, bevel=0.003)
    b.p("neck", (H * 0.055, H * 0.055, H * 0.085), (0, -0.062, H * 0.818), "neck", BODY, bevel=0.014)

    # --- head: no face. A ring of polarisation lenses around a blunt node.
    b.p("cranium", (H * 0.105, H * 0.125, H * 0.080), (0, -0.105, H * 0.905), "lensring", PLATE, bevel=0.022)
    ring_r = H * 0.062
    for i in range(10):
        a = (i / 10) * math.tau
        b.p("lens%d" % i, (H * 0.020, H * 0.016, H * 0.026),
            (math.cos(a) * ring_r, -0.105 + math.sin(a) * ring_r * 0.55, H * 0.905 + math.sin(a) * ring_r * 0.62),
            "lensring", LENS, bevel=0.004, rot=(0, 0, 0))
    b.p("crown", (H * 0.045, H * 0.070, H * 0.030), (0, -0.075, H * 0.955), "lensring", PLATE, bevel=0.010)
    for i in range(4):
        x = (-1.5 + i) * H * 0.035
        b.p("cilium%d" % i, (0.014, H * 0.115, 0.014), (x, 0.115, H * 0.838), "cilium%d" % i, BODY,
            bevel=0.004, rot=(math.radians(-24), 0, 0))

    # --- dorsal rack and the four facet pods
    b.p("rack", (H * 0.150, H * 0.075, H * 0.150), (0, 0.075, H * 0.735), "chest", PLATE, bevel=0.020)
    for i, (px, pz) in enumerate([(-1, 0.79), (1, 0.79), (-1, 0.68), (1, 0.68)]):
        facet_parts(b, "pod%d" % i, px * H * 0.115, 0.145, H * pz, s=1.0)

    # --- arms: long and thin, three segments, held forward
    for side, sx in (("L", 1), ("R", -1)):
        b.p("clav." + side, (H * 0.055, H * 0.060, H * 0.050), (sx * sh_x, -0.02, H * 0.762),
            "upperarm." + side, PLATE, bevel=0.014)
        b.p("upperarm." + side, (H * 0.042, H * 0.048, H * 0.150),
            (sx * sh_x * 1.10, 0.00, H * 0.682), "upperarm." + side, BODY, bevel=0.014,
            rot=(math.radians(-13), math.radians(sx * -7), 0))
        b.p("elbow." + side, (H * 0.048, H * 0.048, H * 0.045),
            (sx * sh_x * 1.20, 0.02, H * 0.600), "forearm." + side, PLATE, bevel=0.012)
        b.p("forearm." + side, (H * 0.036, H * 0.042, H * 0.140),
            (sx * sh_x * 1.24, -0.02, H * 0.528), "forearm." + side, BODY, bevel=0.012,
            rot=(math.radians(16), 0, 0))
        b.p("forearm_glow." + side, (H * 0.012, H * 0.012, H * 0.090),
            (sx * (sh_x * 1.24 + H * 0.024), -0.02, H * 0.528), "forearm." + side, GLOW, bevel=0.003,
            rot=(math.radians(16), 0, 0))
        b.p("hand." + side, (H * 0.036, H * 0.070, H * 0.055),
            (sx * sh_x * 1.29, -0.085, H * 0.425), "hand." + side, PLATE, bevel=0.012)
        for f in range(3):
            b.p("digit%s%d" % (side, f), (H * 0.010, H * 0.050, H * 0.011),
                (sx * (sh_x * 1.29 + (f - 1) * H * 0.014), -0.125, H * 0.408), "hand." + side, BODY,
                bevel=0.003)

        # --- digitigrade legs: heavy femur, thin reversed tibia, long foot
        b.p("hipjoint." + side, (H * 0.070, H * 0.070, H * 0.065), (sx * hip_x, 0.01, H * 0.455),
            "thigh." + side, PLATE, bevel=0.018)
        b.p("thigh." + side, (H * 0.062, H * 0.085, H * 0.150), (sx * hip_x, -0.045, H * 0.378),
            "thigh." + side, BODY, bevel=0.020, rot=(math.radians(-34), 0, 0))
        b.p("knee." + side, (H * 0.055, H * 0.055, H * 0.050), (sx * hip_x, -0.10, H * 0.300),
            "shin." + side, PLATE, bevel=0.014)
        b.p("shin." + side, (H * 0.042, H * 0.070, H * 0.150), (sx * hip_x, -0.005, H * 0.225),
            "shin." + side, BODY, bevel=0.016, rot=(math.radians(48), 0, 0))
        b.p("hock." + side, (H * 0.046, H * 0.046, H * 0.042), (sx * hip_x, 0.09, H * 0.150),
            "meta." + side, PLATE, bevel=0.012)
        b.p("meta." + side, (H * 0.038, H * 0.055, H * 0.120), (sx * hip_x, 0.025, H * 0.090),
            "meta." + side, BODY, bevel=0.012, rot=(math.radians(-42), 0, 0))
        b.p("toe." + side, (H * 0.048, H * 0.130, H * 0.022), (sx * hip_x, -0.100, H * 0.022),
            "toe." + side, PLATE, bevel=0.008)
        b.p("spur." + side, (H * 0.020, H * 0.045, H * 0.016), (sx * hip_x, 0.075, H * 0.026),
            "meta." + side, PLATE, bevel=0.005)

    mesh = b.done("PC_Choralith_mesh")
    arm = kit.armature("PC_Choralith", bones())
    kit.bind_rigid(mesh, arm)
    add_clips(arm)
    return arm, mesh


# ------------------------------------------------------------------- clips
def add_clips(arm):
    pods = ["pod0", "pod1", "pod2", "pod3"]
    acts = []

    # Idle: the colony never fully settles — pods drift, cilia trail
    idle = {
        "chest": {"rot": [(1, (1.5, 0, 0)), (40, (-1.5, 0, 0)), (80, (1.5, 0, 0))]},
        "lensring": {"rot": [(1, (0, 0, 5)), (26, (0, 0, -6)), (54, (0, 0, 3)), (80, (0, 0, 5))]},
        "upperarm.L": {"rot": [(1, (0, 0, 0)), (40, (-5, 0, 0)), (80, (0, 0, 0))]},
        "upperarm.R": {"rot": [(1, (-3, 0, 0)), (40, (2, 0, 0)), (80, (-3, 0, 0))]},
    }
    for i, p in enumerate(pods):
        ph = i * 20
        idle[p] = {"rot": [(1, (0, 0, 0)), (20 + ph % 60, (10, 0, 14)),
                           (50 + ph % 30, (-8, 0, -10)), (80, (0, 0, 0))]}
    for i in range(4):
        idle["cilium%d" % i] = {"rot": [(1, (0, 0, i * 3 - 4)), (40, (6, 0, -i * 3 + 4)), (80, (0, 0, i * 3 - 4))]}
    acts.append(kit.action(arm, "Idle", idle, 80))

    # Walk / Run: digitigrade gait — the hock leads, the toe pushes off last
    for clip, n, amp, bob in (("Walk", 34, 26, 0.022), ("Run", 22, 42, 0.05)):
        mid, q = n // 2, n // 4
        t = {
            "hips": {"loc": [(1, (0, 0, 0)), (q, (0, -bob, 0)), (mid, (0, 0, 0)),
                             (mid + q, (0, -bob, 0)), (n, (0, 0, 0))],
                     "rot": [(1, (0, 0, 5)), (mid, (0, 0, -5)), (n, (0, 0, 5))]},
            "spine": {"rot": [(1, (6 if clip == "Run" else 3, 0, 0)), (n, (6 if clip == "Run" else 3, 0, 0))]},
            "chest": {"rot": [(1, (0, 0, -4)), (mid, (0, 0, 4)), (n, (0, 0, -4))]},
            "lensring": {"rot": [(1, (0, 0, 4)), (mid, (0, 0, -4)), (n, (0, 0, 4))]},
        }
        for side, phase in (("L", 0), ("R", mid)):
            def f(k):
                return 1 + (k + phase) % n
            t["thigh." + side] = {"rot": [(f(0), (amp, 0, 0)), (f(mid), (-amp * 0.8, 0, 0)), (f(n - 1), (amp, 0, 0))]}
            t["shin." + side] = {"rot": [(f(0), (-amp * 1.1, 0, 0)), (f(q), (-amp * 0.3, 0, 0)),
                                          (f(mid), (amp * 0.5, 0, 0)), (f(n - 1), (-amp * 1.1, 0, 0))]}
            t["meta." + side] = {"rot": [(f(0), (amp * 0.7, 0, 0)), (f(mid), (-amp * 0.4, 0, 0)),
                                          (f(n - 1), (amp * 0.7, 0, 0))]}
            t["toe." + side] = {"rot": [(f(0), (-8, 0, 0)), (f(mid), (18, 0, 0)), (f(n - 1), (-8, 0, 0))]}
            t["upperarm." + side] = {"rot": [(f(0), (-amp * 0.45, 0, 0)), (f(mid), (amp * 0.45, 0, 0)),
                                              (f(n - 1), (-amp * 0.45, 0, 0))]}
        for i, p in enumerate(pods):
            t[p] = {"rot": [(1, (0, 0, 6 + i * 2)), (mid, (0, 0, -6 - i * 2)), (n, (0, 0, 6 + i * 2))]}
        acts.append(kit.action(arm, clip, t, n))

    # Attack: the whole colony leans into one strike
    n = 26
    acts.append(kit.action(arm, "Attack", {
        "spine": {"rot": [(1, (0, 0, 0)), (8, (-12, 0, 0)), (13, (16, 0, 0)), (n, (0, 0, 0))]},
        "chest": {"rot": [(1, (0, 0, 0)), (8, (-8, 0, 0)), (13, (14, 0, 0)), (n, (0, 0, 0))]},
        "upperarm.R": {"rot": [(1, (0, 0, 0)), (8, (-62, 0, 0)), (13, (44, 0, 0)), (n, (0, 0, 0))]},
        "forearm.R": {"rot": [(1, (0, 0, 0)), (8, (-40, 0, 0)), (13, (30, 0, 0)), (n, (0, 0, 0))]},
        "upperarm.L": {"rot": [(1, (0, 0, 0)), (13, (-22, 0, 0)), (n, (0, 0, 0))]},
        "lensring": {"rot": [(1, (0, 0, 0)), (13, (12, 0, 0)), (n, (0, 0, 0))]},
        "pod0": {"rot": [(1, (0, 0, 0)), (10, (0, 0, 38)), (n, (0, 0, 0))]},
        "pod1": {"rot": [(1, (0, 0, 0)), (10, (0, 0, -38)), (n, (0, 0, 0))]},
    }, n))

    # Shed: the pods flare off the rack — this is the class ability tell
    n = 30
    shed = {
        "chest": {"rot": [(1, (0, 0, 0)), (9, (-14, 0, 0)), (18, (8, 0, 0)), (n, (0, 0, 0))]},
        "lensring": {"rot": [(1, (0, 0, 0)), (12, (-16, 0, 0)), (n, (0, 0, 0))]},
    }
    for i, p in enumerate(pods):
        shed[p] = {"rot": [(1, (0, 0, 0)), (10 + i, (26, 0, (-1) ** i * 60)), (n, (0, 0, 0))],
                   "loc": [(1, (0, 0, 0)), (10 + i, (0, 0.22, 0)), (n, (0, 0, 0))]}
    acts.append(kit.action(arm, "Shed", shed, n))

    # Death: quorum loss — it comes apart before it falls
    n = 44
    death = {
        "root": {"rot": [(1, (0, 0, 0)), (16, (-18, 0, 6)), (n, (-84, 0, 14))],
                 "loc": [(1, (0, 0, 0)), (n, (0, -0.12, 0))]},
        "spine": {"rot": [(1, (0, 0, 0)), (12, (24, 0, 0)), (n, (40, 0, 0))]},
        "chest": {"rot": [(1, (0, 0, 0)), (12, (18, 0, 0)), (n, (30, 0, 0))]},
        "lensring": {"rot": [(1, (0, 0, 0)), (10, (-30, 0, 12)), (n, (-46, 0, 20))]},
        "thigh.L": {"rot": [(1, (0, 0, 0)), (n, (40, 0, 0))]},
        "thigh.R": {"rot": [(1, (0, 0, 0)), (n, (32, 0, 0))]},
        "shin.L": {"rot": [(1, (0, 0, 0)), (n, (-56, 0, 0))]},
        "shin.R": {"rot": [(1, (0, 0, 0)), (n, (-48, 0, 0))]},
        "upperarm.L": {"rot": [(1, (0, 0, 0)), (n, (34, 0, 0))]},
        "upperarm.R": {"rot": [(1, (0, 0, 0)), (n, (28, 0, 0))]},
    }
    for i, p in enumerate(pods):
        death[p] = {"rot": [(1, (0, 0, 0)), (14 + i * 2, (40, 0, (-1) ** i * 70)), (n, (70, 0, (-1) ** i * 110))],
                    "loc": [(1, (0, 0, 0)), (n, (0, 0.4 + i * 0.1, 0))]}
    acts.append(kit.action(arm, "Death", death, n))

    for a in acts:
        kit.push_to_nla(arm, a)
    return acts


def build_facet_prop():
    """The Shed drone: one pod on its own, with a hover/spin clip."""
    mats = palette()
    b = Build(mats)
    facet_parts(b, "core", 0, 0, 0.25, s=1.6, slot_body=PLATE)
    b.p("halo", (0.30, 0.05, 0.30), (0, 0, 0.25), "core", GLOW, bevel=0.012)
    mesh = b.done("PROP_Facet_mesh")
    arm = kit.armature("PROP_Facet", [
        dict(name="root", head=(0, 0, 0), tail=(0, 0, 0.1)),
        dict(name="core", head=(0, 0, 0.16), tail=(0, 0, 0.42), parent="root"),
    ])
    kit.bind_rigid(mesh, arm)
    a = kit.action(arm, "Idle", {
        "core": {"rot": [(1, (0, 0, 0)), (30, (0, 120, 0)), (60, (0, 240, 0))],
                 "loc": [(1, (0, 0, 0)), (15, (0, 0.05, 0)), (30, (0, 0, 0)),
                         (45, (0, -0.04, 0)), (60, (0, 0, 0))]},
    }, 60)
    kit.push_to_nla(arm, a)
    return arm, mesh


def main():
    kit.reset(); kit.clear_material_cache()
    arm, mesh = build_character()
    kit.export_fbx([arm, mesh], "PC_Choralith.fbx", subdir="Characters", with_anim=True)

    kit.reset(); kit.clear_material_cache()
    farm, fmesh = build_facet_prop()
    kit.export_fbx([farm, fmesh], "PROP_Facet.fbx", subdir="Props", with_anim=True)

    # Large turnaround so proportions can actually be judged. Perspective with a
    # fitted distance — ortho framing left the subject small and off-centre.
    res = (620, 900)
    lens = 58.0
    dist = kit.frame_camera(H, fill=0.80, lens=lens, res=res)
    eye = H * 0.52
    for label, ang in (("front", 90.0), ("three_quarter", 128.0), ("side", 180.0)):
        kit.reset(); kit.clear_material_cache()
        kit.setup_preview_world((0.040, 0.045, 0.058))
        kit.box("ground", (16, 16, 0.4), (0, 0, -0.2),
                material=kit.mat("Ground", (0.085, 0.09, 0.105), roughness=0.92))
        a, m = build_character()
        kit.rest_pose(a)
        rad = math.radians(ang)
        cam = (math.cos(rad) * dist, -math.sin(rad) * dist, eye + H * 0.10)
        kit.three_point_lights(target=(0, 0, eye), scale=2.4)
        kit.render("choralith_%s.png" % label, cam_loc=cam, cam_target=(0, 0, eye),
                   res=res, samples=64, lens=lens)
    print("CHORALITH DONE")


main()
