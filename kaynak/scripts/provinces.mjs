// Provinces: troop moves, province-by-province conquest vs whole country, development and per-province region views.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT || 'scripts';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:4173/?test');
await p.evaluate(() => localStorage.setItem('mbr-cinematics', 'off'));   // keep this test quick
await p.click('#playSolo'); await p.click('#era2014');
await p.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 90000 });
await p.evaluate(() => window.__mbr.chooseCountry('Türkiye')); await p.click('#ideoMil'); await p.click('#persWar');
const M = (fn, ...a) => p.evaluate(fn, ...a);
const tr = await M(() => window.__mbr.provinces('Türkiye'));
check(tr.length > 1 && tr.every(q => q.own), 'home country split into ' + tr.length + ' provinces, all ours');
const capId = tr.find(q => q.capital).id, east = tr.find(q => !q.capital).id;
await M(([c]) => { const m = window.__mbr; m.set('moneyCap', 200000); m.set('money', 150000); m.troops(c, 60000); }, [capId]);

// 1) move troops between provinces
await M(([a, e]) => window.__mbr.moveTroops(a, e, 20000), [capId, east]);
await p.waitForFunction(e => window.__mbr.provinces('Türkiye').find(q => q.id === e).troops === 20000, { timeout: 60000 }, east).catch(() => {});
let t2 = await M(() => window.__mbr.provinces('Türkiye'));
check(t2.find(q => q.id === east).troops === 20000 && t2.find(q => q.id === capId).troops === 40000, 'troops marched from the capital to ' + t2.find(q => q.id === east).label);
await M(() => window.__mbr.look('Türkiye', 260, .85)); await M(([c]) => window.__mbr.showProv(c), [capId]); await sleep(900);
await p.screenshot({ path: `${OUT}/pv-panel.png` });

// 2) take one province of Syria, then the rest
async function conquer(prov, choice) {
  for (let tries = 0; tries < 4; tries++) {
    await M(([c]) => window.__mbr.troops(c, 40000), [capId]);
    await M(([pr]) => window.__mbr.invade('Syria', pr), [prov])
    await p.waitForFunction(() => !window.__mbr.invasionPhase, { timeout: 120000 });
    const open = await M(() => document.getElementById('conquerModal').classList.contains('open'));
    if (open) { await M(c => window.__mbr.conquerChoice(c), choice); return true; }
  }
  return false;
}
const sy = await M(() => window.__mbr.provinces('Syria'));
const first = sy.find(q => !q.capital) || sy[0];
check(await conquer(first.id, 'takeOne'), 'won the battle for ' + first.label + ' (Syria)');
let sy2 = await M(() => window.__mbr.provinces('Syria'));
check(sy2.filter(q => q.own).length === 1 && sy2.length > 1, 'took only that province: ' + sy2.filter(q => q.own).length + '/' + sy2.length + ' of Syria is ours');
await M(() => window.__mbr.look('Syria', 200, .9)); await sleep(900); await p.screenshot({ path: `${OUT}/pv-partial.png` });
const second = sy2.find(q => !q.own);
check(await conquer(second.id, 'takeAll'), 'won the battle for ' + second.label);
sy2 = await M(() => window.__mbr.provinces('Syria'));
check(sy2.every(q => q.own), 'took the whole country afterwards');

// 3) development: build up a rural province and look at it
const before = (await M(() => window.__mbr.provinces('Türkiye'))).find(q => q.id === east).dev;
await M(([e]) => { const m = window.__mbr, r = m.regionInfoOf(e).center; const types = ['city', 'town', 'bank', 'base', 'farm', 'choco', 'garage', 'field'];
  types.forEach((t, i) => { const a = i / types.length * 6.28; m.set('bread', 5000); m.build(t, r[0] + Math.cos(a) * 1.6, r[1] + Math.sin(a) * 1.6); }); }, [east]);
const after = (await M(() => window.__mbr.provinces('Türkiye'))).find(q => q.id === east).dev;
check(before !== after, 'building up ' + east + ' raised it from ' + before + ' to ' + after);
console.log('    hint:', await M(() => window.__mbr.hint()));
const rural = tr.filter(q => !q.capital && q.id !== east)[0].id;
for (const [id, tag] of [[rural, 'rural'], [east, 'developed']]) {
  await M(i => window.__mbr.enterRegion(i), id);
  await p.waitForFunction(() => window.__mbr.view === 'region', { timeout: 30000 }); await sleep(1500);
  console.log('    region', tag, JSON.stringify(await M(() => window.__mbr.regionInfo())));
  await p.screenshot({ path: `${OUT}/pv-region-${tag}.png` });
  const t0 = Date.now(); await M(() => window.__mbr.exitRegion()); await p.waitForFunction(() => window.__mbr.view === 'world', { timeout: 60000 });   // software GPU: big regions render slowly
  console.log('    exit took', Date.now() - t0, 'ms');
}
// 4) save + load keeps provinces and troops
await M(() => document.getElementById('saveBtn').click()); await sleep(300);
const snap = await M(() => JSON.stringify(window.__mbr.provinces('Syria').map(q => q.own)) + JSON.stringify(window.__mbr.provinces('Türkiye').map(q => q.troops)));
await M(() => document.getElementById('exitBtn').click()); await M(() => document.getElementById('savesMenuBtn').click()); await sleep(300);
await M(() => document.querySelector('#savesList .save-item button').click());
const snap2 = await M(() => JSON.stringify(window.__mbr.provinces('Syria').map(q => q.own)) + JSON.stringify(window.__mbr.provinces('Türkiye').map(q => q.troops)));
check(snap === snap2, 'save/load keeps province ownership and garrisons');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await b.close();
console.log(fails ? fails + ' check(s) failed' : 'all checks passed');
process.exit(fails ? 1 : 0);
