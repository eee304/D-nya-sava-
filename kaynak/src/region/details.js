// Small things that make a region feel hand-made: grass tufts and wild flowers, crop rows in the fields,
// reeds along the water, and town life (market stalls, well, barrels, street lamps, carts, fences).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, box, cyl } from './builders.js';
import { SIZE, AREA } from './terrain.js';
import { along, polyLen } from './noise.js';
import { PREFABS } from './prefabs.js';

// vertex colours: dark at the root, light at the tip (painted volume without textures)
function gradient(g, lo = .55, hi = 1.15) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3);
  let y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  for (let i = 0; i < n; i++) { const v = lo + (hi - lo) * (p.getY(i) - y0) / (y1 - y0 || 1); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// a few thin leaning blades fanned around the centre
function bladeTuft(n, h, w) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BufferGeometry(), a = i / n * Math.PI * 2 + i, lean = .25 + (i % 3) * .12, hh = h * (.7 + (i % 4) * .12);
    const tx = Math.cos(a) * lean * hh, tz = Math.sin(a) * lean * hh, ox = -Math.sin(a) * w, oz = Math.cos(a) * w;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-ox, 0, -oz, ox, 0, oz, tx, hh, tz], 3));
    g.computeVertexNormals(); parts.push(g);
  }
  return gradient(mergeGeometries(parts), .7, 1.25);
}
// shader patch: grass and crops sway in the wind
const wind = { value: 0 };
export function windy(mat, amp) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;
        transformed.x += sin(uWind * 1.7 + ph) * position.y * ${amp.toFixed(3)};
        transformed.z += cos(uWind * 1.3 + ph) * position.y * ${(amp * .6).toFixed(3)};
      #endif`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
  return mat;
}
export function windTick(t) { wind.value = t; }

function scatter(scene, geo, mat, list, color, jitter = .18) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.r, 0); o.scale.setScalar(p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    c.set(p.color || color); c.offsetHSL((Math.random() - .5) * .03, 0, (Math.random() - .5) * jitter); m.setColorAt(i, c);
  });
  m.receiveShadow = true; m.castShadow = false; scene.add(m);
  return m;
}

// ground cover: grass, flowers, reeds, crops
export function addGroundCover(scene, T, B, info, rng, free) {
  const dry = info.biome === 'desert', cold = info.biome === 'polar';
  const tufts = [], flowers = [], reeds = [], stones = [];
  const nGrass = Math.round((cold ? 500 : dry ? 1300 : 5000) * AREA);
  for (let i = 0; i < nGrass * 3 && tufts.length < nGrass; i++) {
    const x = (rng() - .5) * (SIZE - 3), z = (rng() - .5) * (SIZE - 3), h = T.H(x, z);
    if (h < .35 || h > B.snowAt + 1 || T.slope(x, z) > 1.1 || !free(x, z)) continue;
    // denser in meadows, thinner under forests and near the town
    if (T.forestAt(x, z) > B.forest + .05 && rng() < .7) continue;
    tufts.push({ x, y: h - .02, z, r: rng() * 6.3, s: .55 + rng() * .6, color: B.grass[Math.floor(rng() * 3)] });
    if (!dry && !cold && rng() < .09) flowers.push({ x: x + (rng() - .5) * .6, y: h, z: z + (rng() - .5) * .6, r: rng() * 6, s: .8 + rng() * .5, color: ['#f4f1e6', '#f2d24a', '#e86a8a', '#9a7ad8', '#ff8a3c'][Math.floor(rng() * 5)] });
    if (rng() < .03) stones.push({ x, y: h, z, r: rng() * 6, s: .4 + rng() * .7, color: B.rock[1] });
  }
  // reeds where land meets water
  for (let i = 0; i < 20000 * AREA && reeds.length < (dry ? 120 : 700) * AREA; i++) {
    const x = (rng() - .5) * (SIZE - 3), z = (rng() - .5) * (SIZE - 3), h = T.H(x, z);
    if (h < -.15 || h > .35) continue;
    reeds.push({ x, y: h - .05, z, r: rng() * 6, s: .7 + rng() * .6, color: dry ? '#a9a35a' : '#6f8a3a' });
  }
  const grassMat = windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide }), .09);
  scatter(scene, bladeTuft(7, .32, .035), grassMat, tufts, B.grass[0], .14);
  scatter(scene, gradient(mergeGeometries([new THREE.CylinderGeometry(.006, .006, .26, 3).translate(0, .13, 0).toNonIndexed(), new THREE.IcosahedronGeometry(.045, 0).translate(0, .27, 0)])), windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), .1), flowers, '#ffffff', .1);
  scatter(scene, bladeTuft(9, .75, .025), windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide }), .12), reeds, '#6f8a3a', .12);
  scatter(scene, new THREE.DodecahedronGeometry(.13, 0), new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }), stones, B.rock[1], .12);

  // crops: rows of plants following each field's orientation; the local flavour decides what grows
  // (tulip stripes in the Netherlands, vineyards around the Mediterranean, green rice in East Asia)
  const flora = info.flora || {}, crops = [], cabbages = [], tulips = [], vines = [];
  T.FIELDS.forEach(([fx, fz, w, h, r], fi) => {
    const golden = fi % 2 === 0, c = Math.cos(r), s = Math.sin(r);
    const kind = flora.tulips ? 'tulip' : flora.vines && !golden ? 'vine' : golden ? 'wheat' : 'cabbage';
    const du = kind === 'vine' ? .3 : .32, dv = kind === 'tulip' ? .16 : kind === 'vine' ? .55 : golden ? .2 : .34;
    let row = 0;
    for (let v = -h / 2 + .15; v < h / 2 - .1; v += dv, row++) for (let u = -w / 2 + .2; u < w / 2 - .1; u += du) {
      const x = fx + u * c - v * s, z = fz + u * s + v * c, y = T.H(x, z), j = { x: x + (rng() - .5) * .05, y, z: z + (rng() - .5) * .05, r: rng() * 6, s: .8 + rng() * .4 };
      if (kind === 'tulip') tulips.push({ ...j, color: flora.crops[Math.floor(row / 3) % flora.crops.length] });
      else if (kind === 'vine') vines.push({ ...j, r: -r, color: rng() < .2 ? '#5a7a2e' : '#4a6a2a' });
      else if (kind === 'wheat') crops.push({ ...j, color: flora.crops ? flora.crops[fi % flora.crops.length] : fi % 4 === 0 ? '#d8b44a' : '#c9a83e' });
      else cabbages.push({ ...j, color: '#5f8f35' });
    }
  });
  const head = gradient(new THREE.CylinderGeometry(.018, .01, .12, 4).translate(0, .45, 0), 1.05, 1.25); head.deleteAttribute('uv');
  const wheat = mergeGeometries([bladeTuft(5, .42, .02), head]);
  scatter(scene, wheat, windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide }), .1), crops, '#d8b44a', .1);
  scatter(scene, gradient(new THREE.IcosahedronGeometry(.12, 1).scale(1, .7, 1).translate(0, .06, 0), .6, 1.15), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, flatShading: true }), cabbages, '#5f8f35', .1);
  // tulip: green stem and leaves, coloured cup
  const cup = new THREE.CylinderGeometry(.05, .03, .08, 6).translate(0, .27, 0).toNonIndexed(); cup.deleteAttribute('uv');
  const tc = new Float32Array(cup.attributes.position.count * 3).fill(1); cup.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const stem = bladeTuft(3, .24, .015), sc = stem.attributes.color; for (let i = 0; i < sc.count; i++) sc.setXYZ(i, sc.getX(i) * .35, sc.getY(i) * .6, sc.getZ(i) * .3);
  scatter(scene, mergeGeometries([stem, cup]), windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide }), .08), tulips, '#e8343a', .08);
  // vine: a leafy hedge-row bush on a stake
  const stake = gradient(new THREE.CylinderGeometry(.015, .015, .5, 4).translate(.14, .25, 0), .5, .6), bush = gradient(new THREE.IcosahedronGeometry(.16, 1).scale(1.3, 1, .7).translate(0, .3, 0), .55, 1.15);
  stake.deleteAttribute('uv'); bush.deleteAttribute('uv');
  scatter(scene, mergeGeometries([stake, bush]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true }), vines, '#4a6a2a', .1);
  return tufts.length;
}

// town life around the plaza and along the roads; occupied(x,z,r) / mark(x,z,r) keep things from overlapping
export function addTownProps(scene, T, info, rng, occupied, mark) {
  const K = new Kit(), era = info.era, dev = info.devLevel ?? 2;
  const M4 = (x, z, ry = 0) => K.M4(x, T.H(x, z), z, ry);
  const okAt = (x, z, r) => T.H(x, z) > .4 && T.roadDist(x, z) > r + .25 && !occupied(x, z, r) && T.riverDist(x, z) > r + 1.5;
  // market stalls around the plaza
  const awn = [['#c8463a', '#f1e6cf'], ['#3f6fa8', '#f1e6cf'], ['#5a8a3a', '#f1e6cf'], ['#d8a03a', '#f1e6cf']];
  let stalls = 0;
  for (let i = 0; i < 40 && stalls < Math.min(5, 1 + dev); i++) {
    const a = rng() * Math.PI * 2, rr = 4.6 + rng() * 2, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!okAt(x, z, 1)) continue;
    const B = M4(x, z, a + Math.PI / 2), [c1, c2] = awn[stalls % awn.length];
    K.part(B, box(1.3, .08, .7), '#8a6a48', 0, .55, 0);
    for (const sx of [-.6, .6]) for (const sz of [-.3, .3]) K.part(B, cyl(.03, .03, 1.1, 5), '#5e4630', sx, .55, sz);
    for (let k = 0; k < 6; k++) K.part(B, box(.22, .04, .82), k % 2 ? c2 : c1, -.55 + k * .22, 1.12, .05, 0, -.28);
    for (let k = 0; k < 5; k++) K.part(B, new THREE.SphereGeometry(.07, 6, 4), ['#d84a2a', '#e8b83a', '#6a9a3a', '#a85aa8', '#f08a3a'][Math.floor(rng() * 5)], -.45 + k * .22, .65, (rng() - .5) * .3);
    K.part(B, box(.3, .22, .25), '#9a7a52', .45, .11, .45); K.part(B, cyl(.12, .14, .3, 8), '#7a5a3a', -.5, .15, .45);
    mark(x, z, 1); stalls++;
  }
  // well (1810) or fountain (2014) next to the square
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2, x = Math.cos(a) * 3, z = Math.sin(a) * 3;
    if (!okAt(x, z, .7)) continue;
    const B = M4(x, z);
    if (era === '2014') { K.part(B, cyl(.75, .8, .3, 16), '#bdb8ae', 0, .15, 0); K.part(B, cyl(.6, .6, .05, 16), '#5aa6c8', 0, .28, 0); K.part(B, cyl(.1, .14, .7, 8), '#bdb8ae', 0, .5, 0); K.part(B, cyl(.25, .1, .08, 10), '#bdb8ae', 0, .85, 0); }
    else { K.part(B, cyl(.45, .5, .5, 12), '#9a8f80', 0, .25, 0); K.part(B, cyl(.36, .36, .04, 12), '#2f4a5a', 0, .48, 0);
      for (const s of [-1, 1]) K.part(B, box(.07, .9, .07), '#5e4630', s * .38, .85, 0);
      K.part(B, box(.9, .06, .5), '#8a3a28', 0, 1.3, 0, 0, .0); K.part(B, cyl(.03, .03, .7, 5), '#5e4630', 0, 1.1, 0, 0, 0, Math.PI / 2); K.part(B, cyl(.07, .07, .12, 8), '#6b5236', .1, .85, 0); }
    mark(x, z, .7); break;
  }
  // barrels, crates and sacks next to houses
  for (let i = 0; i < 60 * (dev + 1) / 3; i++) {
    const a = rng() * Math.PI * 2, rr = 3 + rng() * (T.townR + 2), x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (!okAt(x, z, .25) || !occupied(x, z, .9)) continue;   // only right beside something
    const B = M4(x, z, rng() * 6), k = rng();
    if (k < .45) { K.part(B, cyl(.14, .12, .32, 10), '#7a5634', 0, .16, 0); K.part(B, cyl(.145, .145, .03, 10), '#3a3a36', 0, .08, 0); K.part(B, cyl(.145, .145, .03, 10), '#3a3a36', 0, .25, 0); }
    else if (k < .8) { K.part(B, box(.26, .24, .26), '#a08058', 0, .12, 0); K.part(B, box(.27, .03, .03), '#6b5236', 0, .12, .13); if (rng() < .5) K.part(B, box(.2, .18, .2), '#a08058', .05, .33, 0, .4); }
    else { K.part(B, new THREE.SphereGeometry(.13, 8, 6).scale(1, 1.2, .9), '#c9b48a', 0, .14, 0); K.part(B, new THREE.SphereGeometry(.11, 8, 6).scale(1, 1.2, .9), '#bca67a', .18, .12, .05); }
    mark(x, z, .25);
  }
  // street lamps along the roads in town
  for (const road of T.ROADS) {
    const L = Math.min(polyLen(road), T.townR + 6);
    for (let s = 4; s < L; s += 3.2) for (const side of [-1, 1]) {
      if ((s / 3.2 + (side > 0 ? 0 : .5)) % 1 > .6) continue;
      const p = along(road, s), x = p.x - p.dz * side * 1.45, z = p.z + p.dx * side * 1.45;
      if (T.H(x, z) < .4 || occupied(x, z, .25) || T.roadDist(x, z) < 1.05) continue;
      const B = M4(x, z, Math.atan2(p.dx, p.dz));
      if (era === '2014') { K.part(B, cyl(.035, .05, 1.8, 6), '#3a3f46', 0, .9, 0); K.part(B, box(.06, .05, .45), '#3a3f46', 0, 1.78, -side * .2); K.part(B, box(.14, .06, .2), '#f6e9b8', 0, 1.74, -side * .4); }
      else { K.part(B, box(.07, 1.4, .07), '#4a3426', 0, .7, 0); K.part(B, box(.05, .05, .3), '#4a3426', 0, 1.35, -side * .12);
        K.part(B, box(.14, .18, .14), '#f2d48a', 0, 1.2, -side * .26); K.part(B, new THREE.ConeGeometry(.12, .1, 4), '#2b2520', 0, 1.33, -side * .26, Math.PI / 4); }
      mark(x, z, .25);
    }
  }
  // a cart parked by the road outside town
  for (const road of T.ROADS.slice(0, 2)) {
    const p = along(road, Math.min(polyLen(road) - 1, T.townR + 9)), x = p.x - p.dz * 1.6, z = p.z + p.dx * 1.6;
    if (!okAt(x, z, .9)) continue;
    const B = M4(x, z, Math.atan2(p.dx, p.dz));
    // Blender models (front along +x; turn so they park along the road)
    const B2 = B.clone().multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    if (PREFABS.van_2014 && era === '2014') K.prefab(B2, rng() < .5 ? 'van_2014' : 'car_2014', { body: ['#d8433a', '#3f6fa8', '#e8c33a', '#f1ede4'][Math.floor(rng() * 4)] });
    else if (PREFABS.wagon_1810 && era !== '2014') K.prefab(B2, 'wagon_1810');
    mark(x, z, .9);
  }
  // East Asian touches: a red torii over the main road at the edge of town, stone lanterns by the square
  const extras = (info.flora && info.flora.extras) || [];
  if (extras.includes('torii') && T.ROADS[0]) {
    const p = along(T.ROADS[0], T.townR + 4), B = K.M4(p.x, T.H(p.x, p.z), p.z, Math.atan2(p.dx, p.dz) + Math.PI / 2);
    for (const sx of [-1.25, 1.25]) { K.part(B, cyl(.1, .12, 2.4, 10), '#c8321f', sx, 1.2, 0); K.part(B, cyl(.15, .15, .15, 10), '#1d1a17', sx, .07, 0); }
    K.part(B, box(3.3, .14, .2), '#c8321f', 0, 1.95, 0); K.part(B, box(.12, .32, .16), '#c8321f', 0, 2.12, 0);
    K.part(B, box(3.7, .16, .28), '#1d1a17', 0, 2.36, 0); K.part(B, box(.6, .1, .3), '#1d1a17', -1.8, 2.44, 0, 0, 0, .2); K.part(B, box(.6, .1, .3), '#1d1a17', 1.8, 2.44, 0, 0, 0, -.2);
    mark(p.x, p.z, .3);
  }
  if (extras.includes('lantern')) for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + .3, x = Math.cos(a) * 4.2, z = Math.sin(a) * 4.2;
    if (!okAt(x, z, .3)) continue;
    const B = M4(x, z, a);
    K.part(B, box(.34, .1, .34), '#9a958c', 0, .05, 0); K.part(B, cyl(.06, .08, .45, 6), '#9a958c', 0, .32, 0);
    K.part(B, box(.3, .06, .3), '#9a958c', 0, .57, 0); K.part(B, box(.2, .2, .2), '#f2d48a', 0, .7, 0); K.part(B, new THREE.ConeGeometry(.26, .2, 4), '#8a857c', 0, .9, 0, Math.PI / 4);
    mark(x, z, .3);
  }
  // split-rail fences around the fields
  T.FIELDS.forEach(([fx, fz, w, h, r], i) => {
    if (i % 2) return;
    const c = Math.cos(r), s = Math.sin(r);
    const post = (u, v) => [fx + u * c - v * s, fz + u * s + v * c];
    const edges = [[[-w / 2, -h / 2], [w / 2, -h / 2]], [[w / 2, -h / 2], [w / 2, h / 2]], [[w / 2, h / 2], [-w / 2, h / 2]], [[-w / 2, h / 2], [-w / 2, -h / 2]]];
    for (const [[u0, v0], [u1, v1]] of edges) {
      const n = Math.max(2, Math.round(Math.hypot(u1 - u0, v1 - v0) / 1.2));
      for (let k = 0; k <= n; k++) {
        const [x, z] = post(u0 + (u1 - u0) * k / n + Math.sign(u0) * .15, v0 + (v1 - v0) * k / n + Math.sign(v0) * .15);
        if (T.H(x, z) < .3 || T.roadDist(x, z) < 1.1) continue;
        const B = M4(x, z, 0); K.part(B, box(.06, .45, .06), '#6b5236', 0, .22, 0);
        if (k < n) { const [x2, z2] = post(u0 + (u1 - u0) * (k + 1) / n + Math.sign(u0) * .15, v0 + (v1 - v0) * (k + 1) / n + Math.sign(v0) * .15);
          const len = Math.hypot(x2 - x, z2 - z), ang = Math.atan2(x2 - x, z2 - z), mid = K.M4((x + x2) / 2, T.H(x, z), (z + z2) / 2, ang);
          K.part(mid, box(.035, .035, len), '#8a6a48', 0, .32, 0); K.part(mid, box(.035, .035, len), '#8a6a48', 0, .17, 0); }
      }
    }
  });
  K.flush(scene);
}
