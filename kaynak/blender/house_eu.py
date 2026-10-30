# Detailed European 1810 house for Map Battle Royale (same footprint as the code house: 1.7 x 1.25)
import bpy, bmesh, math, random, sys
from mathutils import Vector
random.seed(4)
bpy.ops.wm.read_factory_settings(use_empty=True)
out = sys.argv[sys.argv.index('--') + 1]

MATS = {}
def mat(name, col, rough=.85):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name + '|#' + ''.join('%02x' % round(c * 255) for c in col)); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*[pow(c, 2.2) for c in col], 1); b.inputs['Roughness'].default_value = rough
    MATS[name] = m; return m
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
PL = mat('plaster', hexc('#e9dfc8')); TIM = mat('timber', hexc('#4a3426')); STN = mat('stone', hexc('#9a9080'))
TIL = mat('tile', hexc('#a9472f')); TIL2 = mat('tile_dark', hexc('#86352a')); GLS = mat('glass', hexc('#3e5468'), .2)
FRM = mat('frame', hexc('#efe8d8')); SHU = mat('shutter', hexc('#4f6f4a')); DOOR = mat('door', hexc('#6b2f24'))
BRK = mat('chimney', hexc('#8f7e6c')); FLW = [mat('fl1', hexc('#e8506a')), mat('fl2', hexc('#f2d24a')), mat('fl3', hexc('#f4f1e6'))]; LEAF = mat('leaf', hexc('#4f7a35'))

objs = []
def box(sx, sy, sz, loc, m, bevel=.015, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 1; md.limit_method = 'ANGLE'
    o.data.materials.append(m); objs.append(o); return o
def cyl(r, d, loc, m, rot=(0, 0, 0), v=8):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v)
    o = bpy.context.active_object; o.data.materials.append(m); objs.append(o); return o
def sph(r, loc, m):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=loc, subdivisions=0); o = bpy.context.active_object; o.data.materials.append(m); objs.append(o); return o

# Blender is Z-up; glTF export converts to Y-up. x = width, y = depth (front is -y), z = up
W, D, H = 1.7, 1.25, 1.0
# stone foundation of individual stones
for side in range(4):
    L = W if side < 2 else D; n = int(L / .2)
    for k in range(n):
        for row in range(2):
            t = -L / 2 + (k + .5 + (row % 2) * .5) * L / n
            if t > L / 2 - .05: continue
            sx, sy = (L / n * .92, .1) if side < 2 else (.1, L / n * .92)
            x, y = (t, (-1 if side == 0 else 1) * (D / 2 + .01)) if side < 2 else ((-1 if side == 2 else 1) * (W / 2 + .01), t)
            box(sx, sy, .1, (x, y, -.02 + row * .11 + random.uniform(-.01, .01)), STN, .02)
# walls
box(W, D, H, (0, 0, .2 + H / 2), PL, .01)
# timber frame on the front and back
for fy in (-1, 1):
    y = fy * (D / 2 + .012)
    for k in range(5): box(.06, .03, H, (-W / 2 + .03 + k * (W - .06) / 4, y, .2 + H / 2), TIM, .006)
    box(W + .02, .035, .06, (0, y, .2 + .03), TIM, .006); box(W + .02, .035, .06, (0, y, .2 + H * .55), TIM, .006); box(W + .02, .035, .07, (0, y, .2 + H - .02), TIM, .006)
    for k in (0, 3):
        x0 = -W / 2 + .03 + k * (W - .06) / 4; x1 = -W / 2 + .03 + (k + 1) * (W - .06) / 4; z0, z1 = .2 + H * .55, .2 + H
        L = math.hypot(x1 - x0, z1 - z0); a = math.atan2(z1 - z0, x1 - x0)
        box(L, .03, .05, ((x0 + x1) / 2, y, (z0 + z1) / 2), TIM, .005, (0, -a, 0))
# roof: gable with individual overlapping tiles
RISE, OV = .7, .16; half = D / 2 + OV; slope = math.hypot(half, RISE); ang = math.atan2(RISE, half)
z0 = .2 + H
for s in (-1, 1):
    rows = 7; cols = 10
    for r in range(rows):
        t = (r + .5) / rows; yy = s * half * (1 - t); zz = z0 + RISE * t
        for c in range(cols):
            off = .5 if r % 2 else 0
            x = -(W + .3) / 2 + (c + .5 + off) * (W + .3) / cols
            if x > (W + .3) / 2: continue
            o = box((W + .3) / cols * .96, slope / rows + .05, .035, (x, yy + random.uniform(-.005, .005), zz + .02), TIL if random.random() > .25 else TIL2, .012, (-s * ang + random.uniform(-.03, .03), 0, random.uniform(-.02, .02)))
    # fascia board
    box(W + .32, .03, .08, (0, s * (half - .01), z0 - .03), TIM, .005, (-s * ang, 0, 0))
# ridge tiles
for c in range(10): cyl(.055, (W + .34) / 10 * .98, (-(W + .34) / 2 + (c + .5) * (W + .34) / 10, 0, z0 + RISE + .03), TIL2, (0, math.pi / 2, 0), 8)
# gable walls (triangles) with timber
for gx in (-1, 1):
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in [(gx * W / 2, -D / 2, z0), (gx * W / 2, D / 2, z0), (gx * W / 2, 0, z0 + RISE * (D / 2) / half)]]
    bm.faces.new(vs if gx > 0 else vs[::-1]); me = bpy.data.meshes.new('g'); bm.to_mesh(me); o = bpy.data.objects.new('gable', me); bpy.context.collection.objects.link(o); o.data.materials.append(PL); objs.append(o)
    box(.03, .05, RISE * (D / 2) / half, (gx * (W / 2 + .012), 0, z0 + RISE * (D / 2) / half / 2), TIM, .005)
# chimney with cap and pots
box(.26, .26, .9, (W * .28, .22, z0 + .45), BRK, .012)
for k in range(5): box(.27, .27, .025, (W * .28, .22, z0 + .15 + k * .17), mat('mortar', hexc('#6f6256')), 0)
box(.32, .32, .06, (W * .28, .22, z0 + .92), mat('mortar', hexc('#6f6256')), .01)
cyl(.045, .14, (W * .28 - .05, .22, z0 + 1.0), mat('pot', hexc('#a0523a'))); cyl(.045, .12, (W * .28 + .06, .22, z0 + .99), mat('pot', hexc('#a0523a')))
# windows: frame, glass, cross bars, sill, shutters, flower box
def window(x, z, y, face=-1, w=.3, h=.36, fl=True):
    box(w + .08, .04, h + .08, (x, y + face * .01, z), FRM, .008)
    box(w, .04, h, (x, y + face * .025, z), GLS, 0)
    box(.025, .05, h, (x, y + face * .03, z), FRM, 0); box(w, .05, .025, (x, y + face * .03, z + h * .1), FRM, 0)
    box(w + .14, .1, .04, (x, y + face * .05, z - h / 2 - .05), mat('sill', hexc('#cfc3aa')), .008)
    for s in (-1, 1):
        sh = box(w * .5, .025, h + .04, (x + s * (w * .5 + w * .27), y + face * .02, z), SHU, .005)
        for k in range(3): box(w * .44, .03, .012, (x + s * (w * .5 + w * .27), y + face * .035, z - h / 2 + .06 + k * h / 5), mat('shutter_dark', hexc('#3f5a3a')), 0)
    if fl:
        box(w + .06, .12, .1, (x, y + face * .1, z - h / 2 - .11), TIM, .01)
        for k in range(6): sph(.045, (x - w / 2 + .05 + k * (w - .1) / 5, y + face * (.1 + random.uniform(-.03, .03)), z - h / 2 - .04), random.choice(FLW + [LEAF]))
for x in (-W * .3, W * .3): window(x, .2 + .55, -D / 2)
window(W * .0, .2 + .55, D / 2, 1, fl=False)
# door with frame, planks, iron hinges, step, lantern
box(.46, .05, .72, (0, -D / 2 - .01, .2 + .36), mat('doorframe', hexc('#cfc3aa')), .01)
for k in range(4): box(.09, .05, .64, (-.135 + k * .09, -D / 2 - .025, .2 + .32), DOOR, .006)
for zz in (.35, .65): box(.3, .06, .03, (0, -D / 2 - .04, zz), mat('iron', hexc('#2b2520')), 0)
sph(.025, (.11, -D / 2 - .06, .55), mat('brass', hexc('#d6b04a'), .4))
box(.55, .22, .08, (0, -D / 2 - .12, .2 - .04), STN, .02)
box(.04, .1, .04, (.32, -D / 2 - .05, .2 + .78), mat('iron', hexc('#2b2520')), 0); box(.08, .08, .12, (.32, -D / 2 - .1, .2 + .72), mat('lamp', hexc('#f2d48a'), .3), .005)
# side: woodpile and barrel
for k in range(9): cyl(.04, .4, (W / 2 + .1, -.3 + (k % 3) * .09, .2 + .04 + (k // 3) * .08), mat('log', hexc('#9b7b55')), (math.pi / 2, 0, math.pi / 2), 7)
cyl(.12, .3, (W / 2 + .14, .3, .2 + .15), mat('barrel', hexc('#7a5634'))); cyl(.125, .025, (W / 2 + .14, .3, .2 + .08), mat('iron', hexc('#2b2520'))); cyl(.125, .025, (W / 2 + .14, .3, .2 + .24), mat('iron', hexc('#2b2520')))

# join everything (modifiers applied), shift so the foundation bottom sits at 0
bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
house = bpy.context.active_object; house.name = 'house_eu_1810'
bpy.ops.object.shade_flat()
house.location.z -= .16   # wall base near ground level, foundation partly sunk like the code houses
bpy.ops.object.transform_apply(location=True)
tris = sum(len(p.vertices) - 2 for p in house.data.polygons)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, use_selection=True)
print('TRIS', tris)

# preview render
bpy.ops.object.camera_add(location=(3.6, -4.2, 3.0)); cam = bpy.context.active_object
cam.rotation_euler = (Vector((0, 0, .9)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
bpy.context.scene.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(.8, .2, .6)); bpy.context.active_object.data.energy = 4
bpy.ops.mesh.primitive_plane_add(size=12); bpy.context.active_object.data.materials.append(mat('grass', hexc('#7a9a48')))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .75, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 900; sc.render.resolution_y = 700
sc.render.filepath = out.replace('.glb', '.png'); bpy.ops.render.render(write_still=True)
print('DONE')
