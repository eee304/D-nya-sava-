// Splits every country into provinces: balanced Voronoi cells (k-means seeded, deterministic per country)
// clipped to the country outline. Large islands become their own provinces, small ones join the nearest.
// Rings are in the map's shape space [x, y] (scene z = -y), the same space the extruded meshes use.
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';
import { hashStr, makeRng } from '../region/noise.js';
import { area, pointInRing } from './geo.js';

const DIRS = ['Doğu', 'Kuzeydoğu', 'Kuzey', 'Kuzeybatı', 'Batı', 'Güneybatı', 'Güney', 'Güneydoğu'];

// Douglas–Peucker on a closed ring (only used for clipping; keeps the cells cheap to compute)
function simplify(ring, tol) {
  if (ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = ring[a], [bx, by] = ring[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let md = -1, mi = 0;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) { const n = ring.length; return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
const bboxOf = ring => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
const closed = r => (r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) ? r : [...r, r[0]];

// polys: countryPolys(feature) result ([[ring]...]); capital: [x, z] in scene space (or null)
export function splitCountry(name, polys, capital) {
  const rng = makeRng(hashStr('prov|' + name));
  const pieces = polys.map(p => ({ ring: p[0], a: Math.abs(area(p[0])) })).filter(p => p.a > 0).sort((a, b) => b.a - a.a);
  if (!pieces.length) return [];
  const main = pieces[0];
  const n = Math.max(1, Math.min(10, Math.round(Math.sqrt(main.a) / 5)));
  let cells = [];
  if (n > 1) {
    const pin = capital && pointInRing(capital[0], -capital[1], main.ring) ? [capital[0], -capital[1]] : null;
    try { cells = voronoiSplit(main.ring, n, rng, pin); } catch (e) { cells = []; }
    const covered = cells.reduce((s, c) => s + c.reduce((t, r) => t + Math.abs(area(r)), 0), 0);
    if (cells.length < 2 || covered < main.a * .9) cells = [];   // clipping went wrong: keep the country whole
  }
  if (!cells.length) cells = [[main.ring]];
  const provs = cells.map(rs => ({ rings: rs.slice(), c: centroid(rs[0]), a: rs.reduce((t, r) => t + Math.abs(area(r)), 0) }));
  // islands: big ones are provinces of their own, small ones join the nearest province
  for (const p of pieces.slice(1)) {
    const c = centroid(p.ring);
    if (p.a > 25 && provs.length < 14) provs.push({ rings: [p.ring], c, a: p.a, island: true });
    else {
      let best = provs[0], bd = 1e9;
      for (const q of provs) { const d = Math.hypot(q.c[0] - c[0], q.c[1] - c[1]); if (d < bd) { bd = d; best = q; } }
      best.rings.push(p.ring);
    }
  }
  // which province holds the capital
  let capIdx = 0;
  if (capital) {
    const cap = [capital[0], -capital[1]];
    const inside = provs.findIndex(p => p.rings.some(r => pointInRing(cap[0], cap[1], r)));
    if (inside >= 0) capIdx = inside;
    else { let bd = 1e9; provs.forEach((p, i) => { const d = Math.hypot(p.c[0] - cap[0], p.c[1] - cap[1]); if (d < bd) { bd = d; capIdx = i; } }); }
  }
  // names from the compass direction relative to the capital province
  const cc = provs[capIdx].c, used = {};
  return provs.map((p, i) => {
    let label;
    if (i === capIdx) label = 'Başkent';
    else {
      const ang = Math.atan2(p.c[1] - cc[1], p.c[0] - cc[0]);
      label = (p.island ? 'Ada · ' : '') + DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
    }
    used[label] = (used[label] || 0) + 1;
    if (used[label] > 1) label += ' ' + ['', '', 'II', 'III', 'IV', 'V', 'VI'][used[label]];
    return {
      id: name + '#' + i, country: name, idx: i, label, name: name + ' · ' + label, capital: i === capIdx,
      rings: p.rings, ringsXZ: p.rings.map(r => r.map(q => [q[0], -q[1]])), bboxes: p.rings.map(r => { const b = bboxOf(r); return [b[0], -b[3], b[2], -b[1]]; }),
      center: [p.c[0], -p.c[1]], area: p.a,
    };
  });
}

// real geographic regions (scripts/build-regions.mjs): list = [{ label, polys:[[ring], ...] }] in map shape space
export function provincesFromRegions(name, list, capital) {
  const provs = list.map(r => {
    const rings = r.polys.map(p => p[0]).filter(q => q && q.length > 3 && Math.abs(area(q)) > .05);
    if (!rings.length) return null;
    const big = rings.reduce((a, b) => Math.abs(area(b)) > Math.abs(area(a)) ? b : a);
    return { rings, c: centroid(big), a: rings.reduce((t, q) => t + Math.abs(area(q)), 0), label: r.label };
  }).filter(Boolean);
  if (provs.length < 2) return null;
  let capIdx = 0;
  if (capital) {
    const cap = [capital[0], -capital[1]];
    const inside = provs.findIndex(p => p.rings.some(r => pointInRing(cap[0], cap[1], r)));
    if (inside >= 0) capIdx = inside;
    else { let bd = 1e9; provs.forEach((p, i) => { const d = Math.hypot(p.c[0] - cap[0], p.c[1] - cap[1]); if (d < bd) { bd = d; capIdx = i; } }); }
  }
  return provs.map((p, i) => ({
    id: name + '#' + i, country: name, idx: i, label: p.label, name: name + ' · ' + p.label, capital: i === capIdx,
    rings: p.rings, ringsXZ: p.rings.map(r => r.map(q => [q[0], -q[1]])), bboxes: p.rings.map(r => { const b = bboxOf(r); return [b[0], -b[3], b[2], -b[1]]; }),
    center: [p.c[0], -p.c[1]], area: p.a,
  }));
}

// pin: a point that must stay the centre of its cell (the capital)
function voronoiSplit(ring, n, rng, pin) {
  const simple = closed(simplify(ring, .12));
  const [x0, y0, x1, y1] = bboxOf(simple);
  // sample points inside the outline, then k-means them into n balanced clusters
  const pts = [];
  for (let g = 0; g < n * 400 && pts.length < n * 60; g++) {
    const x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
    if (pointInRing(x, y, simple)) pts.push([x, y]);
  }
  if (pts.length < n * 4) return [];
  let seeds = pts.slice(0, n).map(p => p.slice());
  if (pin) seeds[0] = pin.slice();
  for (let it = 0; it < 6; it++) {
    const sum = seeds.map(() => [0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = 1e18;
      for (let i = 0; i < n; i++) { const d = (p[0] - seeds[i][0]) ** 2 + (p[1] - seeds[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2]++;
    }
    seeds = seeds.map((s, i) => (pin && i === 0) || !sum[i][2] ? s : [sum[i][0] / sum[i][2], sum[i][1] / sum[i][2]]);
  }
  const pad = Math.max(x1 - x0, y1 - y0) * .2 + 5;
  const vor = Delaunay.from(seeds).voronoi([x0 - pad, y0 - pad, x1 + pad, y1 + pad]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const cell = vor.cellPolygon(i); if (!cell) continue;
    const clipped = polygonClipping.intersection([simple], [cell.map(p => [p[0], p[1]])]);
    // a cell can fall apart into several pieces: all of them belong to this province, biggest first
    const rings = (clipped || []).map(poly => poly[0]).filter(r => r.length >= 4 && Math.abs(area(r)) > .02)
      .sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
    if (rings.length) out.push(rings);
  }
  return out;
}

// point (scene x, z) -> province, using the province index
export function makeProvinceIndex(list) {
  const byId = {}, byCountry = {};
  for (const p of list) { byId[p.id] = p; (byCountry[p.country] || (byCountry[p.country] = [])).push(p); }
  function at(x, z) {
    for (const p of list) for (let k = 0; k < p.ringsXZ.length; k++) {
      const b = p.bboxes[k]; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      if (pointInRing(x, z, p.ringsXZ[k])) return p;
    }
    return null;
  }
  return { list, byId, byCountry, at };
}
