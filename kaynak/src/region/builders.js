// Code-generated low-poly architecture for region views.
// Static parts are collected per colour and merged into one mesh each (few draw calls);
// animated parts (flags, windmill blades, ships) are returned separately.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texturedMaterial } from './textures.js';
import { PREFABS } from './prefabs.js';
import { prefabGroup } from './life.js';

export class Kit {
  constructor() { this.buckets = new Map(); this.mats = new Map(); this.smoke = []; }   // smoke: chimney tops in world space
  mat(c) {
    if (!this.mats.has(c)) this.mats.set(c, texturedMaterial(c));
    return this.mats.get(c);
  }
  M4(x, y, z, ry = 0, s = 1) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(s, s, s));
  }
  part(B, geo, c, lx, ly, lz, ry = 0, rx = 0, rz = 0) {
    const L = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const n = geo.index ? geo.toNonIndexed() : geo, g = new THREE.BufferGeometry();
    g.setAttribute('position', n.attributes.position.clone()); g.setAttribute('normal', n.attributes.normal.clone());
    g.applyMatrix4(B.clone().multiply(L));
    // painted-miniature look: every face gets a slightly different shade, like hand-painted brush strokes
    const cnt = g.attributes.position.count, col = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i += 3) { const v = .86 + Math.random() * .22; for (let k = 0; k < 3 && i + k < cnt; k++) col.set([v, v * (.99 + Math.random() * .02), v * .98], (i + k) * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.buckets.has(c)) this.buckets.set(c, []);
    this.buckets.get(c).push(g);
  }
  // a Blender model: every part goes through part(), recoloured by its role
  prefab(B, name, recolor = {}) {
    for (const p of PREFABS[name]) this.part(B, p.geo, recolor[p.role] || p.color, 0, 0, 0);
  }
  flush(parent) {
    for (const [c, arr] of this.buckets) {
      if (!this.paint) this.paint = new Map();
      if (!this.paint.has(c)) this.paint.set(c, texturedMaterial(c, { vertexColors: true }));
      const m = new THREE.Mesh(mergeGeometries(arr), this.paint.get(c));
      m.castShadow = true; m.receiveShadow = true; parent.add(m);
    }
    this.buckets.clear();
  }
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
export const cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);
const dome = (r, w = 16) => new THREE.SphereGeometry(r, w, Math.max(6, w / 2), 0, Math.PI * 2, 0, Math.PI / 2);
export function gable(w, d, h) {
  const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, h); sh.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2); return g;
}
export function hip(w, d, h) { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale(w / Math.SQRT2, h, d / Math.SQRT2); g.translate(0, h / 2, 0); return g; }
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

const WIN = '#33393f', DOOR = '#4a3426';
const PALETTE = {
  european: { walls: ['#e9dfc8', '#ddd0b0', '#e6d6b8', '#cdbd9c', '#efe7d6'], roofs: ['#a9472f', '#b85a3a', '#9c3f2c', '#8f4a33', '#6d5a50'] },
  islamic: { walls: ['#e8dcc0', '#dccaa4', '#efe6d2', '#d2bb92', '#e3d3b2'], roofs: ['#b98f5e', '#a9472f'] },
  eastasia: { walls: ['#e8e1d2', '#c9b79a', '#d8cdb8', '#a8865c'], roofs: ['#3e4652', '#4b5361', '#5a3d32', '#2f3a44'] },
  african: { walls: ['#b9875a', '#a87a4e', '#c49466', '#9c6e46'], roofs: ['#c9a960', '#b8964f', '#d2b56c'] },
  modern: { walls: ['#efe9dc', '#f1e3c6', '#ecd9c6', '#e8ebe6', '#f0dcc0', '#dfe8ec', '#f3eee4'], roofs: ['#5d6066', '#7a4a3a', '#4f545b', '#8a8f96'] },
};

// one dwelling; returns footprint radius
// ---- detailed parts shared by houses ----
// window with frame, sill, glass, glazing bars and (optionally) shutters, on the +z face at local (x, y, z)
function windowPart(K, B, x, y, z, w = .3, h = .36, shutters = null, face = 0) {
  const R = (lx, ly, lz) => face ? [z * face, ly, -lx * face] : [lx, ly, lz];   // face: rotate to the ±x side
  const ry = face ? face * Math.PI / 2 : 0;
  K.part(B, box(w + .08, h + .08, .03), '#efe8d8', ...R(x, y, z + .005), ry);
  K.part(B, box(w, h, .03), '#3e5468', ...R(x, y, z + .02), ry);
  K.part(B, box(.025, h, .035), '#efe8d8', ...R(x, y, z + .03), ry); K.part(B, box(w, .025, .035), '#efe8d8', ...R(x, y + h * .1, z + .03), ry);
  K.part(B, box(w + .14, .04, .1), '#cfc3aa', ...R(x, y - h / 2 - .05, z + .04), ry);
  if (shutters) for (const s of [-1, 1]) {
    K.part(B, box(w * .5, h + .04, .025), shutters, ...R(x + s * (w * .5 + w * .27), y, z + .015), ry);
    K.part(B, box(w * .42, .02, .03), '#00000022' === shutters ? shutters : shutters, ...R(x + s * (w * .5 + w * .27), y + h * .22, z + .03), ry);
  }
}
function doorPart(K, B, x, z, col, h = .62) {
  K.part(B, box(.42, h + .07, .04), '#cfc3aa', x, h / 2, z + .005);
  K.part(B, box(.34, h, .045), col, x, h / 2 - .01, z + .015);
  for (const yy of [.15, .42]) K.part(B, box(.34, .03, .05), '#2e2016', x, yy, z + .025);
  K.part(B, new THREE.SphereGeometry(.025, 6, 4), '#d6b04a', x + .11, h * .5, z + .05);
  K.part(B, box(.5, .06, .18), '#b9ad96', x, .03, z + .08);   // step
}
// pitched roof made of overlapping tile courses with overhang, ridge cap and gable ends
function tiledRoof(K, B, w, d, y0, rise, col, col2) {
  const half = d / 2 + .14, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half), rows = Math.max(4, Math.round(slope / .13));
  for (const s of [-1, 1]) for (let r = 0; r < rows; r++) {
    const t = (r + .5) / rows, zz = s * half * (1 - t), yy = y0 + rise * t;
    K.part(B, box(w + .26, .045, slope / rows + .045), r % 2 ? col : col2, 0, yy, zz, 0, s * ang);
  }
  K.part(B, new THREE.CylinderGeometry(.06, .06, w + .3, 6).rotateZ(Math.PI / 2), col2, 0, y0 + rise + .02, 0);
  // fascia boards under the eaves
  for (const s of [-1, 1]) K.part(B, box(w + .26, .06, .04), '#5e4630', 0, y0 - .03, s * (half - .02));
}
function gableWall(K, B, w, d, y0, rise, col) {
  for (const s of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, rise); sh.closePath();
    const g = new THREE.ShapeGeometry(sh); g.rotateY(Math.PI / 2 * s); K.part(B, g, col, s * w / 2, y0, 0);
  }
}
function chimney(K, B, x, y, z) {
  K.smoke.push(new THREE.Vector3(x, y + .5, z).applyMatrix4(B));
  K.part(B, box(.24, .7, .24), '#8f7e6c', x, y, z); K.part(B, box(.3, .07, .3), '#6f6256', x, y + .37, z);
  K.part(B, new THREE.CylinderGeometry(.05, .05, .12, 6), '#5a4f45', x - .05, y + .45, z); K.part(B, new THREE.CylinderGeometry(.05, .05, .1, 6), '#5a4f45', x + .06, y + .44, z);
}
const STONE = ['#a49a8a', '#948a7b', '#b2a896'];
const SHUTTERS = ['#4f6f4a', '#3f5a7a', '#7a3a2f', '#6b5a3a'];

// rural: villages get plain houses (no apartment blocks even in 2014)
export function house(K, x, y, z, rot, s, culture, era, rng, rural = false) {
  const B = K.M4(x, y, z, rot, s), v = rng();
  if (era === '2014' && culture !== 'african') {
    const P = PALETTE.modern, wc = pick(rng, P.walls);
    if (v < .45 && !rural) {   // apartment block: plinth, balconies, cornice, roof units
      const floors = 3 + Math.floor(rng() * 4), fh = .55, w = 2.2, d = 1.6;
      const apt = floors < 5 ? 'apt_4' : 'apt_6';
      if (K.hi && PREFABS[apt]) { K.prefab(B, apt, { wall: wc }); return 1.6 * s; }   // detailed Blender block
      K.part(B, box(w + .08, .3, d + .08), '#8d8a84', 0, -.1, 0);
      K.part(B, box(w, floors * fh, d), wc, 0, floors * fh / 2, 0);
      for (let f = 0; f < floors; f++) {
        K.part(B, box(w + .04, .04, d + .04), '#bdb8ae', 0, f * fh, 0);
        for (const sx of [-.7, 0, .7]) {
          windowPart(K, B, sx, .3 + f * fh, d / 2, .34, .26);
          if (f > 0 && sx !== 0) { K.part(B, box(.5, .05, .25), '#bdb8ae', sx, .12 + f * fh, d / 2 + .12); K.part(B, box(.5, .16, .02), '#5b6066', sx, .2 + f * fh, d / 2 + .24); }
        }
        for (const sz of [-.45, .45]) windowPart(K, B, sz, .3 + f * fh, w / 2, .3, .26, null, 1);
      }
      K.part(B, box(w + .12, .1, d + .12), '#8d8a84', 0, floors * fh + .05, 0);
      K.part(B, box(.5, .3, .4), '#9aa0a6', -.5, floors * fh + .25, -.2); K.part(B, new THREE.CylinderGeometry(.05, .05, .5, 6), '#7a8086', .6, floors * fh + .35, .3);
      doorPart(K, B, 0, d / 2, '#3c4a58');
      return 1.6 * s;
    }
    const w = 1.6, d = 1.3;   // detached house
    if (K.hi && PREFABS.house_2014 && culture !== 'islamic') { K.prefab(B, 'house_2014', { wall: wc, door: pick(rng, ['#3f5a7a', '#6b2f24', '#3f5a3a', '#2f3338']) }); return 1.2 * s; }
    K.part(B, box(w + .06, .16, d + .06), '#9a958c', 0, .02, 0);
    K.part(B, box(w, 1.0, d), wc, 0, .55, 0);
    if (culture === 'islamic') { K.part(B, box(w + .1, .1, d + .1), '#cfc8b8', 0, 1.1, 0); K.part(B, box(.5, .3, .5), '#8fa7b8', .4, 1.3, 0); K.part(B, box(w + .1, .14, .04), '#cfc8b8', 0, 1.2, d / 2 + .03); }
    else { tiledRoof(K, B, w, d, 1.05, .55, pick(rng, P.roofs), '#5d6066'); gableWall(K, B, w, d, 1.05, .55, wc); chimney(K, B, .45, 1.45, -.25); }
    doorPart(K, B, -.35, d / 2, '#5a3d28');
    windowPart(K, B, .35, .62, d / 2, .32, .32);
    windowPart(K, B, 0, .62, w / 2, .3, .3, null, 1);
    return 1.2 * s;
  }
  const P = PALETTE[culture] || PALETTE.european, wc = pick(rng, P.walls), rc = pick(rng, P.roofs);
  if (culture === 'african') {   // round hut: mud wall with a band, layered thatch, door frame
    const r = .7 + rng() * .2;
    K.part(B, cyl(r * 1.04, r * 1.08, .16, 14), '#8a5f3e', 0, .08, 0);
    K.part(B, cyl(r, r * 1.04, 1.1, 14), wc, 0, .65, 0);
    K.part(B, cyl(r * 1.01, r * 1.01, .07, 14), '#7a4f30', 0, .9, 0);
    for (let k = 0; k < 3; k++) K.part(B, cone(r * (1.5 - k * .32), .55, 14), k % 2 ? '#b8964f' : rc, 0, 1.35 + k * .32, 0);
    K.part(B, cyl(.05, .02, .3, 5), '#6b5236', 0, 2.25, 0);
    K.part(B, box(.36, .6, .05), '#2e2016', 0, .4, r * .98); K.part(B, box(.44, .06, .07), '#6b4a2e', 0, .72, r * .99);
    return r * 1.4 * s;
  }
  if (K.hi && PREFABS.house_ottoman && culture === 'islamic' && v < .7) {   // Ottoman konak with its cumba
    K.prefab(B, 'house_ottoman', { plaster: wc, tile: rc }); return 1.3 * s;
  }
  if (K.hi && PREFABS.house_eastasia && culture === 'eastasia' && v < .75) {
    K.prefab(B, 'house_eastasia', { plaster: wc }); return 1.3 * s;
  }
  if (K.hi && PREFABS.house_eu && culture === 'european' && v < .7) {   // detailed Blender house (region close-ups only)
    K.prefab(B, 'house_eu', { plaster: wc, tile: rc, tile_dark: rc, shutter: pick(rng, SHUTTERS), door: pick(rng, ['#6b2f24', '#3f5a3a', '#5a3d28', '#3f5a7a']) });
    return 1.25 * s;
  }
  const w = 1.7, d = 1.25;
  let wh = 1.0;
  // stone foundation
  K.part(B, box(w + .08, .28, d + .08), pick(rng, STONE), 0, -.1, 0);
  K.part(B, box(w, wh, d), wc, 0, wh / 2 + .04, 0);
  const sh = pick(rng, SHUTTERS);
  if (culture === 'islamic') {
    if (v < .3) {   // Ottoman house: timber bay (cumba) on the upper floor
      K.part(B, box(w + .2, .75, d + .25), v < .15 ? '#8a6a48' : wc, 0, wh + .41, 0);
      for (let k = -2; k <= 2; k++) K.part(B, box(.05, .75, .04), '#5e4630', k * (w + .2) / 4.4, wh + .41, (d + .25) / 2 + .01);
      K.part(B, box(.9, .55, .3), wc, 0, wh + .41, (d + .25) / 2 + .14); windowPart(K, B, 0, wh + .45, (d + .25) / 2 + .29, .5, .3);
      for (const k of [-1, 1]) K.part(B, box(.05, .3, .05), '#5e4630', k * .38, wh + .05, (d + .25) / 2 + .12, 0, k * .5);
      wh += .75; tiledRoof(K, B, w + .2, d + .25, wh + .04, .5, '#9c3f2c', '#86352a');
      gableWall(K, B, w + .2, d + .25, wh + .04, .5, wc);
    } else {   // flat roof with parapet and a small dome now and then
      K.part(B, box(w + .08, .12, d + .08), '#d8cdb5', 0, wh + .1, 0);
      for (const sx of [-1, 1]) K.part(B, box(.06, .14, d + .08), '#d8cdb5', sx * (w / 2 + .01), wh + .22, 0);
      if (v > .85) K.part(B, dome(.45, 12), '#d8cdb5', 0, wh + .16, 0);
      else K.part(B, cyl(.06, .06, .25, 6), '#6b5236', w * .3, wh + .3, -.2);
    }
    windowPart(K, B, -w * .28, .62, d / 2, .26, .34, sh);
    doorPart(K, B, w * .2, d / 2, '#6b4a2e', .58);
  } else if (culture === 'eastasia') {
    for (let k = -1; k <= 1; k++) K.part(B, box(.07, wh, .07), '#7a3328', k * w / 2, wh / 2 + .04, d / 2);
    K.part(B, box(w, .08, .06), '#7a3328', 0, wh, d / 2 + .02);
    K.part(B, hip(w + .8, d + .8, .26), rc, 0, wh + .04, 0); K.part(B, hip(w + .25, d + .25, .52), rc, 0, wh + .22, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.part(B, cone(.06, .18, 5), rc, sx * (w + .8) / 2, wh + .1, sz * (d + .8) / 2, 0, sz * .9, -sx * .9);
    K.part(B, box(.55, .42, .03), '#e8dcc0', -w * .25, .6, d / 2 + .01); for (let k = 0; k < 3; k++) K.part(B, box(.02, .42, .035), '#5a3d32', -w * .25 - .18 + k * .18, .6, d / 2 + .02);
    doorPart(K, B, w * .25, d / 2, '#5a3d32', .6);
  } else {   // European: timber framing on half the houses, tiled roof, chimney, shutters
    const timber = v < .45;
    if (timber) {
      for (let k = -2; k <= 2; k++) K.part(B, box(.06, wh, .03), '#4a3426', k * w / 4.2, wh / 2 + .04, d / 2 + .01);
      K.part(B, box(w, .06, .03), '#4a3426', 0, wh * .55, d / 2 + .015);
      for (const s2 of [-1, 1]) K.part(B, box(.05, wh * .6, .03), '#4a3426', s2 * w * .36, wh * .3 + .1, d / 2 + .02, 0, 0, s2 * .6);
    }
    if (v < .3) { K.part(B, box(w + .15, .7, d + .15), wc, 0, wh + .39, 0); if (timber) for (let k = -2; k <= 2; k++) K.part(B, box(.06, .7, .03), '#4a3426', k * (w + .15) / 4.2, wh + .39, (d + .15) / 2 + .01);
      for (const sx of [-.45, .45]) windowPart(K, B, sx, wh + .42, (d + .15) / 2, .26, .3, sh); wh += .7; }
    tiledRoof(K, B, w + .1, d + .1, wh + .04, .62, rc, pick(rng, ['#86352a', '#7a4433', '#a0523a']));
    gableWall(K, B, w + .1, d + .1, wh + .04, .62, wc);
    chimney(K, B, w * .3, wh + .55, -.18);
    windowPart(K, B, -w * .3, .6, d / 2, .28, .34, sh);
    windowPart(K, B, w * .3, .6, d / 2, .28, .34, sh);
    windowPart(K, B, 0, .6, w / 2, .26, .32, sh, 1);
    doorPart(K, B, 0, d / 2, pick(rng, ['#5a3d28', '#3f5a3a', '#6b2f24']));
  }
  return 1.15 * s;
}

// the town's signature building
export function landmark(K, x, y, z, rot, culture, era) {
  const B = K.M4(x, y, z, rot);
  if (culture === 'islamic') {
    const st = '#ebe3d0', lead = '#7c8792';
    K.part(B, box(5, 3, 5), st, 0, 1.0, 0); K.part(B, cyl(1.9, 1.9, .5, 16), st, 0, 2.75, 0);
    K.part(B, dome(1.95, 20), lead, 0, 3.0, 0); K.part(B, cone(.12, .7, 8), '#d6b04a', 0, 5.2, 0);
    for (const [a, b] of [[1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8]]) K.part(B, dome(.55, 12), lead, a, 2.5, b);
    K.part(B, box(5.6, 1.6, 2.2), st, 0, .3, 3.6); K.part(B, gable(5.8, 2.4, .5), lead, 0, 1.1, 3.6);
    for (const sx of [2.9, -2.9]) { K.part(B, cyl(.24, .3, 7.4, 10), st, sx, 3.0, -2.9); K.part(B, cyl(.42, .36, .16, 12), st, sx, 5.4, -2.9); K.part(B, cone(.27, 1.3, 10), lead, sx, 7.35, -2.9); }
    for (let k = 0; k < 4; k++) K.part(B, box(.3, .55, .05), WIN, -1.5 + k, 1.6, 2.51);
    return 4.6;
  }
  if (culture === 'eastasia') {
    const red = '#9a3328', roof = '#2f3a44';
    K.part(B, box(5.5, .6, 5.5), '#a8a092', 0, .1, 0);
    for (let i = 0; i < 5; i++) {
      const s = 3.4 - i * .5, y0 = .4 + i * 1.3;
      K.part(B, box(s, 1.0, s), i ? '#d9cdb5' : red, 0, y0 + .5, 0);
      K.part(B, hip(s + 1.3, s + 1.3, .45), roof, 0, y0 + 1.0, 0);
    }
    K.part(B, cyl(.06, .1, 1.6, 6), '#c9a24b', 0, 7.7, 0);
    return 3.6;
  }
  if (culture === 'african') {
    K.part(B, cyl(2.6, 2.7, 2.0, 16), '#a87a4e', 0, .6, 0); K.part(B, cone(3.6, 2.6, 16), '#c9a960', 0, 2.9, 0);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) K.part(B, cyl(.08, .1, 1.4, 5), '#6b4a2e', Math.cos(a) * 4.6, .5, Math.sin(a) * 4.6);
    return 4.8;
  }
  // european church: stone nave with buttresses and tall windows, tiled roof, bell tower with openings and spire
  const st = era === '2014' ? '#cfc8b8' : '#a59a86', rf = era === '2014' ? '#5b6470' : '#9c3f2c', rf2 = era === '2014' ? '#4f5660' : '#86352a';
  K.part(B, box(3.4, .3, 6.6), '#948a7b', 0, -.05, 0);
  K.part(B, box(3.2, 3.0, 6.4), st, 0, 1.5, 0);
  const BN = B.clone().multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));   // the nave's ridge runs front to back
  tiledRoof(K, BN, 6.4, 3.2, 3.0, 1.8, rf, rf2);
  gableWall(K, BN, 6.4, 3.2, 3.0, 1.8, st);
  for (const sz of [-2.2, -.75, .75, 2.2]) for (const sx of [-1, 1]) {
    K.part(B, box(.35, 2.4, .45), '#948a7b', sx * 1.75, 1.2, sz, 0, 0, sx * .06);                       // buttress
    K.part(B, box(.06, 1.4, .5), '#2f3e52', sx * 1.61, 1.75, sz + .73 > 3 ? sz - .73 : sz + .73);       // tall window
    K.part(B, cyl(.25, .25, .06, 10, 1).rotateZ(Math.PI / 2), '#2f3e52', sx * 1.61, 2.45, sz + .73 > 3 ? sz - .73 : sz + .73);
  }
  K.part(B, cyl(.55, .55, .08, 16).rotateX(Math.PI / 2), '#7a9ac8', 0, 2.35, 3.21); K.part(B, cyl(.62, .62, .06, 16).rotateX(Math.PI / 2), '#cfc3aa', 0, 2.35, 3.2);   // rose window
  K.part(B, box(.9, 1.5, .08), '#5a3d28', 0, .75, 3.22); K.part(B, cyl(.45, .45, .09, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), '#cfc3aa', 0, 1.5, 3.21);
  // bell tower
  K.part(B, box(2.1, 6.4, 2.1), st, 0, 3.2, -4.0);
  for (const y of [2.2, 4.4]) K.part(B, box(2.2, .14, 2.2), '#948a7b', 0, y, -4.0);
  for (const [sx, sz, ry] of [[0, -2.95, 0], [0, -5.05, 0], [1.05, -4, Math.PI / 2], [-1.05, -4, Math.PI / 2]]) {
    K.part(B, box(.5, .9, .1), '#1d2026', sx, 5.4, sz, ry); K.part(B, cyl(.25, .25, .1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(ry + Math.PI / 2), '#1d2026', sx, 5.85, sz);
  }
  K.part(B, box(2.3, .2, 2.3), '#948a7b', 0, 6.45, -4.0);
  K.part(B, hip(2.2, 2.2, 3.4), rf, 0, 6.5, -4.0);
  K.part(B, cyl(.04, .04, 1.0, 4), '#d6b04a', 0, 10.3, -4.0); K.part(B, box(.45, .05, .05), '#d6b04a', 0, 10.5, -4.0);
  K.part(B, cyl(.35, .35, .06, 14).rotateX(Math.PI / 2), '#f1ece0', 0, 4.9, -2.94); K.part(B, box(.03, .25, .02), '#1d2026', 0, 4.95, -2.9);   // clock
  return 4.6;
}

// East Asian castle pieces: battered ishigaki stone base, white plaster, dark tiled caps and yagura towers with flared eaves
function batter(w, h, d, kw, kd) {   // a box whose top is pulled in (sloping castle base)
  const g = box(w, h, d), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * kw); p.setZ(i, p.getZ(i) * kd); }
  g.computeVertexNormals(); return g;
}
const PLASTER = '#f1ece0', TIMBER = '#2b2725', TILE = '#3e4652', ISHI = '#9a958c';
function eave(K, B, w, y, h) {   // hip roof with a thin flared skirt and a ridge
  K.part(B, box(w * 1.12, .07, w * 1.12), TILE, 0, y + .02, 0); K.part(B, box(w * 1.04, .06, w * 1.04), TILE, 0, y + .1, 0);
  K.part(B, hip(w * .98, w * .98, h), TILE, 0, y + .1, 0);
}
function yagura(K, B, s) {
  K.part(B, batter(3.0 * s, 1.5, 3.0 * s, .8, .8), ISHI, 0, .45, 0);
  K.part(B, box(2.3 * s, .45, 2.3 * s), TIMBER, 0, 1.42, 0); K.part(B, box(2.3 * s, .9, 2.3 * s), PLASTER, 0, 2.1, 0);
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const o of [-.45, .45]) K.part(B, box(.28 * s, .3, .04), TIMBER, Math.sin(r) * 1.16 * s + Math.cos(r) * o * s, 2.15, Math.cos(r) * 1.16 * s - Math.sin(r) * o * s, r);   // slatted windows
  eave(K, B, 2.6 * s, 2.55, .55);
  K.part(B, box(1.5 * s, .75, 1.5 * s), PLASTER, 0, 3.15, 0); eave(K, B, 1.85 * s, 3.5, .75);
  for (const sx of [-.32, .32]) K.part(B, box(.08, .16, .1), '#d6b04a', sx * s, 4.2, 0);   // shachi on the ridge
}
export function wallSegment(K, x, y, z, ang, len, stone, culture) {
  const B = K.M4(x, y, z, -ang + Math.PI / 2);
  if (culture === 'eastasia') {
    K.part(B, batter(len, 1.25, 1.4, 1, .62), ISHI, 0, .2, 0);
    K.part(B, box(len, .25, .44), TIMBER, 0, .95, 0); K.part(B, box(len, .65, .4), PLASTER, 0, 1.4, 0);
    K.part(B, gable(len + .04, .78, .32), TILE, 0, 1.72, 0); K.part(B, box(len + .04, .05, .8), TILE, 0, 1.73, 0);
    for (const sz of [-1, 1]) K.part(B, box(.12, .14, .02), TIMBER, len * .2 * sz, 1.4, .21 * sz);   // sama loopholes
    return;
  }
  K.part(B, box(len, .4, .85), '#948a7b', 0, -.3, 0);
  K.part(B, box(len, 2.2, .7), stone, 0, .55, 0);
  K.part(B, box(len, .1, .82), '#948a7b', 0, 1.62, 0);
  K.part(B, box(len * .4, .36, .7), stone, -len * .25, 1.85, 0); K.part(B, box(len * .4, .36, .7), stone, len * .25, 1.85, 0);
}
export function tower(K, x, y, z, stone, roof, culture) {
  const B = K.M4(x, y, z);
  if (culture === 'eastasia') { yagura(K, K.M4(x, y, z, Math.atan2(x, z)), .85); return; }
  K.part(B, cyl(1.08, 1.2, .5, 14), '#948a7b', 0, -.1, 0);
  K.part(B, cyl(1.0, 1.08, 3.4, 14), stone, 0, 1.6, 0); K.part(B, cyl(1.18, 1.05, .35, 14), stone, 0, 3.35, 0);
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; K.part(B, box(.3, .3, .22), stone, Math.cos(a) * 1.08, 3.65, Math.sin(a) * 1.08, -a); }
  for (const a of [.4, 2.3, 4.2]) K.part(B, box(.08, .45, .1), '#1d2026', Math.cos(a) * 1.02, 2.0, Math.sin(a) * 1.02, -a);
  K.part(B, cone(1.3, 1.9, 14), roof, 0, 4.6, 0); K.part(B, cyl(.03, .03, .5, 4), '#5e4630', 0, 5.7, 0);
}
export function gateTower(K, x, y, z, stone, roof, culture) {
  const B = K.M4(x, y, z);
  if (culture === 'eastasia') { yagura(K, K.M4(x, y, z, Math.atan2(x, z)), .7); return; }
  K.part(B, box(1.6, 3.6, 1.6), stone, 0, .9, 0); K.part(B, hip(1.9, 1.9, 1.3), roof, 0, 2.7, 0);
}

export function barracks(K, x, y, z, rot, era) {
  const B = K.M4(x, y, z, rot);
  if (era === '2014') {
    K.part(B, box(7, .2, 6), '#7d7f78', 0, .05, 0);
    for (const sz of [-1.8, 1.8]) { K.part(B, box(6, 1.6, 2.2), '#6b7553', 0, .55, sz); K.part(B, cyl(1.1, 1.1, 6, 12, 1).rotateZ(Math.PI / 2), '#5a6448', 0, 1.35, sz); }
    return 4.2;
  }
  K.part(B, box(8, 2.0, 2.4), '#cbbd9e', 0, .4, -2.8); K.part(B, gable(8.3, 2.8, .9), '#7d3a2a', 0, 1.4, -2.8);
  K.part(B, box(2.4, 2.0, 5.6), '#cbbd9e', -2.8, .4, .8); K.part(B, gable(5.9, 2.8, .9).rotateY(Math.PI / 2), '#7d3a2a', -2.8, 1.4, .8);
  K.part(B, box(.4, 1.3, 5.6), '#a29a8a', 3.8, .25, .8); K.part(B, box(5.6, 1.3, .4), '#a29a8a', 1.0, .25, 3.6);
  for (let k = 0; k < 6; k++) K.part(B, box(.34, .42, .05), WIN, -3.2 + k * 1.3, .9, -1.59);
  for (let k = 0; k < 5; k++) K.part(B, box(.35, .35, .35), '#8a6a44', 1 + (k % 3) * .4, .18 + Math.floor(k / 3) * .36, 1.4);
  return 5.2;
}
export function mine(K, x, y, z, rot, rng) {
  const B = K.M4(x, y, z, rot);
  K.part(B, new THREE.DodecahedronGeometry(2.2, 0), '#8f877a', 0, .4, -1.6);
  K.part(B, box(.25, 1.6, .25), '#5a4330', -.7, .6, .6); K.part(B, box(.25, 1.6, .25), '#5a4330', .7, .6, .6); K.part(B, box(1.8, .25, .3), '#5a4330', 0, 1.45, .6);
  K.part(B, box(1.2, 1.3, .3), '#121212', 0, .55, .45);
  for (let k = 0; k < 7; k++) K.part(B, new THREE.IcosahedronGeometry(.28 + rng() * .15, 0), '#d8b04a', 1.4 + rng() * 1.2, .15, 1 + rng() * 1.2);
  for (let k = 0; k < 5; k++) K.part(B, new THREE.IcosahedronGeometry(.3 + rng() * .2, 0), '#565048', -1.6 - rng(), .15, 1 + rng() * 1.4);
  K.part(B, box(.9, .45, .6), '#6b5236', 2.2, .45, -.3);
  return 3;
}
export function bank(K, x, y, z, rot) {
  const B = K.M4(x, y, z, rot);
  K.part(B, box(4.4, .4, 3.2), '#cfd3d8', 0, .1, 0); K.part(B, box(3.8, 2.2, 2.6), '#e8ebee', 0, 1.2, -.1);
  for (let i = 0; i < 5; i++) K.part(B, cyl(.17, .17, 2.0, 10), '#f4f6f8', -1.6 + i * .8, 1.3, 1.35);
  K.part(B, gable(4.2, 3.1, .8).rotateY(Math.PI / 2), '#c9a14a', 0, 2.3, 0);
  return 2.6;
}
export function factory(K, x, y, z, rot, kind) {
  const B = K.M4(x, y, z, rot), body = kind === 'choco' ? '#6a3d1c' : '#6c757f', roof = kind === 'choco' ? '#caa15a' : '#454c55';
  K.part(B, box(5, 2.4, 3.4), body, 0, .9, 0);
  for (let i = 0; i < 3; i++) K.part(B, gable(1.7, 3.4, .7).rotateY(Math.PI / 2), roof, -1.7 + i * 1.7, 2.1, 0);
  if (kind === 'choco') for (const sx of [-1.6, 1.6]) K.part(B, cyl(.25, .32, 3.2, 10), '#7a4a22', sx, 2.6, -1.2);
  else { K.part(B, box(1.8, 1.5, .1), '#2b3038', 0, .75, 1.71); for (let i = 0; i < 3; i++) K.part(B, box(1.8, .1, .12), '#f1c40f', 0, .3 + i * .5, 1.73); }
  return 3.2;
}
export function farmhouse(K, x, y, z, rot) {
  const B = K.M4(x, y, z, rot);
  K.part(B, box(2.6, 1.6, 3.6), '#a8432e', 0, .5, 0); K.part(B, gable(3.8, 3.0, 1.2).rotateY(Math.PI / 2), '#5c2418', 0, 1.3, 0);
  K.part(B, box(1.2, 1.1, .05), '#3a2418', 0, .55, 1.81);
  K.part(B, cyl(.6, .6, 3.2, 12), '#c9c4b8', 2.2, 1.3, -.8); K.part(B, dome(.62, 12), '#8a8f96', 2.2, 2.9, -.8);
  return 2.8;
}
export function haystack(K, x, y, z) {
  const B = K.M4(x, y, z);
  K.part(B, cyl(.4, .45, .5, 10), '#d9b85a', 0, .25, 0); K.part(B, cone(.45, .5, 10), '#c9a54a', 0, .75, 0);
}
export function dock(K, sx, sz, dir, len) {
  const ry = Math.atan2(dir[0], dir[1]), cx = sx + dir[0] * (len / 2 - 1.5), cz = sz + dir[1] * (len / 2 - 1.5), B = K.M4(cx, 0, cz, ry);
  K.part(B, box(1.9, .2, len), '#8a6a48', 0, .42, 0);
  for (let k = -len / 2 + .5; k < len / 2; k += 1.5) for (const s of [-.85, .85]) K.part(B, cyl(.09, .09, 2.2, 6), '#5a4330', s, -.6, k);
  for (let k = 0; k < 4; k++) K.part(B, box(.45, .45, .45), '#7a5a3e', -.4 + (k % 2) * .5, .75, -len / 2 + 1 + Math.floor(k / 2) * .6);
}
export function bridge(K, p) {
  const B = K.M4(p.x, 0, p.z, Math.atan2(p.dx, p.dz)), L = 11;
  K.part(B, box(2.4, .3, L), '#a59a86', 0, .95, 0);
  for (const s of [-1.15, 1.15]) K.part(B, box(.18, .35, L), '#8e8472', s, 1.25, 0);
  for (const k of [-3, 0, 3]) K.part(B, box(2.6, 2.4, .8), '#9a9080', 0, -.3, k);
}

// ---- animated pieces ----
export function flagTexture(color, emblem) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 84; const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 128, 84);
  if (emblem) { x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(64, 42, 18, 0, 7); x.fill(); x.fillStyle = color; x.beginPath(); x.arc(64, 42, 11, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 76, 128, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeFlag(K, tex, size = 1, pole = 3) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(cyl(.04, .05, pole, 6), K.mat('#4a3a2a')); p.position.y = pole / 2; p.castShadow = true; g.add(p);
  const fg = new THREE.PlaneGeometry(1.1 * size, .72 * size, 12, 4); fg.translate(.55 * size, 0, 0);
  const m = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .8 }));
  m.position.y = pole - .4 * size; m.castShadow = true; g.add(m);
  return { group: g, mesh: m, base: fg.attributes.position.array.slice(), size };
}
export function makeWindmill(K, x, y, z) {
  const B = K.M4(x, y, z);
  K.part(B, cyl(.65, 1.0, 3.6, 10), '#e7dfcc', 0, 1.6, 0); K.part(B, box(.5, .8, .05), DOOR, 0, .4, .98);
  const cap = new THREE.Mesh(cone(.8, .9, 10), K.mat('#7d3a2a')); cap.position.set(x, y + 3.85, z); cap.castShadow = true;
  const hub = new THREE.Group(); hub.position.set(x + .62, y + 3.3, z + .62); hub.rotation.y = Math.PI / 4;
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(box(.42, 2.3, .04), K.mat('#e8e0cc')); b.position.y = 1.2; b.castShadow = true;
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(b); hub.add(arm);
  }
  return { cap, hub };
}
export function makeShip(K, era, team = '#c0392b') {
  if (PREFABS['ship_' + era]) return prefabGroup('ship_' + era, { team });   // Blender ship (blender/ships.py)
  const g = new THREE.Group(), hull = box(4.4, .9, 1.4), p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i); let zf = 1;
    if (x > .6) zf *= 1 - (x - .6) / 1.6 * .92; if (y < 0) zf *= .62;
    p.setZ(i, p.getZ(i) * zf); if (era !== '2014' && x < -1.9 && y > 0) p.setY(i, y + .25);
  }
  hull.computeVertexNormals();
  const hm = new THREE.Mesh(hull, K.mat(era === '2014' ? '#5b6470' : '#5e4129')); hm.position.y = .2; g.add(hm);
  if (era === '2014') {
    const sup = new THREE.Mesh(box(1.4, .9, 1.0), K.mat('#e5e7ea')); sup.position.set(-.8, 1.0, 0); g.add(sup);
    const mast = new THREE.Mesh(cyl(.05, .05, 1.2, 6), K.mat('#3a3f46')); mast.position.set(-.8, 1.9, 0); g.add(mast);
    const stripe = new THREE.Mesh(box(4.0, .1, 1.42), K.mat('#a83a32')); stripe.position.set(-.1, -.05, 0); g.add(stripe);
  } else {
    const stripe = new THREE.Mesh(box(3.2, .12, 1.42), K.mat('#d4b46a')); stripe.position.set(-.3, .45, 0); g.add(stripe);
    for (const [mx, h] of [[-.6, 4.2], [.9, 3.6]]) {
      const mast = new THREE.Mesh(cyl(.05, .07, h, 6), K.mat('#4a3426')); mast.position.set(mx, .6 + h / 2, 0); g.add(mast);
      for (const [sy, sw] of [[1.6, 1.9], [2.9, 1.5]]) { if (sy > h - .4) continue; const s = new THREE.Mesh(box(.06, 1.05, sw), K.mat('#f1ece0')); s.position.set(mx + .08, .6 + sy, 0); g.add(s); }
    }
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}

// ---- identity props: herds, fishing boats, pumpjacks ----
const C3 = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
// grazing animals as one instanced geometry (cow or sheep), facing +z
export function animalGeo(kind) {
  const S = (r, x, y, z, sx, sy, sz, c) => C3(new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(x, y, z), c);
  const L = (x, z, c, h = .26) => C3(new THREE.CylinderGeometry(.045, .04, h, 6).translate(x, h / 2, z), c);
  if (kind === 'sheep') return mergeGeometries([
    S(.26, 0, .42, 0, 1, .85, 1.35, '#efeae0'), S(.11, 0, .5, .36, 1, 1.1, 1.2, '#3a3430'),
    L(-.1, -.18, '#3a3430', .3), L(.1, -.18, '#3a3430', .3), L(-.1, .18, '#3a3430', .3), L(.1, .18, '#3a3430', .3),
  ]);
  return mergeGeometries([
    S(.3, 0, .55, 0, .9, .85, 1.55, '#f2efe8'), S(.17, .1, .62, -.1, 1, .8, 1.2, '#2b2724'), S(.14, -.12, .5, .2, 1, .8, 1.1, '#2b2724'),
    S(.15, 0, .62, .52, .9, 1, 1.25, '#f2efe8'), S(.07, 0, .56, .66, 1.2, .8, .8, '#e3a99a'),
    L(-.15, -.28, '#2b2724', .36), L(.15, -.28, '#2b2724', .36), L(-.15, .28, '#2b2724', .36), L(.15, .28, '#2b2724', .36),
  ]);
}
export const ANIMAL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
// small fishing boat with a cabin and a net boom (a Group, so it can bob)
export function fishingBoat(K) {
  if (PREFABS.boat_fishing) return prefabGroup('boat_fishing', { boathull: ['#2f6a8a', '#c8463a', '#3f8a5a', '#e8c33a'][Math.floor(Math.random() * 4)] });
  const g = new THREE.Group(), hull = new THREE.CylinderGeometry(.55, .4, 2.4, 10, 1, false, 0, Math.PI);
  hull.rotateZ(Math.PI / 2); hull.rotateX(Math.PI); hull.scale(1, .55, 1);
  const h = new THREE.Mesh(hull, K.mat('#2f6a8a')); h.position.y = .25; g.add(h);
  const deck = new THREE.Mesh(box(2.3, .06, .78), K.mat('#c9b48a')); deck.position.y = .26; g.add(deck);
  const cab = new THREE.Mesh(box(.6, .5, .6), K.mat('#f1ece0')); cab.position.set(-.45, .52, 0); g.add(cab);
  const roof = new THREE.Mesh(box(.7, .08, .7), K.mat('#b84a3a')); roof.position.set(-.45, .8, 0); g.add(roof);
  const mast = new THREE.Mesh(cyl(.03, .03, 1.3, 5), K.mat('#4a3426')); mast.position.set(.45, .9, 0); g.add(mast);
  const boom = new THREE.Mesh(cyl(.02, .02, 1.1, 5), K.mat('#4a3426')); boom.rotation.z = 1.1; boom.position.set(.75, 1.1, 0); g.add(boom);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// oil pumpjack: static base merged into K, the nodding beam returned for animation
export function pumpjack(K, x, y, z, rot) {
  const B = K.M4(x, y, z, rot);
  K.part(B, box(2.6, .25, .9), '#5b6066', 0, .12, 0);
  K.part(B, box(.12, 1.6, .12), '#3d4248', -.1, .9, .25, 0, 0, .18); K.part(B, box(.12, 1.6, .12), '#3d4248', -.1, .9, -.25, 0, 0, .18);
  K.part(B, box(.12, 1.6, .12), '#3d4248', .25, .9, .25, 0, 0, -.18); K.part(B, box(.12, 1.6, .12), '#3d4248', .25, .9, -.25, 0, 0, -.18);
  K.part(B, box(.5, .5, .4), '#c9a227', -.95, .45, 0);
  K.part(B, cyl(.55, .55, 1.2, 14), '#d8dde2', 1.9, .6, 1.4); K.part(B, cyl(.56, .56, .08, 14), '#b84a3a', 1.9, 1.2, 1.4);
  const beam = new THREE.Group(); beam.position.set(x, y + 1.7, z); beam.rotation.y = rot;
  const bar = new THREE.Mesh(box(2.4, .16, .16), K.mat('#c9a227')); bar.castShadow = true; beam.add(bar);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .2, 12, 1, false, -Math.PI / 2, Math.PI), K.mat('#c9a227'));
  head.rotation.x = Math.PI / 2; head.position.x = 1.2; head.castShadow = true; beam.add(head);
  return beam;
}
