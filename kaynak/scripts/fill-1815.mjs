// The 1815 basemap leaves land that no state claimed without a name, so the game dropped it (most of Africa,
// inner Arabia, Madagascar, Borneo, Patagonia...). Name it: small islands join the nearest state, big unclaimed
// land is cut along modern borders and named after the peoples and kingdoms that held it around 1810.
// Usage: node scripts/fill-1815.mjs   (reads data-src/world_1815.raw.geojson, writes public/data/world_1815.geojson)
import fs from 'node:fs';
import pc from 'polygon-clipping';
import { feature } from 'topojson-client';

const HIST = {
  'Dem. Rep. Congo': 'Luba-Lunda', 'Congo': 'Loango', 'Central African Rep.': 'Azande', 'Chad': 'Wadai', 'Cameroon': 'Adamawa',
  'Gabon': 'Orungu', 'Eq. Guinea': 'Bubi', 'Zambia': 'Lozi Kingdom', 'Tanzania': 'Nyamwezi', 'Kenya': 'Maasai', 'Uganda': 'Buganda',
  'Rwanda': 'Rwanda', 'Burundi': 'Burundi', 'Mozambique': 'Gaza', 'Zimbabwe': 'Rozvi Empire', 'Botswana': 'Tswana', 'Namibia': 'Herero',
  'South Africa': 'Zulu', 'Lesotho': 'Basotho', 'eSwatini': 'Swazi', 'Malawi': 'Maravi', 'Somalia': 'Somali clans', 'Somaliland': 'Isaaq',
  'S. Sudan': 'Shilluk', 'Sudan': 'Darfur', 'Libya': 'Fezzan', 'Niger': 'Tuareg', 'Mali': 'Bambara', 'Mauritania': 'Trarza',
  'W. Sahara': 'Sahrawi', 'Algeria': 'Sahara tribes', 'Madagascar': 'Merina', 'Ethiopia': 'Oromo', 'Eritrea': 'Medri Bahri',
  'Angola': 'Ovimbundu', 'Nigeria': 'Benin', 'Ghana': 'Ashanti', "Côte d'Ivoire": 'Baoulé', 'Liberia': 'Kru', 'Sierra Leone': 'Temne',
  'Guinea': 'Futa Jallon', 'Burkina Faso': 'Mossi', 'Benin': 'Dahomey', 'Togo': 'Ewe', 'Senegal': 'Cayor', 'Djibouti': 'Afar',
  'Saudi Arabia': 'Najd', 'Yemen': 'Hadramaut', 'Oman': 'Oman', 'United Arab Emirates': 'Trucial Coast', 'Qatar': 'Qatar', 'Kuwait': 'Kuwait',
  'Argentina': 'Patagonia', 'Chile': 'Mapuche', 'Indonesia': 'Borneo sultanates', 'Malaysia': 'Borneo sultanates', 'Brunei': 'Brunei',
  'Australia': 'Aboriginal lands', 'Papua New Guinea': 'Papua', 'Canada': 'First Nations', 'United States of America': 'Native nations',
  'Brazil': 'Amazon peoples', 'Mongolia': 'Mongol khanates', 'Syria': 'Anizah Bedouin', 'Jordan': 'Bani Sakhr', 'Iraq': 'Shammar',
  'Tunisia': 'Nefzaoua', 'Morocco': 'Tafilalt', 'Egypt': 'Western Desert', 'Guinea-Bissau': 'Kaabu', 'Gambia': 'Niumi', 'Fiji': 'Fiji',
};
// unclaimed pieces inside these modern countries belong to a state that is already on the 1815 map
const JOIN = { 'United Kingdom': 'United Kingdom of Great Britain and Ireland', 'Faeroe Is.': 'Denmark', 'Russia': 'Russian Empire',
  'Japan': 'Japan', 'Taiwan': 'Manchu Empire', 'Madagascar': 'Merina Kingdom' };

const raw = JSON.parse(fs.readFileSync('data-src/world_1815.raw.geojson', 'utf8'));
const topo = JSON.parse(fs.readFileSync('public/data/countries-50m.json', 'utf8'));
const modern = feature(topo, topo.objects.countries).features.filter(f => f.geometry);
const toMP = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(a / 2); };
const area = mp => mp.reduce((t, p) => t + ringArea(p[0]), 0);
const bbox = mp => { let b = [1e9, 1e9, -1e9, -1e9]; for (const p of mp) for (const [x, y] of p[0]) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; return b; };
const hit = (a, b, m = 0) => a[0] - m <= b[2] && b[0] - m <= a[2] && a[1] - m <= b[3] && b[1] - m <= a[3];
const safe = fn => { try { return fn(); } catch (e) { return []; } };
const nameOf = p => p.NAME || p.SUBJECTO || p.ABBREVN;

const named = [], unnamed = [];
for (const f of raw.features) {
  if (!f.geometry || !/Polygon/.test(f.geometry.type)) continue;
  const n = f.properties.NAME;
  if (n) named.push({ f, n, mp: toMP(f.geometry), bb: bbox(toMP(f.geometry)) });
  else if (nameOf(f.properties) !== 'Antarctica') unnamed.push(f);
}
const taken = new Set(named.map(x => x.n));
const modernBB = modern.map(m => ({ n: m.properties.name, mp: toMP(m.geometry), bb: bbox(toMP(m.geometry)) }));
const add = {};   // new name -> MultiPolygon pieces
const join = {};  // existing state name -> extra pieces (islands)
let islands = 0, carved = 0;

for (const f of unnamed) {
  // a feature can hold several separate polygons: decide piece by piece
  for (const poly of toMP(f.geometry)) {
    const mp = [poly], a = area(mp), bb = bbox(mp);
    const sub = f.properties.SUBJECTO;   // e.g. 'Dutch East Indies': already a state in the data
    if (sub && taken.has(sub)) { (join[sub] ||= []).push(poly); islands++; continue; }
    if (a < 4) {   // small island or coastal sliver: belongs to the closest state within 1.5°
      let best = null, bd = 2.25;
      for (const s of named) {
        if (!hit(bb, s.bb, 1.5)) continue;
        for (const q of s.mp) for (const v of q[0]) for (const w of poly[0]) { const d = (v[0] - w[0]) ** 2 + (v[1] - w[1]) ** 2; if (d < bd) { bd = d; best = s; } }
      }
      if (best) { (join[best.n] ||= []).push(poly); islands++; continue; }
    }
    // unclaimed land: cut along modern countries
    let left = mp;
    for (const m of modernBB) {
      if (!hit(bb, m.bb)) continue;
      const piece = safe(() => pc.intersection(mp, m.mp));
      if (area(piece) < .05) continue;
      if (JOIN[m.n]) { (join[JOIN[m.n]] ||= []).push(...piece); left = safe(() => pc.difference(left, m.mp)); continue; }
      let n = HIST[m.n] || (m.n + ' tribes');
      if (taken.has(n)) n += ' lands';
      (add[n] ||= []).push(...piece); carved++;
      left = safe(() => pc.difference(left, m.mp));
    }
    // coast mismatches outside every modern border join whatever unclaimed piece is nearest, or are dropped if tiny
    for (const rest of left) if (ringArea(rest[0]) > .3) { (add[Object.keys(add).pop() || 'Unclaimed lands'] ||= []).push(rest); }
  }
}

const out = raw.features.filter(f => f.properties.NAME && f.geometry).map(f => {
  const extra = join[f.properties.NAME]; if (!extra) return f;
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: [...toMP(f.geometry), ...extra] } };
});
for (const [n, mp] of Object.entries(add)) out.push({ type: 'Feature', properties: { NAME: n, UNCLAIMED: true }, geometry: { type: 'MultiPolygon', coordinates: mp } });
fs.writeFileSync('public/data/world_1815.geojson', JSON.stringify({ type: 'FeatureCollection', features: out }));
console.log('islands joined', islands, '| unclaimed pieces', carved, '| new lands', Object.keys(add).length + ':', Object.keys(add).join(', '));
