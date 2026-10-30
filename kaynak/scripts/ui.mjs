// HUD screenshots: overview, enemy country panel, build drawer, tax popover, toasts, paused.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT || 'scripts', W = +(process.env.W || 1280), H = +(process.env.H || 800);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`] });
const p = await b.newPage(); await p.setViewport({ width: W, height: H });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:4173/?test'); await p.click('#playSolo'); await p.click('#era2014');
await p.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 90000 });
await p.evaluate(() => window.__mbr.chooseCountry('Türkiye')); await p.click('#ideoCap'); await p.click('#persWork');
await p.evaluate(() => { window.__mbr.set('moneyCap', 60000); window.__mbr.set('money', 30000); window.__mbr.look('Türkiye', 330, .8); });
const cap = await p.evaluate(() => window.__mbr.capital('Türkiye'));
await p.evaluate(([x, z]) => { window.__mbr.build('base', x - 5, z + 3); window.__mbr.build('field', x + 6, z); }, cap);
await sleep(900); await p.screenshot({ path: `${OUT}/ui-${W}-overview.png` });
// click a neighbour on the map -> context panel
const [sx, sy] = await p.evaluate(() => window.__mbr.screenOf('Syria'));
await p.mouse.click(sx, sy); await sleep(700);
await p.screenshot({ path: `${OUT}/ui-${W}-ctx.png` });
await p.keyboard.press('Escape');
await p.keyboard.press('b'); await sleep(400); await p.click('.bopt[data-b="bank"]'); await sleep(400);
await p.screenshot({ path: `${OUT}/ui-${W}-build.png` });
await p.keyboard.press('Escape'); await p.click('#taxAct'); await p.keyboard.press(' '); await sleep(500);
await p.screenshot({ path: `${OUT}/ui-${W}-tax-paused.png` });
console.log('speed after space:', await p.evaluate(() => document.querySelector('#speed .on').dataset.speed));
console.log('errors:', errors.length ? errors : 'none');
await b.close();
