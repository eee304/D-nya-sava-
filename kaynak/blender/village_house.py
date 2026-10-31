# 1810 village house from the user's model (blender/kaynak-modeller/village_house.obj, © 2018 illuminachos):
# a timber-framed cottage with a rounded thatched roof. Each face takes the colour of its texture area and is sorted into
# a material named "role|#hex" (thatch, timber, plaster, stone, glass) so the game's Kit can paint and recolour it like the
# code-built houses. Scaled to the game's house size (≈2.4 long), origin at the centre of the ground plan.
#   Blender -b -P blender/village_house.py -- public/models
import bpy, sys, os, colorsys
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
HERE = os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1]))
SRC = os.path.join(HERE, 'kaynak-modeller')

if bpy.app.background: bpy.ops.wm.read_factory_settings(use_empty=True)
else:
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll): coll.remove(d)
bpy.ops.wm.obj_import(filepath=os.path.join(SRC, 'village_house.obj'))
ob = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
img = bpy.data.images.load(os.path.join(SRC, 'village_house.png'))
W, H = img.size; px = img.pixels[:]
def sample(u, v):
    x = min(W - 1, max(0, int((u % 1) * W))); y = min(H - 1, max(0, int((v % 1) * H))); i = (y * W + x) * 4
    return px[i], px[i + 1], px[i + 2]

# ---- sort the faces by the colour under them
me = ob.data; uv = me.uv_layers.active.data
ROLES = ['thatch', 'timber', 'plaster', 'stone', 'glass']
def role_of(c):
    h, s, v = colorsys.rgb_to_hsv(*c); h *= 360
    if v < .2: return 'glass'
    if s < .16 and v > .62: return 'plaster'
    if 28 < h < 62 and s > .3 and v > .42: return 'thatch'
    if v < .45 and s > .25: return 'timber'
    return 'stone'
acc = {r: [0, 0, 0, 0] for r in ROLES}; face_role = []
# height helps where the weathered texture is ambiguous: above the eaves everything that is not a dark rib is thatch,
# below them golden wood is timber, light is plaster, and the bottom course is the stone plinth
zs = [(ob.matrix_world @ v.co).z for v in me.vertices]; z0, z1 = min(zs), max(zs)
def role_at(p, c):
    zf = ((ob.matrix_world @ p.center).z - z0) / (z1 - z0)
    h, s_, v = colorsys.rgb_to_hsv(*c); h *= 360
    if zf > .56: return 'timber' if (v < .38 or (s_ < .3 and v < .5)) else 'thatch'
    if zf < .07: return 'stone'
    if v < .16: return 'glass'
    if s_ < .2 and v > .58: return 'plaster'
    return 'timber'
for p in me.polygons:
    cs = [sample(*uv[li].uv) for li in p.loop_indices]
    cu = sum(uv[li].uv[0] for li in p.loop_indices) / p.loop_total; cv = sum(uv[li].uv[1] for li in p.loop_indices) / p.loop_total
    cs.append(sample(cu, cv)); cs.append(sample(cu, cv))   # the centre counts double
    c = tuple(sum(q[k] for q in cs) / len(cs) for k in range(3))
    r = role_at(p, c); face_role.append(r); a = acc[r]; a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3] += 1
def hexc(c): return '#%02x%02x%02x' % tuple(int(max(0, min(1, x)) * 255) for x in c)   # the PNG's pixels are already sRGB
# painted-miniature palette (the texture's own averages come out muddy once flattened to one colour per part)
PALETTE = {'thatch': '#c9a253', 'timber': '#5e4630', 'plaster': '#eee6d4', 'stone': '#a59b8a', 'glass': '#3a4656'}
mats = {}
me.materials.clear()
for r in ROLES:
    h = PALETTE[r]; col = tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))
    m = bpy.data.materials.new(r + '|' + h); m.diffuse_color = (*col, 1); me.materials.append(m); mats[r] = len(me.materials) - 1
for p, r in zip(me.polygons, face_role): p.material_index = mats[r]
print('ROLES', {r: acc[r][3] for r in ROLES}, [m.name for m in me.materials])

# ---- size and origin: ≈2.4 long, standing on z=0, centred
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bb = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
k = 2.4 / max(mx.x - mn.x, mx.y - mn.y)
me.transform(__import__('mathutils').Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
ob.scale = (k, k, k); bpy.ops.object.transform_apply(scale=True)
# long side along the game's x axis (like house_eu)
if mx.y - mn.y > mx.x - mn.x: ob.rotation_euler = (0, 0, 1.5708); bpy.ops.object.transform_apply(rotation=True)
for e in me.uv_layers[:]: me.uv_layers.remove(e)
bpy.ops.object.shade_flat()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'house_vil.glb'), export_format='GLB', use_selection=True, export_materials='EXPORT', export_texcoords=False)
print('HOUSE_VIL', [round(x, 2) for x in ob.dimensions], 'faces', len(me.polygons))
