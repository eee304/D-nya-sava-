// A block of soldiers (plus tanks or cannons behind them) drawn with InstancedMesh.
// Soldiers are a body + two swinging legs: they march, kneel to fire and collapse when hit.
// The group is positioned/rotated by its owner; locally the front rank stands at z=0 facing +z.
import * as THREE from 'three';
import { soldierParts, cavalryParts, riderParts, tankGeo, cannonGeo, UNIT_MAT } from './models.js';
import { makeHorse } from '../region/life.js';
import { makeHuman, humanName } from './humans.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(1, 1, 1);
const _body = new THREE.Matrix4(), _leg = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _p = new THREE.Vector3();
const HIP = .26;

export class Formation {
  // kind: 'infantry' | 'cavalry'; vehFront: tanks lead the block instead of following it
  constructor(parent, { era = '2014', team = '#c0392b', count = 24, cols = 6, spacing = .62, vehicles = 0, scale = 1, stance = 'line', kind = 'infantry', vehFront = false, culture = 'european' } = {}) {
    this.group = new THREE.Group(); this.group.scale.setScalar(scale); parent.add(this.group);
    this.era = era; this.count = count; this.cols = cols; this.sp = spacing; this.scale = scale;
    this.kind = kind;
    // cavalry rides the rigged Blender horse when it has loaded (riders are instanced, horses are skinned clones)
    this.horses = kind === 'cavalry' ? Array.from({ length: count }, () => makeHorse(['#6b4a32', '#8a5a3a', '#3a2a22', '#5a4030', '#d8cdb5'][Math.floor(Math.random() * 5)])) : null;
    if (this.horses && this.horses.some(h => !h)) this.horses = null;
    const parts = this.horses ? { body: riderParts(team, culture), leg: null, legs: [] } : kind === 'cavalry' ? cavalryParts(team) : soldierParts(era, team);
    this.legDefs = parts.legs || [[-.05, 0, 1], [.05, 0, -1]]; this.hip = parts.hip || HIP;
    this.men = new THREE.InstancedMesh(parts.body, UNIT_MAT, count);
    this.legMeshes = this.legDefs.map(() => new THREE.InstancedMesh(parts.leg, UNIT_MAT, count));
    if (this.horses) for (const h of this.horses) { h.g.scale.setScalar(.55); this.group.add(h.g); }
    // infantry: rigged Blender soldiers (instanced blocks stay as the fallback until the models have loaded)
    if (kind !== 'cavalry') {
      const name = humanName('soldier', era, culture), hs = Array.from({ length: count }, () => makeHuman(name, { team }));
      if (hs.every(Boolean)) {
        this.humans = hs;
        hs.forEach((h, i) => { h.g.scale.setScalar(.64); this.group.add(h.g); if (count > 16) h.setLod(i % 2); });   // big blocks: half the men animate at 30 Hz
      }
    }
    if (this.humans) for (const m of [this.men, ...this.legMeshes]) m.visible = false;
    for (const m of [this.men, ...this.legMeshes]) { m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.nVeh = vehicles;
    if (vehicles) {
      this.veh = new THREE.InstancedMesh(era === '2014' ? tankGeo(team) : cannonGeo(), UNIT_MAT, vehicles);
      this.veh.castShadow = true; this.veh.frustumCulled = false; this.group.add(this.veh);
    }
    const rows = Math.ceil(count / cols);
    this.units = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      // 'loose' = skirmish order: wider, staggered
      const jx = stance === 'loose' ? (Math.random() - .5) * spacing * .9 : (Math.random() - .5) * .08;
      const jz = stance === 'loose' ? (Math.random() - .5) * spacing * .9 : (Math.random() - .5) * .08;
      this.units.push({ row: r, lx: (c - (cols - 1) / 2) * spacing * (stance === 'loose' ? 1.5 : 1) + jx, lz: -r * spacing * 1.05 + jz,
        ph: Math.random() * 6, yaw: (Math.random() - .5) * 2.4, rank: Math.random(), fall: 0, kneel: 0, side: Math.random() < .5 ? -1 : 1 });
    }
    // who falls first: random order, front rank slightly more likely
    const order = this.units.map((u, i) => [u.rank + u.row * .08, i]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, i], k) => { this.units[i].fallOrder = k; });
    this.vehicles = [];
    for (let i = 0; i < vehicles; i++) this.vehicles.push({ lx: (i - (vehicles - 1) / 2) * 1.5, lz: vehFront ? 1.6 : -rows * spacing * 1.05 - .9, next: 1 + i * .8 + Math.random(), ph: Math.random() * 6 });
    this.fallen = 0; this.t = 0; this.moving = false; this.firing = false; this.target = null; this.charge = false;
    this.update(0);
  }
  setCasualties(frac) { this.fallen = Math.round(this.count * Math.max(0, Math.min(1, frac))); }
  // local point -> the FX group's space (the FX may live higher up the scene graph than this formation)
  toFx(fx, x, y, z) { this.group.updateWorldMatrix(true, false); return fx.group.worldToLocal(_v.set(x, y, z).applyMatrix4(this.group.matrixWorld)); }

  update(dt, fx) {
    this.t += dt;
    const cav = this.kind === 'cavalry', t = this.t, pace = cav ? 15 : this.charge ? 13 : 7, stride = cav ? .7 : this.charge ? .75 : .45;
    for (let i = 0; i < this.count; i++) {
      const u = this.units[i], down = u.fallOrder < this.fallen;
      // a hit soldier crumples over ~0.6 s instead of snapping flat
      u.fall = down ? Math.min(1, u.fall + dt / .6) : Math.max(0, u.fall - dt * 2);
      // front rank kneels while volleying
      const wantKneel = this.firing && u.row === 0 && !down && !cav ? 1 : 0;
      u.kneel += (wantKneel - u.kneel) * Math.min(1, dt * 6);
      const f = u.fall * u.fall * (3 - 2 * u.fall), walk = this.moving && !down;
      const swing = walk ? Math.sin(t * pace + u.ph) * stride : 0;
      const bob = walk ? Math.abs(Math.cos(t * pace + u.ph)) * (cav ? .08 : .035) : 0;
      // body transform: position, yaw (+ a twist as he falls), pitch forward/back when falling, kneel lowers the hips
      _e.set(u.side * Math.PI / 2 * f, (this.firing || walk ? 0 : Math.sin(t * .8 + u.ph) * .04) + u.yaw * f, 0);   // falls forwards or backwards
      _q.setFromEuler(_e);
      _p.set(u.lx, bob - u.kneel * .1 + f * .05, u.lz);
      _body.compose(_p, _q, _s);
      this.men.setMatrixAt(i, _body);
      if (this.humans) {   // pick the clip from what the block is doing; a fallen man keeps his last pose and topples
        const h = this.humans[i];
        h.g.position.set(u.lx, f * .03, u.lz); h.g.quaternion.copy(_q);
        const clip = down ? null : walk ? (this.charge ? 'run' : 'march') : this.firing ? (u.row === 0 && this.era === '1810' ? 'kneel' : 'aim') : 'idle';
        if (clip) h.play(clip, dt, walk ? (this.charge ? 1.15 : 1.25) : 1);
      }
      if (this.horses) {   // the horse carries the rider: same place, falls with him; gallops when charging
        const h = this.horses[i];
        h.g.position.set(u.lx, f * -.05, u.lz); h.g.rotation.set(u.side * Math.PI / 2 * f * .9, (this.firing || walk ? 0 : Math.sin(t * .8 + u.ph) * .04) + u.yaw * f, 0);
        h.update(down ? 0 : walk ? (this.charge ? 2.4 : 1.2) * dt : 0, t, down ? 0 : dt, this.charge || this.moving);
      }
      // legs hang from the hips; kneeling folds one leg back and the other forward
      this.legDefs.forEach(([sx, sz, sgn], k) => {
        const rx = swing * sgn - u.kneel * (sgn > 0 ? 1.45 : -0.2);
        _leg.compose(_v.set(sx, this.hip, sz), _q.setFromEuler(new THREE.Euler(rx, 0, 0)), _s);
        this.legMeshes[k].setMatrixAt(i, _loc.copy(_body).multiply(_leg));
      });
      // front-rank volleys
      if (fx && this.firing && !cav && !down && u.row === 0 && Math.random() < dt * .35) {
        const p = this.toFx(fx, u.lx + .12, .5 - u.kneel * .1, u.lz + .5);
        fx.flash(p.x, p.y, p.z, .45);
        // black powder: each volley leaves a thick white bank that hangs over the line; modern rifles only a wisp
        if (this.era === '1810') { fx.puff(p.x, p.y, p.z, 1.25, 5.5, '#eeede8', .1); fx.puff(p.x, p.y + .15 * this.scale, p.z, .9, 4, '#f4f3ef', .18); }
        else fx.puff(p.x, p.y, p.z, .5, 1.6, '#e4e0d8', .25);
        if (this.era === '2014' && fx.tracer && this.target) fx.tracer(p, this.target);
      }
    }
    for (const m of [this.men, ...this.legMeshes]) m.instanceMatrix.needsUpdate = true;
    // marching feet and hooves kick up dust
    if (fx && this.moving && Math.random() < dt * (cav ? 14 : this.charge ? 9 : 5)) {
      const u = this.units[Math.floor(Math.random() * this.count)];
      if (!(u.fallOrder < this.fallen)) { const p = this.toFx(fx, u.lx, .05, u.lz - .2); fx.puff(p.x, p.y, p.z, cav ? 1 : .7, 2.4, '#b8a07a', .12); }
    }
    if (this.veh) {
      for (let i = 0; i < this.nVeh; i++) {
        const v = this.vehicles[i];
        let kick = 0;
        if (fx && this.firing && t > v.next) {
          v.next = t + 2.2 + Math.random() * 1.6; v.kickT = t;
          const muzzle = this.toFx(fx, v.lx, .45, v.lz + (this.era === '2014' ? .85 : .7)).clone();
          fx.flash(muzzle.x, muzzle.y, muzzle.z, 1.4);
          for (let k = 0; k < 3; k++) fx.puff(muzzle.x, muzzle.y + k * .05 * this.scale, muzzle.z, 1.2 + k * .3, 3.2, '#d8d3ca', .35);
          if (this.target) { const tg = this.target, j = 2.5 * this.scale; if (fx.shell) fx.shell(muzzle, tg, j); else setTimeout(() => fx.boom(tg.x + (Math.random() - .5) * j, tg.y, tg.z + (Math.random() - .5) * j), 420); }
        }
        if (v.kickT != null) kick = Math.max(0, .25 - (t - v.kickT) * .8);
        // tanks rock a little while driving
        const rock = this.moving ? Math.sin(t * 9 + v.ph) * .02 : 0;
        _e.set(rock, 0, rock * .5); _q.setFromEuler(_e);
        _body.compose(_v.set(v.lx, this.moving ? Math.abs(Math.sin(t * 9 + v.ph)) * .02 : 0, v.lz - kick), _q, _s);
        this.veh.setMatrixAt(i, _body);
      }
      this.veh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() { this.group.parent && this.group.parent.remove(this.group); for (const m of [this.men, ...this.legMeshes, this.veh]) if (m) m.dispose(); }
}
