// What makes a place look like itself: local trees, crops and landmarks per country / area.
// Returns overrides merged into the biome (trees: extra tree kinds with weights, crops: field colours, extras: town props).
const MED = new Set(['IT', 'ES', 'PT', 'GR', 'HR', 'CY', 'MT', 'AL', 'ME', 'LB', 'IL', 'TN', 'MA']);
const NORTH = new Set(['FI', 'SE', 'NO', 'EE', 'LV', 'LT', 'RU', 'BY', 'CA', 'IS']);
const SAVANNA = new Set(['KE', 'TZ', 'UG', 'ZM', 'ZW', 'BW', 'NA', 'MZ', 'MW', 'SS', 'ET', 'SN', 'ML', 'BF', 'NE', 'TD', 'CF', 'AO', 'MG']);

export function floraFor(iso, lat, lon, biome) {
  const f = { trees: {}, crops: null, extras: [] };
  const med = MED.has(iso) || (iso === 'TR' && lon < 31) || (iso === 'FR' && lat < 44.5) || (lat > 30 && lat < 44 && lon > -10 && lon < 36 && biome === 'temperate' && !iso);
  if (iso === 'JP' || iso === 'KR' || iso === 'TW') { f.trees = { sakura: .45, pine: .25 }; f.extras.push('torii', 'lantern'); f.crops = ['#7fae4a', '#93bf55']; }   // rice paddies
  else if (iso === 'CN' || iso === 'VN' || iso === 'LA') { f.trees = { bamboo: .35 }; f.extras.push('lantern'); f.crops = ['#7fae4a', '#93bf55']; }
  else if (iso === 'NL' || iso === 'BE') { f.crops = ['#e8343a', '#f2d23a', '#e86aa0', '#f4f1e6', '#a04ad8']; f.tulips = true; }
  else if (med) { f.trees = { olive: .4, cypress: .25 }; f.vines = true; }
  else if (NORTH.has(iso) || (biome === 'boreal')) f.trees = { birch: .35 };
  else if (SAVANNA.has(iso) || (biome === 'tropical' && lat < 15 && lat > -25 && lon > -20 && lon < 52)) f.trees = { acacia: .5, baobab: .08 };
  else if (iso === 'AU') f.trees = { eucalyptus: .6 };
  else if (iso === 'GB' || iso === 'IE' || iso === 'FR' || iso === 'DE') f.hedges = true;
  return f;
}

// leaf colours per tree kind (instance colours; null = use the biome's leaf palette)
export const LEAF = {
  sakura: ['#f6b8cf', '#f2a4c0', '#fbd0de', '#ee93b4'],
  olive: ['#8a9a6a', '#7d8f62', '#97a678'],
  cypress: ['#2f4a2a', '#34512e', '#2a4226'],
  birch: ['#9cc25a', '#b0cc62', '#8ab64e', '#d8c24a'],
  acacia: ['#7a9440', '#8aa24a', '#6f8a3a'],
  baobab: ['#6f8a3a', '#7d9644'],
  bamboo: ['#7fb048', '#8fbe52', '#6fa03e'],
  eucalyptus: ['#8aa08a', '#7d957d', '#9aae92'],
};
