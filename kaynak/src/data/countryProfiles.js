// Every country's economic identity: what it is good and bad at, a title and a one-line character.
// Hand-written for the big economies (2010s conjuncture), derived from geography for everyone else.

// trade goods; bread and iron are the original resources (S.bread / S.iron)
export const GOODS = {
  grain:     { label: 'Tahıl',      icon: '🌾', base: 3,  era1810: 'Tahıl' },
  fish:      { label: 'Balık',      icon: '🐟', base: 4,  era1810: 'Balık' },
  livestock: { label: 'Hayvancılık', icon: '🐄', base: 5,  era1810: 'Hayvancılık' },
  oil:       { label: 'Petrol',     icon: '🛢️', base: 9,  era1810: 'Kömür' },
  iron:      { label: 'Demir',      icon: '⛓️', base: 6,  era1810: 'Demir' },
  tech:      { label: 'Teknoloji',  icon: '⚙️', base: 15, era1810: 'Manüfaktür' },
};
export const GOOD_KEYS = Object.keys(GOODS);
export const goodLabel = (k, era) => era === '1810' ? GOODS[k].era1810 : GOODS[k].label;

// multipliers: 2+ = world class, 1.5 = strong, 1 = normal, ≤0.5 = weak
const P = (title, desc, m) => ({ title, desc, m });
const HAND = {
  NO: P('Fiyortların balıkçıları', 'Kuzey Denizi petrolü ve dünyanın en verimli balıkçı filosu; toprağı tarıma pek elvermez.', { fish: 2.2, oil: 1.8, grain: .4, livestock: .8, tech: 1.2 }),
  IS: P('Okyanusun ortasındaki ada', 'Ekonomisi neredeyse tamamen balıkçılığa dayanır.', { fish: 2.4, grain: .2, livestock: .9, oil: .2 }),
  TR: P("Anadolu'nun bereketi", 'Geniş ovalar, güçlü tarım ve hayvancılık, gelişen sanayi; petrolü azdır.', { grain: 1.5, livestock: 1.4, fish: 1.1, tech: 1.1, oil: .4, iron: 1.1 }),
  SA: P('Çöl altındaki hazine', 'Dünyanın en büyük petrol rezervleri; gıdasının çoğunu dışarıdan alır.', { oil: 2.5, grain: .3, livestock: .6, fish: .7, tech: .8 }),
  AE: P('Körfezin ticaret merkezi', 'Petrol zengini, gıda için tamamen ithalata bağlı.', { oil: 2.4, grain: .2, fish: .9, tech: 1.1 }),
  QA: P('Gaz yarımadası', 'Küçük ama enerji zengini.', { oil: 2.4, grain: .2, livestock: .3 }),
  KW: P('Petrol emirliği', 'Petrol bol, su ve toprak kıt.', { oil: 2.4, grain: .2, livestock: .3 }),
  IQ: P('İki nehrin ülkesi', 'Büyük petrol yatakları, tarımı zayıflamış.', { oil: 2.1, grain: .7, livestock: .8 }),
  IR: P('Pers yaylası', 'Petrol ve doğalgaz zengini, tarımı orta.', { oil: 2.0, grain: 1.0, livestock: 1.1, iron: 1.2 }),
  US: P('Sanayi ve tarım devi', 'Dev tarım alanları, teknoloji liderliği ve kaya petrolü.', { grain: 1.8, tech: 2.0, oil: 1.5, livestock: 1.6, iron: 1.3, fish: 1.2 }),
  CA: P('Kuzeyin kaynak deposu', 'Buğday, petrol kumları, balık ve maden bol.', { grain: 1.6, oil: 1.7, fish: 1.5, iron: 1.4, tech: 1.3 }),
  MX: P('Mısırın vatanı', 'Petrol, tarım ve gelişen imalat.', { oil: 1.4, grain: 1.3, tech: 1.1, livestock: 1.1 }),
  BR: P('Dünyanın çiftliği', 'Soya, sığır ve demir cevherinde dünya lideri.', { grain: 1.8, livestock: 2.0, iron: 1.9, oil: 1.2, tech: .9 }),
  AR: P('Pampaların sığırları', 'Uçsuz bucaksız otlaklar ve tahıl tarlaları.', { livestock: 2.1, grain: 1.7, fish: 1.1, oil: .9 }),
  CL: P('And dağlarının madeni', 'Bakır ve maden zengini, uzun kıyılarında balık bol.', { iron: 1.9, fish: 1.7, grain: .8 }),
  PE: P('Humboldt akıntısının balıkçıları', 'Dünyanın en büyük hamsi avı ve zengin madenler.', { fish: 2.0, iron: 1.6, grain: .9 }),
  VE: P('Karayiplerin petrolü', 'Dev petrol rezervleri, zayıf sanayi.', { oil: 2.2, grain: .7, tech: .5 }),
  GB: P('Ada krallığı', 'Finans ve teknoloji merkezi, Kuzey Denizi balıkçılığı.', { tech: 1.6, fish: 1.4, oil: 1.1, grain: .9 }),
  FR: P('Avrupa’nın ambarı', 'Güçlü tarım, hayvancılık ve havacılık sanayi; petrolü yok.', { grain: 1.7, livestock: 1.5, tech: 1.5, fish: 1.1, oil: .3 }),
  DE: P('Avrupa’nın fabrikası', 'Makine ve otomotivde dünya lideri; enerji ithalatçısı.', { tech: 2.1, iron: 1.2, grain: 1.0, livestock: 1.1, oil: .3 }),
  IT: P('Akdeniz zanaatkârları', 'Tasarım, makine ve tarım; enerjiyi dışarıdan alır.', { tech: 1.3, grain: 1.2, livestock: 1.0, fish: 1.1, oil: .3 }),
  ES: P('İber yarımadası', 'Zeytin, şarap ve büyük bir balıkçı filosu.', { grain: 1.2, fish: 1.5, livestock: 1.3, oil: .2 }),
  PT: P('Atlantik denizcileri', 'Balıkçılık geleneği, sınırlı kaynak.', { fish: 1.7, grain: .8, oil: .2 }),
  NL: P('Deltanın tüccarları', 'Küçük topraktan dev tarım ihracatı, liman ve teknoloji.', { livestock: 1.7, grain: 1.4, tech: 1.5, fish: 1.3, oil: .6 }),
  DK: P('Tereyağı ve balık', 'Yoğun hayvancılık ve balıkçılık.', { livestock: 1.8, fish: 1.6, tech: 1.3, grain: 1.1 }),
  SE: P('Ormanlar ve çelik', 'Demir cevheri ve ileri sanayi.', { iron: 1.7, tech: 1.6, grain: .7, fish: 1.1 }),
  FI: P('Bin göl ülkesi', 'Teknoloji ve orman sanayi.', { tech: 1.5, iron: 1.2, grain: .6, fish: 1.2 }),
  PL: P('Ovaların ülkesi', 'Tahıl, kömür ve büyüyen sanayi.', { grain: 1.4, iron: 1.3, tech: 1.1, livestock: 1.2, oil: .3 }),
  UA: P('Kara toprak', 'Dünyanın tahıl ambarlarından biri.', { grain: 2.3, iron: 1.4, livestock: 1.2, oil: .5 }),
  RU: P('Enerji süper gücü', 'Dev petrol-gaz rezervleri, maden ve buğday.', { oil: 2.1, iron: 1.7, grain: 1.5, tech: 1.0, fish: 1.3 }),
  KZ: P('Bozkırın hazinesi', 'Petrol, maden, tahıl ve at sürüleri.', { oil: 1.7, iron: 1.6, grain: 1.5, livestock: 1.6, fish: .2 }),
  MN: P('Göçebelerin yurdu', 'Sürüler insan nüfusundan kalabalık.', { livestock: 2.3, iron: 1.4, grain: .4, fish: .1 }),
  CN: P('Dünyanın atölyesi', 'İmalat, tarım ve maden üretiminde dev.', { tech: 1.9, grain: 1.5, iron: 1.9, fish: 1.4, livestock: 1.2, oil: .9 }),
  JP: P('Teknoloji adaları', 'İleri teknoloji ve balıkçılık; hammaddesi neredeyse yok.', { tech: 2.3, fish: 1.8, grain: .6, oil: .1, iron: .3 }),
  KR: P('Çip ve çelik', 'Elektronik ve gemi inşasında lider; enerjisi yok.', { tech: 2.2, fish: 1.3, iron: .8, oil: .1, grain: .6 }),
  TW: P('Yarı iletken adası', 'Dünya çiplerinin büyük kısmı burada.', { tech: 2.4, fish: 1.2, oil: .1, grain: .6 }),
  IN: P('Baharat ve yazılım', 'Büyük tarım, hayvancılık ve yazılım sektörü.', { grain: 1.6, livestock: 1.4, tech: 1.4, iron: 1.3, oil: .5 }),
  PK: P('İndus ovası', 'Pamuk, buğday ve hayvancılık.', { grain: 1.4, livestock: 1.4, oil: .4 }),
  ID: P('Bin adalı ülke', 'Balık, palmiye yağı, kömür ve doğalgaz.', { fish: 1.7, grain: 1.4, oil: 1.3, iron: 1.2 }),
  TH: P('Pirinç kâsesi', 'Dünyanın en büyük pirinç ihracatçılarından.', { grain: 1.9, fish: 1.5, tech: 1.1 }),
  VN: P('Mekong deltası', 'Pirinç ve su ürünlerinde güçlü.', { grain: 1.8, fish: 1.7, tech: 1.0 }),
  PH: P('Takımadalar', 'Balıkçılık ve elektronik montajı.', { fish: 1.6, grain: 1.1, tech: 1.0 }),
  AU: P('Kızıl kıta', 'Demir cevheri, kömür ve dev sürüler.', { iron: 2.3, livestock: 1.9, grain: 1.4, oil: 1.2, fish: 1.1 }),
  NZ: P('Koyun adaları', 'Süt ürünleri ve kuzu eti ihracatı.', { livestock: 2.3, fish: 1.5, grain: .8 }),
  EG: P('Nil’in hediyesi', 'Nil vadisinde tarım, Süveyş ticareti, biraz gaz.', { grain: 1.3, oil: 1.0, fish: 1.0, livestock: .9 }),
  LY: P('Sahra petrolü', 'Petrol zengini çöl ülkesi.', { oil: 2.0, grain: .3, livestock: .5 }),
  DZ: P('Kuzey Afrika gazı', 'Petrol ve doğalgaz, sınırlı tarım.', { oil: 1.9, grain: .7, livestock: .8 }),
  MA: P('Atlas ve Atlantik', 'Fosfat, balık ve tarım.', { fish: 1.6, iron: 1.3, grain: 1.0 }),
  NG: P('Afrika’nın devi', 'Büyük petrol üreticisi, geniş tarım.', { oil: 2.0, grain: 1.2, livestock: 1.1, tech: .6 }),
  ZA: P('Altın ve elmas', 'Maden zengini, gelişmiş sanayi.', { iron: 1.9, tech: 1.1, grain: 1.0, livestock: 1.1 }),
  ET: P('Afrika’nın çatısı', 'Kıtanın en büyük hayvan varlığı.', { livestock: 1.9, grain: 1.0, fish: .1 }),
  SY: P('Bereketli hilal', 'Buğday ve biraz petrol.', { grain: 1.2, livestock: 1.1, oil: .9 }),
  GR: P('Ege denizcileri', 'Zeytin, balık ve dev ticaret filosu.', { fish: 1.5, grain: .9, livestock: 1.1, oil: .2 }),
  IL: P('Girişim ülkesi', 'Yüksek teknoloji, kıt su.', { tech: 1.9, grain: .5, oil: .5 }),
};
// 1810 states -> their modern counterpart's profile
const HIST = { 'Ottoman Empire': 'TR', 'Russian Empire': 'RU', 'France': 'FR', 'United Kingdom of Great Britain and Ireland': 'GB', 'Spain': 'ES', 'Prussia': 'DE',
  'Persia': 'IR', 'Japan': 'JP', 'Qing Empire': 'CN', 'Portugal': 'PT', 'Sweden': 'SE', 'Denmark': 'DK', 'Netherlands': 'NL', 'United States': 'US',
  'United States of America': 'US', 'Viceroyalty of New Spain': 'MX', 'Austrian Empire': 'DE' };

const STRONG_TITLES = { fish: 'Balıkçı ulus', grain: 'Tahıl ambarı', livestock: 'Çobanlar diyarı', oil: 'Enerji zengini', iron: 'Maden diyarı', tech: 'Sanayi ülkesi' };

// geo: { lat, coastal, biome } from the map; iso may be null (1810 states)
export function profileFor(name, iso, geo, era) {
  const key = iso || HIST[name];
  let p = key && HAND[key];
  let m;
  if (p) m = { ...p.m };
  else {
    m = { grain: 1, fish: geo.coastal ? 1.4 : .3, livestock: 1, oil: .6, iron: 1, tech: .8 };
    const b = geo.biome;
    if (b === 'desert') Object.assign(m, { grain: .4, livestock: .8, oil: 1.7 });
    else if (b === 'tropical') Object.assign(m, { grain: 1.5, livestock: 1.1, tech: .6 });
    else if (b === 'steppe') Object.assign(m, { grain: 1.2, livestock: 1.8 });
    else if (b === 'boreal') Object.assign(m, { grain: .6, iron: 1.4, fish: geo.coastal ? 1.7 : .3 });
    else if (b === 'polar') Object.assign(m, { grain: .2, livestock: .5, fish: geo.coastal ? 1.9 : .2 });
    else Object.assign(m, { grain: 1.3, livestock: 1.2 });
    // small stable variety between neighbours
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    for (const k of Object.keys(m)) { m[k] = Math.round(m[k] * (.85 + ((h >>> (k.length * 3)) % 31) / 100) * 10) / 10; }
  }
  for (const k of Object.keys(GOODS)) if (m[k] == null) m[k] = 1;
  if (era === '1810') m.tech = Math.min(m.tech, 1.2);   // no silicon valleys in 1810
  const sorted = Object.keys(m).sort((a, b) => m[b] - m[a]);
  const strengths = sorted.filter(k => m[k] >= 1.4).slice(0, 3), weaknesses = sorted.filter(k => m[k] <= .6).reverse().slice(0, 3);
  const title = p ? p.title : STRONG_TITLES[sorted[0]] || 'Dengeli ekonomi';
  const desc = p ? p.desc : (strengths.length ? strengths.map(k => goodLabel(k, era)).join(', ') + ' güçlü' : 'Her alanda orta düzey') +
    (weaknesses.length ? '; ' + weaknesses.map(k => goodLabel(k, era).toLocaleLowerCase('tr')).join(', ') + ' zayıf.' : '.');
  return { name, mult: m, strengths, weaknesses, title, desc };
}
