# Rigged, animated draught horse for Map Battle Royale.
# Smooth body from metaballs -> mesh, armature with automatic weights, 4-beat walk + idle actions, exported as GLB.
#   Blender -b --factory-startup -P blender/horse.py -- public/models/horse.glb
import bpy, math, sys, os
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, hexs, rough=.7):
    c = tuple(int(hexs[i:i+2], 16) / 255 for i in (1, 3, 5))
    m = bpy.data.materials.new(name + '|' + hexs); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*[pow(x, 2.2) for x in c], 1); b.inputs['Roughness'].default_value = rough
    return m
COAT = mat('coat', '#8a5a3a'); DARK = mat('mane', '#2e2118'); HOOF = mat('hoof', '#2a2420', .5); LEATHER = mat('leather', '#3a2a1e', .6); BRASS = mat('brass', '#c9a868', .35); EYE = mat('eye', '#14100c', .2)

# Blender: Z up, horse faces -Y (glTF export turns that into the game's +Z forward)
# ---- 1. body from metaballs
mb = bpy.data.metaballs.new('horse_mb'); mb.resolution = .035; mb.render_resolution = .035
mbo = bpy.data.objects.new('horse_mb', mb); bpy.context.collection.objects.link(mbo)
def ball(x, y, z, r, sx=1, sy=1, sz=1, kind='ELLIPSOID', stiff=2.0):
    e = mb.elements.new(); e.type = kind; e.co = (x, y, z); e.radius = r; e.stiffness = stiff
    if kind == 'ELLIPSOID': e.size_x, e.size_y, e.size_z = sx, sy, sz
    return e
def capsule(a, b, r, stiff=2.0, n=None):   # a chain of balls between two points
    a, b = Vector(a), Vector(b); n = n or max(2, int((b - a).length / (r * .7)))
    for i in range(n + 1): ball(*(a + (b - a) * i / n), r, stiff=stiff, kind='BALL')
H = .62   # withers-ish body height
ball(0, 0, H, .26, 1, 1.9, 1.05)            # barrel
ball(0, -.33, H + .03, .22, 1.05, 1.1, 1.1)  # chest
ball(0, .36, H + .05, .23, 1.1, 1.2, 1.05)   # hindquarters
capsule((0, -.36, H + .12), (0, -.55, H + .42), .12, 2.2)                 # neck
capsule((0, -.55, H + .44), (0, -.74, H + .3), .085, 2.0)                 # head
ball(0, -.79, H + .26, .065, 1, 1.2, .9)                                 # muzzle
for sx in (-1, 1):
    capsule((sx * .1, -.32, H - .1), (sx * .1, -.34, H - .36), .08, 2.0)    # forearm
    capsule((sx * .1, -.34, H - .38), (sx * .1, -.34, H - .6), .05, 2.0)   # front cannon
    capsule((sx * .1, .36, H - .05), (sx * .1, .42, H - .32), .085, 2.0)    # gaskin
    capsule((sx * .1, .42, H - .34), (sx * .1, .38, H - .6), .05, 2.0)     # hind cannon
bpy.context.view_layer.objects.active = mbo; mbo.select_set(True)
bpy.ops.object.convert(target='MESH')
body = bpy.context.active_object; body.name = 'horse_body'
dec = body.modifiers.new('d', 'DECIMATE'); dec.ratio = .35; bpy.ops.object.modifier_apply(modifier='d')
bpy.ops.object.shade_smooth(); body.data.materials.append(COAT)

# ---- 2. small rigid parts (parented to bones later)
parts = []
def add(o, m, bone):
    o.data.materials.append(m); o.name = 'p_' + bone; parts.append((o, bone)); bpy.ops.object.shade_smooth(); return o
for sx in (-1, 1):
    for y, bone in ((-.34, 'fl' if sx < 0 else 'fr'), (.38, 'hl' if sx < 0 else 'hr')):
        bpy.ops.mesh.primitive_cylinder_add(radius=.04, depth=.045, location=(sx * .1, y, .022), vertices=12); add(bpy.context.active_object, HOOF, bone + '_low')
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.017, location=(sx * .058, -.64, H + .43), segments=10, ring_count=6); add(bpy.context.active_object, EYE, 'head')
    bpy.ops.mesh.primitive_cone_add(radius1=.03, depth=.09, location=(sx * .05, -.58, H + .56), vertices=8); add(bpy.context.active_object, COAT, 'head')
# mane: a row of tufts along the neck
for i in range(7):
    t = i / 6; bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.38 - t * .2, H + .26 + t * .27), rotation=(-.9, 0, 0))
    o = bpy.context.active_object; o.scale = (.035, .06, .1); bpy.ops.object.transform_apply(scale=True); add(o, DARK, 'neck')
# forelock
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -.63, H + .53)); o = bpy.context.active_object; o.scale = (.05, .04, .06); bpy.ops.object.transform_apply(scale=True); add(o, DARK, 'head')
# tail: tapered, slightly curved
bpy.ops.mesh.primitive_cone_add(radius1=.018, radius2=.05, depth=.46, location=(0, .62, H - .15), rotation=(.32, 0, 0), vertices=12); add(bpy.context.active_object, DARK, 'tail')   # tail hangs from the rump
# harness: collar around the neck base, bridle band, breeching strap
bpy.ops.mesh.primitive_torus_add(major_radius=.105, minor_radius=.03, location=(0, -.42, H + .2), rotation=(1.0, 0, 0), major_segments=20, minor_segments=8); add(bpy.context.active_object, LEATHER, 'neck')
bpy.ops.mesh.primitive_torus_add(major_radius=.062, minor_radius=.011, location=(0, -.73, H + .32), rotation=(math.pi / 2 - .55, 0, 0), major_segments=16, minor_segments=5); add(bpy.context.active_object, LEATHER, 'head')
bpy.ops.mesh.primitive_torus_add(major_radius=.19, minor_radius=.016, location=(0, -.1, H + .01), rotation=(math.pi / 2, 0, 0), major_segments=24, minor_segments=5)
o = bpy.context.active_object; o.scale = (.95, 1.0, 1.08); bpy.ops.object.transform_apply(scale=True); add(o, LEATHER, 'spine')   # girth band
for sx in (-1, 1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.022, location=(sx * .1, -.44, H + .24), segments=8, ring_count=6); add(bpy.context.active_object, BRASS, 'neck')

# ---- 3. armature
bpy.ops.object.armature_add(location=(0, 0, 0)); arm = bpy.context.active_object; arm.name = 'horse_rig'
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones; eb.remove(eb[0])
def bone(name, head, tail, parent=None, roll=0):
    b = eb.new(name); b.head = head; b.tail = tail; b.roll = roll
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b
bone('spine', (0, .45, H), (0, -.3, H))
bone('neck', (0, -.33, H + .12), (0, -.55, H + .44), 'spine')
bone('head', (0, -.55, H + .44), (0, -.8, H + .27), 'neck')
bone('tail', (0, .55, H + .05), (0, .7, H - .25), 'spine')
for name, x, y, up_end, low_end in (('fl', -.1, -.33, H - .37, .02), ('fr', .1, -.33, H - .37, .02), ('hl', -.1, .38, H - .33, .02), ('hr', .1, .38, H - .33, .02)):
    bone(name + '_up', (x, y, H - .05), (x, y + (.04 if name[0] == 'h' else -.01), up_end), 'spine')
    bone(name + '_low', (x, y + (.04 if name[0] == 'h' else -.01), up_end), (x, y, low_end), name + '_up')
bpy.ops.object.mode_set(mode='OBJECT')

# skin the body, bone-parent the rigid bits
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for o, bname in parts:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); arm.data.bones.active = arm.data.bones[bname]
    bpy.ops.object.mode_set(mode='OBJECT'); bpy.ops.object.parent_set(type='BONE', keep_transform=True)

# ---- 4. animations (rotation about each bone's local X = swing forward/back)
def action(name, frames, pose_at):
    arm.animation_data_create(); act = bpy.data.actions.new(name); arm.animation_data.action = act
    for f in range(frames + 1):
        pose_at(f / frames)
        for pb in arm.pose.bones:
            pb.rotation_mode = 'XYZ'; pb.keyframe_insert('rotation_euler', frame=f + 1); pb.keyframe_insert('location', frame=f + 1)
    tr = arm.animation_data.nla_tracks.new(); tr.name = name; tr.strips.new(name, 1, act)
    arm.animation_data.action = None
P = lambda n: arm.pose.bones[n]
def walk(t):
    for leg, ph in (('hl', 0), ('fl', .25), ('hr', .5), ('fr', .75)):
        a = (t + ph) * 2 * math.pi
        swing, lift = math.sin(a), max(0, math.cos(a))
        P(leg + '_up').rotation_euler = (swing * (.38 if leg[0] == 'f' else .32), 0, 0)
        P(leg + '_low').rotation_euler = ((-1 if leg[0] == 'f' else 1) * -lift * (.95 if leg[0] == 'f' else .7), 0, 0)
    P('spine').location = (0, math.sin(t * 4 * math.pi) * .012, 0)
    P('neck').rotation_euler = (math.sin(t * 4 * math.pi) * .08, 0, 0)
    P('head').rotation_euler = (math.sin(t * 4 * math.pi + 1) * .06, 0, 0)
    P('tail').rotation_euler = (0, 0, math.sin(t * 2 * math.pi) * .12)
def idle(t):
    for leg in ('fl', 'fr', 'hl', 'hr'): P(leg + '_up').rotation_euler = (0, 0, 0); P(leg + '_low').rotation_euler = (0, 0, 0)
    P('spine').location = (0, 0, 0); P('spine').rotation_euler = (0, 0, 0)
    P('neck').rotation_euler = (.12 + math.sin(t * 2 * math.pi) * .05, 0, 0)     # head lowers a little, breathing
    P('head').rotation_euler = (math.sin(t * 2 * math.pi + 1) * .05, 0, 0)
    P('tail').rotation_euler = (0, 0, math.sin(t * 2 * math.pi) * .25)
def gallop(t):   # rotary gallop: hind pair, then fore pair, with a suspension phase; the back rocks
    for leg, ph in (('hl', 0), ('hr', .1), ('fl', .45), ('fr', .55)):
        a = (t + ph) * 2 * math.pi
        swing, lift = math.sin(a), max(0, math.cos(a))
        P(leg + '_up').rotation_euler = (swing * (.75 if leg[0] == 'f' else .6), 0, 0)
        P(leg + '_low').rotation_euler = ((-1 if leg[0] == 'f' else 1) * -lift * (1.3 if leg[0] == 'f' else .9), 0, 0)
    P('spine').rotation_euler = (math.sin(t * 2 * math.pi) * .08, 0, 0)
    P('spine').location = (0, math.sin(t * 2 * math.pi + 1) * .03, 0)
    P('neck').rotation_euler = (-math.sin(t * 2 * math.pi) * .14 - .1, 0, 0)
    P('head').rotation_euler = (math.sin(t * 2 * math.pi + 1) * .06, 0, 0)
    P('tail').rotation_euler = (-.5, 0, math.sin(t * 2 * math.pi) * .1)
action('walk', 24, walk)
action('gallop', 16, gallop)
action('idle', 48, idle)

# ---- 5. export + preview render (walk frame 6)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True)
for o in arm.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_nla_strips=True, export_skins=True)
tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print('HORSE tris', tris, 'bones', len(arm.data.bones))
arm.animation_data.action = bpy.data.actions['walk']; sc.frame_set(6)
bpy.ops.object.camera_add(location=(2.6, -.3, .9)); cam = bpy.context.active_object
cam.rotation_euler = (Vector((0, -.1, .45)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 45; sc.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(.8, .3, .9)); bpy.context.active_object.data.energy = 4
bpy.ops.mesh.primitive_plane_add(size=8); bpy.context.active_object.data.materials.append(mat('grass', '#7a9a48'))
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .75, 1)
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 800; sc.render.resolution_y = 560
sc.render.filepath = os.path.join(os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1])), 'horse.png'); bpy.ops.render.render(write_still=True)
print('DONE')
