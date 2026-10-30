// 1810 era check + real mouse-wheel zoom transition (world -> region -> world).
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:4173/';
const OUT = process.env.OUT || 'scripts';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
await page.goto(BASE + '?test', { waitUntil: 'load' });
await page.click('#playSolo'); await page.click('#era1810');
await page.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 60000 });
await page.evaluate(() => window.__mbr.chooseCountry('Ottoman Empire'));
await page.click('#ideoMil'); await page.click('#persWar');
for (const n of ['Ottoman Empire', 'France', 'Japan']) {
  await page.evaluate(n => window.__mbr.enterRegion(n), n);
  await page.waitForFunction(() => window.__mbr.view === 'region', { timeout: 30000 });
  console.log(n, JSON.stringify(await page.evaluate(() => window.__mbr.regionInfo())));
  await sleep(1300);
  await page.screenshot({ path: `${OUT}/r1810-${n.replace(/\W+/g, '_')}.png` });
  await page.evaluate(() => window.__mbr.exitRegion());
  await page.waitForFunction(() => window.__mbr.view === 'world', { timeout: 60000 });
}
// real wheel: zoom in over the screen centre until the region opens, then out until the world returns
await page.mouse.move(640, 460);
for (let i = 0; i < 60 && await page.evaluate(() => window.__mbr.view) === 'world'; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(60); }
await sleep(1500);
console.log('after wheel-in:', await page.evaluate(() => window.__mbr.view), JSON.stringify(await page.evaluate(() => window.__mbr.regionInfo())));
for (let i = 0; i < 40 && await page.evaluate(() => window.__mbr.view) === 'region'; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(80); }
await sleep(1200);
console.log('after wheel-out:', await page.evaluate(() => window.__mbr.view));
await page.screenshot({ path: `${OUT}/r1810-back-to-world.png` });
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
