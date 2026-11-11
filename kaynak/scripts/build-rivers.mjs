// Natural Earth 1:10m rivers and lakes → public/data/rivers.json + lakes.json (small, game-ready)
//   node scripts/build-rivers.mjs <ne_10m_rivers_lake_centerlines.geojson> <ne_10m_lakes.geojson>
// Rivers: simplified, duplicates removed (the same river is often drawn twice along a border, or once per country
// under another name: Fırat / Euphrates / Al Furat) and pieces that meet end to end joined into one line.
// Lakes: simplified outer rings (+ holes); reservoirs are flagged (they only exist in 2014).
import fs from 'fs';
const [rivSrc, lakeSrc] = process.argv.slice(2);
const OUT = new URL('../public/data/', import.meta.url).pathname;

function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dm = 0, id = 0; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], L = Math.hypot(bx - ax, by - ay) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > dm) { dm = d; id = i; } }
  if (dm > eps) { const a = dp(pts.slice(0, id + 1), eps), b = dp(pts.slice(id), eps); return a.slice(0, -1).concat(b); }
  return [pts[0], pts[pts.length - 1]];
}
const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-12))); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
const r3 = v => Math.round(v * 1000) / 1000;

// ---- rivers
const rg = JSON.parse(fs.readFileSync(rivSrc));
let lines = [];
for (const f of rg.features) {
  const p = f.properties, g = f.geometry; if (!g || p.scalerank > 9) continue;
  if (p.featurecla !== 'River' && p.featurecla !== 'Lake Centerline') continue;
  for (const l of g.type === 'LineString' ? [g.coordinates] : g.coordinates) {
    // densify long segments first so the duplicate test sees the whole line
    const d = []; for (let i = 0; i < l.length; i++) { if (i) { const [ax, ay] = l[i - 1], [bx, by] = l[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) / .02); for (let k = 1; k < n; k++) d.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); } d.push(l[i]); }
    if (d.length > 1) lines.push({ n: p.name_en || p.name || '', r: p.scalerank, c: d });
  }
}
lines.sort((a, b) => a.r - b.r || b.c.length - a.c.length);   // big rivers claim their course first
// duplicates: points lying on an already accepted river (within ~3 km) are dropped; one point is kept at each end of a
// dropped stretch so tributaries still meet the main river
const CELL = .1, grid = new Map(), key = (x, y) => Math.floor(x / CELL) * 100000 + Math.floor(y / CELL);
const near = (x, y, eps) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const b = grid.get(key(x + i * CELL, y + j * CELL)); if (b) for (const s of b) if (segD(x, y, s[0], s[1], s[2], s[3]) < eps) return true; } return false; };
const accept = c => { for (let i = 0; i < c.length - 1; i++) { const s = [c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]]; for (const k of new Set([key(s[0], s[1]), key(s[2], s[3]), key((s[0] + s[2]) / 2, (s[1] + s[3]) / 2)])) { let b = grid.get(k); if (!b) grid.set(k, b = []); b.push(s); } } };
const kept = []; let dropped = 0;
for (const L of lines) {
  const k0 = kept.length;
  const dup = L.c.map(([x, y]) => near(x, y, .03));
  let run = [];
  const flush = () => { if (run.length > 1) { kept.push({ n: L.n, r: L.r, c: run }); } run = []; };
  for (let i = 0; i < L.c.length; i++) {
    if (!dup[i]) { if (!run.length && i > 0) run.push(L.c[i - 1]); run.push(L.c[i]); }
    else { dropped++; if (run.length) { run.push(L.c[i]); flush(); } }
  }
  flush();
  for (let i = k0; i < kept.length; i++) accept(kept[i].c);   // (after the whole line: it never counts as its own duplicate)
}
// join pieces that meet end to end (same course, similar size) into long lines; where three or more ends meet it is a
// confluence and stays a junction
const EPS = .02;
let merged = 0;
for (let pass = 0; pass < 50; pass++) {
  const ends = [];
  kept.forEach((k, i) => { if (k) { ends.push([i, 0, k.c[0]]); ends.push([i, 1, k.c[k.c.length - 1]]); } });
  const eg = new Map(), ek = p => Math.floor(p[0] / EPS) + ',' + Math.floor(p[1] / EPS);
  for (const e of ends) { const q = ek(e[2]); if (!eg.has(q)) eg.set(q, []); eg.get(q).push(e); }
  const around = p => { const out = [], cx = Math.floor(p[0] / EPS), cy = Math.floor(p[1] / EPS); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const e of eg.get((cx + i) + ',' + (cy + j)) || []) if (Math.hypot(e[2][0] - p[0], e[2][1] - p[1]) < EPS) out.push(e); return out; };
  // does any line pass through this point (a tributary reaching the middle of a river)?
  let did = 0; const used = new Set();
  for (const e of ends) {
    const [i, ei] = e; if (!kept[i] || used.has(i)) continue;
    const m = around(e[2]); if (m.length !== 2) continue;
    const o = m.find(x => x[0] !== i); if (!o || used.has(o[0]) || !kept[o[0]]) continue;
    const j = o[0], ej = o[1]; if (Math.abs(kept[i].r - kept[j].r) > 2) continue;
    let a = kept[i].c, b = kept[j].c; if (ei === 0) a = a.slice().reverse(); if (ej === 1) b = b.slice().reverse();
    kept[i] = { n: kept[i].n || kept[j].n, r: Math.min(kept[i].r, kept[j].r), c: a.concat(b.slice(1)) }; kept[j] = null;
    used.add(i); used.add(j); merged++; did++;
  }
  if (!did) break;
}
const rivers = kept.filter(Boolean).map(k => ({ n: k.n, r: k.r, c: dp(k.c, .012).map(([x, y]) => [r3(x), r3(y)]) }));
fs.writeFileSync(OUT + 'rivers.json', JSON.stringify(rivers));
console.log('rivers', lines.length, '→', rivers.length, 'pieces; duplicate points dropped', dropped, '; joins', merged, '; bytes', fs.statSync(OUT + 'rivers.json').size);

// ---- lakes
const lg = JSON.parse(fs.readFileSync(lakeSrc)), lakes = [];
for (const f of lg.features) {
  const p = f.properties, g = f.geometry; if (!g || p.scalerank > 8) continue;
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    // (a closed ring has the same first and last point: simplify its two halves separately)
    const dpRing = r => { const h = Math.floor(r.length / 2); return dp(r.slice(0, h + 1), .008).concat(dp(r.slice(h), .008).slice(1)); };
    const rings = poly.map(r => dpRing(r).map(([x, y]) => [r3(x), r3(y)])).filter(r => r.length >= 4);
    if (!rings.length) continue;
    let a = 0; const o = rings[0]; for (let i = 0, j = o.length - 1; i < o.length; j = i++) a += (o[j][0] + o[i][0]) * (o[j][1] - o[i][1]);
    if (Math.abs(a / 2) < .0015) continue;   // tiny ponds
    lakes.push({ n: p.name || '', r: p.scalerank, res: p.featurecla === 'Reservoir' ? 1 : 0, p: rings });
  }
}
fs.writeFileSync(OUT + 'lakes.json', JSON.stringify(lakes));
console.log('lakes', lakes.length, 'reservoirs', lakes.filter(l => l.res).length, 'bytes', fs.statSync(OUT + 'lakes.json').size);
