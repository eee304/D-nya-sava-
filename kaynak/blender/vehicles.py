# Cute-but-real vehicles for Map Battle Royale: 2014 hatchback, 2014 delivery van, 1810 hay wagon.
# Material names are "role|#hex" (the game recolours the 'body' role per car). Run:
#   Blender -b --factory-startup -P blender/vehicles.py -- public/models
import bpy, bmesh, math, sys, os
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]

MATS = {}
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()
def mat(role, hexs, rough=.6, metal=0.):
    k = role + hexs
    if k in MATS: return MATS[k]
    c = tuple(int(hexs[i:i+2], 16) / 255 for i in (1, 3, 5))
    m = bpy.data.materials.new(role + '|' + hexs); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*[pow(x, 2.2) for x in c], 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    MATS[k] = m; return m
objs = []
WHEEL = [None]   # while set, new parts belong to that wheel (exported as its own node so the game can spin it)
def add(o, m, bevel=0, seg=2):
    if WHEEL[0] is not None: o['wheel'] = WHEEL[0]
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'
    o.data.materials.append(m); objs.append(o); return o
def box(sx, sy, sz, loc, m, bevel=0, seg=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True); return add(o, m, bevel, seg)
def cyl(r, d, loc, m, rot=(0, 0, 0), v=14, bevel=0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v); return add(bpy.context.active_object, m, bevel, 1)
def sph(r, loc, m, scale=(1, 1, 1), sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=loc, subdivisions=sub); o = bpy.context.active_object
    o.scale = scale; bpy.ops.object.transform_apply(scale=True); return add(o, m)
def join(lst, nm):
    bpy.ops.object.select_all(action='DESELECT')
    for o in lst: o.select_set(True)
    bpy.context.view_layer.objects.active = lst[0]
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    o = bpy.context.active_object; o.name = nm; bpy.ops.object.shade_flat(); return o
def finish(name):
    wheels = {}
    for o in objs:
        if 'wheel' in o: wheels.setdefault(o['wheel'], []).append(o)
    body = join([o for o in objs if 'wheel' not in o], name)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    out = [body]
    for k, lst in wheels.items():   # each wheel: one node whose origin is the hub, so it can turn on its axle
        w = join(lst, 'wheel_%d' % k); bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS'); out.append(w)
    bpy.ops.object.select_all(action='DESELECT')
    for o in out: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True)
    print('MODEL', name, tris)
    objs.clear()
def wheel(x, y, r=.11, w=.08):
    WHEEL[0] = len([1 for o in objs if 'wheel' in o and o.get('_first')]) ; objs_before = len(objs)
    cyl(r, w, (x, y, r), mat('tire', '#1f2124', .9), (math.pi / 2, 0, 0), 16, .02)
    cyl(r * .58, w + .01, (x, y, r), mat('rim', '#c9ccd1', .3, .8), (math.pi / 2, 0, 0), 12)
    cyl(r * .2, w + .02, (x, y, r), mat('chrome', '#8a8e94', .3, .9), (math.pi / 2, 0, 0), 8)
    objs[objs_before]['_first'] = 1; WHEEL[0] = None

# x = length (front +x), y = width, z = up. glTF turns it into the game's Y-up with front along +x.
# ---- 2014 hatchback: rounded body, glass cabin, lights, bumpers, mirrors
reset()
BODY = mat('body', '#d8433a', .35)
box(1.0, .5, .22, (0, 0, .2), BODY, .08, 4)                       # lower body
box(.62, .46, .2, (-.08, 0, .4), BODY, .07, 4)                     # cabin shell
box(.6, .47, .15, (-.08, 0, .41), mat('glass', '#3a4e63', .1), .05, 3)   # windows band
box(.06, .44, .14, (.24, 0, .4), mat('glass', '#3a4e63', .1), .03, 2, (0, -.55, 0))   # windscreen
box(.6, .44, .03, (-.08, 0, .51), BODY, .015, 2)                   # roof
for s in (-1, 1):
    box(.01, .015, .12, (-.06, s * .238, .41), BODY)               # door pillar
    sph(.035, (.49, s * .17, .22), mat('light', '#fff3c4', .2), (.5, 1, .7))            # headlight
    box(.02, .08, .04, (-.5, s * .18, .23), mat('tail', '#c8212a', .3))                 # tail light
    box(.05, .04, .03, (.17, s * .27, .38), BODY, .01)                                  # mirror
    box(.18, .012, .01, (-.05, s * .251, .3), mat('chrome', '#8a8e94', .3, .9))        # door handle line
    wheel(.3, s * .22); wheel(-.3, s * .22)
    box(.26, .03, .1, (.3, s * .245, .2), mat('trim', '#2b2d31', .7), .02); box(.26, .03, .1, (-.3, s * .245, .2), mat('trim', '#2b2d31', .7), .02)   # wheel arches
box(.06, .52, .07, (.51, 0, .12), mat('trim', '#2b2d31', .7), .025); box(.06, .52, .07, (-.51, 0, .12), mat('trim', '#2b2d31', .7), .025)   # bumpers
box(.02, .2, .05, (.51, 0, .2), mat('chrome', '#8a8e94', .3, .9))   # grille
box(.01, .1, .03, (-.505, 0, .2), mat('plate', '#f1ece0', .5))       # plate
finish('car_2014')

# ---- 2014 delivery van
reset()
BODY = mat('body', '#e9e6df', .4)
box(1.25, .56, .5, (-.08, 0, .36), BODY, .06, 3)                    # box body
box(.36, .54, .34, (.5, 0, .28), BODY, .08, 4)                       # cab
box(.04, .5, .2, (.66, 0, .37), mat('glass', '#3a4e63', .1), .03, 2, (0, -.35, 0))
for s in (-1, 1):
    box(.24, .01, .16, (.48, s * .275, .38), mat('glass', '#3a4e63', .1))
    sph(.04, (.69, s * .19, .22), mat('light', '#fff3c4', .2), (.5, 1, .7))
    box(.02, .08, .06, (-.71, s * .2, .2), mat('tail', '#c8212a', .3))
    wheel(.45, s * .25, .12, .09); wheel(-.45, s * .25, .12, .09)
    box(.6, .005, .14, (-.15, s * .281, .42), mat('stripe', '#3f6fa8', .5))   # company stripe
box(.06, .58, .08, (.7, 0, .13), mat('trim', '#2b2d31', .7), .025); box(.06, .58, .08, (-.72, 0, .13), mat('trim', '#2b2d31', .7), .025)
box(.01, .5, .44, (-.71, 0, .37), mat('trim', '#c9c4b8', .5))        # rear doors
finish('van_2014')

# ---- 1810 hay wagon: planked bed, spoked wheels, shafts
reset()
WOOD = mat('wood', '#8a6a48', .9); DARK = mat('wood_dark', '#5e4630', .9)
box(1.0, .55, .05, (0, 0, .32), WOOD, .01)
for s in (-1, 1):
    for k in range(3): box(1.0, .03, .05, (0, s * .27, .38 + k * .06), WOOD if k % 2 else DARK, .008)
    for x in (-.45, 0, .45): box(.04, .04, .22, (x, s * .27, .44), DARK, .006)
    for x, r in ((.32, .17), (-.32, .22)):
        WHEEL[0] = len([1 for o in objs if o.get('_first')]); first = len(objs)
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=.02, location=(x, s * .33, r), rotation=(math.pi / 2, 0, 0), major_segments=18, minor_segments=5)
        add(bpy.context.active_object, mat('iron', '#3a3836', .6, .3))
        cyl(.04, .07, (x, s * .33, r), DARK, (math.pi / 2, 0, 0), 8)
        for k in range(8): box(.018, .015, r * 2 - .04, (x, s * .33, r), WOOD, 0, 1, (0, k * math.pi / 8, 0))
        objs[first]['_first'] = 1; WHEEL[0] = None
    box(.9, .03, .03, (.95, s * .16, .3), DARK, .008, 1, (0, .12, 0))   # shafts
cyl(.025, .7, (.32, 0, .17), mat('iron', '#3a3836', .6, .3), (math.pi / 2, 0, 0), 6); cyl(.025, .7, (-.32, 0, .22), mat('iron', '#3a3836', .6, .3), (math.pi / 2, 0, 0), 6)
for x in (-.25, .15): sph(.3, (x, 0, .52), mat('hay', '#d9b85a', .95), (1.3, .85, .5), 2)
for k in range(3): cyl(.09, .3, (-.4 + k * .12, .05, .62), mat('sack', '#c9b48a', .95), (0, .2, .3), 8)
finish('wagon_1810')
# preview of all three
reset()
for i, n in enumerate(['car_2014', 'van_2014', 'wagon_1810']):
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n + '.glb'))
    for o in bpy.context.selected_objects: o.location.y += (i - 1) * 1.1
bpy.ops.object.camera_add(location=(2.2, -2.6, 1.6)); cam = bpy.context.active_object
cam.rotation_euler = (Vector((0, 0, .25)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(.8, .2, .6)); bpy.context.active_object.data.energy = 4
bpy.ops.mesh.primitive_plane_add(size=12); bpy.context.active_object.data.materials.append(mat('grass', '#7a9a48'))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .75, 1)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 900; sc.render.resolution_y = 560
sc.render.filepath = os.path.join(os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1])), 'vehicles.png'); bpy.ops.render.render(write_still=True)
print('DONE')
