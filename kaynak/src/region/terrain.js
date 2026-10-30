// Region terrain: layout (coast, mountains, river, roads, fields), heightfield and painted ground texture.
import * as THREE from 'three';
import { clamp, lerp, sstep, hash, vnoise, fbm, segD, polyD, polyLen, along } from './noise.js';

// the playable square: big enough to build a whole province (was 110 units)
export const SIZE = 200, HALF = SIZE / 2, N = 401, STEP = SIZE / (N - 1);
export const AREA = (SIZE / 110) ** 2;   // density scale for things placed per area
const R2 = Math.SQRT1_2;
const norm = ([x, z]) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function buildTerrain(info, B, rng) {
  const so = rng() * 100;   // noise offset: different hills per country
  const coast = info.coast ? { d: norm(info.coast.dir), D: clamp(info.coast.dist, 22, HALF - 12) } : null;
  let mtn = info.mountains ? { d: norm(info.mountains.dir), D: clamp(info.mountains.dist, 16, HALF - 14) } : null;
  if (mtn && coast && mtn.d[0] * coast.d[0] + mtn.d[1] * coast.d[1] > .4) mtn = null;   // never put mountains in the sea
  const TOWN = [0, 0];
  const townR = 7 + (info.devLevel ?? 2) * 2.6;   // the settlement grows with the province's development

  const coastAt = (x, z) => coast ? (x * coast.d[0] + z * coast.d[1]) - (coast.D + (fbm(x * .05 + 40, z * .05 + 7, 3) - .5) * 16) : -1e9;

  // ---- river: meanders past the town, flows toward the sea when there is one
  let RIVER = null;
  if (B.river) {
    const flow = coast ? norm([coast.d[0] + (rng() - .5) * .9, coast.d[1] + (rng() - .5) * .9]) : norm([rng() - .5, rng() - .5]);
    const perp = [-flow[1], flow[0]], side = rng() < .5 ? 1 : -1, off = (14 + rng() * 8) * side, ph = rng() * 6;
    RIVER = [];
    for (let t = -SIZE; t <= SIZE; t += 6) {
      const w = Math.sin(t * .045 + ph) * 7 + (fbm(t * .03 + so, 3.3, 2) - .5) * 10;
      RIVER.push([flow[0] * t + perp[0] * (off + w), flow[1] * t + perp[1] * (off + w)]);
    }
  }

  // ---- four roads leave the town centre at right angles: a proper crossroads, straight through town, winding outside
  const ROADS = [];
  const a0 = rng() * Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a = a0 + i * Math.PI / 2, pts = [[TOWN[0], TOWN[1]]];
    let x = 0, z = 0, ang = a;
    for (let k = 0; k < Math.ceil(HALF / 8) + 3; k++) {
      if (k >= 2) ang += (rng() - .5) * .35;   // straight for the first 16 units
      x += Math.cos(ang) * 8; z += Math.sin(ang) * 8;
      if (Math.abs(x) > HALF + 3 || Math.abs(z) > HALF + 3 || coastAt(x, z) > -3) break;
      pts.push([x, z]);
    }
    if (pts.length > 2) ROADS.push(pts);
  }
  const roadDist = (x, z) => ROADS.length ? Math.min(...ROADS.map(r => polyD(r, x, z))) : 1e9;

  // ---- raw height
  const hilly = mtn ? 1 : .6 + rng() * .8;
  function Hraw(x, z) {
    let h = 1.0 + (fbm(x * .035 + so, z * .035 + 3) - .5) * 2.0 + Math.pow(fbm(x * .06 + 77 + so, z * .06 + 11, 3), 3) * 4 * hilly;
    if (B.dunes) h += (Math.sin(x * .32 + z * .18 + fbm(x * .05, z * .05, 2) * 7) * .5 + .5) * 1.3 * fbm(x * .02 + 9, z * .02, 2);
    if (mtn) { const v = x * mtn.d[0] + z * mtn.d[1], m = sstep(mtn.D - 12, mtn.D + 22, v); h += m * m * (4 + fbm(x * .09 + 5, z * .09 + 9) * 14); }
    h -= Math.max(0, coastAt(x, z) + 10) * .32;
    const td = Math.hypot(x - TOWN[0], z - TOWN[1]);
    h = lerp(h, 1.1, sstep(townR + 7, townR - 1, td));
    if (RIVER) { const rd = polyD(RIVER, x, z), w = 1.5; h = Math.min(h, lerp(-1.1, h, sstep(w, w + 3.5, rd))); }
    return h;
  }

  // ---- grids (heights + per-cell noise, sampled bilinearly afterwards)
  const HG = new Float32Array(N * N), FG = new Float32Array(N * N), GG = new Float32Array(N * N), RG = new Float32Array(N * N), CG = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = -HALF + ix * STEP, z = -HALF + iz * STEP, i = iz * N + ix;
    HG[i] = Hraw(x, z); FG[i] = fbm(x * .07 + 100 + so, z * .07 + 50, 3); GG[i] = fbm(x * .12 + 30, z * .12 + so, 3);
    RG[i] = RIVER ? polyD(RIVER, x, z) : 1e3; CG[i] = coastAt(x, z);
  }
  function samp(G, x, z) {
    const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return lerp(lerp(G[i], G[i + 1], tx), lerp(G[i + N], G[i + N + 1], tx), tz);
  }
  const H = (x, z) => samp(HG, x, z);
  const slope = (x, z) => Math.hypot(H(x + .5, z) - H(x - .5, z), H(x, z + .5) - H(x, z - .5));
  const riverDist = (x, z) => samp(RG, x, z);
  const forestAt = (x, z) => samp(FG, x, z);

  // ---- bridges where roads cross the river
  const BRIDGES = [];
  if (RIVER) for (const r of ROADS) {
    let best = 1e9, bp = null; const L = polyLen(r);
    for (let s = 0; s < L; s += .2) { const p = along(r, s); const dd = polyD(RIVER, p.x, p.z); if (dd < best) { best = dd; bp = p; } }
    if (best < 1.5 && H(bp.x, bp.z) < .6) BRIDGES.push(bp);
  }

  // ---- fields around the town
  const FIELDS = [];
  const fieldCount = info.biome === 'polar' ? 0 : Math.round(((info.biome === 'desert' ? 3 : 7) + ((info.devLevel ?? 2) <= 1 ? 3 : 0)) * 1.8);
  for (let i = 0; i < 900 && FIELDS.length < fieldCount; i++) {
    const a = rng() * Math.PI * 2, r = townR + 6 + rng() * 30, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 5 + rng() * 3, h = 4 + rng() * 3;
    if (Math.abs(x) > HALF - 7 || Math.abs(z) > HALF - 7 || H(x, z) < .5 || slope(x, z) > .5 || riverDist(x, z) < 4 || roadDist(x, z) < 4.5) continue;
    if (info.biome === 'desert' && RIVER == null && r > townR + 20) continue;
    if (FIELDS.some(f => Math.hypot(f[0] - x, f[1] - z) < 7.5)) continue;
    FIELDS.push([x, z, w, h, a + Math.PI / 2]);
  }
  const inField = (x, z, m = 0) => FIELDS.some(([fx, fz, w, h, r]) => {
    const dx = x - fx, dz = z - fz, c = Math.cos(-r), s = Math.sin(-r), lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < w / 2 + m && Math.abs(lz) < h / 2 + m;
  });

    // the same height and forest functions without the grid, for the countryside around the playable square
  const forestRaw = (x, z) => fbm(x * .07 + 100 + so, z * .07 + 50, 3);
  return { TOWN, townR, crossAng: a0, coast, mtn, RIVER, ROADS, BRIDGES, FIELDS, HG, FG, GG, RG, CG, H, slope, riverDist, forestAt, roadDist, inField, coastAt, samp, so, Hraw, forestRaw };
}

// Paint the ground texture: grass variety, forest floor, sand, rock, snow, fields, roads, plaza.
export function paintGround(T, B, info, patches, S = 1536) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), D = img.data;
  const G1 = hex(B.grass[0]), G2 = hex(B.grass[1]), G3 = hex(B.grass[2]), DRY = hex(B.dry), FF = hex(B.floor), SAND = hex(B.sand),
    WET = mixc(SAND, [90, 80, 60], .35), DEEP = hex(B.water).map(v => v * .55), FOAM = [232, 239, 230],
    ROCK1 = hex(B.rock[0]), ROCK2 = hex(B.rock[1]), SNOW = [238, 242, 244];
  const { H, samp, FG, GG, RG, CG } = T;
  for (let py = 0; py < S; py++) {
    const z = -HALF + (py + .5) / S * SIZE;
    for (let px = 0; px < S; px++) {
      const x = -HALF + (px + .5) / S * SIZE;
      const h = H(x, z), dn = vnoise(x * 1.7, z * 1.7), sp = hash(px, py);
      let c;
      if (h < .12) {
        c = mixc(WET, DEEP, clamp(-h / 1.6, 0, 1));
        c = mixc(c, FOAM, sstep(-.32, -.04, h) * .45 * (.6 + .4 * vnoise(x * 4, z * 4)));
      } else {
        const f = samp(FG, x, z), g = samp(GG, x, z), rd = samp(RG, x, z), cu = samp(CG, x, z);
        c = mixc(G1, G2, g); c = mixc(c, G3, sstep(.5, .8, dn) * .35); c = mixc(c, DRY, sstep(.42, .25, g) * .55);
        c = mixc(c, FF, sstep(B.forest - .01, B.forest + .07, f) * .75);
        if (B.dunes) c = mixc(c, mixc(SAND, DRY, vnoise(x * .4, z * .4)), .35 * (Math.sin(x * .32 + z * .18 + g * 7) * .5 + .5));
        c = mixc(c, SAND, Math.max(sstep(-14, -6, cu), sstep(5, 2.4, rd)) * sstep(1.05, .3, h));
        const sl = Math.hypot(H(x + .4, z) - H(x - .4, z), H(x, z + .4) - H(x, z - .4)) / .8 * .5;
        c = mixc(c, mixc(ROCK1, ROCK2, dn), Math.max(sstep(.5, .95, sl), sstep(5, 8.5, h)));
        if (B.snowy) c = mixc(c, SNOW, B.snowy * sstep(.45, .7, vnoise(x * .12 + 3, z * .12) * .7 + dn * .3));
        c = mixc(c, SNOW, sstep(B.snowAt, B.snowAt + 2.5, h));
      }
      const k = (.9 + sp * .16) * (.94 + .12 * vnoise(x * 6, z * 6)), o = (py * S + px) * 4;
      D[o] = c[0] * k; D[o + 1] = c[1] * k; D[o + 2] = c[2] * k; D[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.setTransform(S / SIZE, 0, 0, S / SIZE, S / 2, S / 2);   // draw in world units from here on
  let seed = 7; const rnd = () => (seed = seed * 48271 % 2147483647) / 2147483647;

  T.FIELDS.forEach(([x, z, w, h, r], i) => {
    ctx.save(); ctx.translate(x, z); ctx.rotate(r);
    ctx.fillStyle = ['#c3a24a', '#7f9a3c', '#b8933f', '#9aa646', '#c9ac57', '#8c8a3a', '#a9a248'][i % 7];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(70,55,25,.35)'; ctx.lineWidth = .09;
    for (let k = -w / 2 + .2; k < w / 2; k += .32) { ctx.beginPath(); ctx.moveTo(k, -h / 2 + .1); ctx.lineTo(k, h / 2 - .1); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(60,80,30,.8)'; ctx.lineWidth = .25; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  });
  for (const [x, z, r, a] of patches) {
    const g = ctx.createRadialGradient(x, z, 0, x, z, r); g.addColorStop(0, `rgba(120,98,66,${a})`); g.addColorStop(1, 'rgba(120,98,66,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, r, 0, 7); ctx.fill();
  }
  const modern = info.era === '2014';
  const paintSquare = () => {
  ctx.fillStyle = modern ? '#8f8c84' : '#b9aa8c'; ctx.beginPath(); ctx.arc(T.TOWN[0], T.TOWN[1], 3.8, 0, 7); ctx.fill();
  // cobbled square: rings of small rounded stones (modern: paving slabs)
  for (let r = .25; r < 3.7; r += .2) for (let a = 0; a < Math.PI * 2; a += .2 / r) {
    const x = T.TOWN[0] + Math.cos(a) * r, z = T.TOWN[1] + Math.sin(a) * r, v = 150 + rnd() * 50;
    ctx.fillStyle = `rgb(${v},${v * .95},${v * .86})`;
    if (modern) ctx.fillRect(x - .08, z - .08, .16, .16); else { ctx.beginPath(); ctx.ellipse(x, z, .085, .07, a, 0, 7); ctx.fill(); }
  }
  ctx.strokeStyle = 'rgba(80,70,55,.6)'; ctx.lineWidth = .14; ctx.beginPath(); ctx.arc(T.TOWN[0], T.TOWN[1], 3.8, 0, 7); ctx.stroke();
  };
  if (modern) paintSquare();   // old towns: the square is laid over the dirt roads further down
  // brush strokes in the grass so close-ups never look like flat paint
  for (let i = 0; i < 26000 * AREA; i++) {
    const x = (rnd() - .5) * SIZE, z = (rnd() - .5) * SIZE; if (T.H(x, z) < .3 || T.H(x, z) > B.snowAt) continue;
    ctx.strokeStyle = rnd() < .5 ? 'rgba(40,60,20,.16)' : 'rgba(230,240,180,.12)'; ctx.lineWidth = .05;
    const a = rnd() * 6.3, l = .12 + rnd() * .2; ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x + Math.cos(a) * l, z + Math.sin(a) * l); ctx.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const a = rnd() * 7, r = Math.sqrt(rnd()) * 3.6;
    ctx.fillStyle = `rgba(${80 + rnd() * 60},${70 + rnd() * 50},${55 + rnd() * 40},.3)`;
    ctx.fillRect(T.TOWN[0] + Math.cos(a) * r, T.TOWN[1] + Math.sin(a) * r, .14, .14);
  }
  const strokePath = (pts, jitter) => {
    const q = pts.map(p => [p[0] + (rnd() - .5) * jitter, p[1] + (rnd() - .5) * jitter]);
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < q.length - 1; i++) ctx.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
    ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]); ctx.stroke();
  };
  ctx.lineCap = ctx.lineJoin = 'round';
  // road from arc length s0 on (so markings stop before the junction)
  const from = (r, s0) => { const out = [[along(r, s0).x, along(r, s0).z]]; let acc = 0; for (let i = 1; i < r.length; i++) { acc += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); if (acc > s0) out.push(r[i]); } return out; };
  T.ROADS.forEach((r, i) => {
    const w = i % 2 ? 1.8 : 2.1;
    if (modern) {
      ctx.lineWidth = w + .5; ctx.strokeStyle = 'rgba(120,112,98,.6)'; strokePath(r, 0);
      ctx.lineWidth = w; ctx.strokeStyle = '#4b4b4d'; strokePath(r, 0);
      // kerbs, then the centre line starting after the crosswalk
      ctx.lineWidth = .06; ctx.strokeStyle = '#c9c4b8';
      for (const off of [-w / 2, w / 2]) strokePath(from(r, 2.2).map((p, k, a) => { const q = a[Math.min(k + 1, a.length - 1)], o = a[Math.max(k - 1, 0)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * off, p[1] + dx / l * off]; }), 0);
      ctx.lineWidth = .1; ctx.strokeStyle = '#e2d9b8'; ctx.setLineDash([.8, .8]); strokePath(from(r, 4.2), 0); ctx.setLineDash([]);
    } else {
      ['rgba(104,80,50,.5)', 'rgba(142,112,72,.75)', 'rgba(168,136,92,.6)', 'rgba(190,160,114,.35)'].forEach((st, k) => {
        ctx.lineWidth = w * (1 - .2 * k); ctx.strokeStyle = st; strokePath(r, .25);
      });
      // wheel ruts and pebbles along the dirt road
      ctx.lineWidth = .08; ctx.strokeStyle = 'rgba(90,68,42,.45)';
      for (const off of [-.32, .32]) strokePath(r.map((p, i) => { const q = r[Math.min(i + 1, r.length - 1)], o = r[Math.max(i - 1, 0)], dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * off, p[1] + dx / l * off]; }), 0);
    }
  });
  if (modern) {
    // asphalt junction box with a zebra crossing on every arm
    ctx.save(); ctx.translate(T.TOWN[0], T.TOWN[1]); ctx.rotate(T.crossAng);
    ctx.fillStyle = '#4b4b4d'; ctx.fillRect(-1.15, -1.15, 2.3, 2.3);
    ctx.fillStyle = '#ece7da';
    for (let arm = 0; arm < 4; arm++) { ctx.save(); ctx.rotate(arm * Math.PI / 2);
      for (let k = -4; k <= 4; k++) ctx.fillRect(1.45, k * .22 - .07, .55, .14);
      ctx.fillRect(2.15, -1.05, .08, 1.05);   // stop line on the incoming lane
      ctx.restore(); }
    ctx.restore();
  } else {
    paintSquare();   // the dirt roads end at the cobbled square: the crossroads sits inside it
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return cv;
}

// countryside beyond the playable square: a coarse continuation of the same land, so the region no longer floats
// as a slab in the void but runs on until the haze swallows it. Vertex-coloured; overlaps the square by one cell.
export function outerGround(T, B, R = 260, step = 2.5) {
  const n = Math.round(2 * R / step) + 1, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), idx = [];
  const G1 = hex(B.grass[0]), G2 = hex(B.grass[1]), DRY = hex(B.dry), FF = hex(B.floor), SAND = hex(B.sand),
    WET = mixc(SAND, [90, 80, 60], .35), DEEP = hex(B.water).map(v => v * .55), ROCK = hex(B.rock[0]), SNOW = [238, 242, 244];
  const inner = HALF - step;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = -R + ix * step, z = -R + iz * step, i = iz * n + ix;
    const inside = Math.abs(x) < HALF - .01 && Math.abs(z) < HALF - .01;
    const h = T.Hraw(x, z);
    pos.set([x, h - (inside ? .12 : .02), z], i * 3);
    let c;
    if (h < .12) c = mixc(WET, DEEP, clamp(-h / 1.6, 0, 1));
    else {
      const g = fbm(x * .12 + 30, z * .12 + T.so, 3), f = T.forestRaw(x, z), dn = vnoise(x * .3, z * .3);
      c = mixc(G1, G2, g); c = mixc(c, DRY, sstep(.42, .25, g) * .55);
      c = mixc(c, FF, sstep(B.forest - .01, B.forest + .07, f) * .8);
      c = mixc(c, SAND, Math.max(sstep(-14, -6, T.coastAt(x, z)), T.RIVER ? sstep(5, 2.4, polyD(T.RIVER, x, z)) : 0) * sstep(1.05, .3, h));
      const sl = Math.hypot(T.Hraw(x + 1, z) - T.Hraw(x - 1, z), T.Hraw(x, z + 1) - T.Hraw(x, z - 1)) / 2 * .5;
      c = mixc(c, ROCK, Math.max(sstep(.5, .95, sl), sstep(5, 8.5, h)));
      if (B.snowy) c = mixc(c, SNOW, B.snowy * sstep(.45, .7, dn));
      c = mixc(c, SNOW, sstep(B.snowAt, B.snowAt + 2.5, h));
      c = c.map(v => v * (.92 + dn * .14));
    }
    // vertex colours are linear: undo the sRGB of the painted palette so both grounds match
    col.set(c.map(v => Math.pow(v / 255, 2.2)), i * 3);
  }
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) {
    const x0 = -R + ix * step, z0 = -R + iz * step;
    if (x0 >= -inner && x0 + step <= inner && z0 >= -inner && z0 + step <= inner) continue;   // the square has its own ground
    const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// tileable water normal map
export function waterNormals(WN = 128) {
  const cv = document.createElement('canvas'); cv.width = cv.height = WN;
  const c = cv.getContext('2d'), im = c.createImageData(WN, WN);
  const hh = (x, y) => vnoise(x / WN * 8, y / WN * 8, 8) * .7 + vnoise(x / WN * 16, y / WN * 16, 16) * .3;
  for (let y = 0; y < WN; y++) for (let x = 0; x < WN; x++) {
    const dx = hh((x + 1) % WN, y) - hh((x + WN - 1) % WN, y), dy = hh(x, (y + 1) % WN) - hh(x, (y + WN - 1) % WN);
    const l = Math.hypot(dx * 6, dy * 6, 1), o = (y * WN + x) * 4;
    im.data[o] = (-dx * 6 / l * .5 + .5) * 255; im.data[o + 1] = (-dy * 6 / l * .5 + .5) * 255; im.data[o + 2] = (1 / l * .5 + .5) * 255; im.data[o + 3] = 255;
  }
  c.putImageData(im, 0, 0);
  return cv;
}

export { R2, segD };
