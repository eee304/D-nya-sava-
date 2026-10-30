# Detailed houses for Map Battle Royale: Ottoman konak, East Asian house, 2014 apartment blocks (4 / 6 floors), 2014 detached house.
# Same footprints as the code-built houses (front faces -Y here = +z in the game). Materials are "role|#hex".
#   Blender -b --factory-startup -P blender/buildings.py -- public/models
import bpy, math, sys, os, random
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
HERE = os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1]))
MATS, objs = {}, []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear(); objs.clear(); random.seed(7)
def mat(role, hexs, rough=.85):
    k = role + hexs
    if k not in MATS:
        c = tuple(int(hexs[i:i+2], 16) / 255 for i in (1, 3, 5))
        m = bpy.data.materials.new(role + '|' + hexs); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*[pow(x, 2.2) for x in c], 1); b.inputs['Roughness'].default_value = rough
        MATS[k] = m
    return MATS[k]
def box(sx, sy, sz, loc, m, bevel=.008, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 1; md.limit_method = 'ANGLE'
    o.data.materials.append(m); objs.append(o); return o
def cyl(r, d, loc, m, rot=(0, 0, 0), v=10, r2=None):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v)
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=d, location=loc, rotation=rot, vertices=v)
    o = bpy.context.active_object; o.data.materials.append(m); objs.append(o); return o
def frustum(w0, d0, w1, d1, h, z, m, y=0):   # 4-sided truncated pyramid (hip roof tiers)
    import bmesh
    bm = bmesh.new(); vs = []
    for (w, d, zz) in ((w0, d0, z), (w1, d1, z + h)):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)): vs.append(bm.verts.new((sx * w / 2, y + sy * d / 2, zz)))
    for i in range(4):
        a, b = i, (i + 1) % 4; bm.faces.new((vs[a], vs[b], vs[b + 4], vs[a + 4]))
    bm.faces.new(vs[4:8]); bm.faces.new(vs[0:4][::-1])
    me = bpy.data.meshes.new('f'); bm.to_mesh(me); o = bpy.data.objects.new('f', me); bpy.context.collection.objects.link(o)
    o.data.materials.append(m); objs.append(o); return o
def window(x, z, y, w, h, frame='#efe8d8', glass='#3e5468', shutter=None, sill=True, face=-1, bars=True):
    """window on the front (face=-1, -Y) or back (face=1) wall plane at y."""
    box(w + .07, .03, h + .07, (x, y + face * .01, z), mat('frame', frame))
    box(w, .03, h, (x, y + face * .022, z), mat('glass', glass, .15), 0)
    if bars: box(.02, .035, h, (x, y + face * .03, z), mat('frame', frame), 0); box(w, .035, .02, (x, y + face * .03, z + h * .12), mat('frame', frame), 0)
    if sill: box(w + .12, .08, .035, (x, y + face * .045, z - h / 2 - .045), mat('sill', '#cfc3aa'))
    if shutter:
        for s in (-1, 1): box(w * .48, .025, h + .03, (x + s * (w * .5 + w * .26), y + face * .018, z), mat('shutter', shutter))
def side_window(x, z, y, w, h, frame='#efe8d8', glass='#3e5468', face=1):   # on a ±X wall at x
    box(.03, w + .07, h + .07, (x + face * .01, y, z), mat('frame', frame)); box(.03, w, h, (x + face * .022, y, z), mat('glass', glass, .15), 0)
    box(.035, .02, h, (x + face * .03, y, z), mat('frame', frame), 0)
def door(x, y, w, h, col, frame='#cfc3aa', face=-1):
    box(w + .08, .04, h + .06, (x, y + face * .01, h / 2 + .03), mat('doorframe', frame))
    box(w, .045, h, (x, y + face * .02, h / 2), mat('door', col))
    for zz in (h * .3, h * .7): box(w * .9, .05, .025, (x, y + face * .03, zz), mat('trim_dark', '#2e2016'), 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.022, location=(x + w * .32, y + face * .05, h * .5), segments=8, ring_count=5)
    o = bpy.context.active_object; o.data.materials.append(mat('brass', '#d6b04a', .4)); objs.append(o)
def tiles(w, d, z0, rise, col, col2, over=.16, rows=7, cols=10, along_x=True):
    """gable roof of overlapping tile strips; ridge along X."""
    half = d / 2 + over; slope = math.hypot(half, rise); ang = math.atan2(rise, half)
    for s in (-1, 1):
        for r in range(rows):
            t = (r + .5) / rows; yy = s * half * (1 - t); zz = z0 + rise * t
            for c in range(cols):
                x = -(w + .3) / 2 + (c + .5 + (.5 if r % 2 else 0)) * (w + .3) / cols
                if x > (w + .3) / 2: continue
                box((w + .3) / cols * .96, slope / rows + .05, .035, (x, yy, zz + .02), mat('tile', col) if random.random() > .2 else mat('tile_dark', col2), .01, (-s * ang, 0, 0))
    cyl(.05, w + .34, (0, 0, z0 + rise + .03), mat('tile_dark', col2), (0, math.pi / 2, 0), 8)
def gables(w, d, z0, rise, m):
    import bmesh
    for gx in (-1, 1):
        bm = bmesh.new(); vs = [bm.verts.new(v) for v in [(gx * w / 2, -d / 2, z0), (gx * w / 2, d / 2, z0), (gx * w / 2, 0, z0 + rise)]]
        bm.faces.new(vs if gx > 0 else vs[::-1]); me = bpy.data.meshes.new('g'); bm.to_mesh(me); o = bpy.data.objects.new('g', me)
        bpy.context.collection.objects.link(o); o.data.materials.append(m); objs.append(o)
def finish(name, preview=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; bpy.ops.object.shade_flat()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True)
    print('BUILDING', name, sum(len(p.vertices) - 2 for p in o.data.polygons))

# ---------------- Ottoman konak: stone ground floor, timber-framed upper floor jutting out (cumba), hip tile roof, wide eaves
reset()
W, D = 1.7, 1.25
for i in range(int(W / .18)):                                    # stone plinth
    for side in (-1, 1): box(W / int(W / .18) * .94, .08, .14, (-W / 2 + (i + .5) * W / int(W / .18), side * (D / 2 + .01), .03), mat('stone', '#9a9080'), .02)
box(W, D, .9, (0, 0, .45), mat('plaster', '#e6d6b8'))
for x in (-.55, .55): window(x, .5, -D / 2, .26, .36, shutter='#6b4a2e')
door(0, -D / 2, .36, .62, '#6b4a2e')
# upper floor overhangs on the front and sides, carried by diagonal brackets
UW, UD, UZ = W + .3, D + .3, .9
box(UW + .04, UD + .04, .06, (0, -.05, UZ + .03), mat('timber', '#5e4630'))
box(UW, UD, .8, (0, -.05, UZ + .46), mat('plaster', '#efe7d6'))
for k in range(7): box(.05, .03, .8, (-UW / 2 + .03 + k * (UW - .06) / 6, -.05 - UD / 2 - .01, UZ + .46), mat('timber', '#5e4630'), 0)
for x in (-UW / 2 + .12, -.3, .3, UW / 2 - .12): box(.05, .05, .32, (x, -D / 2 - .1, UZ - .12), mat('timber', '#5e4630'), 0, (-.7, 0, 0))   # brackets
# the cumba: a bay of close-set windows with lattice
box(1.0, .3, .62, (0, -.05 - UD / 2 - .14, UZ + .45), mat('plaster', '#efe7d6'))
for k, x in enumerate((-.34, -.11, .11, .34)): window(x, UZ + .48, -.05 - UD / 2 - .29, .17, .34, frame='#5e4630', glass='#2f4050', sill=False)
box(1.06, .36, .05, (0, -.05 - UD / 2 - .14, UZ + .79), mat('timber', '#5e4630'))
for x in (-.85, .85): window(x, UZ + .48, -.05 - UD / 2, .22, .34, frame='#5e4630', sill=False)
for y in (-.3, .3): side_window(UW / 2, UZ + .48, y - .05, .22, .34, frame='#5e4630'); side_window(-UW / 2, UZ + .48, y - .05, .22, .34, frame='#5e4630', face=-1)
# hip roof with wide eaves: three tiers of tile + a ridge
RZ = UZ + .86
frustum(UW + .5, UD + .5, UW - .1, UD - .2, .18, RZ, mat('tile', '#9c3f2c'), y=-.05)
frustum(UW - .1, UD - .2, .7, .3, .42, RZ + .18, mat('tile', '#9c3f2c'), y=-.05)
for t in range(6):   # tile course lines on the long slopes
    f = t / 6; box(UW + .4 - f * (UW - .5), .03, .025, (0, -.05 - (UD / 2 + .23 - f * (UD / 2 + .1)), RZ + .02 + f * .55), mat('tile_dark', '#86352a'), 0, (-.5, 0, 0))
    box(UW + .4 - f * (UW - .5), .03, .025, (0, -.05 + (UD / 2 + .23 - f * (UD / 2 + .1)), RZ + .02 + f * .55), mat('tile_dark', '#86352a'), 0, (.5, 0, 0))
box(.75, .06, .05, (0, -.05, RZ + .62), mat('tile_dark', '#86352a'))
box(.22, .22, .5, (.5, .25, RZ + .4), mat('chimney', '#cfc6b2')); box(.28, .28, .05, (.5, .25, RZ + .66), mat('chimney_cap', '#9a9080'))
finish('house_ottoman')

# ---------------- East Asian house: raised stone base, timber posts, paper screens, two-tier hip roof with upturned corners
reset()
W, D = 1.7, 1.25
box(W + .3, D + .3, .2, (0, 0, .02), mat('stone', '#8f877a'), .02)
for k in range(3): box(.4, .2, .05, (0, -D / 2 - .25 - k * .12, .1 - k * .05), mat('stone', '#8f877a'), .01)   # steps
box(W, D, .95, (0, 0, .6), mat('plaster', '#efe6d2'))
for x in (-W / 2, -W / 6, W / 6, W / 2):
    for y in (-D / 2, D / 2): cyl(.045, .95, (x, y, .6), mat('wood_red', '#7a3328'), v=8)
box(W + .06, D + .06, .06, (0, 0, 1.06), mat('wood_red', '#7a3328')); box(W + .06, D + .06, .05, (0, 0, .15), mat('wood_red', '#7a3328'))
for x in (-W / 3, W / 3):   # lattice screens
    box(.5, .02, .6, (x, -D / 2 - .012, .6), mat('screen', '#f4ecd8'), 0)
    for k in range(5): box(.012, .025, .6, (x - .2 + k * .1, -D / 2 - .02, .6), mat('trim_dark', '#3a2a22'), 0)
    for k in range(4): box(.5, .025, .012, (x, -D / 2 - .02, .36 + k * .16), mat('trim_dark', '#3a2a22'), 0)
door(0, -D / 2, .4, .7, '#5a3d32')
def asian_roof(w, d, z, h, eave):
    frustum(w + eave, d + eave, w * .55, d * .35, h, z, mat('roof', '#4a4e56'))
    frustum(w + eave + .06, d + eave + .06, w + eave, d + eave, .04, z - .04, mat('roof_edge', '#2f3238'))
    for sx in (-1, 1):
        for sy in (-1, 1):   # eave corners sweep gently upwards
            ang = math.atan2(sy * (d + eave), sx * (w + eave))
            box(.2, .07, .035, (sx * (w + eave) / 2 - math.cos(ang) * .04, sy * (d + eave) / 2 - math.sin(ang) * .04, z + .035), mat('roof_edge', '#2f3238'), .01, (0, -.35, ang))
asian_roof(W + .1, D + .1, 1.09, .3, .7)
box(W - .3, D - .4, .3, (0, 0, 1.45), mat('plaster', '#efe6d2'))
asian_roof(W - .3, D - .4, 1.6, .38, .5)
box(W * .5, .08, .06, (0, 0, 1.99), mat('roof_edge', '#2f3238'))
for sx in (-1, 1): cyl(.04, .14, (sx * W * .25, 0, 2.04), mat('roof_edge', '#2f3238'), v=6, r2=.015)
finish('house_eastasia')

# ---------------- 2014 apartment blocks: concrete frame, balconies with rails, window frames, canopy, rooftop kit
def apartment(name, floors):
    reset()
    W, D, FH = 2.2, 1.6, .55
    box(W + .08, D + .08, .3, (0, 0, -.05), mat('base', '#8d8a84'), .01)
    box(W, D, floors * FH, (0, 0, floors * FH / 2), mat('wall', '#d8d2c4'), .005)
    for f in range(floors + 1): box(W + .04, D + .04, .04, (0, 0, f * FH), mat('trim', '#bdb8ae'), 0)
    for f in range(floors):
        z = .3 + f * FH
        for x in (-.72, 0, .72):
            window(x, z, -D / 2, .36, .28, frame='#f1efe8', glass='#3c4a58', bars=True, sill=False)
            window(x, z, D / 2, .36, .28, frame='#f1efe8', glass='#3c4a58', sill=False, face=1)
            if f > 0 and x != 0:   # balcony: slab, rails, a plant or a chair now and then
                box(.56, .26, .04, (x, -D / 2 - .13, z - .17), mat('trim', '#bdb8ae'))
                box(.56, .015, .16, (x, -D / 2 - .255, z - .07), mat('rail', '#5b6066'), 0)
                for k in range(6): box(.012, .012, .16, (x - .26 + k * .104, -D / 2 - .255, z - .07), mat('rail', '#5b6066'), 0)
                if random.random() < .4: cyl(.04, .08, (x + .15, -D / 2 - .12, z - .11), mat('pot', '#a0523a'), v=8); cyl(.06, .07, (x + .15, -D / 2 - .12, z - .04), mat('plant', '#5a8a3a'), v=8, r2=.02)
        for y in (-.45, .45): side_window(W / 2, z, y, .3, .28, frame='#f1efe8', glass='#3c4a58'); side_window(-W / 2, z, y, .3, .28, frame='#f1efe8', glass='#3c4a58', face=-1)
        box(.12, .12, .1, (W / 2 + .07, .4, z - .12), mat('ac', '#e8e8e4'))   # AC unit
    # entrance: canopy, glass door, house number, steps
    box(.7, .45, .05, (0, -D / 2 - .22, .7), mat('trim', '#bdb8ae')); box(.45, .04, .6, (0, -D / 2 - .01, .3), mat('glass', '#3c4a58', .15))
    box(.06, .4, .04, (-.32, -D / 2 - .2, .68), mat('rail', '#5b6066')); box(.06, .4, .04, (.32, -D / 2 - .2, .68), mat('rail', '#5b6066'))
    for k in range(2): box(.7, .2, .05, (0, -D / 2 - .14 - k * .1, -.02 - k * .05), mat('base', '#8d8a84'))
    # roof: parapet, stair house, water tank, satellite dish, antenna
    Z = floors * FH
    for sx in (-1, 1): box(.05, D + .04, .14, (sx * W / 2, 0, Z + .07), mat('trim', '#bdb8ae'));
    for sy in (-1, 1): box(W + .04, .05, .14, (0, sy * D / 2, Z + .07), mat('trim', '#bdb8ae'))
    box(.55, .5, .35, (-.55, .3, Z + .18), mat('wall', '#d8d2c4')); cyl(.16, .3, (.6, .35, Z + .2), mat('tank', '#e8e8e4'), v=12)
    cyl(.1, .02, (.5, -.4, Z + .2), mat('dish', '#f1efe8'), (.9, 0, 0), 12); cyl(.008, .5, (-.8, -.5, Z + .25), mat('rail', '#5b6066'), v=4)
    finish(name)
apartment('apt_4', 4)
apartment('apt_6', 6)

# ---------------- 2014 detached house: render walls, dark gable roof, big windows, garage door, porch lamp
reset()
W, D = 1.6, 1.3
box(W + .06, D + .06, .16, (0, 0, .02), mat('base', '#9a958c'))
box(W, D, 1.0, (0, 0, .55), mat('wall', '#ece6da'))
box(W + .02, D + .02, .06, (0, 0, 1.06), mat('trim', '#f1efe8'))
tiles(W, D, 1.06, .55, '#5b6470', '#4f5660', over=.14, rows=6, cols=9)
gables(W, D, 1.06, .55, mat('wall', '#ece6da'))
door(-.38, -D / 2, .3, .6, '#3f5a7a', frame='#f1efe8')
window(.32, .62, -D / 2, .5, .38, frame='#f1efe8', glass='#3c4a58', sill=True)
side_window(W / 2, .62, -.2, .36, .36, frame='#f1efe8', glass='#3c4a58'); side_window(-W / 2, .62, .2, .36, .36, frame='#f1efe8', glass='#3c4a58', face=-1)
window(0, .62, D / 2, .5, .38, frame='#f1efe8', glass='#3c4a58', face=1)
box(.06, .04, .1, (-.62, -D / 2 - .03, .82), mat('lamp', '#f2d48a', .3))
box(.22, .22, .5, (.45, .25, 1.45), mat('chimney', '#8f8a84')); box(.26, .26, .04, (.45, .25, 1.7), mat('chimney_cap', '#6f6a64'))
for k in range(6): box(.04, .04, .3, (-.8 + k * .32, -D / 2 - .45, .15), mat('fence', '#f1efe8'), 0)   # little front fence
box(1.66, .03, .04, (0, -D / 2 - .45, .25), mat('fence', '#f1efe8'), 0)
finish('house_2014')

# ---------------- preview of all five
reset()
for i, n in enumerate(['house_ottoman', 'house_eastasia', 'apt_4', 'apt_6', 'house_2014']):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n + '.glb'))
    for o in bpy.data.objects:
        if o not in before and o.parent is None: o.location.x += (i - 2) * 2.9
bpy.ops.object.camera_add(location=(3.0, -10.5, 4.2)); cam = bpy.context.active_object
cam.rotation_euler = (Vector((0, 0, 1.2)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 38; bpy.context.scene.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(.9, .2, -.5)); bpy.context.active_object.data.energy = 4
bpy.ops.mesh.primitive_plane_add(size=40); bpy.context.active_object.data.materials.append(mat('grass', '#7a9a48'))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .75, 1)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 1300; sc.render.resolution_y = 560
sc.render.filepath = os.path.join(HERE, 'buildings.png'); bpy.ops.render.render(write_still=True)
print('DONE')
