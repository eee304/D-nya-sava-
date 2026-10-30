// Life in a region: traffic on the roads (Blender cars and vans in 2014, horse-drawn wagons in 1810)
// and townsfolk strolling the pavements and the square.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { along, polyLen } from './noise.js';
import { PREFABS, RIGS } from './prefabs.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { makeHuman, humanName } from '../units/humans.js';
import { texturedMaterial } from './textures.js';

const matCache = new Map();
const matFor = c => { if (!matCache.has(c)) matCache.set(c, texturedMaterial(c)); return matCache.get(c); };
// a Blender model as its own (movable) group; recolor maps role -> colour
export function prefabGroup(name, recolor = {}) {
  const g = new THREE.Group(), wheels = {};
  g.userData.wheels = [];
  for (const p of PREFABS[name] || []) {
    let parent = g, geo = p.geo;
    if (p.wheel) {   // wheels turn on their hub
      if (!wheels[p.wheel.id]) { const w = wheels[p.wheel.id] = new THREE.Group(); w.position.copy(p.wheel.hub); g.add(w); g.userData.wheels.push({ g: w, r: Math.max(.05, p.wheel.hub.y) }); }
      parent = wheels[p.wheel.id]; geo = p.wheel.geo;
    }
    const m = new THREE.Mesh(geo.clone(), matFor(recolor[p.role] || p.color));
    m.castShadow = true; m.receiveShadow = true; parent.add(m);
  }
  return g;
}

// ---- rigged horse (Blender: blender/horse.py): skinned mesh + walk/idle clips, one mixer per horse
export function makeHorse(coat) {
  const src = RIGS.horse; if (!src) return null;
  const g = cloneSkinned(src.scene);
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.frustumCulled = false;
    if ((o.material.name || '').startsWith('coat')) { o.material = o.material.clone(); o.material.color.set(coat); }
  });
  g.scale.setScalar(.6);
  const mixer = new THREE.AnimationMixer(g), clip = n => src.animations.find(a => a.name === n);
  const walk = mixer.clipAction(clip('walk')), idle = mixer.clipAction(clip('idle')), gal = clip('gallop') && mixer.clipAction(clip('gallop'));
  for (const a of [walk, idle, gal]) if (a) { a.play(); a.time = Math.random() * a.getClip().duration; a.setEffectiveWeight(0); }
  const wt = { walk: 1, idle: 0, gallop: 0 };
  return {
    g, mixer,
    // dist: ground covered this frame; gallop: run instead of walk (cavalry charge)
    update(dist, t, dt, gallop = false) {
      const speed = dt > 0 ? dist / dt : 0, moving = speed > .05, want = moving ? (gallop && gal ? 'gallop' : 'walk') : 'idle';
      for (const k in wt) wt[k] += ((k === want ? 1 : 0) - wt[k]) * Math.min(1, dt * 5);
      walk.setEffectiveWeight(wt.walk); idle.setEffectiveWeight(wt.idle); if (gal) gal.setEffectiveWeight(wt.gallop);
      walk.timeScale = Math.max(.5, Math.min(2, speed / .55)); if (gal) gal.timeScale = Math.max(.7, Math.min(1.8, speed / 1.6));
      mixer.update(dt);
    },
  };
}

// ---- rigged townsfolk: every body part is an instanced mesh whose origin is its joint
// (person faces +z; limbs hang along -y from the joint)
const cap = (r, len) => { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.deleteAttribute('uv'); return g; };
function rigParts(era) {
  const hatGeo = era === '2014'
    ? mergeGeometries([new THREE.SphereGeometry(.082, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1).translate(0, .005, -.004).toNonIndexed()])   // hair cap
    : mergeGeometries([new THREE.CylinderGeometry(.115, .115, .014, 14).translate(0, .055, 0).toNonIndexed(), new THREE.CylinderGeometry(.062, .07, .085, 12).translate(0, .1, 0).toNonIndexed()]);   // brimmed hat
  hatGeo.deleteAttribute('uv');
  return {
    torso: cap(.068, .13).scale(1, 1, .8).translate(0, .11, 0),          // hip joint at origin
    head: new THREE.SphereGeometry(.078, 14, 12).translate(0, .08, 0),   // neck joint
    hat: hatGeo.translate(0, .08, 0),
    eyes: mergeGeometries([new THREE.SphereGeometry(.011, 6, 4).translate(-.027, .088, .07).toNonIndexed(), new THREE.SphereGeometry(.011, 6, 4).translate(.027, .088, .07).toNonIndexed()]),
    upper: cap(.026, .06).translate(0, -.045, 0),                         // shoulder joint
    lower: cap(.023, .055).translate(0, -.04, 0),                          // elbow joint
    hand: new THREE.SphereGeometry(.024, 8, 6).translate(0, -.09, .005),
    thigh: cap(.033, .06).translate(0, -.05, 0),                          // hip joint
    shin: cap(.029, .06).translate(0, -.05, 0),                           // knee joint
    foot: new THREE.BoxGeometry(.05, .03, .085).translate(0, -.1, .02),
  };
}
const SHIRTS_2014 = ['#3f6fa8', '#c8463a', '#e8c33a', '#5a8a4a', '#f1ede4', '#2f3338', '#d97aa0', '#7a5aa8', '#e08a3a'];
const SHIRTS_1810 = ['#6b4a32', '#8a3a28', '#3f5a3a', '#e8e0cc', '#4a5a78', '#c9b48a', '#a85a3a', '#5a6a8a', '#d8a050', '#7a3a5a', '#f1ece0', '#3a5a6a'];
const PANTS_2014 = ['#2f4a6a', '#3a3a3e', '#6b5a48', '#c9bfa8', '#24324a'];
const PANTS_1810 = ['#4a3a2a', '#5e4630', '#d8cdb5', '#3a3836', '#6b5236', '#8a7a5a', '#2f3a4a'];
const HAIR = ['#2b2018', '#4a3020', '#8a6a3a', '#d8b878', '#1d1a17', '#a04a2a', '#9a9a98'];
const SKIN = ['#f2cfb0', '#e0b48c', '#c99470', '#9a6a48', '#6b4a32'];
// local look for 1810 townsfolk: skin tones and the cloth of skirts, robes, headscarves and obis
const SKIN_OF = { european: ['#f2cfb0', '#e8c09c', '#e0b48c', '#c99470'], islamic: ['#e0b48c', '#c99470', '#b8865e', '#9a6a48'],
  eastasia: ['#f0d2ae', '#e8c49c', '#dcb48a'], african: ['#8a5a3a', '#6b4a32', '#5a3a26', '#9a6a48'] };
const CLOTH = { european: ['#4a5a78', '#7a3a3a', '#5a6a4a', '#8a7a5a', '#3a3a4a', '#a8865a'], islamic: ['#2c3a66', '#6a2a3a', '#3a5a4a', '#efe9dc', '#8a6a3a', '#4a3a5a'],
  eastasia: ['#3a4a7a', '#8a2a3a', '#c8a050', '#4a6a5a', '#d88a8a', '#2b2a30'], african: ['#d8a020', '#c84a2a', '#2a6a8a', '#3a7a3a', '#8a2a6a', '#e07a2a'] };

const CAR_COLORS = ['#d8433a', '#3f6fa8', '#e8c33a', '#f1ede4', '#2f3338', '#5a8a4a', '#9a9ea4', '#e07a2e', '#7a3f8a'];

// height to stand at: the bridge deck over rivers (same box as RegionView.unitY), else the ground; null = water
function walkY(T, x, z) {
  for (const p of T.BRIDGES) {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx * p.dx + dz * p.dz) < 5.8 && Math.abs(-dx * p.dz + dz * p.dx) < 1.6) return 1.1;
  }
  const h = T.H(x, z); return h < .08 ? null : h;
}
export class Life {
  constructor(scene, T, info, rng) {
    this.T = T; this.group = new THREE.Group(); scene.add(this.group);
    const era = info.era, dev = info.devLevel ?? 2, roads = T.ROADS.filter(r => polyLen(r) > 12);
    // ---- traffic
    this.vehicles = [];
    const nVeh = roads.length ? Math.min(14, (era === '2014' ? 4 : 2) + dev * (era === '2014' ? 2 : 1)) : 0;
    for (let i = 0; i < nVeh; i++) {
      const road = roads[i % roads.length], L = polyLen(road);
      let g;
      if (era === '2014') g = prefabGroup(rng() < .75 ? 'car_2014' : 'van_2014', { body: CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)] });
      else {
        g = prefabGroup('wagon_1810');
        const h = makeHorse(['#6b4a32', '#8a5a3a', '#3a2a22', '#d8cdb5', '#9a7a5a'][Math.floor(rng() * 5)]);
        if (h) { h.g.rotation.y = Math.PI / 2; h.g.position.x = 1.3; g.add(h.g); g.userData.horse = h; }
      }
      if (!g.children.length) continue;
      this.group.add(g);
      this.vehicles.push({ g, road, L, s: rng() * L, dir: rng() < .5 ? 1 : -1, v: era === '2014' ? 2.2 + rng() * 1.6 : .8 + rng() * .4, ph: rng() * 6, horse: g.userData.horse || null });
    }
    // ---- townsfolk: rigged Blender people when loaded (else the coded figures below)
    this.civ = null;
    if (makeHuman('civ_' + era)) {
      const shirts0 = era === '2014' ? SHIRTS_2014 : SHIRTS_1810, pants0 = era === '2014' ? PANTS_2014 : PANTS_1810, pk = a => a[Math.floor(rng() * a.length)];
      this.civ = Array.from({ length: Math.min(44, 12 + dev * 8) }, () => {
        const fem = rng() < .45, cul = info.culture || 'european';
        // robes / headscarves / kimono obi read the 'pants' colour too, so women get a livelier cloth palette
        const h = makeHuman(humanName('civ', era, cul, fem), { team: pk(shirts0), pants: pk(fem && era === '1810' ? CLOTH[cul] || CLOTH.european : pants0), skin: pk(era === '1810' ? SKIN_OF[cul] || SKIN : SKIN) }), p = { ph: rng() * 6, v: .3 + rng() * .2, wait: 0, h, size: .5 + rng() * .07 };
        h.g.scale.setScalar(p.size); this.group.add(h.g);
        if (roads.length && rng() < .65) { p.road = roads[Math.floor(rng() * roads.length)]; p.L = Math.min(polyLen(p.road), T.townR + 10); p.s = 2 + rng() * (p.L - 2); p.dir = rng() < .5 ? 1 : -1; p.side = rng() < .5 ? 1 : -1; }
        else { const a = rng() * 6.3, r = 1.5 + rng() * 2; p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; p.tx = p.x; p.tz = p.z; }
        return p;
      });
    }
    const n = this.civ ? 0 : Math.min(70, 16 + dev * 12), parts = rigParts(era);
    const shirts = era === '2014' ? SHIRTS_2014 : SHIRTS_1810, pants = era === '2014' ? PANTS_2014 : PANTS_1810;
    this.rig = {};
    const mk = (key, mult, fixed) => {
      const m = new THREE.InstancedMesh(parts[key], new THREE.MeshStandardMaterial({ roughness: .8, color: fixed || '#ffffff' }), n * mult);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); this.rig[key] = m; return m;
    };
    mk('torso', 1); mk('head', 1); mk('hat', 1); mk('eyes', 1, '#1d1a17'); mk('upper', 2); mk('lower', 2); mk('hand', 2); mk('thigh', 2); mk('shin', 2); mk('foot', 2, '#2b2520');
    this.people = [];
    const col = new THREE.Color(), pick = a => a[Math.floor(rng() * a.length)];
    for (let i = 0; i < n; i++) {
      const p = { ph: rng() * 6, v: .32 + rng() * .22, wait: 0, step: 0, look: rng() * 6, size: .82 + rng() * .14 };
      if (roads.length && rng() < .65) { p.road = roads[Math.floor(rng() * roads.length)]; p.L = Math.min(polyLen(p.road), T.townR + 10); p.s = 2 + rng() * (p.L - 2); p.dir = rng() < .5 ? 1 : -1; p.side = rng() < .5 ? 1 : -1; }
      else { const a = rng() * 6.3, r = 1.5 + rng() * 2; p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; p.tx = p.x; p.tz = p.z; }
      const shirt = pick(shirts), skinC = pick(SKIN), pant = pick(pants);
      this.rig.torso.setColorAt(i, col.set(shirt)); this.rig.head.setColorAt(i, col.set(skinC));
      this.rig.hat.setColorAt(i, col.set(era === '2014' ? pick(HAIR) : pick(['#2b2520', '#4a3a2a', '#6b5236', '#d8cdb5', '#c9a868', '#3a4a5a', '#7a2a2a'])));
      for (const k of [0, 1]) {
        this.rig.upper.setColorAt(i * 2 + k, col.set(shirt)); this.rig.lower.setColorAt(i * 2 + k, col.set(era === '2014' && rng() < .4 ? skinC : shirt));
        this.rig.hand.setColorAt(i * 2 + k, col.set(skinC)); this.rig.thigh.setColorAt(i * 2 + k, col.set(pant)); this.rig.shin.setColorAt(i * 2 + k, col.set(pant));
      }
      this.people.push(p);
    }
  }
  update(dt, t) {
    const T = this.T; this._t = t;
    for (const c of this.vehicles) {
      const town = c.s < T.townR + 2 ? .55 : 1;   // slow down in town
      const ds = c.v * town * dt; c.s += c.dir * ds;
      if (c.s > c.L - 1) { c.s = c.L - 1; c.dir = -1; } else if (c.s < 1) { c.s = 1; c.dir = 1; }
      const p = along(c.road, c.s), lane = .5 * c.dir;   // drive on the right
      const x = p.x - p.dz * lane, z = p.z + p.dx * lane, dx = p.dx * c.dir, dz = p.dz * c.dir;
      c.g.position.set(x, (walkY(T, x, z) ?? T.H(x, z)) + .01, z);
      c.g.rotation.y = Math.atan2(-dz, dx);
      if (c.horse) c.horse.update(ds, t, dt);
      for (const w of c.g.userData.wheels || []) w.g.rotation.z -= ds / w.r;   // roll: angle = distance / radius
    }
    if (this.civ) for (const p of this.civ) {   // Blender townsfolk: same routes, real walk cycle
      let x, z, yaw, moving = true;
      if (p.wait > 0) { p.wait -= dt; moving = false; }
      if (p.road) {
        if (moving) { p.s += p.dir * p.v * dt; if (p.s > p.L || p.s < 2) { p.dir *= -1; p.s = Math.max(2, Math.min(p.L, p.s)); } if (Math.random() < dt * .08) p.wait = 1.5 + Math.random() * 3; }
        const q = along(p.road, p.s), off = 1.3 * p.side;
        x = q.x - q.dz * off; z = q.z + q.dx * off; yaw = Math.atan2(q.dx * p.dir, q.dz * p.dir);
      } else {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d < .08) { if (Math.random() < dt * .4) { const a = Math.random() * 6.3, r = 1.2 + Math.random() * 2.4; p.tx = Math.cos(a) * r; p.tz = Math.sin(a) * r; } moving = false; }
        else if (moving) { const st = Math.min(d, p.v * dt); p.x += dx / d * st; p.z += dz / d * st; }
        if (d >= .08) { const want = Math.atan2(dx, dz); p.yaw = (p.yaw ?? want) + Math.atan2(Math.sin(want - (p.yaw ?? want)), Math.cos(want - (p.yaw ?? want))) * Math.min(1, dt * 6); }
        x = p.x; z = p.z; yaw = p.yaw || 0;
      }
      let y = walkY(T, x, z);
      if (y === null) {   // the path ran into water: turn back and stay on the last dry spot
        if (p.road) { if (p.dry != null) { p.dir *= -1; p.s = p.dry; } else p.s = 2 + Math.random() * (p.L - 2); }   // (started in water: try elsewhere)
        else { p.tx = p.x = p.h.g.position.x; p.tz = p.z = p.h.g.position.z; }
        x = p.h.g.position.x; z = p.h.g.position.z; y = p.h.g.position.y;
      }
      else if (p.road) p.dry = p.s;
      p.h.g.position.set(x, y, z); p.h.g.rotation.y = yaw;
      p.h.play(moving ? 'walk' : 'idle', dt, moving ? p.v / (.36 * p.size) : 1);
    }
    if (!this.people.length) return;
    const R = this.rig, M = this._m || (this._m = { root: new THREE.Matrix4(), hip: new THREE.Matrix4(), tmp: new THREE.Matrix4(), j: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3() });
    // joint = parent * translate(x,y,z) * rotate(rx,ry,rz)
    const joint = (out, parent, x, y, z, rx, ry = 0, rz = 0) => { M.q.setFromEuler(M.e.set(rx, ry, rz)); M.tmp.compose(M.v.set(x, y, z), M.q, M.s.set(1, 1, 1)); return out.multiplyMatrices(parent, M.tmp); };
    const sh = new THREE.Matrix4(), el = new THREE.Matrix4(), th = new THREE.Matrix4(), kn = new THREE.Matrix4(), nk = new THREE.Matrix4();
    this.people.forEach((p, i) => {
      let x, z, yaw, moving = true, dist = 0;
      if (p.wait > 0) { p.wait -= dt; moving = false; }
      if (p.road) {
        if (moving) { dist = p.v * dt; p.s += p.dir * dist; if (p.s > p.L || p.s < 2) { p.dir *= -1; p.s = Math.max(2, Math.min(p.L, p.s)); } if (Math.random() < dt * .08) p.wait = 1.5 + Math.random() * 3; }
        const q = along(p.road, p.s), off = 1.3 * p.side;
        x = q.x - q.dz * off; z = q.z + q.dx * off; yaw = Math.atan2(q.dx * p.dir, q.dz * p.dir);
      } else {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        if (d < .08) { if (Math.random() < dt * .4) { const a = Math.random() * 6.3, r = 1.2 + Math.random() * 2.4; p.tx = Math.cos(a) * r; p.tz = Math.sin(a) * r; } moving = false; }
        else if (moving) { dist = Math.min(d, p.v * dt); p.x += dx / d * dist; p.z += dz / d * dist; }
        if (d >= .08) { const want = Math.atan2(dx, dz); p.yaw = (p.yaw ?? want) + Math.atan2(Math.sin(want - (p.yaw ?? want)), Math.cos(want - (p.yaw ?? want))) * Math.min(1, dt * 6); }
        x = p.x; z = p.z; yaw = p.yaw || 0;
      }
      // walk cycle driven by distance travelled, so the feet do not slide (one stride ≈ 0.16 world units at size 1)
      p.step += dist / (.16 * p.size) * Math.PI;
      const w = moving ? Math.min(1, (p.blend = Math.min(1, (p.blend || 0) + dt * 4))) : (p.blend = Math.max(0, (p.blend || 0) - dt * 4));
      const f = p.step, sF = Math.sin(f), cF = Math.cos(f);
      const legL = -sF * .55 * w, legR = sF * .55 * w;
      const kneeL = (.08 + .85 * Math.max(0, cF)) * w, kneeR = (.08 + .85 * Math.max(0, -cF)) * w;
      const breathe = Math.sin(this._t * 1.6 + p.ph) * .004;
      const bob = Math.abs(cF) * .012 * w + breathe;
      M.q.setFromEuler(M.e.set(0, yaw, 0)); M.root.compose(M.v.set(x, T.H(x, z), z), M.q, M.s.set(p.size, p.size, p.size));
      joint(M.hip, M.root, 0, .205 + bob, 0, .07 * w, sF * .12 * w, 0);   // pelvis: lean forward and twist with the stride
      R.torso.setMatrixAt(i, M.hip);
      const look = (1 - w) * Math.sin(this._t * .45 + p.look) * .5;
      joint(nk, M.hip, 0, .215, 0, -.05 * w, -sF * .12 * w + look, 0);
      R.head.setMatrixAt(i, nk); R.hat.setMatrixAt(i, nk); R.eyes.setMatrixAt(i, nk);
      for (const k of [0, 1]) {
        const sg = k ? 1 : -1, arm = (k ? -sF : sF) * .5 * w, idleOut = (1 - w) * .08;
        joint(sh, M.hip, sg * .088, .17, 0, arm, 0, sg * (.12 + idleOut));
        R.upper.setMatrixAt(i * 2 + k, sh);
        joint(el, sh, 0, -.085, 0, -(.25 + Math.max(0, -arm) * .6), 0, 0);
        R.lower.setMatrixAt(i * 2 + k, el); R.hand.setMatrixAt(i * 2 + k, el);
        joint(th, M.hip, sg * .04, 0, 0, k ? legR : legL, 0, 0);
        R.thigh.setMatrixAt(i * 2 + k, th);
        joint(kn, th, 0, -.1, 0, k ? kneeR : kneeL, 0, 0);
        R.shin.setMatrixAt(i * 2 + k, kn); R.foot.setMatrixAt(i * 2 + k, kn);
      }
    });
    for (const m of Object.values(R)) m.instanceMatrix.needsUpdate = true;
  }
}
