// World-map screenshots at a few zoom levels (visual check, not a test).
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'http://localhost:4173/', OUT = process.env.OUT || 'scripts', ERA = process.env.ERA || '2014';
const HOME = ERA === '1810' ? 'Ottoman Empire' : 'Türkiye';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto(BASE + '?test'); await p.click('#playSolo'); await p.click('#era' + ERA);
await p.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 90000 });
await sleep(800); await p.screenshot({ path: `${OUT}/w${ERA}-select.png` });
await p.evaluate(h => window.__mbr.chooseCountry(h), HOME); await p.click('#ideoCap'); await p.click('#persWork');
await sleep(800); await p.screenshot({ path: `${OUT}/w${ERA}-full.png` });
for (const [name, d, pitch, tag] of [[HOME, 330, .8, 'mid'], [HOME, 90, .9, 'close']]) {
  await p.evaluate((n, d, pt) => window.__mbr.look(n, d, pt), name, d, pitch); await sleep(900);
  await p.screenshot({ path: `${OUT}/w${ERA}-${tag}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await b.close();
