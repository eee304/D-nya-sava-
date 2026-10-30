// Main-menu background: a slowly turning globe with empires painted on it and countryballs on a few capitals.
// Uses a light, pre-simplified world file so it starts before the real map is loaded.
import { geoOrthographic, geoPath, geoGraticule10, geoDistance, geoCentroid } from 'd3-geo';
import { hashStr } from '../region/noise.js';

const EMPIRE = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff69b4', '#3d6bff', '#b8e04a', '#c0392b'];
// [country, flag stripes top→bottom]
const BALLS = [['Turkey', ['#e30a17', '#e30a17', '#ffffff']], ['Germany', ['#000000', '#dd0000', '#ffce00']], ['Russia', ['#ffffff', '#1c3faa', '#d52b1e']],
  ['France', ['#0055a4', '#ffffff', '#ef4135']], ['Iran', ['#239f40', '#ffffff', '#da0000']], ['Egypt', ['#ce1126', '#ffffff', '#000000']],
  ['Brazil', ['#009c3b', '#ffdf00', '#009c3b']], ['China', ['#de2910', '#de2910', '#ffde00']], ['United States of America', ['#b22234', '#ffffff', '#3c3b6e']],
  ['India', ['#ff9933', '#ffffff', '#138808']], ['Japan', ['#ffffff', '#bc002d', '#ffffff']], ['Australia', ['#012169', '#ffffff', '#e4002b']]];

function landTone(lat) {
  const a = Math.abs(lat);
  return a > 62 ? [222, 228, 232] : a < 14 ? [74, 132, 56] : a < 32 ? [200, 182, 130] : [128, 160, 82];
}
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function drawBall(ctx, x, y, s, cols, bob) {
  y += bob;
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.clip();
  cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - s, y - s + i * (2 * s / 3), 2 * s, 2 * s / 3 + 1); });
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(x - s * .3, y - s * .45, s * .45, s * .22, -.4, 0, 7); ctx.fill();
  ctx.restore();
  ctx.lineWidth = Math.max(1.2, s * .07); ctx.strokeStyle = '#0a111c'; ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.stroke();
  for (const ex of [-.3, .3]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + ex * s, y - s * .05, s * .2, s * .25, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0a111c'; ctx.beginPath(); ctx.arc(x + ex * s + s * .04, y - s * .02, s * .09, 0, 7); ctx.fill();
  }
}

export function startMenuGlobe(canvas, url, isVisible) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let world = null, colors = new Map(), balls = [], rot = -25, W = 0, H = 0, proj, path, stars = [];
  for (let i = 0; i < 160; i++) stars.push([Math.random(), Math.random(), Math.random()]);
  function size() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = Math.max(10, r.width * dpr); H = canvas.height = Math.max(10, r.height * dpr);
    // the globe sits right of the menu on wide screens, behind it (faded by CSS) on phones
    const wide = W > H * 1.1;
    proj = geoOrthographic().scale(wide ? Math.min(W * .3, H * .44) : W * .48).translate([wide ? W * .68 : W * .5, H * (wide ? .5 : .62)]).clipAngle(90);
    path = geoPath(proj, ctx);
  }
  addEventListener('resize', size); size();
  fetch(url).then(r => r.json()).then(gj => {
    world = gj.features;
    // about half the countries belong to one of ten empires (stable per country name)
    for (const f of world) {
      const n = f.properties.n || f.properties.name || '', h = hashStr(n), lat = geoCentroid(f)[1];
      const base = landTone(lat), emp = h % 10 < 5 ? hexRgb(EMPIRE[h % EMPIRE.length]) : null;
      colors.set(f, emp ? mix(base, emp, .62) : mix(base, base, 0));
    }
    for (const [name, cols] of BALLS) {
      const f = world.find(q => (q.properties.n || q.properties.name) === name);
      if (f) balls.push({ ll: geoCentroid(f), cols, ph: Math.random() * 6 });
    }
  }).catch(() => {});
  function frame(t) {
    requestAnimationFrame(frame);
    if (!isVisible()) return;
    if (canvas.clientWidth && Math.abs(canvas.clientWidth * Math.min(2, devicePixelRatio || 1) - W) > 2) size();
    ctx.clearRect(0, 0, W, H);
    for (const [x, y, b] of stars) { ctx.fillStyle = `rgba(200,220,255,${.12 + b * .4})`; ctx.fillRect(x * W, y * H, 1.5, 1.5); }
    const r = proj.scale();
    const [gx, gy] = proj.translate();
    const halo = ctx.createRadialGradient(gx, gy, r * .92, gx, gy, r * 1.28);
    halo.addColorStop(0, 'rgba(90,170,255,.45)'); halo.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(gx, gy, r * 1.28, 0, 7); ctx.fill();
    proj.rotate([rot, -20]);
    const sea = ctx.createRadialGradient(gx - r * .3, gy - r * .3, r * .1, gx, gy, r);
    sea.addColorStop(0, '#1f6aa0'); sea.addColorStop(1, '#0a2440');
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = sea; ctx.fill();
    ctx.beginPath(); path(geoGraticule10()); ctx.strokeStyle = 'rgba(140,190,240,.08)'; ctx.lineWidth = 1; ctx.stroke();
    if (world) for (const f of world) {
      ctx.beginPath(); path(f); ctx.fillStyle = colors.get(f); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = .6; ctx.stroke();
    }
    // night side
    const shade = ctx.createLinearGradient(gx - r, 0, gx + r, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.62, 'rgba(0,0,0,.05)'); shade.addColorStop(1, 'rgba(0,10,25,.55)');
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = shade; ctx.fill();
    for (const b of balls) {
      const d = geoDistance(b.ll, [-rot, 20]); if (d > 1.4) continue;
      const [x, y] = proj(b.ll), s = r * .055 * (1 - d / 3.2);
      drawBall(ctx, x, y - s * 1.2, s, b.cols, reduce ? 0 : Math.sin(t / 480 + b.ph) * s * .12);
    }
    if (!reduce) rot += .1;
  }
  requestAnimationFrame(frame);
}
