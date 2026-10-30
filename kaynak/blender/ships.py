# Ships for Map Battle Royale: 1810 ship of the line, 2014 destroyer, fishing boat.
# The hull is lofted from stations (beam, draft, freeboard per station) so it has a real bow, sheer and transom.
# Bow points +X, waterline at z = 0. Materials are "role|#hex" ('team' gets the owner's colour in the game).
#   Blender -b --factory-startup -P blender/ships.py -- public/models
import bpy, bmesh, math, sys, os
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
HERE = os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1]))
MATS, objs = {}, []
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear(); objs.clear()
def mat(role, hexs, rough=.75, metal=0.):
    k = role + hexs
    if k not in MATS:
        c = tuple(int(hexs[i:i+2], 16) / 255 for i in (1, 3, 5))
        m = bpy.data.materials.new(role + '|' + hexs); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*[pow(x, 2.2) for x in c], 1)
        b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        MATS[k] = m
    return MATS[k]
def put(o, m):
    o.data.materials.append(m); objs.append(o); return o
def box(sx, sy, sz, loc, m, bevel=.006, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    if bevel: md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 1; md.limit_method = 'ANGLE'
    return put(o, m)
def cyl(r, d, loc, m, rot=(0, 0, 0), v=10, r2=None):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=v)
    else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=d, location=loc, rotation=rot, vertices=v)
    return put(bpy.context.active_object, m)
def line(a, b, r, m, v=5):   # thin rod between two points (masts' rigging, rails)
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(a + b) / 2, vertices=v)
    o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); return put(o, m)

def hull(L, B, draft, free, sheer, mats, stern_full=.75, tumble=0., bands=()):
    """mats: dict bottom/side/deck (+ band materials). bands: [(z0, z1, mat)] painted strips on the topsides."""
    N, K = 28, 7
    def beam(t):   # t: 0 stern .. 1 bow
        if t > .42: f = 1 - ((t - .42) / .58) ** 2; return B / 2 * max(.015, f) ** .55
        f = 1 - ((.42 - t) / .42) ** 2; return B / 2 * (stern_full + (1 - stern_full) * max(0, f) ** .5)
    def deep(t): return draft * (max(.08, 1 - ((t - .45) / .55) ** 2) ** .35 if t > .45 else max(.35, 1 - ((.45 - t) / .45) ** 3) ** .5)
    def top(t): return free + sheer * (2 * t - 1) ** 2 + (sheer * .6 * (1 - t) ** 3)
    bm = bmesh.new(); rings = []
    for i in range(N + 1):
        t = i / N; x = -L / 2 + t * L; b, d, h = beam(t), deep(t), top(t)
        side = [(b * math.sin(k / K * math.pi / 2), -d * math.cos(k / K * math.pi / 2)) for k in range(K + 1)]
        for m in range(1, 7): side.append((b * (1 - tumble * m / 6), h * m / 6))   # topsides in strips so bands can be painted
        pts = [(-y, z) for y, z in reversed(side[1:])] + side   # left top ... keel ... right top
        rings.append([bm.verts.new((x, y, z)) for y, z in pts])
    n = len(rings[0])
    for i in range(N):
        for k in range(n - 1): bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]))
        bm.faces.new((rings[i][-1], rings[i + 1][-1], rings[i + 1][0], rings[i][0]))   # deck strip
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[N])   # transom + stem
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('hull'); bm.to_mesh(me); o = bpy.data.objects.new('hull', me); bpy.context.collection.objects.link(o)
    slots = [mats['bottom'], mats['side'], mats['deck']] + [m for _, _, m in bands]
    for m in slots: o.data.materials.append(m)
    for f in o.data.polygons:
        c = f.center
        if f.normal.z > .7 and c.z > free * .5: f.material_index = 2
        elif c.z < .02: f.material_index = 0
        else:
            f.material_index = 1
            for j, (z0, z1, _) in enumerate(bands):
                if z0 <= c.z <= z1: f.material_index = 3 + j
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.shade_smooth()
    objs.append(o)
    return beam, top
def sail(w, h, loc, m, belly=.12, rot=(0, 0, 0)):   # a billowing square sail (in the YZ plane)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); o = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=5); bpy.ops.object.mode_set(mode='OBJECT')
    for v in o.data.vertices:
        x, y = v.co.x, v.co.y
        v.co = Vector((belly * math.cos(x * math.pi) * math.cos(y * math.pi * .8), x * w, y * h))
    o.location = loc; o.rotation_euler = rot; bpy.ops.object.transform_apply(location=True, rotation=True)
    sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = .012; bpy.ops.object.modifier_apply(modifier='s')
    bpy.ops.object.shade_smooth(); return put(o, m)
def finish(name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', use_selection=True)
    print('SHIP', name, sum(len(p.vertices) - 2 for p in o.data.polygons))

# ================= 1810: two-decker ship of the line =================
reset()
L, B = 4.4, 1.15
WOOD, DARK, OCHRE = mat('hull', '#3a2a20', .7), mat('hull_dark', '#2a1f18', .7), mat('band', '#d4b46a', .6)
beam, top = hull(L, B, .32, .62, .12, { 'bottom': mat('copper', '#7a6040', .5, .3), 'side': DARK, 'deck': mat('deck', '#b08a5a', .85) },
                 stern_full=.8, tumble=.12, bands=[(.22, .31, OCHRE), (.42, .51, OCHRE)])
def side_y(x, z):   # hull surface half-width at (x, z) for placing gunports
    t = (x + L / 2) / L; return beam(t) * (1 - .12 * max(0, z) / top(t)) + .004
for z in (.265, .465):   # two gun decks: dark port, red lid above, a gun muzzle
    for i in range(12):
        x = -1.55 + i * .26
        if x > 1.3: continue
        for s in (-1, 1):
            y = s * side_y(x, z)
            box(.11, .03, .075, (x, y, z), mat('port', '#1d1714'), 0)
            box(.11, .02, .03, (x, y + s * .012, z + .055), mat('lid', '#8a2a20'), 0)
            cyl(.018, .06, (x, y + s * .03, z), mat('gun', '#1d1d1d', .5, .4), (math.pi / 2, 0, 0), 6)
# stern castle with cabin windows and gallery, quarterdeck rail
WARM = mat('wood', '#6b4a2e', .75)
box(.75, B * .78, .26, (-1.85, 0, top(.08) + .1), WARM); box(.77, B * .8, .03, (-1.85, 0, top(.08) + .24), OCHRE, 0)
for s in (-1, 1):
    for k in range(3): box(.1, .012, .08, (-2.05 + k * .2, s * B * .39, top(.08) + .12), mat('window', '#f2d48a', .3), 0)
for k in range(5): box(.012, .1, .12, (-2.23, -.24 + k * .12, top(.08) + .12), mat('window', '#f2d48a', .3), 0)
box(.02, B * .7, .03, (-2.24, 0, top(.08) + .02), OCHRE, 0)
for s in (-1, 1): line((-2.2, s * B * .38, top(.08) + .23), (-1.48, s * B * .4, top(.15) + .23), .01, OCHRE)
cyl(.025, .14, (-2.2, 0, top(.08) + .33), mat('lamp', '#f2d48a', .3), v=8)
# forecastle + figurehead + bowsprit with jib
box(.5, B * .55, .14, (1.6, 0, top(.86) + .05), WARM); box(.52, B * .57, .025, (1.6, 0, top(.86) + .13), OCHRE, 0)
cyl(.03, .22, (2.24, 0, top(.98) + .02), mat('gilt', '#d4b46a', .4, .5), (0, math.pi / 2 - .5, 0), 8)
line((2.0, 0, top(.95) + .05), (3.0, 0, top(.95) + .45), .025, mat('spar', '#4a3426'))
SAIL = mat('sail', '#f1ece0', .9)
# masts with three yards and billowing sails each, tops, shrouds
for mx, h, w0 in ((-1.15, 2.9, 1.25), (.15, 3.4, 1.45), (1.35, 3.0, 1.25)):
    z0 = top((mx + L / 2) / L)
    cyl(.045, h, (mx, 0, z0 + h / 2), mat('spar', '#4a3426'), v=10, r2=.028)
    for j, (zz, ww) in enumerate(((.95, w0), (1.85, w0 * .82), (2.6, w0 * .62))):
        if zz > h - .15: continue
        line((mx, -ww / 2 - .05, z0 + zz + .38), (mx, ww / 2 + .05, z0 + zz + .38), .016, mat('spar', '#4a3426'))
        sail(ww, .76 - j * .1, (mx + .04, 0, z0 + zz), SAIL, .1)
        box(.12, .3, .03, (mx, 0, z0 + zz + .44), mat('spar', '#4a3426'), 0)   # top platform
    for s in (-1, 1):   # shrouds down to the rail
        for k in range(3): line((mx, 0, z0 + h * .62), (mx - .15 + k * .15, s * beam((mx + L / 2) / L) * .95, z0 + .05), .005, mat('rope', '#2b2520'))
    line((mx, 0, z0 + h), (mx + 1.1 if mx < 1 else 2.9, 0, (z0 + 1.0) if mx < 1 else top(.95) + .42), .005, mat('rope', '#2b2520'))   # stays
bpy.ops.mesh.primitive_plane_add(size=1); o = bpy.context.active_object   # jib (triangle)
S0, S1 = Vector((1.35, 0, top((1.35 + L / 2) / L) + 3.0)), Vector((2.9, 0, top(.95) + .42))   # luff hanks onto the lower half of the fore stay
for v, p in zip(o.data.vertices, (S0.lerp(S1, .88), S0.lerp(S1, .5), Vector((1.85, 0, top(.88) + .4)), Vector((1.85, 0, top(.88) + .4)))): v.co = p
sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = .01; bpy.ops.object.modifier_apply(modifier='s'); put(o, SAIL)
box(.02, .32, .2, (.15, .17, top(.6) + 3.5), mat('team', '#c0392b', .6), 0)   # flag
finish('ship_1810')

# ================= 2014: guided-missile destroyer =================
reset()
L, B = 4.4, .9
GREY, LIGHT = mat('hull', '#6b737c', .55), mat('super', '#9aa3ac', .5)
beam, top = hull(L, B, .26, .4, .1, { 'bottom': mat('antifoul', '#8a2a24', .6), 'side': GREY, 'deck': mat('deck', '#4f565e', .7) },
                 stern_full=.85, bands=[(.0, .05, mat('boot', '#1d1f22', .6))])
z = lambda x: top((x + L / 2) / L)
# superstructure: stepped blocks, bridge windows, mast, radars, funnel
box(1.2, .62, .32, (-.15, 0, z(-.15) + .16), LIGHT); box(.7, .5, .22, (.15, 0, z(.15) + .43), LIGHT)
box(.42, .52, .14, (.3, 0, z(.3) + .61), LIGHT); box(.02, .48, .06, (.52, 0, z(.3) + .63), mat('glass', '#1d2a36', .2), 0)
for s in (-1, 1): box(.3, .015, .2, (.15, s * .25, z(.15) + .43), mat('panel', '#7a838c'), 0)   # radar panels
cyl(.04, .9, (.05, 0, z(0) + 1.05), LIGHT, v=8, r2=.02)
for k, (zz, w) in enumerate(((.82, .4), (1.0, .3), (1.18, .22))): box(.04, w, .02, (.05, 0, z(0) + zz), LIGHT, 0)
cyl(.07, .03, (.05, 0, z(0) + 1.33), mat('radome', '#e8e8e4'), v=12)
box(.32, .26, .3, (-.55, 0, z(-.55) + .47), LIGHT); box(.34, .28, .03, (-.55, 0, z(-.55) + .63), mat('funnel_top', '#2b2d31'), 0)
# forward gun, missile hatches, CIWS, aft helipad + hangar + flag
cyl(.13, .12, (1.35, 0, z(1.35) + .07), LIGHT, v=14, r2=.1); line((1.4, 0, z(1.35) + .11), (1.95, 0, z(1.35) + .15), .018, mat('barrel', '#4a525c'))
for i in range(3):
    for j in range(2): box(.09, .09, .015, (.88 + i * .11, -.055 + j * .11, z(.9) + .008), mat('hatch', '#3a4048'), 0)
cyl(.06, .14, (-.95, 0, z(-.95) + .07), mat('radome', '#e8e8e4'), v=10)
box(.5, .58, .3, (-1.25, 0, z(-1.25) + .15), LIGHT)
bpy.ops.mesh.primitive_torus_add(major_radius=.22, minor_radius=.008, location=(-1.8, 0, z(-1.8) + .006)); put(bpy.context.active_object, mat('marking', '#f1efe8'))
box(.02, .14, .005, (-1.8, -.05, z(-1.8) + .007), mat('marking', '#f1efe8'), 0); box(.02, .14, .005, (-1.8, .05, z(-1.8) + .007), mat('marking', '#f1efe8'), 0); box(.11, .02, .005, (-1.8, 0, z(-1.8) + .007), mat('marking', '#f1efe8'), 0)
line((-2.15, 0, z(-2.15)), (-2.15, 0, z(-2.15) + .35), .008, mat('barrel', '#4a525c')); box(.01, .18, .12, (-2.15, .09, z(-2.15) + .3), mat('team', '#c0392b', .6), 0)
for s in (-1, 1):   # deck rails
    for x0 in (-2.0, 1.0): line((x0, s * beam((x0 + L / 2) / L) * .95, z(x0) + .05), (x0 + 1.0, s * beam((x0 + 1 + L / 2) / L) * .95, z(x0 + 1) + .05), .005, mat('rail', '#c9ccd1'))
finish('ship_2014')

# ================= fishing boat =================
reset()
L, B = 2.4, .85
beam, top = hull(L, B, .2, .3, .14, { 'bottom': mat('antifoul', '#8a2a24', .6), 'side': mat('boathull', '#2f6a8a', .55), 'deck': mat('deck', '#c9b48a', .85) },
                 stern_full=.8, bands=[(.22, .3, mat('band', '#f1ece0', .6))])
z = lambda x: top((x + L / 2) / L)
box(.55, .5, .42, (-.45, 0, z(-.45) + .21), mat('cabin', '#f1ece0')); box(.62, .58, .05, (-.45, 0, z(-.45) + .44), mat('roof', '#b84a3a'))
box(.02, .38, .12, (-.17, 0, z(-.45) + .28), mat('glass', '#2f4050', .2), 0)
for s in (-1, 1): box(.3, .02, .12, (-.45, s * .255, z(-.45) + .28), mat('glass', '#2f4050', .2), 0)
cyl(.025, 1.2, (.4, 0, z(.4) + .6), mat('spar', '#4a3426'), v=8); line((.4, 0, z(.4) + .9), (1.15, 0, z(.4) + .45), .015, mat('spar', '#4a3426'))
line((1.15, 0, z(.4) + .45), (1.15, 0, z(.4) + .05), .004, mat('rope', '#2b2520'))
for k in range(5): cyl(.04, .05, (.0 + k * .12, .25 * (1 if k % 2 else -1), z(0) + .03), mat('buoy', '#e8a030', .5), v=8)
box(.4, .3, .06, (.1, 0, z(.1) + .03), mat('net', '#5a7a6a', .9))
finish('boat_fishing')

# ---------------- preview
reset()
for i, n in enumerate(['ship_1810', 'ship_2014', 'boat_fishing']):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, n + '.glb'))
    for o in bpy.data.objects:
        if o not in before and o.parent is None: o.location.y += (i - 1) * 2.4
bpy.ops.object.camera_add(location=(6.5, -7.5, 4.0)); cam = bpy.context.active_object
cam.rotation_euler = (Vector((0, 0, 1.0)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 40; bpy.context.scene.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(.9, .2, -.5)); bpy.context.active_object.data.energy = 4
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, .0)); put(bpy.context.active_object, mat('sea', '#2f6a8a', .2))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .65, .75, 1)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 1200; sc.render.resolution_y = 600
sc.render.filepath = os.path.join(HERE, 'ships.png'); bpy.ops.render.render(write_still=True)
print('DONE')
