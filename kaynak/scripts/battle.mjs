// Battle flow: build a base, raise an army, invade a neighbour, watch it on the map and in the region view.
import puppeteer from 'puppeteer-core';
const OUT = process.env.OUT || 'scripts', ERA = process.env.ERA || '2014';
const HOME = ERA === '1810' ? 'Ottoman Empire' : 'Türkiye', TARGET = process.env.TARGET || (ERA === '1810' ? 'Persia' : 'Syria');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
await p.goto('http://localhost:4173/?test'); await p.click('#playSolo'); await p.click('#era' + ERA);
await p.waitForFunction(() => window.__mbr && window.__mbr.worldBuilt, { timeout: 90000 });
await p.evaluate(h => window.__mbr.chooseCountry(h), HOME); await p.click('#ideoMil'); await p.click('#persWar');
const cap = await p.evaluate(h => window.__mbr.capital(h), HOME);
await p.evaluate(h => { window.__HOME = h; }, HOME);
await p.evaluate(([x, z]) => { const m = window.__mbr; m.set('moneyCap', 90000); m.set('money', 60000); m.build('base', x + 4, z + 2); m.troops(window.__HOME, 30000); m.set('tankCount', 9); }, cap);
await p.evaluate((h) => window.__mbr.look(h, 160, .85), HOME);
await p.evaluate(t => window.__mbr.invade(t), TARGET);
console.log('phase after order:', await p.evaluate(() => window.__mbr.invasionPhase), '|', await p.evaluate(() => window.__mbr.hint()));
await sleep(900); await p.screenshot({ path: `${OUT}/b${ERA}-march.png` });
await p.waitForFunction(() => window.__mbr.invasionPhase === 'battle', { timeout: 60000 });
// full-screen cutscene: title card, then five shots, then back to the map
await sleep(700); await p.screenshot({ path: `${OUT}/b${ERA}-cine-card.png` });
for (const [at, tag] of [[1.5, 'establish'], [4.6, 'advance'], [7.4, 'clash'], [10.2, 'front'], [13.6, 'verdict']]) {
  await p.waitForFunction(t => window.__mbr.cineT >= t, { timeout: 60000 }, at);
  await p.screenshot({ path: `${OUT}/b${ERA}-cine-${tag}.png` });
}
console.log('cinematic on:', await p.evaluate(() => document.body.classList.contains('cinematic')));
await p.waitForFunction(() => !document.body.classList.contains('cinematic'), { timeout: 30000 });
await p.waitForFunction(() => !window.__mbr.invasionPhase, { timeout: 30000 });
await sleep(800); await p.screenshot({ path: `${OUT}/b${ERA}-battle-end.png` });
console.log('result:', await p.evaluate(() => window.__mbr.hint()), '| army', await p.evaluate(() => window.__mbr.snapshot().army));
await p.evaluate(() => { const c = document.querySelector('#conquerModal.open #takeAll'); if (c) c.click(); });
console.log('bot battles started:', await p.evaluate(() => window.__mbr.botsTick()));
await p.evaluate(() => window.__mbr.lookAtBotBattle(140));
await sleep(1200); await p.screenshot({ path: `${OUT}/b${ERA}-bots-march.png` });
await sleep(3500); await p.screenshot({ path: `${OUT}/b${ERA}-bots.png` });
console.log('errors:', errors.length ? errors : 'none');
await b.close();
