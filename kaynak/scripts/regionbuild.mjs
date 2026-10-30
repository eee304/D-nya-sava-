// Build inside the region view: pick a type, find a green spot under the cursor, click, check economy + scene.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT || 'scripts';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:4173/?test'); await p.click('#playSolo'); await p.click('#era2014');
await p.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 90000 });
await p.evaluate(() => window.__mbr.chooseCountry('Türkiye')); await p.click('#ideoCap'); await p.click('#persWork');
await p.evaluate(() => { const m = window.__mbr; m.set('moneyCap', 90000); m.set('money', 60000); });
await p.evaluate(() => window.__mbr.enterRegion('Türkiye'));
await p.waitForFunction(() => window.__mbr.view === 'region', { timeout: 30000 }); await sleep(1500);
let fails = 0;
for (const type of ['bank', 'field', 'base']) {
  const before = await p.evaluate(() => window.__mbr.snapshot());
  await p.keyboard.press('b'); await sleep(200); await p.click(`.bopt[data-b="${type}"]`); await sleep(200);
  let spot = null;
  for (let y = 520; y >= 180 && !spot; y -= 45) for (let x = 120; x <= 1160 && !spot; x += 55) {
    await p.mouse.move(x, y); const g = await p.evaluate(() => window.__mbr.regionGhost);
    if (g && g.ok) spot = [x, y];
  }
  if (!spot) { console.log(type, 'no green spot found'); fails++; continue; }
  await p.screenshot({ path: `${OUT}/rb-${type}-ghost.png` });
  await p.mouse.click(...spot); await sleep(400);
  const after = await p.evaluate(() => window.__mbr.snapshot());
  const placed = await p.evaluate(() => window.__mbr.regionPlaced());
  const ok = after.buildings === before.buildings + 1 && placed.includes(type);
  if (!ok) fails++;
  console.log(type, ok ? 'ok' : 'FAIL', '| buildings', before.buildings, '->', after.buildings, '| money', Math.round(before.money), '->', Math.round(after.money), '| hint:', await p.evaluate(() => window.__mbr.hint()));
  await p.keyboard.press('Escape');
}
await sleep(500); await p.screenshot({ path: `${OUT}/rb-after.png` });
console.log('errors:', errors.length ? errors : 'none', '| fails', fails);
await b.close();
process.exit(fails || errors.length ? 1 : 0);
