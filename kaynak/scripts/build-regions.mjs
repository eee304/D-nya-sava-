// Builds the playable regions of every country from real administrative borders (Natural Earth admin-1),
// grouped into geographic regions (official ones where they exist), then cut to each era's country outlines.
// Usage: node scripts/build-regions.mjs <ne_10m_admin_1_states_provinces.geojson>
// Output: public/data/regions-2014.json, public/data/regions-1810.json  { countryName: [{ n: name, p: MultiPolygon }] }
import fs from 'node:fs';
import pc from 'polygon-clipping';
import { feature } from 'topojson-client';

const ADM1 = process.argv[2];
if (!ADM1) { console.error('usage: node scripts/build-regions.mjs <admin1.geojson>'); process.exit(1); }

// Türkiye's seven official geographic regions
const TR = {
  'Marmara': ['Istanbul', 'Tekirdag', 'Edirne', 'Kirklareli', 'Çanakkale', 'Balikesir', 'Bursa', 'Bilecik', 'Kocaeli', 'Sakarya', 'Yalova'],
  'Ege': ['Izmir', 'Manisa', 'Aydin', 'Denizli', 'Mugla', 'Usak', 'Kütahya', 'Afyonkarahisar'],
  'Akdeniz': ['Antalya', 'Isparta', 'Burdur', 'Mersin', 'Adana', 'Hatay', 'Osmaniye', 'K. Maras'],
  'İç Anadolu': ['Ankara', 'Konya', 'Karaman', 'Aksaray', 'Nigde', 'Nevsehir', 'Kirsehir', 'Kinkkale', 'Yozgat', 'Kayseri', 'Sivas', 'Eskisehir', 'Çankiri'],
  'Karadeniz': ['Zinguldak', 'Bartın', 'Karabük', 'Kastamonu', 'Sinop', 'Samsun', 'Ordu', 'Giresun', 'Trabzon', 'Rize', 'Artvin', 'Gümüshane', 'Bayburt', 'Amasya', 'Tokat', 'Çorum', 'Bolu', 'Düzce'],
  'Doğu Anadolu': ['Erzurum', 'Erzincan', 'Kars', 'Ardahan', 'Agri', 'Iğdir', 'Van', 'Mus', 'Bitlis', 'Bingöl', 'Tunceli', 'Elazig', 'Malatya', 'Hakkari'],
  'Güneydoğu Anadolu': ['Gaziantep', 'Kilis', 'Adiyaman', 'Sanliurfa', 'Diyarbakir', 'Mardin', 'Batman', 'Siirt', 'Sirnak'],
};
// Brazil's five official regions (by ISO 3166-2 code)
const BR = { 'Norte': 'AC AP AM PA RO RR TO', 'Nordeste': 'AL BA CE MA PB PE PI RN SE', 'Centro-Oeste': 'DF GO MT MS', 'Sudeste': 'ES MG RJ SP', 'Sul': 'PR RS SC' };
const lookup = {};
for (const [r, ps] of Object.entries(TR)) for (const p of ps) lookup['TUR|' + p] = r;
for (const [r, cs] of Object.entries(BR)) for (const c of cs.split(' ')) lookup['BRA|BR-' + c] = r;

// ---- geometry helpers (planar lon/lat; good enough for grouping and thresholds)
function simplify(ring, tol) {
  if (ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  // closed ring: first and last point coincide, so split at the point farthest from the start
  let far = 1, fd = -1; for (let i = 1; i < ring.length - 1; i++) { const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[far] = 1;
  const stack = [[0, far], [far, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = ring[a], [bx, by] = ring[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let md = -1, mi = 0;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : null;
}
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
const polyArea = mp => mp.reduce((t, p) => t + Math.abs(ringArea(p[0])) - p.slice(1).reduce((u, h) => u + Math.abs(ringArea(h)), 0), 0);
const toMP = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const simpMP = (mp, tol) => mp.map(p => p.map(r => simplify(r, tol)).filter(Boolean)).filter(p => p.length);
function bboxMP(mp) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of mp) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function centroidMP(mp) { let A = 0, X = 0, Y = 0; for (const p of mp) { const a = Math.abs(ringArea(p[0])); const r = p[0]; let cx = 0, cy = 0; for (const [x, y] of r) { cx += x; cy += y; } A += a; X += cx / r.length * a; Y += cy / r.length * a; } return A ? [X / A, Y / A] : [0, 0]; }
const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
// rings that cross the date line jump from +179 to -179: in flat lon/lat they would span the whole world
// (Russia would 'touch' Canada and Greenland). Unwrap them to the east side, then cut at 180°.
const WORLD = [[[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]]];
function fixDateLine(mp) {
  let wrapped = false;
  const out = mp.map(poly => poly.map(ring => {
    let jump = false; for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { jump = true; break; }
    if (!jump) return ring;
    wrapped = true; return ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);
  }));
  return wrapped ? safe(() => pc.intersection(out, WORLD), mp) : mp;
}

// ---- 1. admin-1 units -> regions
const units = JSON.parse(fs.readFileSync(ADM1, 'utf8')).features;
const byCountry = {};
for (const f of units) {
  const p = f.properties, mp = simpMP(fixDateLine(toMP(f.geometry)), .05); if (!mp.length) continue;
  (byCountry[p.adm0_a3] ||= []).push({ name: p.name || p.name_alt || '?', region: p.region, sub: p.region_sub, iso: p.iso_3166_2, mp, c: centroidMP(mp), a: polyArea(mp) });
}
function kmeans(list, k) {
  const sorted = [...list].sort((a, b) => b.a - a.a);
  let cs = sorted.slice(0, k).map(u => [...u.c]);
  for (let it = 0; it < 25; it++) {
    const acc = cs.map(() => [0, 0, 0]);
    for (const u of list) { let bi = 0, bd = 1e18; cs.forEach((c, i) => { const d = (c[0] - u.c[0]) ** 2 + (c[1] - u.c[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); u.k = bi; const w = Math.sqrt(u.a) + .01; acc[bi][0] += u.c[0] * w; acc[bi][1] += u.c[1] * w; acc[bi][2] += w; }
    cs = acc.map((a, i) => a[2] ? [a[0] / a[2], a[1] / a[2]] : cs[i]);
  }
  return list.map(u => u.k);
}
const regions = [];   // { country(a3), name, mp, bb }
for (const [a3, list] of Object.entries(byCountry)) {
  const regs = new Set(list.map(u => u.region).filter(Boolean));
  let key;
  if (a3 === 'TUR' || a3 === 'BRA') key = u => lookup[a3 + '|' + (a3 === 'TUR' ? u.name : u.iso)] || u.name;
  else if (a3 === 'USA') key = u => u.sub || u.name;
  else if (regs.size >= 3 && regs.size <= 20 && list.filter(u => u.region).length >= list.length * .8) key = u => u.region || u.name;
  else if (list.length <= 16) key = u => u.name;
  else {
    const k = Math.max(4, Math.min(9, Math.round(Math.sqrt(list.length) * 1.1))), lab = kmeans(list, k);
    const names = {}; list.forEach((u, i) => { if (!names[lab[i]] || u.a > names[lab[i]].a) names[lab[i]] = u; });
    key = u => names[u.k].name;
  }
  const groups = {};
  for (const u of list) (groups[key(u)] ||= []).push(u);
  const t0 = Date.now();
  for (const [name, us] of Object.entries(groups)) {
    const mp = us.length === 1 ? us[0].mp : safe(() => pc.union(...us.map(u => u.mp)), null) || us.flatMap(u => u.mp);
    regions.push({ country: a3, name, mp, bb: bboxMP(mp) });
  }
  if (Date.now() - t0 > 2000) console.log('  slow', a3, Date.now() - t0, 'ms');
}
console.log('countries', Object.keys(byCountry).length, 'regions', regions.length, 'TUR', regions.filter(r => r.country === 'TUR').map(r => r.name).join(','));

// ---- 2. cut regions to each era's country outlines; leftovers (coast mismatches) join the nearest region
const round = mp => mp.map(p => p.map(r => r.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000])));
function cutEra(features, out) {
  const res = {};
  let n = 0, fail = 0;
  for (const f of features) {
    const name = f.properties && (f.properties.name || f.properties.NAME); if (!name) continue;
    const cmp = fixDateLine(toMP(f.geometry)); if (!cmp.length) continue;
    const ca = polyArea(cmp), cb = bboxMP(cmp);
    const pieces = [];
    for (const r of regions) {
      if (!overlap(cb, r.bb)) continue;
      const mp = safe(() => pc.intersection(cmp, r.mp), []);
      const a = polyArea(mp);
      if (a > Math.max(.004, ca * .015)) pieces.push({ n: r.name, mp, a });
    }
    if (pieces.length < 2) { res[name] = [{ n: pieces[0] ? pieces[0].n : name, p: round(cmp) }]; n++; continue; }
    // regions of different modern countries can share a name: keep them apart
    const seen = {}; for (const p of pieces) { seen[p.n] = (seen[p.n] || 0) + 1; if (seen[p.n] > 1) p.n += ' ' + seen[p.n]; }
    const rest = safe(() => pc.difference(cmp, ...pieces.map(p => p.mp)), null);
    if (rest === null) fail++;
    for (const poly of rest || []) {
      if (Math.abs(ringArea(poly[0])) < 1e-6) continue;
      const c = centroidMP([poly]); let best = pieces[0], bd = 1e18;
      for (const p of pieces) for (const q of p.mp) for (const v of q[0]) { const d = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2; if (d < bd) { bd = d; best = p; } }
      best.mp = safe(() => pc.union(best.mp, [poly]), [...best.mp, poly]);
    }
    res[name] = pieces.sort((a, b) => b.a - a.a).map(p => ({ n: p.n, p: round(p.mp) }));
    n++;
  }
  fs.writeFileSync(out, JSON.stringify(res));
  console.log(out, n, 'countries', fail, 'leftover failures', (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
}
const topo = JSON.parse(fs.readFileSync('public/data/countries-50m.json', 'utf8'));
cutEra(feature(topo, topo.objects.countries).features, 'public/data/regions-2014.json');
cutEra(JSON.parse(fs.readFileSync('public/data/world_1815.geojson', 'utf8')).features, 'public/data/regions-1810.json');
