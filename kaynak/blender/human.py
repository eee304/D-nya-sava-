# Rigged humans for Map Battle Royale: 1810 / 2014 soldiers and townsfolk.
# One smooth metaball body, accessories skinned rigidly to bones, colours in a vertex-colour layer.
# Marker colours are replaced in the game: magenta = team / shirt, cyan = trousers (townsfolk), yellow = skin (townsfolk).
# Variants: <kind>_<era>[_<culture>][_f]  kind: soldier | civ | worker (a townsman with an axe and a chop clip)  culture: eu (default) | isl (Ottoman / Islamic world) | ea (East Asia) | af (Africa)
#   Blender -b --factory-startup -P blender/human.py -- public/models
import bpy, math, sys, os
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
HERE = os.path.dirname(os.path.abspath(sys.argv[sys.argv.index('-P') + 1]))
TEAM, PANTS, SKINM = '#ff00ff', '#00ffff', '#ffff00'
K = 1.5   # metaball surface sits inside the element radius: scale radii so the surface lands where we want it

def hexrgb(h): return tuple(int(h[i:i+2], 16) / 255 for i in (1, 3, 5))
def paint(obj, colfn):
    """colfn(co) -> hex, per vertex (corner domain colour layer 'Col')."""
    me = obj.data
    if 'Col' not in me.color_attributes: me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    lay = me.color_attributes['Col']
    for poly in me.polygons:
        c = Vector((0, 0, 0))
        for vi in poly.vertices: c += me.vertices[vi].co
        c /= len(poly.vertices); col = hexrgb(colfn(obj.matrix_world @ c))
        for li in poly.loop_indices: lay.data[li].color_srgb = (*col, 1)
def solid(obj, hexs): paint(obj, lambda co: hexs)

def build(variant):
    if bpy.app.background: bpy.ops.wm.read_factory_settings(use_empty=True)
    else:   # inside an open Blender (e.g. driven over MCP): empty the scene without resetting add-ons and preferences
        if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
        for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.actions, bpy.data.materials, bpy.data.metaballs, bpy.data.cameras, bpy.data.lights):
            for d in list(coll): coll.remove(d)
    bits = variant.split('_'); era = bits[1]; soldier = bits[0] == 'soldier'; worker = bits[0] == 'worker'
    fem = bits[-1] == 'f'; cul = bits[2] if len(bits) > 2 and bits[2] != 'f' else 'eu'
    # ---- body (character faces -Y, right side is -X, height 1.0)
    mb = bpy.data.metaballs.new('mb'); mb.resolution = .022; mb.render_resolution = .022
    mbo = bpy.data.objects.new('mb', mb); bpy.context.collection.objects.link(mbo)
    def ball(p, r, s=(1, 1, 1)):
        e = mb.elements.new(); e.co = p; e.radius = r * K; e.stiffness = 2.2
        if s != (1, 1, 1): e.type = 'ELLIPSOID'; e.size_x, e.size_y, e.size_z = s
    def chain(a, b, r, n=4):
        a, b = Vector(a), Vector(b)
        for i in range(n + 1): ball(tuple(a + (b - a) * i / n), r)
    # cute-realistic proportions: head ~1/5.5 of the height, sturdy torso, short neck
    # women: narrower shoulders and waist, fuller hips
    fw = fem and not soldier
    A0, A1, A2 = (.128, .148, .153) if fw else (.14, .16, .165)   # shoulder, elbow, wrist x
    ball((0, 0, .5), .095, (1.27, .9, .72) if fw else (1.15, .85, .7)); ball((0, 0, .6), .09, (1.0, .76, 1) if fw else (1.15, .8, 1))
    ball((0, 0, .7), .1, (1.15, .85, .85) if fw else (1.3, .85, .85))
    chain((0, 0, .76), (0, 0, .81), .036, 2); ball((0, -.005, .885), .095, (1, 1.02, 1.04))
    for sx in (-1, 1):
        chain((sx * A0, 0, .75), (sx * A1, 0, .6), .033 if fw else .036); chain((sx * A1, 0, .6), (sx * A2, -.01, .47), .028 if fw else .031)
        ball((sx * A2, -.012, .44), .031 if fw else .034)
        chain((sx * .07, 0, .47), (sx * .072, 0, .26), .052); chain((sx * .072, 0, .26), (sx * .072, .005, .07), .041)
        ball((sx * .072, -.03, .035), .04, (.9, 1.6, .6))
    bpy.context.view_layer.objects.active = mbo; mbo.select_set(True); bpy.ops.object.convert(target='MESH')
    body = bpy.context.active_object; body.name = variant
    d = body.modifiers.new('d', 'DECIMATE'); d.ratio = .7 if soldier else .9; bpy.ops.object.modifier_apply(modifier='d')   # soldiers come by the hundred: keep them light
    bpy.ops.object.shade_smooth()
    skin = '#e8b890' if soldier else SKINM
    coat = TEAM if era == '1810' else '#6f7a4f'
    trou = ({'eu': '#efe9dc', 'isl': '#2c3a66', 'ea': '#2b2a30'}.get(cul, '#efe9dc') if era == '1810' else '#5f6a44') if soldier else PANTS
    shirt = coat if soldier else TEAM
    boots = {'eu': ('#1d1a17', .2), 'isl': ('#9a6a2a', .07), 'ea': ('#1d1a17', .17)}.get(cul) if soldier and era == '1810' else ('#3a3326', .14) if soldier else None
    # under a robe the hips (and legs, for a long one) take the robe colour, so no trouser colour peeks out at the waist
    robe_z = {'isl_f': 0, 'ea_f': 0, 'af': 0, 'ea': .36}.get(cul + ('_f' if fem else ''), None) if era == '1810' and not soldier else (.36 if soldier and era == '1810' and cul == 'ea' else None)
    def bodycol(co):
        x, z = abs(co.x), co.z
        if z > .79: return skin                                   # head + neck
        if z < .46 and x > A0 - .01: return skin                  # hands
        if boots and z < boots[1]: return boots[0]                # gaiters / boots / yellow Ottoman shoes
        if z < .045: return '#2a2420'                             # shoes
        if z < .47 and x < .13: return shirt if robe_z is not None and z > robe_z else trou
        if soldier and z < .52 and x < .13: return ('#efe9dc' if era == '1810' and cul == 'eu' else '#a8302a' if era == '1810' else '#4e5638')   # belt / sash
        return shirt
    paint(body, bodycol)

    # ---- accessories: (object, bone)
    acc = []
    def box(size, loc, col, bone, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object
        o.scale = size; bpy.ops.object.transform_apply(scale=True, rotation=True)
        bv = o.modifiers.new('b', 'BEVEL'); bv.width = min(size) * .25; bv.segments = 2; bpy.ops.object.modifier_apply(modifier='b')
        solid(o, col); acc.append((o, bone)); return o
    def cyl(r, h, loc, col, bone, rot=(0, 0, 0), v=12, r2=None, s=(1, 1, 1)):
        if r2 is None: bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=v)
        else: bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=v)
        o = bpy.context.active_object; o.scale = s; bpy.ops.object.transform_apply(rotation=True, scale=True); solid(o, col); acc.append((o, bone)); return o
    def sph(r, loc, col, bone, s=(1, 1, 1), seg=10):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=max(5, seg * 2 // 3)); o = bpy.context.active_object
        o.scale = s; bpy.ops.object.transform_apply(scale=True); solid(o, col); acc.append((o, bone)); return o
    # eyes (every variant): small dark dots, cute but not cartoon-big
    for sx in (-1, 1): sph(.011, (sx * .034, -.088, .895), '#1d1a17', 'head')
    sph(.009, (0, -.093, .872), skin, 'head')   # nose
    def skirt(z0, z1, r0, r1, col, bone='hips'):
        # robe / skirt as cloth: 6 rings with a slight bell flare and a wavy hem; the lower rings are skinned partly to the
        # thighs (left half to the left leg...), so the hem swings with each stride instead of hanging like a rigid cone
        import bmesh
        me = bpy.data.meshes.new('skirt'); bm = bmesh.new(); N, R = 20, 6; rings = []
        for j in range(R):
            t = j / (R - 1); z = z0 + (z1 - z0) * t; r = r0 + (r1 - r0) * (t ** 1.35)
            rings.append([bm.verts.new((math.cos(i / N * 2 * math.pi) * r * (1 + (.015 * math.sin(i * 3.0) if j == R - 1 else 0)),
                                        .005 + math.sin(i / N * 2 * math.pi) * r * .82, z - (.004 * (1 + math.cos(i * 2.0)) if j == R - 1 else 0))) for i in range(N)])
        for j in range(R - 1):
            for i in range(N): bm.faces.new((rings[j][i], rings[j][(i + 1) % N], rings[j + 1][(i + 1) % N], rings[j + 1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new('skirt', me); bpy.context.collection.objects.link(o)
        sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = .004; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='s')
        bpy.ops.object.shade_smooth(); solid(o, col)
        cloth(o, z0, z1, r1, bone)
    def cloth(o, z0, z1, r1, bone='hips'):   # hips at the waist, sharing towards the thighs (by side) down to the hem
        gH, gL, gR = (o.vertex_groups.new(name=n) for n in (bone, 'thigh_L', 'thigh_R'))
        for v in o.data.vertices:
            co = o.matrix_world @ v.co
            t = max(0, min(1, (z0 - co.z) / (z0 - z1))) ** 1.3; sd = max(-1, min(1, co.x / max(r1 * .7, .01)))
            wl, wr = t * .6 * (1 + sd) / 2, t * .6 * (1 - sd) / 2
            gH.add([v.index], 1 - wl - wr, 'REPLACE'); gL.add([v.index], wl, 'REPLACE'); gR.add([v.index], wr, 'REPLACE')
        if (o, None) not in acc: acc[:] = [(a, b) for a, b in acc if a is not o] + [(o, None)]
    def baggy(col):   # salvar: ballooning trousers on the thighs and knees
        for sx in (-1, 1):
            sph(.062, (sx * .074, 0, .37), col, 'thigh_' + ('L' if sx > 0 else 'R'), (1, 1, 1.5)); sph(.056, (sx * .074, .005, .22), col, 'shin_' + ('L' if sx > 0 else 'R'), (1, 1, 1.2))
    def vcollar(col, z=.7):   # crossed / V collar: two thin strips meeting low on the chest
        for sx in (-1, 1): box((.012, .005, .12), (sx * .022, -.083, z), col, 'spine', rot=(0, sx * .42, 0))
    def beard(col='#2b2018'):
        sph(.045, (0, -.07, .838), col, 'head', (1.15, .7, 1)); box((.06, .012, .012), (0, -.093, .862), col, 'head')
    if soldier and era == '1810' and cul == 'isl':   # Nizam-i Cedid: red cap in a white turban wrap, sash, baggy blue salvar, yellow shoes
        cyl(.07, .13, (0, .006, 1.0), '#b0252a', 'head', v=14, r2=.058); cyl(.092, .045, (0, 0, .955), '#efe9dc', 'head', v=14, r2=.088)
        cyl(.006, .06, (.03, .04, 1.05), '#1d1a17', 'head', rot=(.6, .4, 0), v=5)   # tassel
        beard()
        box((.028, .01, .34), (0, -.083, .63), '#efe9dc', 'spine', rot=(0, .62, 0))   # one crossbelt
        cyl(.112, .07, (0, 0, .505), '#a8302a', 'hips', v=14, s=(1, .8, 1))                         # sash
        for sx in (-1, 1): box((.012, .008, .2), (sx * .07, -.084, .63), '#d6b04a', 'spine')   # jacket braid
        baggy(trou); box((.07, .05, .08), (.1, .08, .5), '#5a3a24', 'hips')
        box((.028, .04, .22), (-.165, -.035, .46), '#7a5a3a', 'hand_R'); cyl(.01, .42, (-.165, -.04, .77), '#8a9096', 'hand_R'); cyl(.005, .13, (-.165, -.04, 1.04), '#c9ccd1', 'hand_R')
    elif soldier and era == '1810' and cul == 'ea':   # Qing / Edo musketeer: lacquered conical hat, knee-long tunic with a chest roundel
        cyl(.155, .075, (0, 0, .975), '#2b2725', 'head', v=16, r2=.012); cyl(.011, .03, (0, 0, 1.02), '#c8102e', 'head', v=6)
        cyl(.03, .06, (0, .03, 1.0), '#c8102e', 'head', v=8, r2=.012)   # red horsehair tuft
        skirt(.52, .29, .1, .155, TEAM); cyl(.114, .045, (0, 0, .5), '#2b2725', 'hips', v=14, s=(1, .8, 1))
        cyl(.05, .006, (0, -.087, .65), '#efe9dc', 'spine', rot=(math.pi / 2, 0, 0), v=14); cyl(.03, .007, (0, -.089, .65), '#b0252a', 'spine', rot=(math.pi / 2, 0, 0), v=10)
        box((.07, .05, .08), (.1, .08, .5), '#5a3a24', 'hips')
        box((.028, .04, .22), (-.165, -.035, .46), '#5a3a24', 'hand_R'); cyl(.01, .44, (-.165, -.04, .78), '#4a4a4e', 'hand_R'); cyl(.004, .05, (-.165, -.06, .6), '#c8102e', 'hand_R')
    elif soldier and era == '1810':
        cyl(.078, .1, (0, 0, .985), '#1d2430', 'head', v=14, r2=.086)            # shako
        cyl(.096, .012, (0, -.025, .94), '#1d2430', 'head', rot=(.25, 0, 0), v=14)   # peak
        box((.035, .01, .035), (0, -.086, .995), '#d6b04a', 'head')             # plate
        sph(.02, (0, -.05, 1.055), '#c8102e', 'head', (1, 1, 1.6))               # plume
        for sx in (-1, 1): box((.035, .1, .015), (sx * .115, -.01, .775), '#d6b04a', 'spine', rot=(0, 0, sx * .2))   # epaulettes
        box((.028, .01, .34), (0, -.083, .63), '#efe9dc', 'spine', rot=(0, .62, 0)); box((.028, .01, .34), (0, -.083, .63), '#efe9dc', 'spine', rot=(0, -.62, 0))   # crossbelts
        box((.17, .07, .16), (0, .095, .67), '#6b5a40', 'spine'); cyl(.035, .18, (0, .095, .77), '#8a7a5a', 'spine', rot=(0, math.pi / 2, 0))   # knapsack + blanket
        box((.07, .04, .05), (.1, .07, .51), '#2b2018', 'hips')                # cartridge box
        # musket: butt at the right hand, pointing up (the 'hand' bone flips it forward to aim)
        box((.028, .04, .22), (-.165, -.035, .46), '#7a5a3a', 'hand_R'); cyl(.01, .42, (-.165, -.04, .77), '#8a9096', 'hand_R'); cyl(.005, .13, (-.165, -.04, 1.04), '#c9ccd1', 'hand_R')
    elif soldier:
        sph(.108, (0, 0, .91), '#5a6340', 'head', (1, 1.05, .78)); cyl(.11, .022, (0, 0, .905), TEAM, 'head', v=16)   # helmet + team band
        box((.24, .16, .2), (0, 0, .65), '#4e5638', 'spine')                      # plate carrier
        for sx in (-1, 1): box((.045, .03, .06), (sx * .055, -.088, .6), '#3f4630', 'spine')
        box((.05, .012, .035), (.135, -.045, .71), TEAM, 'spine')                  # shoulder flag patch
        box((.18, .08, .2), (0, .115, .67), '#4a5238', 'spine'); cyl(.03, .17, (0, .115, .79), '#5a6340', 'spine', rot=(0, math.pi / 2, 0))
        box((.034, .055, .26), (-.165, -.045, .56), '#26292c', 'hand_R'); box((.03, .035, .08), (-.165, -.05, .43), '#26292c', 'hand_R'); cyl(.009, .14, (-.165, -.05, .76), '#1d1f21', 'hand_R')
    elif era == '1810' and cul == 'isl' and not fem:   # turban, embroidered vest, sash, salvar, beard
        sph(.1, (0, .008, .935), '#efe9dc', 'head', (1.12, 1.12, .5), 16); sph(.09, (0, .008, .97), '#e4dccb', 'head', (1.1, 1.1, .45), 16); cyl(.05, .05, (0, .008, .99), '#b0252a', 'head', v=12, r2=.04)
        beard()
        for sx in (-1, 1): box((.07, .006, .19), (sx * .042, -.079, .645), '#3a2a24', 'spine', rot=(0, 0, sx * -.05))   # vest panels
        for sx in (-1, 1): box((.006, .004, .19), (sx * .008, -.083, .645), '#d6b04a', 'spine')
        cyl(.114, .08, (0, 0, .5), '#c8a040', 'hips', v=14, s=(1, .8, 1)); baggy(PANTS)
    elif era == '1810' and cul == 'isl':   # ferace robe to the ankles + headscarf with a drape
        skirt(.53, .03, .1, .2, TEAM); cyl(.113, .05, (0, 0, .52), '#d6b04a', 'hips', v=14, s=(1, .8, 1))
        sph(.102, (0, .026, .9), PANTS, 'head', (1.04, 1, 1.12), 12); cyl(.125, .09, (0, .025, .775), PANTS, 'neck', v=16, r2=.07, s=(1, .85, 1))
    elif era == '1810' and cul == 'ea' and not fem:   # straw kasa hat, short robe with a sash
        cyl(.18, .085, (0, 0, .985), '#d8c08a', 'head', v=16, r2=.008); cyl(.06, .03, (0, 0, .955), '#b89a60', 'head', v=12)
        skirt(.52, .3, .1, .15, TEAM); cyl(.112, .045, (0, 0, .5), '#3a3430', 'hips', v=14, s=(1, .8, 1))
        vcollar('#3a3430')
    elif era == '1810' and cul == 'ea':   # kimono with a wide obi and its bow, hair in a bun with pins
        skirt(.53, .03, .1, .175, TEAM); cyl(.108, .1, (0, 0, .555), PANTS, 'spine', v=16, s=(1, .78, 1)); box((.13, .05, .085), (0, .095, .56), PANTS, 'spine'); sph(.022, (0, .12, .56), PANTS, 'spine', (1.6, .8, 1))
        vcollar('#efe9dc', .69)
        sph(.1, (0, .016, .905), '#1d1a17', 'head', (1.04, 1.04, .86), 12); sph(.05, (0, .04, .985), '#1d1a17', 'head', (1.3, 1, .8))
        for sx in (-1, 1): cyl(.004, .14, (sx * .03, .04, .99), '#d6b04a', 'head', rot=(0, sx * 1.2, 0), v=5)
    elif era == '1810' and cul == 'af' and not fem:   # boubou robe and an embroidered kufi
        skirt(.62, .1, .1, .21, TEAM); vcollar('#d6b04a', .71); cyl(.085, .055, (0, .005, .955), '#efe9dc', 'head', v=14, r2=.088)
        cyl(.03, .005, (0, -.084, .6), '#d6b04a', 'spine', rot=(math.pi / 2, 0, 0), v=12)
    elif era == '1810' and cul == 'af':   # tall gele headwrap, wrap skirt, beads
        sph(.105, (0, .02, .975), PANTS, 'head', (1.15, 1.05, .9), 12); sph(.06, (.04, .03, 1.045), PANTS, 'head', (1.4, 1, .8))
        skirt(.5, .04, .1, .17, PANTS); cyl(.112, .04, (0, 0, .5), '#d6b04a', 'hips', v=14, s=(1, .8, 1)); cyl(.06, .02, (0, -.01, .775), '#d6b04a', 'neck', v=12, r2=.072)
    elif era == '1810' and fem:   # long skirt, white apron, bonnet over a bun
        skirt(.51, .03, .1, .19, PANTS); cyl(.112, .035, (0, 0, .51), '#3a3430', 'hips', v=14, s=(1, .8, 1)); cloth(box((.12, .006, .3), (0, -.106, .33), '#efe9dc', 'hips', rot=(-.16, 0, 0)), .5, .03, .19)
        sph(.102, (0, .032, .91), '#efe9dc', 'head', (1.06, 1.06, 1), 12); cyl(.05, .015, (0, .07, .92), '#efe9dc', 'head', rot=(math.pi / 2 - .3, 0, 0), v=12)   # bonnet crown
        sph(.06, (0, -.045, .755), '#efe9dc', 'spine', (1.7, .9, .45), 12)   # fichu
    elif era == '1810':   # brimmed hat with a band, dark waistcoat, white neckcloth
        cyl(.14, .012, (0, 0, .95), '#4a3a2a', 'head', v=16); cyl(.08, .08, (0, 0, .995), '#4a3a2a', 'head', v=14, r2=.074); cyl(.081, .015, (0, 0, .965), '#1d1a17', 'head', v=14)
        for sx in (-1, 1): box((.055, .006, .16), (sx * .034, -.08, .63), '#c9b48a', 'spine', rot=(0, 0, sx * -.05))   # buff waistcoat
        sph(.02, (0, -.068, .765), '#efe9dc', 'spine', (1.4, .8, 1.2), 8)
    elif fem:   # 2014: long hair and a knee-length skirt
        sph(.102, (0, .015, .91), '#3a2a20', 'head', (1.04, 1.04, 1), 12); box((.17, .04, .17), (0, .065, .8), '#3a2a20', 'neck')
        skirt(.5, .27, .1, .16, PANTS)
    else:
        sph(.1, (0, .01, .915), '#3a2a20', 'head', (1, 1.02, .8))               # hair
    if worker:   # felling axe held in the right fist: the haft hangs along the leg while walking and becomes the swing's lever
        hx, hy = -A2 - .004, -.018
        cyl(.0085, .36, (hx, hy, .3), '#8a6a44', 'hand_R', v=8)                       # ash haft, from the fist down
        cyl(.011, .02, (hx, hy, .125), '#6b5236', 'hand_R', v=8)                      # swelled knob at the end
        box((.022, .075, .04), (hx, hy - .028, .135), '#7c8288', 'hand_R')            # iron head, blade forward
        box((.024, .012, .052), (hx, hy - .068, .135), '#c9ced3', 'hand_R')           # bright cutting edge
        box((.06, .014, .05), (0, .09, .52), '#5a4330', 'hips')                        # leather pouch at the back
    # ---- armature
    bpy.ops.object.armature_add(location=(0, 0, 0)); arm = bpy.context.active_object; arm.name = variant + '_rig'
    bpy.ops.object.mode_set(mode='EDIT'); eb = arm.data.edit_bones; eb.remove(eb[0])
    def bone(n, h, t, p=None):
        b = eb.new(n); b.head = h; b.tail = t
        if p: b.parent = eb[p]
    bone('hips', (0, 0, .47), (0, 0, .6)); bone('spine', (0, 0, .6), (0, 0, .76), 'hips')
    bone('neck', (0, 0, .76), (0, 0, .82), 'spine'); bone('head', (0, 0, .82), (0, 0, .98), 'neck')
    for s, sx in (('L', 1), ('R', -1)):
        bone('upper_' + s, (sx * A0, 0, .75), (sx * A1, 0, .6), 'spine'); bone('fore_' + s, (sx * A1, 0, .6), (sx * A2, -.01, .47), 'upper_' + s)
        bone('hand_' + s, (sx * A2, -.01, .47), (sx * A2, -.012, .41), 'fore_' + s)
        bone('thigh_' + s, (sx * .07, 0, .47), (sx * .072, 0, .26), 'hips'); bone('shin_' + s, (sx * .072, 0, .26), (sx * .072, .005, .07), 'thigh_' + s)
        bone('foot_' + s, (sx * .072, .005, .07), (sx * .072, -.07, .02), 'shin_' + s)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    # accessories follow one bone each: give them that vertex group at weight 1, then join them into the body
    for o, bn in acc:
        if bn is None: continue   # already weighted (skirts)
        vg = o.vertex_groups.new(name=bn); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    bpy.ops.object.select_all(action='DESELECT')
    for o, _ in acc: o.select_set(True)
    body.select_set(True); bpy.context.view_layer.objects.active = body; bpy.ops.object.join()
    # one material that reads the vertex colours
    m = bpy.data.materials.new('body'); m.use_nodes = True; nt = m.node_tree
    ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'; bs = nt.nodes['Principled BSDF']
    nt.links.new(ca.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = .75
    body.data.materials.clear(); body.data.materials.append(m)

    # ---- animations (rotation about the bone's X: + swings the limb backwards)
    P = lambda n: arm.pose.bones[n]
    def reset():
        for pb in arm.pose.bones: pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    def action(name, frames, pose):
        arm.animation_data_create(); act = bpy.data.actions.new(name); arm.animation_data.action = act
        for f in range(frames + 1):
            reset(); pose(f / frames)
            for pb in arm.pose.bones: pb.keyframe_insert('rotation_euler', frame=f + 1); pb.keyframe_insert('location', frame=f + 1)
        tr = arm.animation_data.nla_tracks.new(); tr.name = name; tr.strips.new(name, 1, act); arm.animation_data.action = None
    def legs(a, amp, knee, base=.05):
        for s, ph in (('L', 0), ('R', math.pi)):
            P('thigh_' + s).rotation_euler = (-amp * math.sin(a + ph), 0, 0)
            P('shin_' + s).rotation_euler = (knee * max(0, math.cos(a + ph)) + base, 0, 0)
            P('foot_' + s).rotation_euler = (-.2 * max(0, math.cos(a + ph)), 0, 0)
    two = 2 * math.pi
    def walk(t, amp=.42, arms=.35):
        a = t * two; legs(a, amp, .8)
        P('hips').location = (0, abs(math.cos(a)) * .01, 0); P('spine').rotation_euler = (-.03, .07 * math.sin(a), 0)
        out = .2 if fw else .06   # skirts: arms swing less and a little wider, clear of the cloth
        P('upper_L').rotation_euler = (arms * math.sin(a), 0, -out); P('upper_R').rotation_euler = (-arms * math.sin(a), 0, out)
        P('fore_L').rotation_euler = (-.25, 0, 0); P('fore_R').rotation_euler = (-.25, 0, 0)
    def idle(t):
        b = math.sin(t * two)
        P('spine').rotation_euler = (b * .02, 0, 0); P('neck').rotation_euler = (0, 0, math.sin(t * two + 1) * .25)
        P('upper_L').rotation_euler = (0, 0, -.08); P('upper_R').rotation_euler = (0, 0, .08); P('fore_L').rotation_euler = (-.12, 0, 0); P('fore_R').rotation_euler = (-.12, 0, 0)
    if soldier:
        def march(t):
            a = t * two; legs(a, .45, .85)
            P('hips').location = (0, abs(math.cos(a)) * .012, 0); P('spine').rotation_euler = (-.04, .06 * math.sin(a), 0)
            P('upper_L').rotation_euler = (.34 * math.sin(a), 0, -.06); P('fore_L').rotation_euler = (-.3, 0, 0)
            P('upper_R').rotation_euler = (.05, 0, .1); P('fore_R').rotation_euler = (-.1, 0, 0)   # musket carried upright at the side
        def run(t):   # bayonet charge: musket levelled forward at the hip
            a = t * two; legs(a, .75, 1.3, .1)
            P('hips').location = (0, abs(math.cos(a)) * .025, 0); P('spine').rotation_euler = (-.28, .05 * math.sin(a), 0)
            P('upper_R').rotation_euler = (-.35, 0, .15); P('fore_R').rotation_euler = (-1.25, 0, 0); P('hand_R').rotation_euler = (math.pi, 0, 0)
            P('upper_L').rotation_euler = (-.95, 0, -.3); P('fore_L').rotation_euler = (-.6, 0, 0)
            P('neck').rotation_euler = (.2, 0, 0)
        def aimpose(rec):
            P('upper_R').rotation_euler = (-1.25, 0, -.25); P('fore_R').rotation_euler = (-.55, 0, 0); P('hand_R').rotation_euler = (math.pi, 0, 0)
            P('upper_L').rotation_euler = (-1.45, 0, -.45); P('fore_L').rotation_euler = (-.25, 0, 0)
            P('neck').rotation_euler = (.15, 0, -.15); P('spine').rotation_euler = (rec * .12, 0, 0)
        def aim(t):
            rec = max(0, 1 - abs(t - .15) * 10)   # recoil kick early in the loop
            P('thigh_L').rotation_euler = (-.15, 0, -.05); P('thigh_R').rotation_euler = (.12, 0, .05); P('shin_R').rotation_euler = (.1, 0, 0); aimpose(rec)
        def kneel(t):
            rec = max(0, 1 - abs(t - .15) * 10)
            P('hips').location = (0, -.19, 0)
            P('thigh_L').rotation_euler = (-1.45, 0, 0); P('shin_L').rotation_euler = (1.45, 0, 0)
            P('thigh_R').rotation_euler = (.25, 0, 0); P('shin_R').rotation_euler = (1.55, 0, 0); P('foot_R').rotation_euler = (-.6, 0, 0)
            aimpose(rec)
        action('march', 24, march); action('run', 14, run); action('aim', 48, aim); action('kneel', 48, kneel); action('idle', 48, idle)
    elif worker:
        def chop(t):   # two-handed overhead stroke: slow wind-up, fast strike into the trunk, short recovery
            sm = lambda k: k * k * (3 - 2 * k)
            if t < .5: e = sm(t / .5); a = -.75 + (-2.75 + .75) * e; w = .55 * e; sp = .1 * e
            elif t < .62: e = ((t - .5) / .12) ** 2; a = -2.75 + (2.75 - .55) * e; w = .55 - .8 * e; sp = .1 - .42 * e
            else: e = sm((t - .62) / .38); a = -.55 - .2 * e; w = -.25 + .25 * e; sp = -.32 + .32 * e
            P('thigh_L').rotation_euler = (-.32, 0, .04); P('shin_L').rotation_euler = (.3, 0, 0)
            P('thigh_R').rotation_euler = (.22, 0, -.04); P('shin_R').rotation_euler = (.18, 0, 0); P('foot_R').rotation_euler = (-.1, 0, 0)
            P('hips').location = (0, -.012 - .01 * max(0, -sp), 0); P('spine').rotation_euler = (sp, -.12, 0); P('neck').rotation_euler = (-sp * .6, .1, 0)
            P('upper_R').rotation_euler = (a, 0, -.12); P('fore_R').rotation_euler = (-.35 - .2 * (1 - abs(w)), 0, 0); P('hand_R').rotation_euler = (w, 0, 0)
            P('upper_L').rotation_euler = (a + .15, 0, .38); P('fore_L').rotation_euler = (-.75, 0, 0)   # left hand closes on the haft below the right
        action('walk', 24, lambda t: walk(t, .4, .18)); action('idle', 48, idle); action('chop', 30, chop)
    else:
        action('walk', 24, (lambda t: walk(t, .36, .2)) if fw else walk); action('idle', 48, idle)
    # ---- export
    bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); body.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, variant + '.glb'), export_format='GLB', use_selection=True, export_animations=True, export_nla_strips=True, export_skins=True)
    print('HUMAN', variant, 'tris', sum(len(p.vertices) - 2 for p in body.data.polygons), 'bones', len(arm.data.bones))
    return arm

ONLY = sys.argv[sys.argv.index('--') + 2:] if len(sys.argv) > sys.argv.index('--') + 2 else None
VARIANTS = ['soldier_1810', 'soldier_1810_isl', 'soldier_1810_ea', 'soldier_2014', 'civ_1810', 'civ_1810_f', 'civ_1810_isl', 'civ_1810_isl_f',
            'civ_1810_ea', 'civ_1810_ea_f', 'civ_1810_af', 'civ_1810_af_f', 'civ_2014', 'civ_2014_f',
            'worker_1810', 'worker_1810_isl', 'worker_1810_ea', 'worker_1810_af', 'worker_2014']
for v in VARIANTS:
    if not ONLY or v in ONLY: build(v)

print('DONE')
