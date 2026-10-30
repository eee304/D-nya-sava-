// Mutable game state of the local player's session.
// Everything the simulation reads/writes lives here so it can be saved, loaded and inspected in one place.
export const S = {
  // economy
  money: 2500,          // enough for a first mine and field
  moneyCap: 5000,          // maximum money; +BANK_CAP per bank
  population: 0,           // current population (grows up to the cap)
  popCap: 100,             // population limit; +500 per city, +250 per town
  iron: 0,                 // mined from iron deposits
  bread: 0,                // from fields
  taxPerPerson: 2,         // money collected per person per month
  _upkeepDebt: 0,          // accumulates fractional daily upkeep

  // building counters (drive upkeep, income and anger)
  fieldCount: 0,
  farmCount: 0,
  chocoCount: 0,
  shipCount: 0,
  portShipyardCount: 0,    // ports + shipyards
  cityCount: 0,
  freeCityCount: 0,        // upkeep-exempt cities (the capital)
  _spawnFreeCity: false,   // set true just before spawning a free city
  townCount: 0,
  baseCount: 0,
  bankCount: 0,
  nonChocoBuildings: 0,    // forest/mountain decorations placed by the player

  // military
  army: 0,                 // total soldiers (each consumes 1 population)
  tankCount: 0,

  // nation
  ideology: null,          // 'socialism' | 'capitalism' | 'militarism'
  personality: null,       // 'peaceful' | 'warlike' | 'hardworking'
  homeName: null,
  selectedName: null,
  selectedFeature: null,   // the chosen country feature

  // time
  gameDays: 0,             // elapsed in-game days (1 real second = 1 day)
  lastMonthCounted: 0,     // last pay period already collected
  rebellionActive: false,
  START_YEAR: 2014,
  goods: { fish: 0, livestock: 0, oil: 0, tech: 0 },   // trade goods (bread and iron live in S.bread / S.iron)
  fed: false,              // was the population fed with fish/meat last month?
  spec: {},                // provinceId -> specialisation ('tarim' | 'sanayi' | 'askeri' | 'ticaret')
  troops: {},              // provinceId -> our soldiers stationed there (S.army = total incl. troops on the move)
  currentEra: '2014',
};

export const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));
