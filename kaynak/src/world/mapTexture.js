// Painted world-map ground texture: climate belts, real deserts and forests, mountains, hillshade and grain.
// The canvas covers the projected map rectangle [0,W]x[0,H] (projection pixel space), north up.
import * as THREE from 'three';
import { clamp, sstep, fbm, vnoise, hash } from '../region/noise.js';
import { MTN } from '../data/terrain.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = {
  ice: hex('#eef3f6'), tundra: hex('#a9ad8c'), boreal: hex('#4f6b3c'), temperate: hex('#79994a'), subtrop: hex('#a9a25c'),
  tropic: hex('#4d8a36'), savanna: hex('#b9a45e'), sand: hex('#e3c88e'), ochre: hex('#c99a5a'), steppe: hex('#b7ad6a'), jungle: hex('#2f6a28'),
  rock: hex('#8d8273'), snow: hex('#f4f7f8'),
};
// [lon, lat, radiusLon, radiusLat]
const DESERTS = [[10, 22, 28, 9], [47, 23, 10, 7], [57, 31, 8, 4], [71, 27, 4, 3], [88, 40, 10, 3], [103, 42, 12, 4], [133, -25, 15, 8],
  [20, -24, 6, 5], [-70, -23, 2.5, 6], [-113, 34, 6, 5], [15, -20, 3, 6], [45, 8, 6, 4]];
// African savanna and Sahel: dry golden grass between the Sahara, the Congo forest and the Kalahari
const SAVANNAS = [[2, 12, 26, 4], [36, -4, 9, 10], [27, -14, 13, 6], [28, -27, 8, 4], [-8, 9, 8, 3], [44, 6, 8, 5], [16, -10, 5, 4]];
const STEPPES = [[65, 46, 18, 5], [-68, -44, 4, 7], [-102, 40, 7, 6], [100, 47, 12, 3], [35, 15, 25, 3], [134, -20, 18, 5]];
const FORESTS = [[-62, -5, 15, 9, 'jungle'], [22, 0, 11, 6, 'jungle'], [110, 1, 16, 8, 'jungle'], [140, -5, 6, 4, 'jungle'],
  [100, 61, 55, 7, 'boreal'], [-100, 56, 32, 7, 'boreal'], [25, 61, 14, 5, 'boreal'], [15, 49, 14, 5, 'temperate'],
  [-82, 40, 9, 8, 'temperate'], [-123, 47, 5, 6, 'boreal'], [128, 45, 8, 6, 'temperate'], [-50, -25, 6, 6, 'jungle']];

function blob(lon, lat, list) {
  let m = 0, kind = null;
  for (const [x, y, rx, ry, k] of list) {
    const dx = (lon - x) / rx, dy = (lat - y) / ry, d = dx * dx + dy * dy;
    if (d < 1.8) { const v = sstep(1.6, .35, d); if (v > m) { m = v; kind = k; } }
  }
  return [m, kind];
}

export function paintWorldTexture(projection, W, H) {
  // ---- 1) low-res climate + relief field
  const LW = 1024, LH = Math.round(LW * H / W);
  const field = new Float32Array(LW * LH * 3), height = new Float32Array(LW * LH), forest = new Float32Array(LW * LH);
  for (let r = 0; r < LH; r++) {
    const py = (r + .5) * H / LH;
    // Natural Earth: longitude is linear in x on each row, so invert two points per row
    const a = projection.invert([W * .25, py]), b = projection.invert([W * .75, py]);
    const lat = a ? a[1] : 0, lonA = a ? a[0] : -90, lonB = b ? b[0] : 90;
    for (let c = 0; c < LW; c++) {
      const px = (c + .5) * W / LW, lon = lonA + (lonB - lonA) * ((px - W * .25) / (W * .5)), al = Math.abs(lat);
      const n = fbm(lon * .09 + 3, lat * .09, 4), m = vnoise(lon * .35, lat * .35);
      let col;
      if (al > 66) col = mix(C.tundra, C.ice, sstep(64, 71, al));
      else if (al > 55) col = mix(C.boreal, C.tundra, sstep(57, 66, al));
      else if (al > 40) col = mix(C.temperate, C.boreal, sstep(47, 57, al));
      else if (al > 25) col = mix(C.subtrop, C.temperate, sstep(30, 42, al));
      else col = mix(C.tropic, C.subtrop, sstep(14, 27, al));
      const [st] = blob(lon, lat, STEPPES); col = mix(col, C.steppe, st * (.6 + .4 * n));
      const [sv] = blob(lon, lat, SAVANNAS); col = mix(col, mix(C.savanna, C.steppe, m * .6), sv * (.7 + .3 * n));
      const [de] = blob(lon, lat, DESERTS); col = mix(col, mix(C.sand, C.ochre, m * .8), clamp(de * (.75 + .5 * n), 0, 1));
      const [fo, fk] = blob(lon, lat, FORESTS);
      const fv = clamp(fo * (.55 + .7 * n), 0, 1) * (1 - de);
      if (fk) col = mix(col, fk === 'jungle' ? C.jungle : fk === 'boreal' ? C.boreal.map(v => v * .85) : C.temperate.map(v => v * .8), fv * .75);
      let mt = 0;
      for (const [x, y] of MTN) { const dx = lon - x, dy = lat - y; if (Math.abs(dx) < 9 && Math.abs(dy) < 9) mt = Math.max(mt, Math.exp(-(dx * dx + dy * dy) / 9)); }
      mt = clamp(mt * (.7 + .6 * n), 0, 1);
      col = mix(col, C.rock, sstep(.15, .7, mt) * .75);
      col = mix(col, C.snow, sstep(.7, .95, mt) * (al > 20 ? 1 : .6));
      if (lat < -62) col = C.ice;
      const i = r * LW + c;
      field[i * 3] = col[0]; field[i * 3 + 1] = col[1]; field[i * 3 + 2] = col[2];
      height[i] = n * 2 + mt * 6; forest[i] = fk ? fv : 0;
    }
  }
  // hillshade from the relief field (light from the north-west)
  const lo = document.createElement('canvas'); lo.width = LW; lo.height = LH;
  const lctx = lo.getContext('2d'), lim = lctx.createImageData(LW, LH);
  for (let r = 0; r < LH; r++) for (let c = 0; c < LW; c++) {
    const i = r * LW + c, hl = height[r * LW + Math.max(0, c - 1)], hu = height[Math.max(0, r - 1) * LW + c];
    const shade = clamp(1 + ((hl - height[i]) + (hu - height[i])) * .55, .7, 1.25);
    lim.data[i * 4] = field[i * 3] * shade; lim.data[i * 4 + 1] = field[i * 3 + 1] * shade; lim.data[i * 4 + 2] = field[i * 3 + 2] * shade; lim.data[i * 4 + 3] = 255;
  }
  lctx.putImageData(lim, 0, 0);

  // ---- 2) upscale, then add canopy dots and grain at full resolution
  const HW = 3072, HH = Math.round(HW * H / W);
  const cv = document.createElement('canvas'); cv.width = HW; cv.height = HH;
  const ctx = cv.getContext('2d', { willReadFrequently: true });   // CPU canvas: fast getImageData
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lo, 0, 0, HW, HH);
  let seed = 11; const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;
  for (let i = 0; i < 70000; i++) {
    const x = rnd() * HW, y = rnd() * HH, f = forest[Math.min(LH - 1, (y / HH * LH) | 0) * LW + Math.min(LW - 1, (x / HW * LW) | 0)];
    if (rnd() > f * .9) continue;
    const s = 1.2 + rnd() * 1.6;
    ctx.fillStyle = `rgba(${18 + rnd() * 20},${50 + rnd() * 30},${18 + rnd() * 15},.55)`; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,110,.18)'; ctx.beginPath(); ctx.arc(x - s * .3, y - s * .3, s * .45, 0, 7); ctx.fill();
  }
  const im = ctx.getImageData(0, 0, HW, HH), d = im.data;
  for (let y = 0, o = 0; y < HH; y++) for (let x = 0; x < HW; x++, o += 4) {
    const k = .93 + hash(x, y) * .14;
    d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
  }
  ctx.putImageData(im, 0, 0);
  return cv;
}

// small tiling grain multiplied over the land at close range so it never looks smeared
export function detailTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), im = c.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = vnoise(x / 16, y / 16, 16) * .45 + vnoise(x / 6, y / 6, 256 / 6 | 0) * .25 + hash(x, y) * .3, o = (y * S + x) * 4;
    im.data[o] = im.data[o + 1] = im.data[o + 2] = 90 + v * 140; im.data[o + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// land material: painted map + close-range grain; vertex colours darken the extruded cliff sides
export function landMaterial(map, detail) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .92, metalness: .02 });
  m.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detail };
    sh.fragmentShader = 'uniform sampler2D detailMap;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      // political map: the country's colour fills the land, the painted relief shows through as light and shade
      'vec4 tx = texture2D(map, vMapUv);\n' +
      '  float lum = dot(tx.rgb, vec3(.3, .59, .11));\n' +
      '  diffuseColor.rgb = mix(tx.rgb, diffuse * (.55 + .85 * lum), .58);   // Victoria-style: painted land shows through the colour\n' +
      '  if (vColor.r < .99) diffuseColor.rgb = diffuse * .55;   // cliff sides: a darker shade of the fill\n' +
      '  diffuseColor.rgb *= mix(.9, 1.08, texture2D(detailMap, vMapUv * vec2(420.0, 220.0)).r);');
  };
  m.customProgramCacheKey = () => 'mbr-land';
  return m;
}

// the same land look for ALL provinces in one mesh: each vertex carries its province's fill (tint) and hover glow (emis),
// so the whole world map is one draw call instead of thousands
export function landMaterialMerged(map, detail) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: .92, metalness: .02 });
  m.onBeforeCompile = sh => {
    sh.uniforms.detailMap = { value: detail };
    sh.vertexShader = 'attribute vec3 tint;\nattribute vec3 emis;\nvarying vec3 vTint;\nvarying vec3 vEmis;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTint = tint; vEmis = emis;');
    sh.fragmentShader = 'uniform sampler2D detailMap;\nvarying vec3 vTint;\nvarying vec3 vEmis;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      'vec4 tx = texture2D(map, vMapUv);\n' +
      '  float lum = dot(tx.rgb, vec3(.3, .59, .11));\n' +
      '  diffuseColor.rgb = mix(tx.rgb, vTint * (.55 + .85 * lum), .58);\n' +
      '  if (vColor.r < .99) diffuseColor.rgb = vTint * .55;\n' +
      '  diffuseColor.rgb *= mix(.9, 1.08, texture2D(detailMap, vMapUv * vec2(420.0, 220.0)).r);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEmis;');
  };
  m.customProgramCacheKey = () => 'mbr-land-merged';
  return m;
}
