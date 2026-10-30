// Real-world army sizes used to scale garrisons (thousands of troops).

// approximate real-world active military personnel (thousands), used to scale armies.
// USA is forced to be the highest at 100000; everyone else is scaled relative to USA.
export const MIL_K = {
  'United States of America':1390,'Russia':1150,'India':1450,'China':2035,'North Korea':1280,
  'South Korea':600,'Pakistan':650,'Iran':610,'Egypt':440,'Vietnam':470,'Myanmar':410,
  'Türkiye':425,'Indonesia':400,'Brazil':360,'Thailand':360,'Colombia':295,'Mexico':270,
  'Japan':250,'France':205,'Saudi Arabia':260,'Eritrea':200,'Taiwan':170,'Germany':185,
  'Italy':170,'United Kingdom':150,'Ukraine':500,'Israel':170,'Syria':170,'Iraq':190,
  'Morocco':200,'Algeria':130,'Spain':120,'Poland':150,'Greece':140,'Sri Lanka':255,
  'Bangladesh':160,'Nigeria':145,'Ethiopia':160,'Sudan':200,'Angola':110,'Cuba':50,
  'Canada':70,'Australia':60,'Argentina':80,'Chile':75,'Peru':80,'Venezuela':120,
  'Afghanistan':180,'Yemen':40,'Jordan':100,'Kazakhstan':70,'Uzbekistan':50,'Azerbaijan':65,
  'Armenia':45,'Belarus':45,'Serbia':28,'Switzerland':21,'Sweden':25,'Finland':23,
  'Norway':23,'Netherlands':35,'Belgium':25,'Portugal':27,'Romania':70,'Bulgaria':37,
  'Hungary':22,'Czechia':28,'Austria':23,'South Africa':75,'Kenya':24,'Libya':35,
  'Tunisia':36,'Lebanon':60,'United Arab Emirates':63,'Qatar':17,'Kuwait':17,'Oman':43,
  'New Zealand':9,'Ireland':9,'Singapore':73,'Malaysia':110,'Philippines':145,'Cambodia':125,
  'Laos':29,'Nepal':95,'Mongolia':35
};

export const MIL_MAX = Math.max(...Object.values(MIL_K));   // China (highest real value)

// scale: USA -> 100000; everyone else proportional to USA's real size, clamped to 100000
export const USA_K = MIL_K['United States of America'];

// approximate army strength around 1810 (thousands of troops), by historical state name.
// The strongest army (France, Napoleonic era) becomes 100000; others scale relative to it.
export const MIL_1810 = {
  'France':600,'French Empire':600,'First French Empire':600,'Kingdom of France':600,
  'Russian Empire':500,'Russia':500,
  'Austrian Empire':350,'Austria':350,'Habsburg Empire':350,'Austria-Hungary':350,
  'Ottoman Empire':300,'Turkey':300,
  'Prussia':240,'Kingdom of Prussia':240,
  'United Kingdom':250,'Great Britain':250,'United Kingdom of Great Britain and Ireland':250,
  'Spain':150,'Kingdom of Spain':150,
  'Qing Empire':800,'China':800,'Qing dynasty':800,
  'Persia':140,'Qajar Iran':140,
  'Kingdom of Naples':60,'Kingdom of Sardinia':45,'Papal States':15,'Kingdom of Italy':90,
  'Sweden':60,'Kingdom of Sweden':60,'Denmark':45,'Denmark–Norway':45,'Norway':20,
  'Portugal':60,'Kingdom of Portugal':60,'Netherlands':45,'Kingdom of the Netherlands':45,
  'Poland':70,'Duchy of Warsaw':70,'Switzerland':30,
  'United States':70,'United States of America':70,'Mexico':40,'Brazil':40,
  'Morocco':50,'Egypt':100,'Japan':120,'Tokugawa shogunate':120,
  'German Confederation':120,'Holy Roman Empire':120,'Bavaria':60,'Saxony':40,'Württemberg':25
};

export const MIL_1810_MAX = Math.max(...Object.values(MIL_1810));   // Qing/France top
