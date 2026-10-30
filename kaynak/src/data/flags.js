// Flag lookups: modern ISO2 codes (flagcdn) and 1810-era Wikimedia flag files.

// real historical (1810-era) flag images via Wikimedia Special:FilePath (no hash needed).
// value = Commons file name; resolved to a PNG at render time.
export function histFlagURL(file, width=40){ return 'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'?width='+width; }

export const HIST_FLAG_FILE = {
  'Ottoman Empire':'Flag of the Ottoman Empire (1844–1922).svg','Turkey':'Flag of the Ottoman Empire (1844–1922).svg',
  'Russian Empire':'Flag of Russia.svg','Russia':'Flag of Russia.svg',
  'Austrian Empire':'Flag of the Habsburg Monarchy.svg','Austria':'Flag of the Habsburg Monarchy.svg','Habsburg Empire':'Flag of the Habsburg Monarchy.svg','Austria-Hungary':'Flag of the Habsburg Monarchy.svg',
  'Prussia':'Flag of the Kingdom of Prussia (1803-1892).svg','Kingdom of Prussia':'Flag of the Kingdom of Prussia (1803-1892).svg',
  'Holy Roman Empire':'Banner of the Holy Roman Emperor (after 1400).svg','German Confederation':'Flag of the German Confederation (war).svg',
  'France':'Flag of France.svg','French Empire':'Flag of France.svg','First French Empire':'Flag of France.svg','Kingdom of France':'Flag of the Kingdom of France (1814-1830).svg',
  'Spain':'Flag of Spain (1785–1873, 1875–1931).svg','Kingdom of Spain':'Flag of Spain (1785–1873, 1875–1931).svg',
  'Portugal':'Flag Portugal (1750).svg','Kingdom of Portugal':'Flag Portugal (1750).svg',
  'United Kingdom':'Flag of the United Kingdom (1801-1962).svg','Great Britain':'Flag of the United Kingdom (1801-1962).svg','United Kingdom of Great Britain and Ireland':'Flag of the United Kingdom (1801-1962).svg',
  'Sweden':'Naval Ensign of Sweden.svg','Kingdom of Sweden':'Naval Ensign of Sweden.svg',
  'Denmark':'Flag of Denmark.svg','Denmark–Norway':'Flag of Denmark.svg',
  'Kingdom of Naples':'Flag of the Kingdom of Naples (1811).svg','Kingdom of Sardinia':'Flag of the Kingdom of Sardinia (1816-1848).svg','Papal States':'Flag of the Papal States (1808-1870).svg',
  'Persia':'State flag of Persia (1907).svg','Qajar Iran':'State flag of Persia (1907).svg',
  'China':'Flag of the Qing Dynasty (1862-1889).svg','Qing Empire':'Flag of the Qing Dynasty (1862-1889).svg','Qing dynasty':'Flag of the Qing Dynasty (1862-1889).svg',
  'Japan':'Flag of Japan (1870–1999).svg','Tokugawa shogunate':'Flag of the Tokugawa Shogunate.svg',
  'Netherlands':'Flag of the Netherlands.svg','Kingdom of the Netherlands':'Flag of the Netherlands.svg',
  'United States':'Flag of the United States (1795-1818).svg','United States of America':'Flag of the United States (1795-1818).svg',
  'Mexico':'Flag of Mexico (1821-1823).svg','Brazil':'Flag of the Empire of Brazil (1822-1870).svg',
  'Morocco':'Flag of Morocco (1666-1915).svg','Egypt':'Flag of Egypt (1793-1844).svg',
  'Poland':'Flag of the Duchy of Warsaw.svg','Duchy of Warsaw':'Flag of the Duchy of Warsaw.svg',
  'Switzerland':'Flag of Switzerland (Pantone).svg','Norway':'Flag of Denmark.svg'
};

// country name (world-atlas) -> ISO2 for flag emoji
export const ISO2 = {
"Afghanistan":"AF","Angola":"AO","Albania":"AL","United Arab Emirates":"AE","Argentina":"AR",
"Armenia":"AM","Antarctica":"AQ","Australia":"AU","Austria":"AT","Azerbaijan":"AZ","Burundi":"BI",
"Belgium":"BE","Benin":"BJ","Burkina Faso":"BF","Bangladesh":"BD","Bulgaria":"BG","Bahamas":"BS",
"Bosnia and Herz.":"BA","Belarus":"BY","Belize":"BZ","Bolivia":"BO","Brazil":"BR","Brunei":"BN",
"Bhutan":"BT","Botswana":"BW","Central African Rep.":"CF","Canada":"CA","Switzerland":"CH","Chile":"CL",
"China":"CN","Côte d'Ivoire":"CI","Cameroon":"CM","Dem. Rep. Congo":"CD","Congo":"CG","Colombia":"CO",
"Costa Rica":"CR","Cuba":"CU","Cyprus":"CY","Czechia":"CZ","Germany":"DE","Djibouti":"DJ","Denmark":"DK",
"Dominican Rep.":"DO","Algeria":"DZ","Ecuador":"EC","Egypt":"EG","Eritrea":"ER","Spain":"ES","Estonia":"EE",
"Ethiopia":"ET","Finland":"FI","Fiji":"FJ","France":"FR","Gabon":"GA","United Kingdom":"GB","Georgia":"GE",
"Ghana":"GH","Guinea":"GN","Gambia":"GM","Guinea-Bissau":"GW","Eq. Guinea":"GQ","Greece":"GR","Greenland":"GL",
"Guatemala":"GT","Guyana":"GY","Honduras":"HN","Croatia":"HR","Haiti":"HT","Hungary":"HU","Indonesia":"ID",
"India":"IN","Ireland":"IE","Iran":"IR","Iraq":"IQ","Iceland":"IS","Israel":"IL","Italy":"IT","Jamaica":"JM",
"Jordan":"JO","Japan":"JP","Kazakhstan":"KZ","Kenya":"KE","Kyrgyzstan":"KG","Cambodia":"KH","South Korea":"KR",
"Kosovo":"XK","Kuwait":"KW","Laos":"LA","Lebanon":"LB","Liberia":"LR","Libya":"LY","Sri Lanka":"LK",
"Lesotho":"LS","Lithuania":"LT","Luxembourg":"LU","Latvia":"LV","Morocco":"MA","Moldova":"MD","Madagascar":"MG",
"Mexico":"MX","Macedonia":"MK","North Macedonia":"MK","Mali":"ML","Myanmar":"MM","Montenegro":"ME","Mongolia":"MN",
"Mozambique":"MZ","Mauritania":"MR","Malawi":"MW","Malaysia":"MY","Namibia":"NA","Niger":"NE","Nigeria":"NG",
"Nicaragua":"NI","Netherlands":"NL","Norway":"NO","Nepal":"NP","New Zealand":"NZ","Oman":"OM","Pakistan":"PK",
"Panama":"PA","Peru":"PE","Philippines":"PH","Papua New Guinea":"PG","Poland":"PL","Puerto Rico":"PR",
"North Korea":"KP","Portugal":"PT","Paraguay":"PY","Palestine":"PS","Qatar":"QA","Romania":"RO","Russia":"RU",
"Rwanda":"RW","W. Sahara":"EH","Saudi Arabia":"SA","Sudan":"SD","S. Sudan":"SS","Senegal":"SN","Solomon Is.":"SB",
"Sierra Leone":"SL","El Salvador":"SV","Somalia":"SO","Serbia":"RS","Suriname":"SR","Slovakia":"SK","Slovenia":"SI",
"Sweden":"SE","Eswatini":"SZ","Syria":"SY","Chad":"TD","Togo":"TG","Thailand":"TH","Tajikistan":"TJ",
"Kosovo":"XK","Palestine":"PS","N. Cyprus":"CY","Somaliland":"SO","Falkland Is.":"FK","Fr. S. Antarctic Lands":"TF",
"Bosnia and Herz.":"BA","Macedonia":"MK","North Macedonia":"MK","Czechia":"CZ","Czech Rep.":"CZ",
"Dominican Rep.":"DO","Timor-Leste":"TL","Brunei":"BN","Laos":"LA","Vietnam":"VN","North Korea":"KP","South Korea":"KR",
"Myanmar":"MM","Dem. Rep. Korea":"KP","Rep. Korea":"KR","Lao PDR":"LA","Moldova":"MD","eSwatini":"SZ",
"Turkmenistan":"TM","Timor-Leste":"TL","Trinidad and Tobago":"TT","Tunisia":"TN","Turkey":"TR","Turkiye":"TR","Türkiye":"TR",
"Taiwan":"TW","Tanzania":"TZ","Uganda":"UG","Ukraine":"UA","Uruguay":"UY","United States of America":"US",
"United States":"US","Uzbekistan":"UZ","Venezuela":"VE","Vietnam":"VN","Vanuatu":"VU","Yemen":"YE",
"South Africa":"ZA","Zambia":"ZM","Zimbabwe":"ZW"
};

export function flagFor(name){
  const iso=ISO2[name];
  // 1810 states: historical flag from Wikimedia
  const src = iso ? 'https://flagcdn.com/48x36/'+iso.toLowerCase()+'.png' : HIST_FLAG_FILE[name] ? histFlagURL(HIST_FLAG_FILE[name], 64) : null;
  if(!src) return '<span class="cp-flag">🌐</span>';
  return '<img class="cp-flagimg" loading="lazy" src="'+src+'" '+
         'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'cp-flag\',textContent:\'🌐\'}))" alt="">';
}
