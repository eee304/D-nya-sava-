// Real-world mountain ranges and forests used to decorate the world map.

// real-world mountain ranges (lon,lat): Rockies, Andes, Alps, Caucasus,
// Himalaya/Tibet, Urals, Atlas, Alaska, Scandinavia, Japan, NZ, Ethiopia
export const MTN=[
  [-110,44],[-106,39],[-119,37],[-150,63],            // N. America (Rockies, Sierra, Alaska)
  [-70,-16],[-70,-33],[-72,-45],[-73,-10],            // Andes
  [9,46],[12,47],[24,46],                              // Alps, Carpathians
  [42,43],[45,40],                                     // Caucasus
  [78,35],[86,29],[90,30],[95,29],[86.925,27.99],     // Himalaya / Tibet
  [60,57],[59,64],                                     // Urals
  [-6,31],[5,36],                                      // Atlas
  [14,66],[8,61],                                      // Scandinavia
  [138,36],[140,40],                                  // Japan
  [170,-43],[168,-45],                                // New Zealand
  [38,9],[39,13],                                      // Ethiopia highlands
  [101,30],[103,33]                                    // SW China
];

// real-world forests (lon,lat): Amazon, Congo, SE Asia, Taiga, Boreal, etc.
export const FOR=[
  [-62,-3],[-65,-6],[-58,-7],[-55,-4],[-68,-8],        // Amazon
  [22,0],[25,1],[18,2],[27,-1],                        // Congo
  [114,0],[101,2],[110,-1],[117,1],                    // SE Asia / Borneo / Sumatra
  [140,-5],[145,-6],                                   // New Guinea
  [100,61],[120,62],[90,60],[135,60],[60,60],[150,63], // Siberian taiga
  [-110,56],[-90,52],[-75,49],[-120,55],[-128,60],     // Canadian boreal
  [24,63],[30,62],[15,62],                             // Nordic / Russia west
  [10,50],[14,49],                                     // Central Europe
  [131,-15],[146,-18]                                  // N. Australia
];

// a decoration only fits if the host country is at least 2x the decoration's footprint
export const MTN_FOOTPRINT = Math.PI*7*7;     // mountain base radius ~7

export const TREE_FOOTPRINT = Math.PI*3.5*3.5; // tree canopy radius ~3.5
