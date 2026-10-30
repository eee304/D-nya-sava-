// Low-poly unit geometries with baked vertex colours (one InstancedMesh per kind and team).
// Units face +z; feet at y=0; a soldier is ~0.75 units tall (region scale).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  // painted-miniature: tiny shade differences across the surface
  for (let i = 0; i < n; i++) { const v = .9 + Math.random() * .16; a[i * 3] = c.r * v; a[i * 3 + 1] = c.g * v; a[i * 3 + 2] = c.b * v; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const P = (g, c, x, y, z, rx = 0, rz = 0) => colored(g.rotateX(rx).rotateZ(rz).translate(x, y, z), c);
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

export const UNIT_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 });

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
// a soldier is two instanced parts: the body (everything above the hips) and one leg (drawn twice, swinging)
// era 1810: line infantry with shako + musket; 2014: helmet, vest and rifle. Team colour on coat / helmet band.
export function soldierParts(era, team) {
  return memo('sp' + era + team, () => {
    const modern = era === '2014', coat = modern ? mixHex('#5d6b45', team, .25) : team, skin = '#e0b48c';
    const body = [
      P(cyl(.1, .125, .3, 10), coat, 0, .41, 0),                                      // rounded torso
      P(sph(.065, 8, 6).scale(1, .8, 1), coat, -.13, .53, 0), P(sph(.065, 8, 6).scale(1, .8, 1), coat, .13, .53, 0),   // shoulders
      P(cyl(.04, .035, .26, 6), coat, -.15, .43, .05, -.35), P(cyl(.04, .035, .26, 6), coat, .15, .43, .07, -.55),    // arms forward
      P(sph(.032, 6, 5), skin, -.15, .32, .12), P(sph(.032, 6, 5), skin, .15, .33, .15),                             // hands
      P(cyl(.035, .04, .05, 8), skin, 0, .57, 0),                                      // neck
      P(sph(.075, 12, 10), skin, 0, .65, 0),                                           // head
      P(sph(.012, 4, 3), '#1d2430', -.028, .66, .068), P(sph(.012, 4, 3), '#1d2430', .028, .66, .068),               // eyes
    ];
    if (modern) {
      body.push(P(new THREE.SphereGeometry(.088, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), coat, 0, .675, 0), P(cyl(.092, .092, .025, 12), team, 0, .69, 0),   // helmet + band
        P(cyl(.118, .132, .2, 10), '#4a5238', 0, .43, 0),                               // plate carrier
        P(cyl(.016, .016, .55, 6), '#26292c', .1, .43, .2, Math.PI / 2 - .25), P(new THREE.BoxGeometry(.05, .09, .14), '#26292c', .1, .4, .02),   // rifle
        P(new THREE.BoxGeometry(.18, .2, .09), '#4a5238', 0, .43, -.14),                // pack
        P(new THREE.BoxGeometry(.2, .06, .1), '#3f4630', 0, .55, -.15), P(cyl(.035, .035, .2, 6), '#5a6340', 0, .59, -.15, 0, Math.PI / 2),   // bedroll
        P(new THREE.BoxGeometry(.05, .07, .04), '#3f4630', -.06, .38, .12), P(new THREE.BoxGeometry(.05, .07, .04), '#3f4630', .02, .38, .12),   // mag pouches
        P(new THREE.BoxGeometry(.035, .1, .04), '#1d1f21', .1, .37, .17), P(cyl(.008, .008, .12, 4), '#1d1f21', .1, .47, .44, Math.PI / 2 - .25),   // magazine + muzzle
        P(cyl(.012, .012, .12, 4), '#2b2d2a', -.06, .76, -.03, .3), P(new THREE.BoxGeometry(.06, .04, .03), '#2b2d2a', 0, .66, .085));   // goggles strap + nvg mount
    } else {
      body.push(P(cyl(.07, .078, .16, 12), '#1d2430', 0, .76, 0), P(cyl(.1, .1, .015, 12), '#1d2430', 0, .69, .01),   // shako + brim
        P(sph(.03, 6, 5), '#c8102e', 0, .86, .03),                                       // pompon
        P(cyl(.13, .13, .03, 10), '#efe9dc', 0, .3, 0),                                  // white belt
        P(new THREE.BoxGeometry(.03, .26, .015), '#efe9dc', 0, .42, .11, 0, .6),         // cross belt
        P(cyl(.014, .016, .72, 6), '#5b4630', .15, .48, .1, -.2), P(cyl(.006, .006, .2, 4), '#cfd5db', .15, .86, .17, -.2),   // musket + bayonet
        P(new THREE.BoxGeometry(.17, .18, .07), '#6b5a40', 0, .44, -.12),                // knapsack
        P(cyl(.04, .04, .18, 8), '#8a7a5a', 0, .56, -.13, 0, Math.PI / 2),              // rolled blanket
        P(new THREE.BoxGeometry(.07, .03, .06), '#e0ae45', -.13, .56, 0), P(new THREE.BoxGeometry(.07, .03, .06), '#e0ae45', .13, .56, 0),   // epaulettes
        P(cyl(.044, .044, .04, 6), '#efe9dc', -.15, .33, .1), P(cyl(.044, .044, .04, 6), '#efe9dc', .15, .34, .13),   // white cuffs
        P(new THREE.BoxGeometry(.2, .14, .03), team, 0, .23, -.1, .25),                  // coat tails
        P(new THREE.BoxGeometry(.04, .05, .015), '#e0ae45', 0, .76, .075),               // shako plate
        P(cyl(.012, .006, .1, 5), '#f4f1ea', .02, .88, .04),                            // plume
        P(new THREE.BoxGeometry(.06, .07, .05), '#3a2a1c', .1, .3, -.06));                // cartridge box
    }
    // leg: pivot at the hip (y = 0), hanging down to y = -0.26
    const trouser = modern ? '#3b4230' : '#e6e0d0', boot = modern ? '#26221d' : '#1d1a17';
    const leg = mergeGeometries([P(cyl(.042, .036, .21, 7), trouser, 0, -.105, 0), P(new THREE.BoxGeometry(.06, .06, .11).translate(0, 0, .02), boot, 0, -.235, 0),
      modern ? P(new THREE.BoxGeometry(.05, .05, .03), '#2b2d2a', 0, -.11, .035) : P(cyl(.04, .04, .09, 7), '#1d1a17', 0, -.18, 0)]);   // knee pad / black gaiter
    return { body: mergeGeometries(body), leg };
  });
}
export function soldierGeo(era, team) { return soldierParts(era, team).body; }   // kept for older callers

// cavalry (1810): horse + rider as the body, four horse legs that gallop in diagonal pairs
export function cavalryParts(team) {
  return memo('cav' + team, () => {
    const horse = '#6b4a32', mane = '#2e2118', skin = '#e0b48c';
    const body = mergeGeometries([
      P(sph(.2, 12, 10).scale(1, .9, 2.0), horse, 0, .55, 0),                       // barrel
      P(cyl(.08, .11, .38, 8), horse, 0, .72, .36, -.65), P(sph(.09, 8, 6).scale(1, .9, 1.7), horse, 0, .86, .55),   // neck + head
      P(new THREE.BoxGeometry(.03, .16, .2), mane, 0, .8, .32, -.65), P(cyl(.03, .01, .32, 5), mane, 0, .55, -.42, .7),   // mane + tail
      P(new THREE.BoxGeometry(.24, .05, .3), '#3a2a1c', 0, .74, 0),                  // saddle
      P(cyl(.085, .1, .26, 8), team, 0, .9, -.02), P(sph(.06, 8, 6), skin, 0, 1.09, 0), // rider
      P(cyl(.06, .07, .13, 10), '#1d2430', 0, 1.19, 0), P(sph(.025, 6, 5), '#c8102e', 0, 1.28, .02),
      P(cyl(.008, .012, .5, 5), '#cfd5db', .12, 1.05, .16, -.9),                      // raised sabre
      P(cyl(.03, .03, .22, 6), '#e6e0d0', -.09, .68, .05, .2), P(cyl(.03, .03, .22, 6), '#e6e0d0', .09, .68, .05, .2),   // rider legs
    ]);
    const leg = mergeGeometries([P(cyl(.03, .024, .36, 6), horse, 0, -.18, 0), P(cyl(.032, .032, .05, 6), '#1d1a17', 0, -.37, 0)]);
    return { body, leg, hip: .42, legs: [[-.08, .25, 1], [.08, .25, -1], [-.08, -.25, -1], [.08, -.25, 1]] };
  });
}

// rider alone (sits on the rigged Blender horse): saddle, body, head, shako with plume, raised sabre, legs astride
// hat and breeches follow the army's culture: shako (Europe), red cap in a turban + salvar (Ottoman / Islamic, Africa), lacquered cone hat (East Asia)
export function riderParts(team, culture = 'european') {
  const cul = culture === 'african' ? 'islamic' : culture;
  return memo('rider' + team + cul, () => {
    const skin = '#e0b48c', y = -.33, legs = cul === 'islamic' ? '#2c3a66' : cul === 'eastasia' ? '#2b2a30' : '#e6e0d0';
    const hat = cul === 'islamic' ? [P(cyl(.05, .042, .11, 10), '#b0252a', 0, 1.2 + y, 0), P(cyl(.068, .066, .04, 10), '#efe9dc', 0, 1.15 + y, 0)]
      : cul === 'eastasia' ? [P(new THREE.ConeGeometry(.115, .06, 12), '#2b2725', 0, 1.18 + y, 0), P(sph(.016, 6, 5), '#c8102e', 0, 1.22 + y, 0)]
      : [P(cyl(.055, .065, .13, 10), '#1d2430', 0, 1.2 + y, 0), P(sph(.024, 6, 5), '#c8102e', 0, 1.29 + y, .02), P(new THREE.BoxGeometry(.04, .04, .015), '#d6b04a', 0, 1.2 + y, .06)];
    return mergeGeometries([
      P(new THREE.BoxGeometry(.2, .05, .26), '#3a2a1c', 0, .76 + y, 0),
      P(cyl(.08, .095, .26, 10), team, 0, .92 + y, -.02), P(new THREE.BoxGeometry(.17, .03, .03), '#f1ece0', 0, .96 + y, .07, 0, 0, .6),
      P(sph(.058, 10, 8), skin, 0, 1.1 + y, 0),
      ...hat,
      P(cyl(.008, .012, .5, 5), '#cfd5db', .12, 1.07 + y, .16, -.9), P(sph(.025, 6, 5), skin, .11, .9 + y, .07),
      P(cyl(.032, .03, .24, 6), legs, -.11, .7 + y, .05, .35, 0, .25), P(cyl(.032, .03, .24, 6), legs, .11, .7 + y, .05, .35, 0, -.25),
      P(new THREE.BoxGeometry(.05, .1, .1), '#1d1a17', -.15, .58 + y, .1), P(new THREE.BoxGeometry(.05, .1, .1), '#1d1a17', .15, .58 + y, .1),   // boots in the stirrups
    ]);
  });
}

// main battle tank (2014): sloped hull, tracks with road wheels, round turret with team band and muzzle brake
export function tankGeo(team) {
  return memo('t2' + team, () => {
    const body = mixHex('#5f6a4a', team, .18), dark = '#2b2d2a';
    const prof = new THREE.Shape([[-.55, .1], [.5, .1], [.6, .22], [.42, .34], [-.5, .34], [-.58, .24]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hull = new THREE.ExtrudeGeometry(prof, { depth: .56, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 1 });
    hull.translate(0, 0, -.28); hull.rotateY(-Math.PI / 2);   // length along z, nose at +z
    const parts = [colored(hull.toNonIndexed(), body)];
    const nonIdx = (g, c, x, y, z, rx = 0, rz = 0) => P(g, c, x, y, z, rx, rz).toNonIndexed();
    for (const sx of [-.33, .33]) {
      parts.push(nonIdx(new THREE.BoxGeometry(.16, .16, 1.0), dark, sx, .14, 0));
      for (const z of [-.42, .42]) parts.push(nonIdx(cyl(.08, .08, .16, 10), dark, sx, .14, z, 0, Math.PI / 2));
      for (let k = -2; k <= 2; k++) parts.push(nonIdx(cyl(.065, .065, .17, 8), '#4a4c46', sx, .1, k * .17, 0, Math.PI / 2));
    }
    parts.push(nonIdx(cyl(.2, .25, .17, 14), body, 0, .43, -.05), nonIdx(cyl(.21, .21, .04, 14), team, 0, .5, -.05),
      nonIdx(cyl(.028, .034, .75, 8), '#3a3f33', 0, .45, .38, Math.PI / 2), nonIdx(cyl(.045, .045, .08, 8), '#2b2d2a', 0, .45, .76, Math.PI / 2),
      nonIdx(sph(.05, 8, 6), '#3a3f33', -.08, .54, -.12),   // hatch
      nonIdx(cyl(.06, .06, .03, 10), '#3a3f33', .08, .53, -.15), nonIdx(cyl(.012, .012, .2, 4), '#26292c', .08, .6, -.05, Math.PI / 2),   // commander hatch + MG
      nonIdx(cyl(.006, .006, .5, 3), '#26292c', -.15, .74, -.25),   // antenna
      nonIdx(new THREE.BoxGeometry(.06, .08, .1), '#3a3f33', -.22, .47, .05), nonIdx(new THREE.BoxGeometry(.06, .08, .1), '#3a3f33', .22, .47, .05),   // smoke dischargers
      nonIdx(new THREE.BoxGeometry(.04, .14, 1.05), body, -.42, .2, 0), nonIdx(new THREE.BoxGeometry(.04, .14, 1.05), body, .42, .2, 0),   // side skirts
      nonIdx(new THREE.BoxGeometry(.4, .08, .14), '#4a4c46', 0, .37, -.52), nonIdx(cyl(.03, .03, .1, 6), '#2b2d2a', .18, .34, -.58, Math.PI / 2),   // engine deck + exhaust
      nonIdx(new THREE.BoxGeometry(.18, .04, .12), '#6b5a40', -.15, .38, -.35), nonIdx(new THREE.BoxGeometry(.22, .1, .1), '#5a5a4e', .14, .52, -.3));   // crates + turret bin
    return mergeGeometries(parts);
  });
}
// field gun (1810): wheels, carriage, bronze barrel
export function cannonGeo() {
  return memo('c2', () => {
    const parts = [];
    for (const sx of [-.22, .22]) {   // spoked wheels: rim, hub, spokes
      parts.push(P(new THREE.TorusGeometry(.2, .025, 6, 16).rotateY(Math.PI / 2), '#5a4330', sx, .22, 0), P(cyl(.05, .05, .08, 8), '#3a3a36', sx, .22, 0, 0, Math.PI / 2));
      for (let k = 0; k < 6; k++) parts.push(P(new THREE.BoxGeometry(.015, .36, .02), '#6b5236', sx, .22, 0, k * Math.PI / 6));
    }
    parts.push(P(cyl(.025, .025, .5, 6), '#3a3a36', 0, .22, 0, 0, Math.PI / 2),   // axle
      P(new THREE.BoxGeometry(.14, .08, .8), '#6b5236', 0, .17, -.4, .25), P(new THREE.BoxGeometry(.2, .05, .1), '#3a3a36', 0, .06, -.78),   // trail
      P(new THREE.BoxGeometry(.26, .1, .32), '#6b5236', 0, .33, -.02),                                   // cheeks
      P(cyl(.055, .09, .95, 12), '#9a7a3e', 0, .42, .2, Math.PI / 2 - .12),                             // bronze barrel
      P(cyl(.1, .1, .05, 12), '#7a5f2e', 0, .42, -.18, Math.PI / 2 - .12), P(cyl(.075, .075, .04, 12), '#7a5f2e', 0, .44, .62, Math.PI / 2 - .12),   // bands
      P(new THREE.SphereGeometry(.05, 8, 6), '#7a5f2e', 0, .4, -.28));                                   // cascabel
    return mergeGeometries(parts);
  });
}
// warship for the world map: galleon (1810) or destroyer (2014); ~6 units long, faces +z
function hullGeo(L, Wd, D, sheer) {
  // top-view outline with a pointed bow, extruded downwards and bevelled so it reads as a hull, not a box
  const sh = new THREE.Shape(); sh.moveTo(-Wd / 2, -L / 2); sh.lineTo(Wd / 2, -L / 2);
  sh.quadraticCurveTo(Wd * .6, L * .15, 0, L / 2); sh.quadraticCurveTo(-Wd * .6, L * .15, -Wd / 2, -L / 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 2, curveSegments: 10 });
  g.rotateX(Math.PI / 2); g.translate(0, D, 0);   // deck on top
  if (sheer) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > D * .5) p.setY(i, p.getY(i) + Math.pow(Math.abs(p.getZ(i)) / (L / 2), 2) * sheer); g.computeVertexNormals(); }
  return g.toNonIndexed();
}
export function shipGeo(era, team = '#c8c2b0') {
  return memo('ship2' + era + team, () => {
    const ni = (g, c, x, y, z, rx = 0, rz = 0) => P(g, c, x, y, z, rx, rz).toNonIndexed();
    if (era === '2014') return mergeGeometries([
      colored(hullGeo(5.6, 1.5, .8, .25), '#5b6470'), ni(new THREE.BoxGeometry(1.52, .1, 5.0), team, 0, .12, -.2),
      ni(new THREE.BoxGeometry(1.0, .7, 1.6), '#d8dde2', 0, 1.15, -.7), ni(new THREE.BoxGeometry(.7, .5, .8), '#d8dde2', 0, 1.7, -.8),
      ni(cyl(.05, .05, 1.3, 6), '#3a3f46', 0, 2.5, -.8), ni(cyl(.32, .35, .5, 10), '#5b6470', 0, 1.05, .9), ni(cyl(.05, .05, .9, 6), '#3a3f46', 0, 1.15, 1.4, Math.PI / 2),
      ni(cyl(.25, .3, .55, 10), '#4a525c', 0, 1.1, -2.0),
    ]);
    return mergeGeometries([
      colored(hullGeo(5.0, 1.6, .9, .55), '#5e4129'), ni(new THREE.BoxGeometry(1.4, .5, 1.1), '#5e4129', 0, 1.15, -1.9), ni(new THREE.BoxGeometry(1.62, .1, 4.0), '#d4b46a', 0, .6, 0),
      ni(cyl(.06, .08, 4.2, 6), '#4a3426', 0, 2.8, -.4), ni(cyl(.05, .07, 3.4, 6), '#4a3426', 0, 2.4, 1.4),
      ni(new THREE.BoxGeometry(1.9, 1.3, .06), '#f1ece0', 0, 2.5, -.35), ni(new THREE.BoxGeometry(1.6, 1.0, .06), '#f1ece0', 0, 3.7, -.35), ni(new THREE.BoxGeometry(1.5, 1.1, .06), '#f1ece0', 0, 2.4, 1.45),
      ni(new THREE.BoxGeometry(.6, .35, .04), team, 0, 4.75, -.4),
    ]);
  });
}
