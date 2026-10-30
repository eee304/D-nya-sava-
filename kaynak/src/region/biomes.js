// Climate (terrain palette + vegetation) and architectural culture for a region,
// derived from the country's centroid and ISO code.

const DESERT = new Set(['DZ', 'LY', 'EG', 'SA', 'YE', 'OM', 'AE', 'QA', 'KW', 'BH', 'IQ', 'JO', 'IL', 'PS', 'MR', 'ML', 'NE', 'TD', 'SD', 'EH', 'NA', 'BW', 'AU', 'DJ', 'SO']);
const STEPPE = new Set(['KZ', 'MN', 'UZ', 'TM', 'KG', 'TJ', 'AF', 'IR', 'SY', 'PK', 'AR']);
const TROPICAL = new Set(['IN', 'BD', 'MM', 'TH', 'VN', 'LA', 'KH', 'BR', 'PY', 'CU', 'DO', 'HT', 'JM', 'PH', 'MX', 'TW', 'LK']);

// colours are hex strings; tree kinds: dec (broadleaf), pine, palm, jungle, shrub
export const BIOMES = {
  temperate: {
    label: 'Ilıman', grass: ['#5f8a32', '#86a443', '#4b7429'], dry: '#a4a058', floor: '#3e5a24', sand: '#d6c08a',
    rock: ['#8a8273', '#a69e8d'], snowAt: 11, forest: .56, trees: { dec: .78, pine: .22 }, treeCap: 3200, river: true, water: '#2e6f8e',
    leaf: ['#3f6e2a', '#4b7d2f', '#5a8a34', '#3a6127', '#6a8f35', '#7b8b2e'],
  },
  steppe: {
    label: 'Bozkır', grass: ['#9c9a52', '#b5a95f', '#857f44'], dry: '#c2b37a', floor: '#6f7036', sand: '#d8c38e',
    rock: ['#8f8574', '#ab9f88'], snowAt: 10, forest: .7, trees: { dec: .5, pine: .3, shrub: .2 }, treeCap: 700, river: true, water: '#3a7590',
    leaf: ['#5c7a32', '#6b8238', '#7a8a3a'],
  },
  desert: {
    label: 'Çöl', grass: ['#d9b77a', '#e6c88e', '#c9a467'], dry: '#c99a5c', floor: '#a8925a', sand: '#efd9a4',
    rock: ['#a3784f', '#bd9468'], snowAt: 99, forest: .82, trees: { palm: .6, shrub: .4 }, treeCap: 380, river: false, water: '#2f7f95',
    leaf: ['#6b8a3a', '#7d9a40', '#58763a'], dunes: true,
  },
  savanna: {
    label: 'Savan', grass: ['#b49a55', '#c7ad66', '#9c8a4c'], dry: '#cfb377', floor: '#8a7a45', sand: '#e2c992',
    rock: ['#a07a55', '#b8936a'], snowAt: 99, forest: .8, trees: { acacia: .55, baobab: .1, shrub: .35 }, treeCap: 650, river: true, water: '#3a7f8a',
    leaf: ['#7a8a3e', '#8a9446', '#6d7d38'],
  },
  tropical: {
    label: 'Tropik', grass: ['#3f7a2a', '#5c9134', '#2f6522'], dry: '#7d8f3c', floor: '#2b4a1c', sand: '#e2cf96',
    rock: ['#776f60', '#918876'], snowAt: 14, forest: .48, trees: { jungle: .7, palm: .3 }, treeCap: 4200, river: true, water: '#2c7c7a',
    leaf: ['#2e6b25', '#3b7d2a', '#25591f', '#4a8a2c'],
  },
  boreal: {
    label: 'Tayga', grass: ['#6b7f4a', '#829156', '#55683c'], dry: '#8f8a5c', floor: '#3c4a2c', sand: '#bfb38e',
    rock: ['#7d7b74', '#97948b'], snowAt: 6, forest: .48, trees: { pine: .85, dec: .15 }, treeCap: 3800, river: true, water: '#3a6478',
    leaf: ['#2f5530', '#2a4a2b', '#355f35', '#24442a'], snowy: .35,
  },
  polar: {
    label: 'Kutup', grass: ['#e6ecef', '#f3f6f7', '#d7e0e5'], dry: '#c9d3d8', floor: '#cfd8dc', sand: '#d9dfe2',
    rock: ['#6f7378', '#8a8f95'], snowAt: 0, forest: .95, trees: { pine: 1 }, treeCap: 60, river: false, water: '#3b5e73',
    leaf: ['#3b5a44'], snowy: 1,
  },
};

// Africa and Arabia by position (1810 states have no ISO code): Sahara, Sahel/savanna, Congo forest, Kalahari
function africaBiome(lat, lon) {
  if (lon < -20 || lon > 60 || lat < -36 || lat > 37) return null;
  if (lat > 31 && lon < 36) return 'steppe';                                   // Maghreb and Mediterranean coast
  if (lat >= 15 || (lon > 34 && lat > 12)) return 'desert';                     // Sahara and Arabia
  if (lat < -17 && lon < 26) return 'desert';                                   // Namib and Kalahari
  if ((lat > -6 && lat < 5 && lon > 8 && lon < 30) || (lat < 8 && lon < 8 && lat > 4)) return 'tropical';   // Congo basin, Guinea coast
  return 'savanna';
}
export function biomeFor(lat, iso, lon) {
  const a = Math.abs(lat);
  if (a >= 71 || iso === 'GL' || iso === 'AQ') return 'polar';
  const af = lon != null && africaBiome(lat, lon); if (af) return af;
  if (DESERT.has(iso)) return 'desert';
  if (STEPPE.has(iso)) return 'steppe';
  if (TROPICAL.has(iso) || a <= 15) return 'tropical';
  if (a >= 55) return 'boreal';
  if (a >= 18 && a <= 30 && !iso) return 'desert';   // unknown 1810 states in the desert belt
  return 'temperate';
}

// islamic: domes + minaret · eastasia: pagoda + dark hip roofs · african: round huts · european: steeple church
export function cultureFor(lon, lat) {
  if (lon >= 95 && lon <= 150 && lat >= 8) return 'eastasia';
  // Africa south of the Sahel stays african; South Asia counts from 8°N
  if (lon >= -18 && lon <= 90 && lat <= 43 && lat >= (lon > 60 ? 8 : 12) && !(lon < 26 && lat > 36)) return 'islamic';
  if (lat < 12 && lat > -35 && lon > -20 && lon < 52) return 'african';
  return 'european';
}
