"""Models every weapon archetype in the game and exports them as FBX.

Modelled barrel-along-+Y, up-along-+Z (Blender convention). The FBX export in
kit.py converts that to Unity's Y-up / Z-forward, so a weapon's muzzle points
along the object's local +Z once imported.

Material slots are identical on every weapon, in this order:
    0 body   1 dark (barrel/stock)   2 grip   3 glow (element strip)
Unity recolours slot 3 per damage element and slot 0 per rarity.

    blender --background --python tools/blender/weapons.py
"""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

# Shared palette. Slot 3 is overwritten per-instance by Unity at runtime.
def palette():
    return [
        kit.mat("GunBody", (0.155, 0.170, 0.200), metallic=0.75, roughness=0.44),
        kit.mat("GunDark", (0.070, 0.077, 0.092), metallic=0.85, roughness=0.34),
        kit.mat("GunGrip", (0.055, 0.052, 0.056), metallic=0.05, roughness=0.72),
        kit.mat("GunGlow", (0.9, 0.5, 0.2), emission=(1.0, 0.52, 0.18), emit_strength=6.0),
    ]

BODY, DARK, GRIP, GLOW = 0, 1, 2, 3


class GunBuilder:
    """Assembles a weapon from labelled parts, all sharing one material list."""

    def __init__(self, mats):
        self.mats = mats
        self.parts = []

    def add(self, ob, slot):
        kit.assign_slots(ob, self.mats, slot)
        self.parts.append(ob)
        return ob

    def box(self, name, size, loc, slot=BODY, bevel=0.006, rot=(0, 0, 0)):
        return self.add(kit.box(name, size, loc, rot, bevel=bevel), slot)

    def cyl(self, name, r, d, loc, slot=DARK, rot=(math.pi / 2, 0, 0), verts=14):
        return self.add(kit.cylinder(name, r, d, loc, rot, verts=verts), slot)

    def finish(self, name):
        ob = kit.join(self.parts, name)
        kit.shade_flat(ob)
        kit.set_origin(ob, (0, 0, 0))
        return ob


def build(spec):
    """Build one weapon from a proportion spec. Lengths are metres."""
    b = GunBuilder(palette())
    L = spec["length"]            # receiver length
    H = spec["height"]            # receiver height
    W = spec["width"]             # receiver width
    barrel_len = spec["barrel"]
    barrel_r = spec["barrel_r"]
    mag = spec.get("mag", (0.05, 0.12, 0.16))
    stock = spec.get("stock", 0.0)

    # --- receiver: a chunky main body with a raised top rail
    b.box("receiver", (W, L, H), (0, 0, 0))
    b.box("rail", (W * 0.55, L * 0.82, 0.018), (0, L * 0.04, H * 0.5 + 0.009), DARK, bevel=0.003)
    b.box("ejector", (W * 0.52, L * 0.30, H * 0.55), (W * 0.30, L * 0.10, 0), DARK, bevel=0.004)

    # --- barrel assembly
    b.cyl("barrel", barrel_r * 1.25, barrel_len, (0, L * 0.5 + barrel_len * 0.5, H * 0.05))
    if spec.get("shroud", True):
        # A full-length shroud plus an under-barrel handguard is what gives a gun
        # its readable silhouette; a bare cylinder reads as a stick in motion.
        b.box("shroud", (W * 0.94, barrel_len * 0.74, H * 0.74),
              (0, L * 0.5 + barrel_len * 0.36, H * 0.06), DARK, bevel=0.008)
        b.box("handguard", (W * 0.80, barrel_len * 0.42, H * 0.40),
              (0, L * 0.5 + barrel_len * 0.26, -H * 0.36), GRIP, bevel=0.010)
        for i in range(4):
            b.box("vent%d" % i, (W * 1.02, 0.014, H * 0.40),
                  (0, L * 0.5 + barrel_len * (0.12 + i * 0.155), H * 0.08), GRIP, bevel=0.0)
    if spec.get("muzzle", True):
        b.cyl("muzzle", barrel_r * 1.7, 0.06,
              (0, L * 0.5 + barrel_len - 0.025, H * 0.05), DARK, verts=12)
        b.box("brake", (barrel_r * 2.6, 0.045, barrel_r * 2.6),
              (0, L * 0.5 + barrel_len - 0.06, H * 0.05), DARK, bevel=0.005)

    # --- grip and trigger guard
    gy = -L * 0.18
    b.box("grip", (W * 0.72, 0.062, 0.135), (0, gy - 0.02, -H * 0.5 - 0.055), GRIP,
          bevel=0.012, rot=(math.radians(-12), 0, 0))
    b.box("guard", (W * 0.55, 0.075, 0.014), (0, gy + 0.045, -H * 0.5 - 0.055), DARK, bevel=0.006)
    b.box("trigger", (0.012, 0.02, 0.032), (0, gy + 0.035, -H * 0.5 - 0.03), DARK, bevel=0.003)

    # --- magazine
    if mag:
        b.box("mag", mag, (0, L * 0.02, -H * 0.5 - mag[2] * 0.5 + 0.01), DARK,
              bevel=0.008, rot=(math.radians(spec.get("mag_tilt", 6)), 0, 0))

    # --- stock
    if stock > 0:
        b.box("stock_arm", (W * 0.62, stock, H * 0.78), (0, -L * 0.5 - stock * 0.5, -H * 0.06),
              DARK, bevel=0.010)
        b.box("stock_cheek", (W * 0.50, stock * 0.62, H * 0.30),
              (0, -L * 0.5 - stock * 0.45, H * 0.34), DARK, bevel=0.008)
        b.box("stock_pad", (W * 0.88, 0.040, H * 1.10),
              (0, -L * 0.5 - stock - 0.018, -H * 0.10), GRIP, bevel=0.014)

    # --- optic
    optic = spec.get("optic", "iron")
    top = H * 0.5 + 0.018
    if optic == "scope":
        b.cyl("scope", 0.030, spec.get("scope_len", 0.22),
              (0, L * 0.10, top + 0.042), DARK, verts=16)
        b.cyl("scope_lens", 0.026, 0.012,
              (0, L * 0.10 + spec.get("scope_len", 0.22) * 0.5, top + 0.042), GLOW, verts=16)
        for sx in (-1, 1):
            b.box("scope_mount%d" % sx, (0.014, 0.022, 0.045),
                  (0, L * 0.10 + sx * spec.get("scope_len", 0.22) * 0.32, top + 0.014), DARK)
    elif optic == "holo":
        b.box("holo_body", (W * 0.42, 0.055, 0.042), (0, L * 0.14, top + 0.022), DARK, bevel=0.006)
        b.box("holo_glass", (W * 0.34, 0.006, 0.030), (0, L * 0.14 + 0.024, top + 0.024), GLOW, bevel=0.002)
    else:
        b.box("front_post", (0.008, 0.010, 0.026), (0, L * 0.44, top + 0.011), DARK)
        b.box("rear_post", (0.026, 0.010, 0.020), (0, -L * 0.34, top + 0.008), DARK)

    # --- element glow strip along the receiver flank
    for sx in (-1, 1):
        b.box("glow%d" % sx, (0.006, L * 0.52, 0.012),
              (sx * (W * 0.5 + 0.002), L * 0.02, H * 0.18), GLOW, bevel=0.0)
    b.box("core", (W * 0.30, 0.05, 0.05), (0, -L * 0.30, H * 0.16), GLOW, bevel=0.008)

    ob = b.finish(spec["name"])
    # Origin sits at the grip, which is where Unity parents the weapon.
    kit.set_origin(ob, (0, gy, -H * 0.5 - 0.02))
    return ob


# --------------------------------------------------------------------- specs
SPECS = [
    dict(id="auto",    name="WPN_AutoRifle",       length=0.34, height=0.085, width=0.052,
         barrel=0.30, barrel_r=0.014, stock=0.13, optic="holo", mag=(0.048, 0.075, 0.18)),
    dict(id="smg",     name="WPN_SMG",             length=0.24, height=0.080, width=0.050,
         barrel=0.16, barrel_r=0.012, stock=0.07, optic="holo", mag=(0.044, 0.062, 0.20)),
    dict(id="pulse",   name="WPN_PulseRifle",      length=0.36, height=0.082, width=0.048,
         barrel=0.28, barrel_r=0.013, stock=0.14, optic="holo", mag=(0.046, 0.070, 0.17)),
    dict(id="scout",   name="WPN_ScoutRifle",      length=0.40, height=0.080, width=0.046,
         barrel=0.40, barrel_r=0.012, stock=0.16, optic="scope", scope_len=0.20,
         mag=(0.044, 0.062, 0.15)),
    dict(id="hand",    name="WPN_HandCannon",      length=0.20, height=0.090, width=0.044,
         barrel=0.17, barrel_r=0.016, stock=0.0, optic="iron", mag=(0.040, 0.055, 0.13),
         shroud=False),
    dict(id="sidearm", name="WPN_Sidearm",         length=0.15, height=0.078, width=0.040,
         barrel=0.10, barrel_r=0.011, stock=0.0, optic="iron", mag=(0.036, 0.048, 0.14),
         shroud=False),
    dict(id="shotgun", name="WPN_Shotgun",         length=0.36, height=0.098, width=0.062,
         barrel=0.34, barrel_r=0.026, stock=0.15, optic="iron", mag=(0.058, 0.090, 0.13)),
    dict(id="sniper",  name="WPN_SniperRifle",     length=0.46, height=0.086, width=0.050,
         barrel=0.52, barrel_r=0.015, stock=0.20, optic="scope", scope_len=0.30,
         mag=(0.046, 0.070, 0.14)),
    dict(id="fusion",  name="WPN_FusionRifle",     length=0.34, height=0.105, width=0.070,
         barrel=0.20, barrel_r=0.030, stock=0.12, optic="holo", mag=(0.062, 0.100, 0.15)),
    dict(id="rocket",  name="WPN_RocketLauncher",  length=0.30, height=0.130, width=0.100,
         barrel=0.62, barrel_r=0.055, stock=0.10, optic="scope", scope_len=0.16,
         mag=(0.0, 0.0, 0.0)),
    dict(id="gl",      name="WPN_GrenadeLauncher", length=0.28, height=0.115, width=0.082,
         barrel=0.26, barrel_r=0.040, stock=0.12, optic="holo", mag=(0.090, 0.090, 0.11)),
    dict(id="mg",      name="WPN_MachineGun",      length=0.42, height=0.105, width=0.070,
         barrel=0.46, barrel_r=0.018, stock=0.16, optic="holo", mag=(0.095, 0.130, 0.16)),
]


def main():
    export_all = "--preview-only" not in sys.argv
    built = []
    for spec in SPECS:
        kit.reset()
        kit.clear_material_cache()
        ob = build(spec)
        if export_all:
            kit.export_fbx([ob], spec["name"] + ".fbx", subdir="Weapons")
        built.append(spec)

    # contact sheet: rebuild everything in one scene, laid out in a grid
    kit.reset()
    kit.clear_material_cache()
    kit.setup_preview_world()
    # Weapons are modelled barrel-along-+Y and up-along-+Z, so their readable
    # profile is the YZ plane: the camera has to look down -X, not down -Z.
    objs = []
    rows = 6
    for i, spec in enumerate(SPECS):
        ob = build(spec)
        col, row = i // rows, i % rows
        ob.location = (0, col * 1.55 - 0.78, -row * 0.34 + 0.85)
        objs.append(ob)
    kit.three_point_lights(target=(0, 0, 0), scale=2.4)
    kit.render("weapons_sheet.png", cam_loc=(3.4, 0.0, 0.0), cam_target=(0, 0.0, 0.0),
               res=(1240, 860), samples=54, ortho_scale=3.35)
    print("WEAPONS DONE %d" % len(built))


main()
