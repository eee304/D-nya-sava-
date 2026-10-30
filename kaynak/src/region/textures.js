// Hand-painted surface textures (stone brick, plaster, wood planks, roof tiles, rough stone), generated on canvases.
// They are applied triplanar in the model's own space, so the merged low-poly geometry needs no UVs.
// Every texture is a brightness pattern around 1.0 that multiplies the part's own colour.
import * as THREE from 'three';

const S = 256;
let seed = 99;
const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;
function canvas(fn) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.fillStyle = 'rgb(200,200,200)'; x.fillRect(0, 0, S, S); fn(x);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const grey = v => `rgb(${v},${v},${v})`;
function speckle(x, n, lo, hi, r = 1.6) { for (let i = 0; i < n; i++) { x.fillStyle = grey(lo + rnd() * (hi - lo)); x.globalAlpha = .35; x.beginPath(); x.arc(rnd() * S, rnd() * S, r * (.5 + rnd()), 0, 7); x.fill(); } x.globalAlpha = 1; }
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.fill(); }

const MAKERS = {
  // plaster: soft blotches, a few hairline cracks
  plaster: x => {
    speckle(x, 900, 180, 230, 6); speckle(x, 1500, 170, 225, 1.2);
    x.strokeStyle = grey(150); x.lineWidth = 1; x.globalAlpha = .5;
    for (let k = 0; k < 4; k++) { let a = rnd() * S, b = rnd() * S; x.beginPath(); x.moveTo(a, b); for (let i = 0; i < 6; i++) { a += (rnd() - .5) * 20; b += 6 + rnd() * 8; x.lineTo(a, b); } x.stroke(); }
    x.globalAlpha = 1;
  },
  // cut stone blocks in staggered courses with dark mortar
  brick: x => {
    x.fillStyle = grey(120); x.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows;
    for (let r = 0; r < rows; r++) { const w = S / (3 + (r % 2 ? 0 : 1)), off = r % 2 ? w / 2 : 0;
      for (let c = -1; c < 6; c++) { x.fillStyle = grey(180 + rnd() * 50); roundRect(x, c * w + off + 3, r * h + 3, w - 6, h - 6, 5); } }
    speckle(x, 1200, 150, 230, 1.3);
  },
  // rough fieldstone: irregular rounded stones
  stone: x => {
    x.fillStyle = grey(115); x.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { const r = 14 + rnd() * 18, a = rnd() * S, b = rnd() * S; x.fillStyle = grey(165 + rnd() * 60);
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { x.beginPath(); x.ellipse(a + dx, b + dy, r, r * (.65 + rnd() * .3), rnd() * 3, 0, 7); x.fill(); } }
    speckle(x, 900, 140, 230, 1.2);
  },
  // vertical planks with grain and nail heads
  wood: x => {
    const n = 5, w = S / n;
    for (let k = 0; k < n; k++) { x.fillStyle = grey(175 + rnd() * 45); x.fillRect(k * w, 0, w, S);
      x.strokeStyle = grey(140); x.globalAlpha = .45; x.lineWidth = 1;
      for (let g = 0; g < 7; g++) { const gx = k * w + 4 + rnd() * (w - 8); x.beginPath(); x.moveTo(gx, 0); x.bezierCurveTo(gx + 4, S * .3, gx - 4, S * .6, gx + 2, S); x.stroke(); }
      x.globalAlpha = 1; x.fillStyle = grey(95); x.fillRect(k * w, 0, 2, S);
      x.fillStyle = grey(110); for (const ny of [20, S - 20]) { x.beginPath(); x.arc(k * w + w / 2, ny, 2.2, 0, 7); x.fill(); } }
  },
  // overlapping clay tiles (scalloped rows)
  tile: x => {
    x.fillStyle = grey(140); x.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows, w = S / 6;
    for (let r = rows; r >= -1; r--) for (let c = -1; c < 7; c++) {
      const cx = c * w + (r % 2 ? w / 2 : 0), cy = r * h; x.fillStyle = grey(175 + rnd() * 50);
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + w, cy); x.lineTo(cx + w, cy + h * .7); x.quadraticCurveTo(cx + w / 2, cy + h * 1.25, cx, cy + h * .7); x.closePath(); x.fill();
      x.fillStyle = grey(225); x.globalAlpha = .3; x.fillRect(cx + 3, cy + 2, w * .25, h * .5); x.globalAlpha = 1;
    }
  },
};
const cache = {};
export function surfaceTexture(kind) { return cache[kind] || (cache[kind] = canvas(MAKERS[kind])); }

// which colours in the builders are which material
const SETS = {
  tile: ['#a9472f', '#b85a3a', '#9c3f2c', '#8f4a33', '#6d5a50', '#86352a', '#7a4433', '#a0523a', '#7d3a2a', '#5b6470', '#c85a3c', '#8a3a28', '#a8432e', '#5c2418', '#b84a3a'],
  plaster: ['#e9dfc8', '#ddd0b0', '#e6d6b8', '#cdbd9c', '#efe7d6', '#e8dcc0', '#dccaa4', '#efe6d2', '#d2bb92', '#e3d3b2', '#e8e1d2', '#c9b79a', '#d8cdb8', '#e4d7bb', '#efe6d2', '#cbbd9e', '#ebe3d0', '#d9d4c8', '#cfc6b2', '#e8ebee', '#d8cdb5', '#efe9dc', '#f1e3c6', '#ecd9c6', '#e8ebe6', '#f0dcc0', '#dfe8ec', '#f3eee4'],
  brick: ['#a39b8b', '#bba886', '#9d9583', '#8f8776', '#9a9080', '#a59a86', '#8e8472', '#9a8f80', '#a49a8a', '#948a7b', '#b2a896', '#8f7e6c', '#cfc8b8', '#cfd3d8', '#b9ad96'],
  wood: ['#5e4630', '#4a3426', '#8a6a48', '#6b5236', '#7a5a3e', '#5a4330', '#6b4a2e', '#5a3d28', '#7a3328', '#9b7b55', '#a08058', '#7a5634', '#c9b48a', '#4a3a2a'],
  stone: ['#8f877a', '#565048', '#9a958c', '#8d8679', '#b9875a', '#a87a4e', '#c49466', '#9c6e46', '#8a5f3e'],
};
const BY_COLOR = {}; for (const k in SETS) for (const c of SETS[k]) BY_COLOR[c.toLowerCase()] = k;
// world units per texture tile
const SCALE = { tile: 1.1, plaster: 2.2, brick: 1.6, wood: 1.0, stone: 1.8 };

// window panes light up warm in the evening: one shared uniform for every glass material
const GLASS = ['#3e5468', '#2f3e52', '#33393f'], GLOW = { value: 0 };
export function setWindowGlow(v) { GLOW.value = v; }

export function texturedMaterial(color, opts = {}) {
  const key = String(color).toLowerCase(), kind = BY_COLOR[key];
  const m = new THREE.MeshStandardMaterial({ color, roughness: .88, flatShading: true, ...opts });
  if (GLASS.includes(key)) {
    m.roughness = .35;
    m.onBeforeCompile = sh => {
      sh.uniforms.uGlow = GLOW;
      sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, .6, .28) * uGlow;');
    };
    m.customProgramCacheKey = () => 'glass' + (opts.vertexColors ? '-vc' : '');
    return m;
  }
  if (!kind) return m;
  const tex = surfaceTexture(kind), sc = 1 / SCALE[kind];
  m.onBeforeCompile = sh => {
    sh.uniforms.tSurf = { value: tex };
    sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n  vWP = transformed; vWN = normalize(objectNormal);   // object space: same texture scale on the big region and the tiny map models');
    sh.fragmentShader = 'uniform sampler2D tSurf; varying vec3 vWP; varying vec3 vWN;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
      vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec3 P = vWP * ${sc.toFixed(3)};
      float tex = texture2D(tSurf, P.zy).r * bw.x + texture2D(tSurf, P.xz).r * bw.y + texture2D(tSurf, P.xy).r * bw.z;
      diffuseColor.rgb *= .2 + tex * 1.05;`);
  };
  m.customProgramCacheKey = () => 'surf-' + kind + (opts.vertexColors ? '-vc' : '');
  return m;
}
