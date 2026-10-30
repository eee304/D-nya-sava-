// Underground resources and their real-world deposit regions.

// ---- underground resources (real-world deposit regions) ----
// value = money per extraction (every 60s). color used on the resource map.
export const MINERALS = {
  diamond: { value:1500, color:'#7fe3ff', label:'Elmas' },
  gold:    { value:1000, color:'#ffd35a', label:'Altın' },
  silver:  { value:400,  color:'#d8dde6', label:'Gümüş' },
  copper:  { value:300,  color:'#d98a4b', label:'Bakır' },
  iron:    { value:0, iron:10, color:'#9aa3ad', label:'Demir' }  // yields 10 iron/min, no money
};

// deposits as [lon, lat, radius_in_degrees]
export const DEPOSITS = {
  diamond: [[24,-28,7],[23,-6,6],[115,65,9],[-110,64,8],[127,-18,6],[25,-29,5],
    // Africa
    [13,-9,5],[18,-22,5],[-11,8,4],[31,-20,4],[21,4,4],
    // West Asia
    [45,16,4]],
  gold:    [[27,-26,5],[121,-30,7],[-117,40,6],[-75,-10,6],[110,35,7],[150,62,7],[-150,64,5],
    // Africa
    [-2,6,5],[-13,12,4],[33,15,4],[34,2,4],[30,-26,3],[8,12,4],[37,9,4],
    // West Asia
    [44,40,4],[60,33,4],[57,21,3],[42,15,3],[69,41,4]],
  silver:  [[-104,23,7],[-72,-14,5],[-65,-19,5],[16,51,4],[141,-31,5],[54,34,5],
    // Africa
    [3,17,4],[26,-29,3],[-7,32,4],[29,-3,3],
    // West Asia
    [47,38,4],[51,35,4],[44,33,3],[64,39,4]],
  copper:  [[-69,-24,6],[-71,-15,4],[-110,33,5],[27,-12,6],[137,-4,5],[92,31,7],[68,28,5],
    // Africa
    [25,-11,5],[28,-6,4],[6,35,3],[36,-1,3],[15,9,4],[-8,29,3],
    // West Asia
    [55,29,4],[44,39,4],[66,30,4],[48,30,3],[39,38,3],[58,37,4]],
  iron:    [[-43,-20,6],[135,-23,7],[88,22,6],[60,58,6],[-92,47,5],[14,65,4],
    // Africa
    [-12,21,5],[11,-12,4],[28,-26,4],[40,9,4],
    // West Asia
    [60,33,4],[44,40,3],[51,35,3],[35,39,4]]
};

// return the mineral key at a lon/lat, or null
export function resourceAt(lon,lat){
  let best=null, bestScore=Infinity;
  for(const key in DEPOSITS){
    for(const [dlon,dlat,r] of DEPOSITS[key]){
      const d=Math.hypot(lon-dlon, lat-dlat);
      if(d<=r && d<bestScore){ bestScore=d; best=key; }
    }
  }
  return best;
}
