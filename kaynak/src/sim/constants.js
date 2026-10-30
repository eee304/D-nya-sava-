// Economy and military tuning constants.

export const REBEL_ARMY = 5000;     // a popular rebellion fields 5000 soldiers
export const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
export const BREAD_PER_FIELD = 1;   // bread per second per field
export const CITY_BREAD_COST = 500; // bread needed to build a city
export const TOWN_BREAD_COST = 250; // bread needed to build a town
export const BANK_CAP = 7000;       // money cap added per bank
export const FIELD_INCOME = 50;       // per second, per field
export const FARM_INCOME = 100;       // per second, per farm
export const CHOCO_INCOME = 7500/60;  // 7500 per MINUTE = 125 per second

// upkeep (expenses), all expressed per second
export const SHIP_UPKEEP = 5000/60;   // (legacy per-sec, no longer used for money)
export const FARM_UPKEEP = 1000/60;
export const FIELD_UPKEEP = 1000/60;
export const PORTYARD_UPKEEP = 5000/60;
export const CITY_UPKEEP = 5000/60;
export const TOWN_UPKEEP = 1000/60;
export const BASE_UPKEEP = 500/60;
export const UPKEEP_OTHER = 8000/60;

// monthly upkeep base per building (half of it is charged, spread over the days of the month).
// Tuned so growth pays: a city (+500 people ≈ +1000 tax/month) costs 600/month, a town 200, a field 150.
export const M_SHIP=2000, M_FARM=400, M_FIELD=300, M_PORTYARD=2000, M_CITY=1200, M_TOWN=400, M_BASE=500, M_OTHER=8000;

// population capacity added per building
export const CITY_POP = 500;
export const TOWN_POP = 250;
export const ARMY_UNIT = 100;         // soldiers per recruitment unit
export const ARMY_UNIT_COST = 600;    // cost for one 100-soldier unit (scales with amount)
export const ARMY_UNIT_POP = 20;      // people drafted per 100 soldiers: a country fields armies far bigger than its town populations
export const COSTS = { city: 5000, town: 2500, base: 5000, bank: 3000, mine: 1000, field: 700, farm: 1000, port: 5000, shipyard: 7000, choco: 8000, garage: 1000, fishery: 2000, ranch: 1500, oilwell: 4000, factory: 6000 };
export const TANK_COST_MONEY = 1500, TANK_COST_POP = 10, TANK_COST_IRON = 20, TANK_ARMY = 500; // each tank adds 500 army power
export const SHIP_COST = 3000;
export const BATTLE_TIME=10; // seconds of clash before resolution (long enough to watch)
export const EARTH_KM2_PER_STER = 6371*6371;   // ~40.6M km2 per steradian

// footprint radius used for overlap checks (tiny: only blocks true overlap, allows adjacency)
export const BUILD_R = 0.35;   // tiny: buildings only block if truly overlapping

export function b_label(t){ return ({fishery:'Balıkçı Limanı',ranch:'Hayvancılık Çiftliği',oilwell:'Petrol Kuyusu',factory:'Sanayi Fabrikası',city:'Şehir',town:'Kasaba',port:'Liman',shipyard:'Tersane',base:'Askeri Üs',mine:'Maden Ocağı',bank:'Banka',garage:'Garaj',
  field:'Tarla',farm:'Çiftlik',forest:'Orman',mountain:'Dağ',choco:'Çikolata Fabrikası'})[t]||t; }
