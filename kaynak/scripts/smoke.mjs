// End-to-end smoke test: builds nothing, expects a server at BASE (vite dev or preview).
// Usage: node scripts/smoke.mjs [baseUrl]
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] || 'http://localhost:4173/';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) failed++; };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '?test', { waitUntil: 'load' });

  await page.click('#playSolo');
  await page.click('#era2014');
  await page.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 60000 });
  check(true, 'world map loaded');

  await page.evaluate(() => window.__mbr.chooseCountry('Türkiye'));
  await page.click('#ideoCap');
  await page.click('#persWork');
  await page.evaluate(() => document.getElementById('persWork').click()); // double click must not crash
  let s = await page.evaluate(() => window.__mbr.snapshot());
  check(s.owned.includes('Türkiye'), 'home country owned');
  check(s.ideology === 'capitalism' && s.personality === 'hardworking', 'ideology + personality set');
  check(s.bots === 10, '10 bots spawned (got ' + s.bots + ')');
  check(s.buildings === 1, 'free capital city placed (got ' + s.buildings + ')');

  const before = s.money;
  const cap = await page.evaluate(() => window.__mbr.capital('Türkiye'));
  await page.evaluate(([x, z]) => window.__mbr.build('field', x + 6, z), cap);
  s = await page.evaluate(() => window.__mbr.snapshot());
  check(s.buildings === 2 && Math.round(before - s.money) >= 690, 'field built, ~700 money spent');

  const day0 = s.gameDays;   // measure from the moment the field exists
  await page.waitForFunction(d => window.__mbr.snapshot().gameDays >= d + 2, { timeout: 30000 }, day0).catch(() => {});
  s = await page.evaluate(() => window.__mbr.snapshot());
  check(s.gameDays >= day0 + 2, 'calendar advances (days=' + s.gameDays.toFixed(1) + ')');
  check(s.bread > 0, 'field produces bread (bread=' + s.bread + ', buildings=' + s.buildings + ')');

  // ---- region view: enter, look around, leave
  await page.evaluate(() => { window.__mbr.set('moneyCap', 50000); window.__mbr.set('money', 20000); });
  await page.evaluate(() => window.__mbr.build('base', ...(() => { const c = window.__mbr.capital('Türkiye'); return [c[0] + 1.8, c[1] + 1.2]; })()));
  await page.evaluate(() => window.__mbr.enterRegion('Türkiye'));
  await page.waitForFunction(() => window.__mbr.view === 'region', { timeout: 30000 }).catch(() => {});
  let ri = await page.evaluate(() => window.__mbr.regionInfo());
  check(ri && ri.name.startsWith('Türkiye#'), 'region view opens for Türkiye (' + JSON.stringify(ri) + ')');
  check(ri && ri.trees > 500, 'region has a forest');
  check(ri && ri.placed.includes('base'), 'player base appears in the region');
  await sleep(1500);
  await page.screenshot({ path: 'scripts/region-Türkiye.png' });
  await page.evaluate(() => window.__mbr.exitRegion());
  await page.waitForFunction(() => window.__mbr.view === 'world', { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => window.__mbr.view) === 'world', 'zooming back out returns to the world map');
  for (const n of (process.env.REGIONS || '').split(',').filter(Boolean)) {
    await page.evaluate(n => window.__mbr.enterRegion(n), n);
    await page.waitForFunction(() => window.__mbr.view === 'region', { timeout: 30000 }).catch(() => {});
    ri = await page.evaluate(() => window.__mbr.regionInfo());
    console.log('    region', n, JSON.stringify(ri));
    await sleep(1200);
    await page.screenshot({ path: 'scripts/region-' + n.replace(/\W+/g, '_') + '.png' });
    await page.evaluate(() => window.__mbr.exitRegion());
    await page.waitForFunction(() => window.__mbr.view === 'world', { timeout: 10000 }).catch(() => {});
  }
  s = await page.evaluate(() => window.__mbr.snapshot());

  await page.evaluate(() => document.getElementById('saveBtn').click());
  await sleep(300);
  const saves = await page.evaluate(() => JSON.parse(localStorage.getItem('gamesaves') || '[]').length);
  check(saves >= 1, 'game saved to localStorage');
  const savedMoney = await page.evaluate(() => JSON.parse(localStorage.getItem('gamesaves'))[0].state.money);

  await page.evaluate(() => document.getElementById('exitBtn').click());
  await page.evaluate(() => document.getElementById('savesMenuBtn').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('#savesList .save-item button').click());
  s = await page.evaluate(() => window.__mbr.snapshot());
  check(s.buildings === 3 && Math.abs(s.money - savedMoney) < 5 && s.owned.includes('Türkiye'), 'save loads back (buildings ' + s.buildings + ', money ' + Math.round(s.money) + ' vs ' + Math.round(savedMoney) + ', owned ' + s.owned.join('/') + ')');

  await page.screenshot({ path: process.env.SHOT || 'scripts/last-smoke.png' });
} catch (e) {
  errors.push('test aborted: ' + e.message);
} finally {
  await browser.close();
}
const real = errors.filter(e => !/flagcdn|commons\.wikimedia|Failed to load resource/.test(e));
check(real.length === 0, 'no page errors' + (real.length ? ':\n    ' + real.join('\n    ') : ''));
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
