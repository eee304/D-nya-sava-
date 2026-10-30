// Battle effects: pooled smoke puffs and muzzle/explosion flashes as sprites.
// `scale` converts the region-sized defaults to the parent's units (world map uses bigger numbers).
import * as THREE from 'three';

let smokeTex = null, flashTex = null;
function textures() {
  if (smokeTex) return;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  let s = 3; const r = () => (s = s * 48271 % 2147483647) / 2147483647;
  for (let i = 0; i < 6; i++) {
    const cx = 32 + (r() - .5) * 18, cy = 32 + (r() - .5) * 18, rad = 14 + r() * 12, g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  smokeTex = new THREE.CanvasTexture(c);
  const f = document.createElement('canvas'); f.width = f.height = 32; const y = f.getContext('2d'), g = y.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.35, 'rgba(255,180,60,.9)'); g.addColorStop(1, 'rgba(255,120,20,0)');
  y.fillStyle = g; y.fillRect(0, 0, 32, 32); flashTex = new THREE.CanvasTexture(f);
}

export class FX {
  constructor(parent, scale = 1, nSmoke = 140, nFlash = 40) {
    textures();
    this.scale = scale; this.group = new THREE.Group(); parent.add(this.group);
    this.smokes = []; this.flashes = []; this.si = 0; this.fi = 0;
    for (let i = 0; i < nSmoke; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#d8d3ca', transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false; this.group.add(sp); this.smokes.push({ sp, life: 0, max: 1 });
    }
    for (let i = 0; i < nFlash; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.visible = false; this.group.add(sp); this.flashes.push({ sp, life: 0 });
    }
    // rifle tracers (short glowing streaks)
    this.tracers = [];
    const tMat = new THREE.LineBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); const l = new THREE.Line(g, tMat); l.visible = false; l.frustumCulled = false; this.group.add(l); this.tracers.push({ l, life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() }); }
    // artillery shells flying in an arc
    this.shells = [];
    for (let i = 0; i < 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.visible = false; this.group.add(sp); this.shells.push({ sp, t: 0, dur: 1, a: new THREE.Vector3(), b: new THREE.Vector3() }); }
    // scorch marks left by hits
    this.craters = []; this.ci = 0;
    const cMat = new THREE.MeshBasicMaterial({ map: smokeTex, color: '#1a140e', transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cMat.clone()); m.visible = false; this.group.add(m); this.craters.push({ m, life: 0 }); }
    // persistent fires (burning buildings during a siege)
    this.fires = [];
    this.rain = null;
  }
  tracer(from, to) {
    const tr = this.tracers.find(x => !x.l.visible); if (!tr) return;
    const j = 1.2 * this.scale;
    tr.a.copy(from); tr.b.set(to.x + (Math.random() - .5) * j, to.y + .4 * this.scale + (Math.random() - .5) * .3, to.z + (Math.random() - .5) * j);
    tr.life = 0; tr.l.visible = true;
  }
  shell(from, to, spread) {
    const sh = this.shells.find(x => !x.sp.visible); if (!sh) { this.boom(to.x, to.y, to.z); return; }
    sh.a.copy(from); sh.b.set(to.x + (Math.random() - .5) * spread, to.y, to.z + (Math.random() - .5) * spread);
    sh.t = 0; sh.dur = .7 + sh.a.distanceTo(sh.b) / (30 * this.scale); sh.sp.visible = true; sh.sp.scale.setScalar(.35 * this.scale);
  }
  crater(x, y, z, size) {
    const c = this.craters[this.ci++ % this.craters.length];
    c.m.position.set(x, y + .03 * this.scale, z); c.m.scale.setScalar(size * this.scale); c.m.material.opacity = .75; c.life = 0; c.m.visible = true;
  }
  fire(x, y, z, size = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (const [s, h, c] of [[1.2, .9, '#ff5a1f'], [.85, 1.4, '#ff9a2e'], [.5, 1.9, '#ffe08a']]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.set(s * size * this.scale, s * size * 1.5 * this.scale, 1); sp.position.y = h * size * .5 * this.scale; g.add(sp);
    }
    this.group.add(g); this.fires.push({ g, ph: Math.random() * 6, size });
  }
  setRain(on, center) {
    if (on && !this.rain) {
      const n = 1500, pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) { const x = (Math.random() - .5) * 60, y = Math.random() * 30, z = (Math.random() - .5) * 60; pos.set([x, y, z, x + .15, y - .9, z + .1], i * 6); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b8c7d8', transparent: true, opacity: .35 }));
      this.rain.frustumCulled = false; this.group.add(this.rain);
    }
    if (this.rain) { this.rain.visible = on; if (center) this.rain.position.set(center.x, 0, center.z); }
  }
  puff(x, y, z, size, life, color = '#d8d3ca', vy = .5) {
    const p = this.smokes[this.si++ % this.smokes.length], k = this.scale;
    p.sp.position.set(x, y, z); p.sp.material.color.set(color);
    Object.assign(p, { size: size * k, life: 0, max: life, vy: vy * k, vx: ((Math.random() - .5) * .3 + .25) * k });
    p.sp.visible = true;
  }
  flash(x, y, z, size) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.sp.position.set(x, y, z); f.sp.scale.setScalar(size * this.scale); f.life = 0; f.sp.visible = true;
  }
  // shell hit: flash + dirt and dark smoke (+ a scorch mark)
  boom(x, y, z, big = 1) {
    this.crater(x, y, z, 1.6 * big);
    this.flash(x, y + .3 * this.scale, z, 1.2 * big);
    this.puff(x, y + .3 * this.scale, z, 1.5 * big, 2.2, '#8a7458', .8);
    this.puff(x, y + .5 * this.scale, z, 1.0 * big, 1.8, '#5f5244', 1.2);
  }
  update(dt) {
    for (const p of this.smokes) if (p.sp.visible) {
      p.life += dt; const k = p.life / p.max;
      if (k >= 1) { p.sp.visible = false; continue; }
      p.sp.position.y += p.vy * dt; p.sp.position.x += p.vx * dt;
      p.sp.scale.setScalar(p.size * (.6 + k * 1.8)); p.sp.material.opacity = (1 - k) * .75;
    }
    for (const f of this.flashes) if (f.sp.visible) { f.life += dt; if (f.life > .09) f.sp.visible = false; }
    for (const tr of this.tracers) if (tr.l.visible) {
      tr.life += dt; const k = tr.life / .12; if (k >= 1) { tr.l.visible = false; continue; }
      const p = tr.l.geometry.attributes.position;
      p.setXYZ(0, ...tr.a.clone().lerp(tr.b, Math.max(0, k - .25)).toArray()); p.setXYZ(1, ...tr.a.clone().lerp(tr.b, k).toArray()); p.needsUpdate = true;
    }
    for (const sh of this.shells) if (sh.sp.visible) {
      sh.t += dt; const k = Math.min(1, sh.t / sh.dur), h = sh.a.distanceTo(sh.b) * .35;
      sh.sp.position.copy(sh.a).lerp(sh.b, k); sh.sp.position.y += Math.sin(k * Math.PI) * h;
      if (Math.random() < .5) this.puff(sh.sp.position.x, sh.sp.position.y, sh.sp.position.z, .35, 1.2, '#c9c4bb', .1);
      if (k >= 1) { sh.sp.visible = false; this.boom(sh.b.x, sh.b.y, sh.b.z, 1.2); }
    }
    for (const c of this.craters) if (c.m.visible) { c.life += dt; if (c.life > 18) { c.m.material.opacity = Math.max(0, .75 - (c.life - 18) * .2); if (c.m.material.opacity <= 0) c.m.visible = false; } }
    for (const f of this.fires) { f.ph += dt * 7; f.g.children.forEach((sp, i) => { const w = 1 + Math.sin(f.ph + i * 1.7) * .18; sp.scale.x = sp.scale.x / (sp.userData.w || 1) * w; sp.userData.w = w; sp.material.opacity = .75 + Math.sin(f.ph * 1.3 + i) * .25; });
      if (Math.random() < dt * 3) this.puff(f.g.position.x, f.g.position.y + 1.6 * f.size * this.scale, f.g.position.z, 1.3 * f.size, 4, '#3d3a37', .7); }
    if (this.rain && this.rain.visible) { this.rain.position.y -= dt * 28; if (this.rain.position.y < -15) this.rain.position.y += 15; }
  }
  dispose() {
    this.group.parent && this.group.parent.remove(this.group);
    for (const p of [...this.smokes, ...this.flashes, ...this.shells]) p.sp.material.dispose();
    for (const c of this.craters) { c.m.geometry.dispose(); c.m.material.dispose(); }
  }
}
