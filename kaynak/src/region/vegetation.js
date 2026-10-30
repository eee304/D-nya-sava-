// Instanced trees, palms, shrubs, rocks and bushes for a region.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIZE, AREA } from './terrain.js';
import { LEAF } from './flora.js';
import { windy } from './details.js';

// lumpy leaf clump: subdivided icosahedron with its vertices pushed in and out a little
function clump(r, x, y, z, sx = 1, sy = 1, sz = 1, seed = 1) {
  // shared vertices so the crown shades smoothly (soft painted foliage instead of hard facets)
  const ico = new THREE.IcosahedronGeometry(r, 2); ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
  const g = mergeVertices(ico), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 1 + Math.sin(vx * 9.1 + seed) * Math.cos(vz * 7.3 + seed * 2) * .13 + Math.sin(vy * 11 + seed) * .06;
    p.setXYZ(i, vx * k * sx, vy * k * sy, vz * k * sz);
  }
  g.computeVertexNormals(); g.translate(x, y, z);
  return g;
}
// shade by height: dark underside, sunlit top
function shade(g, lo = .5, hi = 1.18) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3);
  let y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  for (let i = 0; i < n; i++) { const t = (p.getY(i) - y0) / (y1 - y0 || 1), v = lo + (hi - lo) * Math.pow(t, .8); c[i * 3] = v * .97; c[i * 3 + 1] = v; c[i * 3 + 2] = v * .92; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const coneG = (r, h, x, y, z, seg = 9) => {   // drooping pine tier
  const pts = [new THREE.Vector2(0, h), new THREE.Vector2(r * .25, h * .78), new THREE.Vector2(r * .7, h * .3), new THREE.Vector2(r, 0), new THREE.Vector2(r * .82, -h * .08), new THREE.Vector2(0, 0)];
  const g = new THREE.LatheGeometry(pts, seg); g.deleteAttribute('uv');
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + Math.sin(a * 5 + h * 9) * .07; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals(); return g.translate(x, y, z);
};

const SWAY = .022;   // tree tops lean a few centimetres in the wind; trunk and crown share it so they stay joined
const variants = new Map();   // two shapes per kind so neighbouring trees differ
function crownGeo(kind, v = 0) {
  const key = kind + v; if (variants.has(key)) return variants.get(key);
  let g;
  if (kind === 'pine') g = shade(mergeGeometries([coneG(.68, .9, 0, .55, 0), coneG(.56, .8, 0, 1.05, 0), coneG(.42, .72, 0, 1.5, 0), coneG(.26, .6, 0, 1.9, 0)].map(q => q.toNonIndexed())), .42, 1.15);
  else if (kind === 'jungle') g = shade(mergeGeometries([clump(.85, 0, 2.1, 0, 1.1, .55, 1.1, v), clump(.6, .55, 1.85, .25, 1, .6, 1, v + 1), clump(.6, -.5, 1.9, -.3, 1, .6, 1, v + 2), clump(.5, .1, 2.35, -.4, 1, .55, 1, v + 3)].map(q => q.toNonIndexed())), .45, 1.12);
  else if (kind === 'palm') {
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + v, f = new THREE.PlaneGeometry(1.4, .28, 6, 1), p = f.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k) + .7; p.setX(k, x); p.setY(k, -x * x * .32 + Math.abs(p.getY(k)) * .4); p.setZ(k, p.getY(k) > 0 ? .12 * (1 - x / 1.4) : -.12 * (1 - x / 1.4)); }
      f.deleteAttribute('uv'); f.rotateY(a); f.translate(0, 2.05, 0); leaves.push(f.toNonIndexed());
    }
    leaves.push(new THREE.IcosahedronGeometry(.13, 0).translate(.05, 1.95, 0).toNonIndexed());
    leaves[leaves.length - 1].deleteAttribute('uv');
    g = shade(mergeGeometries(leaves), .6, 1.1);
  } else if (kind === 'sakura') {   // wide, airy blossom crown
    g = shade(mergeGeometries([clump(.62, 0, 1.45, 0, 1.35, .62, 1.2, v), clump(.48, .62, 1.3, .2, 1.2, .6, 1.1, v + 1), clump(.46, -.6, 1.35, -.18, 1.2, .62, 1.1, v + 2),
      clump(.42, .1, 1.7, .45, 1.1, .6, 1, v + 3), clump(.4, -.2, 1.68, -.5, 1.1, .6, 1, v + 4), clump(.3, .9, 1.1, -.3, 1, .7, 1, v + 5)].map(q => q.toNonIndexed())), .7, 1.18);
  } else if (kind === 'olive') g = shade(mergeGeometries([clump(.42, 0, 1.0, 0, 1.3, .7, 1.2, v), clump(.32, .35, .9, .2, 1.2, .7, 1, v + 1), clump(.3, -.3, .95, -.2, 1.2, .7, 1, v + 2)].map(q => q.toNonIndexed())), .55, 1.12);
  else if (kind === 'cypress') {
    const pts = [[0, 2.9], [.12, 2.6], [.26, 2.0], [.32, 1.3], [.28, .7], [.16, .35], [0, .3]].map(([r, y]) => new THREE.Vector2(r, y));
    const q = new THREE.LatheGeometry(pts, 9); q.deleteAttribute('uv'); g = shade(q.toNonIndexed(), .45, 1.1);
  } else if (kind === 'birch') g = shade(mergeGeometries([clump(.42, 0, 1.75, 0, .9, 1.2, .9, v), clump(.32, .22, 1.45, .12, .9, 1.1, .9, v + 1), clump(.3, -.2, 2.05, -.1, .9, 1.1, .9, v + 2)].map(q => q.toNonIndexed())), .55, 1.15);
  else if (kind === 'acacia') g = shade(mergeGeometries([clump(.8, 0, 2.05, 0, 1.5, .28, 1.4, v), clump(.5, .55, 1.95, .3, 1.3, .3, 1.2, v + 1), clump(.48, -.55, 2.0, -.25, 1.3, .3, 1.2, v + 2)].map(q => q.toNonIndexed())), .6, 1.1);
  else if (kind === 'baobab') g = shade(mergeGeometries([clump(.4, .25, 2.25, 0, 1.3, .4, 1.1, v), clump(.36, -.3, 2.2, .15, 1.2, .4, 1, v + 1), clump(.3, 0, 2.35, -.3, 1.1, .4, 1, v + 2)].map(q => q.toNonIndexed())), .6, 1.1);
  else if (kind === 'bamboo') {   // a clump of tall stalks with leaf tufts
    const parts = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + v, r = .08 + (i % 3) * .07, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.8 + (i % 4) * .35, lean = (i % 2 ? .06 : -.05);
      const st = new THREE.CylinderGeometry(.022, .03, h, 5).translate(0, h / 2, 0).rotateZ(lean).rotateX(lean * .7).translate(x, 0, z); st.deleteAttribute('uv'); parts.push(st.toNonIndexed());
      for (let k = 0; k < 3; k++) { const t = clump(.12, x + lean * h * (.6 + k * .15) * -1, h * (.62 + k * .17), z, 1.6, .35, .8, v + i + k); parts.push(t.toNonIndexed()); }
    }
    g = shade(mergeGeometries(parts), .55, 1.15);
  } else if (kind === 'eucalyptus') g = shade(mergeGeometries([clump(.45, .1, 2.2, 0, 1, .8, 1, v), clump(.36, -.35, 1.9, .2, 1, .8, 1, v + 1), clump(.34, .35, 1.75, -.2, 1, .8, 1, v + 2)].map(q => q.toNonIndexed())), .55, 1.12);
  else if (kind === 'shrub') g = shade(mergeGeometries([clump(.36, 0, .3, 0, 1.3, .8, 1.3, v), clump(.28, .3, .25, .15, 1, 1, 1, v + 1), clump(.24, -.25, .22, -.1, 1, 1, 1, v + 2)].map(q => q.toNonIndexed())), .55, 1.1);
  else {   // broadleaf: a big crown of five to six lumps
    const parts = [clump(.6, 0, 1.3, 0, 1, .9, 1, v), clump(.46, .4, 1.05, .15, 1, .9, 1, v + 1), clump(.44, -.38, 1.1, -.12, 1, .9, 1, v + 2),
      clump(.4, .05, 1.65, .12, 1, .9, 1, v + 3), clump(.36, -.1, 1.0, .42, 1, .9, 1, v + 4)];
    if (v) parts.push(clump(.34, .3, 1.5, -.3, 1, .9, 1, v + 5));
    g = shade(mergeGeometries(parts.map(q => q.toNonIndexed())), .48, 1.15);
  }
  variants.set(key, g);
  return g;
}
function trunkGeo(kind) {
  if (kind === 'palm') {   // gently leaning trunk
    const g = new THREE.CylinderGeometry(.06, .1, 2.0, 6, 4); g.translate(0, 1.0, 0);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + y * y * .05); }
    g.computeVertexNormals(); return g;
  }
  if (kind === 'jungle') return new THREE.CylinderGeometry(.1, .16, 1.9, 6).translate(0, .95, 0);
  if (kind === 'shrub' || kind === 'bamboo' || kind === 'cypress') return kind === 'cypress' ? new THREE.CylinderGeometry(.05, .07, .4, 5).translate(0, .2, 0) : null;
  const bent = (h, r0, r1, curve, n = 6) => { const q = new THREE.CylinderGeometry(r1, r0, h, n, 5); q.translate(0, h / 2, 0); const p = q.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h; p.setX(i, p.getX(i) + Math.sin(y * 2.4) * curve); } q.computeVertexNormals(); q.deleteAttribute('uv'); return q.toNonIndexed(); };
  const branch = (len, r, ang, y, ry = 0) => { const q = new THREE.CylinderGeometry(r * .6, r, len, 5).translate(0, len / 2, 0).rotateZ(ang).rotateY(ry).translate(0, y, 0); q.deleteAttribute('uv'); return q.toNonIndexed(); };
  if (kind === 'sakura') return mergeGeometries([bent(1.3, .12, .07, .12), branch(.7, .05, -.9, 1.0), branch(.6, .045, .95, 1.05, 1.2), branch(.55, .04, .8, 1.1, 2.6)]);
  if (kind === 'olive') return mergeGeometries([bent(.85, .13, .08, .1, 7), branch(.45, .05, -.8, .7), branch(.4, .05, .8, .72, 2)]);
  if (kind === 'birch') return bent(1.75, .06, .035, .04);
  if (kind === 'acacia') return mergeGeometries([bent(1.5, .08, .05, .08), branch(.75, .045, -.7, 1.3), branch(.7, .045, .65, 1.35, 2.2)]);
  if (kind === 'baobab') { const pts = [[.32, 0], [.36, .4], [.34, 1.0], [.26, 1.6], [.16, 2.0], [.1, 2.2], [0, 2.25]].map(([r, y]) => new THREE.Vector2(r, y)); const q = new THREE.LatheGeometry(pts, 9); q.deleteAttribute('uv'); return mergeGeometries([q.toNonIndexed(), branch(.5, .06, -.9, 2.0), branch(.45, .06, .9, 2.05, 1.5)]); }
  if (kind === 'eucalyptus') return mergeGeometries([bent(1.9, .08, .05, .1), branch(.6, .04, -.7, 1.4)]);
  const t = new THREE.CylinderGeometry(.06, .11, .95, 6).translate(0, .47, 0), br = new THREE.CylinderGeometry(.025, .045, .45, 5).rotateZ(-.7).translate(.17, .78, 0);
  t.deleteAttribute('uv'); br.deleteAttribute('uv');
  return mergeGeometries([t.toNonIndexed(), br.toNonIndexed()]);
}

// canPlace(x,z,r) -> true if a tree may grow there naturally; blocked(x,z) -> true if it has since been cut down or built over.
// The natural forest is decided first, so clearing a wood or adding a building never reshuffles trees elsewhere.
export function addVegetation(scene, T, B, rng, canPlace, blocked = null) {
  const kinds = Object.entries(B.trees);
  const pickKind = (h, r) => {
    if (B.trees.pine && h > 3.6) return 'pine';
    for (const [k, w] of kinds) { if ((r -= w) <= 0) return k; } return kinds[0][0];
  };
  // every candidate draws the same random numbers whether it grows or not, so the forest is identical on every visit
  const trees = [];
  for (let i = 0; i < 20000 * AREA && trees.length < B.treeCap * AREA; i++) {
    const x = (rng() - .5) * (SIZE - 2), z = (rng() - .5) * (SIZE - 2), roll = rng(), kr = rng(), pr = rng(), s = .75 + rng() * .65, r = rng() * 6.3, c = rng(), ck = rng();
    const f = T.forestAt(x, z), p = f > B.forest ? .8 : (f > B.forest - .06 ? .12 : .018);
    if (roll > p || !canPlace(x, z, .4)) continue;
    const h = T.H(x, z), kind = pickKind(h, kr);
    if (kind === 'palm' && B.label !== 'Tropik' && T.riverDist(x, z) > 9 && T.coastAt(x, z) < -14 && pr < .8) continue; // desert palms cluster by water
    trees.push({ x, z, y: h, kind, s, r, c, ck });
  }
  const stumps = [];
  if (blocked) for (let i = trees.length - 1; i >= 0; i--) { const t = trees[i], b = blocked(t.x, t.z); if (b) { if (b === 'cut') stumps.push(t); trees.splice(i, 1); } }
  const dmy = new THREE.Object3D(), col = new THREE.Color();
  const vegMat = new THREE.MeshStandardMaterial({ roughness: .9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4330', roughness: 1 });
  const meshes = [], items = [];   // items: where each tree instance lives, so buildings can clear them later
  for (const [kind] of kinds) {
    const list = trees.filter(t => t.kind === kind); if (!list.length) continue;
    const crown = new THREE.InstancedMesh(crownGeo(kind, list.length % 2), windy(new THREE.MeshStandardMaterial({ roughness: .9, flatShading: false, vertexColors: true, side: kind === 'palm' ? THREE.DoubleSide : THREE.FrontSide }), SWAY), list.length);
    const TRUNK = { palm: '#8a6e4a', sakura: '#4a3530', olive: '#6b5a48', birch: '#ece8de', baobab: '#9a8070', eucalyptus: '#d8cfc0', acacia: '#5a4636', cypress: '#4a3a2a' };
    const tg = trunkGeo(kind), trunk = tg ? new THREE.InstancedMesh(tg, windy(TRUNK[kind] ? new THREE.MeshStandardMaterial({ color: TRUNK[kind], roughness: 1 }) : trunkMat.clone(), SWAY), list.length) : null;
    list.forEach((t, i) => {
      dmy.position.set(t.x, t.y - .05, t.z); dmy.rotation.set(0, t.r, 0); dmy.scale.setScalar(t.s); dmy.updateMatrix();
      crown.setMatrixAt(i, dmy.matrix); if (trunk) trunk.setMatrixAt(i, dmy.matrix);
      items.push({ x: t.x, z: t.z, i, tree: true, kind, s: t.s, y: t.y - .05, r: t.r, meshes: trunk ? [crown, trunk] : [crown], crown });
      const pal = LEAF[kind] || (kind === 'pine' ? ['#2f5530', '#2a4a2b', '#355f35', '#24442a'] : B.leaf);
      crown.setColorAt(i, col.set(pal[Math.floor(t.c * pal.length)]).multiplyScalar(.85 + t.ck * .3));
    });
    for (const m of [crown, trunk]) if (m) { m.castShadow = true; m.receiveShadow = true; scene.add(m); meshes.push(m); }
  }
  // rocks on slopes / mountains, bushes on open ground
  const rocks = [], bushes = [];
  for (let i = 0; i < 9000 * AREA; i++) {
    const x = (rng() - .5) * (SIZE - 2), z = (rng() - .5) * (SIZE - 2), h = T.H(x, z), sl = T.slope(x, z);
    if (rocks.length < 520 * AREA && (sl > .9 || h > 5.5 || (B.dunes && rng() < .02)) && h > .3 && rng() < .5 && T.roadDist(x, z) > 1.5) rocks.push([x, h, z, .25 + rng() * .7]);
    else if (bushes.length < (B.label === 'Kutup' ? 0 : 1000 * AREA) && h > .5 && h < 5 && sl < .6 && rng() < .2 && canPlace(x, z, .3) && !(blocked && blocked(x, z))) bushes.push([x, h, z, .18 + rng() * .22]);
  }
  const rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }), Math.max(1, rocks.length));
  rockM.count = rocks.length;
  rocks.forEach(([x, y, z, s], i) => { dmy.position.set(x, y, z); dmy.rotation.set(rng() * 3, rng() * 3, rng() * 3); dmy.scale.set(s, s * .7, s); dmy.updateMatrix(); rockM.setMatrixAt(i, dmy.matrix); rockM.setColorAt(i, col.set(B.rock[0]).multiplyScalar(.8 + rng() * .35)); });
  const bushGeo = new THREE.IcosahedronGeometry(1, 2); bushGeo.deleteAttribute('uv'); bushGeo.deleteAttribute('normal');
  const bushSmooth = mergeVertices(bushGeo); bushSmooth.computeVertexNormals();
  const bushM = new THREE.InstancedMesh(bushSmooth, vegMat.clone(), Math.max(1, bushes.length));
  bushM.count = bushes.length;
  bushes.forEach(([x, y, z, s], i) => { items.push({ x, z, i, meshes: [bushM] }); dmy.position.set(x, y + s * .4, z); dmy.rotation.set(0, rng() * 3, 0); dmy.scale.set(s * 1.3, s, s * 1.3); dmy.updateMatrix(); bushM.setMatrixAt(i, dmy.matrix); bushM.setColorAt(i, col.set(B.leaf[i % B.leaf.length]).multiplyScalar(.85 + rng() * .3)); });
  for (const m of [rockM, bushM]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); meshes.push(m); }
  return { count: trees.length, meshes, items, stumps };
}

// forests continuing into the countryside beyond the playable square (no shadows, never cleared)
export function addOuterTrees(scene, T, B, rng, R = SIZE / 2 + 130) {
  const kinds = Object.entries(B.trees), HALF = SIZE / 2, trees = [];
  const pick = h => { if (B.trees.pine && h > 3.6) return 'pine'; let r = rng(); for (const [k, w] of kinds) { if ((r -= w) <= 0) return k; } return kinds[0][0]; };
  const cap = Math.round(B.treeCap * 1.6);
  for (let i = 0; i < cap * 12 && trees.length < cap; i++) {
    const x = (rng() * 2 - 1) * R, z = (rng() * 2 - 1) * R;
    if (Math.abs(x) < HALF + .5 && Math.abs(z) < HALF + .5) continue;
    const f = T.forestRaw(x, z), p = f > B.forest ? .75 : (f > B.forest - .06 ? .1 : .012);
    if (rng() > p) continue;
    const h = T.Hraw(x, z);
    if (h < .5 || h > B.snowAt + 1.5 || (T.RIVER && T.riverDist(x, z) < 3 && Math.abs(x) < HALF + 3 && Math.abs(z) < HALF + 3)) continue;
    trees.push({ x, z, y: h, kind: pick(h), s: .8 + rng() * .7, r: rng() * 6.3 });
  }
  const dmy = new THREE.Object3D(), col = new THREE.Color();
  for (const [kind] of kinds) {
    const list = trees.filter(t => t.kind === kind); if (!list.length) continue;
    const crown = new THREE.InstancedMesh(crownGeo(kind, 0), windy(new THREE.MeshStandardMaterial({ roughness: .9, vertexColors: true, side: kind === 'palm' ? THREE.DoubleSide : THREE.FrontSide }), SWAY), list.length);
    const tg = trunkGeo(kind), trunk = tg ? new THREE.InstancedMesh(tg, windy(new THREE.MeshStandardMaterial({ color: '#5a4330', roughness: 1 }), SWAY), list.length) : null;
    const pal = LEAF[kind] || (kind === 'pine' ? ['#2f5530', '#2a4a2b', '#355f35', '#24442a'] : B.leaf);
    list.forEach((t, i) => {
      dmy.position.set(t.x, t.y - .05, t.z); dmy.rotation.set(0, t.r, 0); dmy.scale.setScalar(t.s); dmy.updateMatrix();
      crown.setMatrixAt(i, dmy.matrix); if (trunk) trunk.setMatrixAt(i, dmy.matrix);
      crown.setColorAt(i, col.set(pal[Math.floor(rng() * pal.length)]).multiplyScalar(.85 + rng() * .3));
    });
    for (const m of [crown, trunk]) if (m) { m.receiveShadow = true; scene.add(m); }
  }
  return trees.length;
}
