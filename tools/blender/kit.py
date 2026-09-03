"""Shared Blender helpers for STARFALL asset scripts.

Every asset in this game is modelled procedurally: the scripts here are the
source of truth, and the FBX files they emit are build products. That keeps the
whole art pipeline reviewable in a diff and re-runnable from scratch.

Run any asset script with:
    blender --background --python tools/blender/<script>.py
"""
import bpy
import bmesh
import math
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT_DIR = os.path.join(REPO, "StarfallUnity", "Assets", "Art")
PREVIEW_DIR = os.path.join(REPO, "assets-src", "previews")

TAU = math.pi * 2


# --------------------------------------------------------------------- scene
def reset():
    """Empty scene with sane units and no default cube."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    return sc


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


# ------------------------------------------------------------------ material
_MATS = {}


def mat(name, rgb, metallic=0.0, roughness=0.62, emission=None, emit_strength=3.0):
    """Principled material, cached by name so meshes share slots on export."""
    key = (name, tuple(rgb), metallic, roughness,
           tuple(emission) if emission else None, emit_strength)
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        # Socket names differ across Blender versions; set whichever exists.
        for socket in ("Emission Color", "Emission"):
            if socket in bsdf.inputs:
                bsdf.inputs[socket].default_value = (
                    emission[0], emission[1], emission[2], 1.0)
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit_strength
    _MATS[key] = m
    return m


def clear_material_cache():
    _MATS.clear()


# --------------------------------------------------------------------- prims
def box(name, size, location=(0, 0, 0), rotation=(0, 0, 0), material=None,
        bevel=0.0, segments=2):
    """Axis-aligned box given as full extents (not half-extents)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        _bevel(ob, bevel, segments)
    if material:
        ob.data.materials.append(material)
    return ob


def cylinder(name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0),
             verts=16, material=None, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts,
                                        location=location, rotation=rotation)
    ob = bpy.context.active_object
    ob.name = name
    if bevel > 0:
        _bevel(ob, bevel, 2)
    if material:
        ob.data.materials.append(material)
    return ob


def sphere(name, radius, location=(0, 0, 0), segments=16, rings=10, material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments,
                                         ring_count=rings, location=location)
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.shade_smooth()
    if material:
        ob.data.materials.append(material)
    return ob


def cone(name, r1, r2, depth, location=(0, 0, 0), rotation=(0, 0, 0), verts=12,
         material=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth,
                                    vertices=verts, location=location,
                                    rotation=rotation)
    ob = bpy.context.active_object
    ob.name = name
    if material:
        ob.data.materials.append(material)
    return ob


def _bevel(ob, width, segments):
    m = ob.modifiers.new("bevel", 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(40)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=m.name)


def mirror_x(ob, apply=True):
    m = ob.modifiers.new("mirror", 'MIRROR')
    m.use_axis = (True, False, False)
    if apply:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


def assign_slots(ob, materials, index):
    """Give `ob` the full material list in a fixed order, then point every face
    at slot `index`.

    Joining meshes concatenates their material slots, so giving every part the
    identical list up front is what keeps slot order stable across an asset —
    which is what lets Unity recolour "slot 3 is the element glow" reliably.
    """
    ob.data.materials.clear()
    for m in materials:
        ob.data.materials.append(m)
    for poly in ob.data.polygons:
        poly.material_index = index
    return ob


# ------------------------------------------------------------------- joining
def join(objects, name):
    """Join meshes into one object, keeping separate material slots."""
    objects = [o for o in objects if o and o.type == 'MESH']
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    return ob


def set_origin(ob, point=(0, 0, 0)):
    """Move the object's origin to a world-space point."""
    prev = tuple(bpy.context.scene.cursor.location)
    bpy.context.scene.cursor.location = point
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = prev
    return ob


def shade_flat(ob):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.shade_flat()
    return ob


# -------------------------------------------------------------------- rigging
def armature(name, bones):
    """Create an armature from a list of bone dicts.

    Each bone: {name, head, tail, parent (optional), connect (optional)}.
    Returns the armature object, left in OBJECT mode.
    """
    bpy.ops.object.armature_add(location=(0, 0, 0), enter_editmode=False)
    arm = bpy.context.active_object
    arm.name = name
    arm.data.name = name + "_data"
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)
    created = {}
    for spec in bones:
        bone = eb.new(spec["name"])
        bone.head = spec["head"]
        bone.tail = spec["tail"]
        bone.roll = spec.get("roll", 0.0)
        created[spec["name"]] = bone
    for spec in bones:
        if spec.get("parent"):
            created[spec["name"]].parent = created[spec["parent"]]
            created[spec["name"]].use_connect = spec.get("connect", False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def bind_rigid(mesh, arm):
    """Bind with existing vertex groups only (no automatic weights).

    Every part of these characters belongs wholly to one bone, so rigid binding
    by named vertex group is both exact and cheap — automatic weights would
    smear blocky parts across neighbouring joints.
    """
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    return mesh


def vgroup(ob, bone_name):
    """Put every vertex of `ob` into a vertex group named after `bone_name`."""
    g = ob.vertex_groups.new(name=bone_name)
    g.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
    return ob


def action(arm, name, tracks, frame_end, fps=30):
    """Author one animation action from per-bone keyframe tracks.

    tracks: { bone_name: { 'rot': [(frame, (rx,ry,rz) degrees)],
                           'loc': [(frame, (x,y,z))] } }
    Angles are degrees for readability at the call site.
    """
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.frame_start = 1
    sc.frame_end = frame_end
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')

    act = bpy.data.actions.new(name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act

    for bone_name, track in tracks.items():
        pb = arm.pose.bones.get(bone_name)
        if pb is None:
            print("WARN: no bone %s for action %s" % (bone_name, name))
            continue
        pb.rotation_mode = 'XYZ'
        for frame, rot in track.get("rot", []):
            sc.frame_set(frame)
            pb.rotation_euler = (math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2]))
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
        for frame, loc in track.get("loc", []):
            sc.frame_set(frame)
            pb.location = loc
            pb.keyframe_insert(data_path="location", frame=frame)

    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    bpy.ops.object.mode_set(mode='OBJECT')
    act.use_fake_user = True
    return act


def push_to_nla(arm, act, name=None):
    """Stash an action as an NLA strip so FBX export emits it as its own take."""
    if arm.animation_data is None:
        arm.animation_data_create()
    track = arm.animation_data.nla_tracks.new()
    track.name = name or act.name
    strip = track.strips.new(act.name, 1, act)
    strip.name = act.name
    arm.animation_data.action = None
    return track


def rest_pose(arm):
    """Put an armature back in its modelled rest pose for previews.

    push_to_nla() leaves every clip on its own NLA track, and Blender evaluates
    all unmuted tracks together — so a preview would otherwise render the sum of
    Idle, Walk, Attack, Death and Shed at once. Exports are unaffected: the FBX
    writer reads each strip separately.
    """
    if arm.animation_data:
        for track in arm.animation_data.nla_tracks:
            track.mute = True
        arm.animation_data.action = None
    arm.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    return arm


# ------------------------------------------------------------------- export
def export_fbx(objects, filename, subdir="", with_anim=False, all_actions=False):
    """Export the given objects as FBX, in Unity-friendly orientation/scale."""
    out_dir = os.path.join(EXPORT_DIR, subdir) if subdir else EXPORT_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        if o:
            o.select_set(True)
    types = {'MESH', 'ARMATURE', 'EMPTY'}
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        apply_scale_options='FBX_SCALE_ALL',
        global_scale=1.0,
        axis_forward='-Z',
        axis_up='Y',
        object_types=types,
        use_mesh_modifiers=True,
        mesh_smooth_type='FACE',
        add_leaf_bones=False,
        bake_anim=with_anim,
        bake_anim_use_all_actions=all_actions,
        bake_anim_use_nla_strips=with_anim,
        bake_anim_simplify_factor=0.0,
        bake_anim_step=1.0,
        path_mode='COPY',
        embed_textures=False,
    )
    print("EXPORT %s (%d bytes)" % (path, os.path.getsize(path)))
    return path


# ------------------------------------------------------------------ preview
def setup_preview_world(bg=(0.05, 0.055, 0.07)):
    sc = bpy.context.scene
    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs[0].default_value = (bg[0], bg[1], bg[2], 1.0)
        bg_node.inputs[1].default_value = 1.0
    sc.world = world


def three_point_lights(target=(0, 0, 1), scale=1.0):
    key = _light('KeySun', 'SUN', (4 * scale, -5 * scale, 7 * scale), 4.2,
                 color=(1.0, 0.95, 0.88))
    fill = _light('FillArea', 'AREA', (-5 * scale, -3 * scale, 3 * scale), 260 * scale * scale,
                  color=(0.55, 0.68, 1.0), size=6 * scale)
    rim = _light('RimArea', 'AREA', (0, 6 * scale, 4 * scale), 340 * scale * scale,
                 color=(1.0, 0.62, 0.35), size=5 * scale)
    for lt in (key, fill, rim):
        _aim(lt, target)
    return key, fill, rim


def _light(name, kind, loc, energy, color=(1, 1, 1), size=3.0):
    bpy.ops.object.light_add(type=kind, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.data.energy = energy
    ob.data.color = color
    if kind == 'AREA':
        ob.data.size = size
    return ob


def _aim(ob, target):
    import mathutils
    direction = mathutils.Vector(target) - ob.location
    ob.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def frame_camera(height, fill=0.72, lens=55.0, res=(600, 900)):
    """Distance at which a subject of `height` fills `fill` of the frame height.

    Blender's sensor fit is AUTO, so the 36 mm sensor maps to the larger render
    dimension; these previews are portrait, so that is the vertical axis.
    """
    sensor = 36.0
    fov_v = 2.0 * math.atan((sensor * 0.5) / lens)
    visible = height / max(fill, 0.05)
    return (visible * 0.5) / math.tan(fov_v * 0.5)


def render(filename, cam_loc, cam_target=(0, 0, 1), res=(560, 420), samples=40,
           ortho_scale=None, subdir="", lens=50.0):
    """Render a Cycles CPU preview. Denoising is off — the build here lacks OIDN."""
    sc = bpy.context.scene
    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.active_object
    _aim(cam, cam_target)
    if ortho_scale:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho_scale
    cam.data.lens = lens
    sc.camera = cam
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    out_dir = os.path.join(PREVIEW_DIR, subdir) if subdir else PREVIEW_DIR
    os.makedirs(out_dir, exist_ok=True)
    sc.render.filepath = os.path.join(out_dir, filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print("PREVIEW %s" % sc.render.filepath)
    return sc.render.filepath


def arrange_row(objects, spacing):
    """Lay objects out along +X so one render can show a whole set."""
    total = (len(objects) - 1) * spacing
    for i, ob in enumerate(objects):
        ob.location.x += -total / 2 + i * spacing
    return objects
