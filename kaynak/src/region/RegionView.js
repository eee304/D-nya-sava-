// Close-up isometric view of one country: generated terrain, town, the player's buildings and ambient life.
// The world map hands over a plain `info` object (see regionInfoFor in main.js); nothing here touches game state.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, lerp, makeRng, hashStr, along, polyLen } from './noise.js';
import { BIOMES, biomeFor, cultureFor } from './biomes.js';
import { buildTerrain, paintGround, waterNormals, outerGround, SIZE, HALF, N } from './terrain.js';
import { addVegetation, addOuterTrees } from './vegetation.js';
import { addGroundCover, addTownProps, addCrops, addFences, windTick } from './details.js';
import { makeHuman, humanName } from '../units/humans.js';
import { Life } from './life.js';
import { floraFor } from './flora.js';
import { Formation } from '../units/Formation.js';
import { FX } from '../units/fx.js';
import {
  Kit, house, landmark, wallSegment, tower, gateTower, barracks, mine, bank, factory, farmhouse, haystack, dock, bridge,
  flagTexture, makeFlag, makeWindmill, makeShip, animalGeo, ANIMAL_MAT, fishingBoat, pumpjack, box, cyl,
} from './builders.js';
import { setWindowGlow } from './textures.js';
import { RIGS } from './prefabs.js';

const VIEW_H = 40;            // world units visible vertically at zoom 1
const CAM_OFFSET = new THREE.Vector3(80, 76, 80);
export const REGION_MIN_ZOOM = .42;   // far enough out to overlook the whole province
const GHOST_OK = '#4aa8ff', GHOST_BAD = '#ff4f45';   // placement preview: blue = fits, red = cannot be built
const FIELD_COLORS = ['#c3a24a', '#7f9a3c', '#b8933f', '#9aa646', '#c9ac57', '#8c8a3a', '#a9a248'];   // same as the painted ground (terrain.js)
export const treeKey = (x, z) => x.toFixed(2) + ',' + z.toFixed(2);
const RIGS_HAVE = n => !!RIGS[n];

export class RegionView {
  constructor(renderer, { keys, labelsEl, onExit, post, env }) {
    this.renderer = renderer; this.post = post; this.env = env; this.keys = keys; this.labelsEl = labelsEl; this.onExit = onExit;
    this.active = false; this.info = null; this.scene = null;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 600);
    this.controls = new OrbitControls(this.cam, renderer.domElement);
    Object.assign(this.controls, {
      enabled: false, enableDamping: true, dampingFactor: .08, minZoom: REGION_MIN_ZOOM, maxZoom: 4,
      minPolarAngle: .62, maxPolarAngle: 1.18, screenSpacePanning: false, zoomToCursor: true,
    });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    // zooming out past the minimum returns to the world map
    renderer.domElement.addEventListener('wheel', e => {
      if (this.active && e.deltaY > 0 && this.cam.zoom <= REGION_MIN_ZOOM + .02 && this.t > .6) this.onExit && this.onExit();
    });
    this.t = 0; this.labels = [];
    this.battleSource = null;   // name -> {prog, lossA, lossD, won, attColor, defColor} while a battle is on
  }

  // Build the scene for a country. Heavy (~0.5–1.5 s); call behind a loading overlay.
  build(info) {
    if (this.scene && this.jobs) this.finishJobs();   // woodcutters still at work: their wood arrives now
    this.dispose(); this._base = null; this._wallR = 0;
    this.info = info;
    const rng = makeRng(hashStr(info.name + '|' + info.era));
    const biomeKey = biomeFor(info.lat, info.iso, info.lon);
    // local flavour: the biome's trees blended with the trees this place is known for (sakura in Japan, olives by the Mediterranean...)
    const flora = info.flora = floraFor(info.iso, info.lat, info.lon, biomeKey), B = { ...BIOMES[biomeKey] };
    const extra = Object.values(flora.trees).reduce((a, b) => a + b, 0);
    if (extra && biomeKey !== 'polar' && biomeKey !== 'desert') {
      B.trees = Object.fromEntries(Object.entries(B.trees).map(([k, w]) => [k, w * (1 - extra)]));
      for (const [k, w] of Object.entries(flora.trees)) B.trees[k] = (B.trees[k] || 0) + w;
    }
    const culture = cultureFor(info.lon, info.lat), era = info.era;
    info.biome = biomeKey; info.biomeLabel = B.label; info.culture = culture;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#b9cbd8');   // light sky that melts into the distance haze

    // light: tinted by climate
    const warm = biomeKey === 'desert' ? '#fff0d0' : biomeKey === 'boreal' || biomeKey === 'polar' ? '#eef3ff' : '#fff0d8';
    this.hemi = new THREE.HemisphereLight(biomeKey === 'polar' ? '#dfeaff' : '#d8e8ff', '#a08a68', 1.75);   // generous sky light: shaded walls stay bright
    this.sun = new THREE.DirectionalLight(warm, biomeKey === 'desert' ? 3.0 : 2.7);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
    this.sun.shadow.bias = -.0004; this.sun.shadow.normalBias = .03;
    this.sunOff = new THREE.Vector3(38, 60, -18);
    scene.add(this.hemi, this.sun, this.sun.target);

    // player fields become painted fields in the layout
    const T = buildTerrain(info, B, rng);
    this.T = T;

    // ---- occupancy for placement
    const obstacles = [];
    const occupied = (x, z, r) => obstacles.some(o => Math.hypot(o[0] - x, o[1] - z) < o[2] + r);
    const freeSpot = (x, z, r) => T.H(x, z) > .4 && T.slope(x, z) < .8 && T.riverDist(x, z) > r + 2 && T.roadDist(x, z) > r + .9
      && !T.inField(x, z, .5) && !occupied(x, z, r) && Math.abs(x) < HALF - 5 && Math.abs(z) < HALF - 5;
    const findSpot = (x, z, r) => {
      for (let rad = 0; rad < 26; rad += 1.5) for (let k = 0; k < (rad ? 10 : 1); k++) {
        const a = k / 10 * Math.PI * 2, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        if (freeSpot(px, pz, r)) return [px, pz];
      } return null;
    };
    const roadAngle = (x, z) => {
      let bd = 1e9, ang = 0;
      for (const r of T.ROADS) for (let i = 0; i < r.length - 1; i++) {
        const dx = r[i + 1][0] - r[i][0], dz = r[i + 1][1] - r[i][1];
        const t = clamp(((x - r[i][0]) * dx + (z - r[i][1]) * dz) / (dx * dx + dz * dz), 0, 1);
        const dd = Math.hypot(x - r[i][0] - dx * t, z - r[i][1] - dz * t);
        if (dd < bd) { bd = dd; ang = Math.atan2(dx, dz); }
      } return ang;
    };
    // the player's fields, turned the way their preview was (along the nearest road)
    for (const b of info.buildings) if (b.type === 'field') T.FIELDS.push([b.x, b.z, 6, 5, -roadAngle(b.x, b.z)]);

    const K = new Kit(), patches = []; K.hi = true;
    this.flags = []; this.blades = []; this.ships = []; this.basePos = null; this.forms = []; this.battle = null;
    this.pumps = []; this.boats = []; this.chimneys = []; this.herds = [];
    const ownerTex = flagTexture(info.ownerColor, info.isPlayer);

    // ---- capital town
    // big landmark only in capitals and developed provinces; villages just have their square
    if (info.landmark !== false) {
      const lmPos = [2.5, -3.5], lmR = landmark(K, lmPos[0], T.H(...lmPos), lmPos[1], roadAngle(...lmPos), culture, era);
      obstacles.push([...lmPos, lmR]); patches.push([...lmPos, lmR + 1.5, .5]);
    }
    obstacles.push([0, 0, 3.8]);
    const rural = (info.devLevel ?? 2) <= 1;
    const town = (K, cx, cz, radius, count, scale = 1) => {
      let placed = 0;
      for (let i = 0; i < count * 18 && placed < count; i++) {
        const a = rng() * Math.PI * 2, r = 3 + Math.pow(rng(), .8) * radius, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, s = (.85 + rng() * .45) * scale;
        if (!freeSpot(x, z, 1.1 * s)) continue;
        const fr = house(K, x, T.H(x, z), z, roadAngle(x, z) + (rng() < .5 ? 0 : Math.PI / 2) + (rng() - .5) * .12, s, culture, era, rng, rural);
        obstacles.push([x, z, fr]); patches.push([x, z, fr * 1.5, .4]); placed++;
      }
      return placed;
    };
    const typeR = { city: 8, town: 5, base: 5.2, mine: 3, bank: 2.6, garage: 3.2, choco: 3.2, farm: 2.8, port: 2, shipyard: 2, field: 3.5, fishery: 2, ranch: 4, oilwell: 2.6, factory: 3.4 };
    // everything later placement (incl. buildings added by the player in this view) needs
    this._ctx = { T, rng, culture, era, obstacles, occupied, freeSpot, findSpot, roadAngle, town, ownerTex, patches, typeR };

    // ---- the player's buildings (mapped from their world-map positions)
    this.placed = [];
    for (const b of info.buildings) {
      if (b.type === 'city' && Math.hypot(b.x, b.z) < 9) continue;   // the capital itself
      this.placeModel(K, b);
    }

    // ---- capital houses fill the space left around the landmark and the player's buildings
    // (the player's provinces: a handful of cottages that grow into a town and a city as they are upgraded)
    const capCount = info.houses ?? [6, 14, 26, 40, 58][info.devLevel ?? 2];
    town(K, 0, 0, info.houses != null ? Math.min(T.townR, 4 + capCount * .55) : T.townR, capCount, info.houses != null && info.houses < 6 ? .78 : 1);

    // ---- walls (1810 only; huts get a palisade-free village)
    if (era !== '2014' && culture !== 'african' && info.walls !== false) {
      const WR = T.townR + 4.5; this._wallR = WR;
      const stone = culture === 'islamic' ? '#bba886' : '#a39b8b', roof = culture === 'eastasia' ? '#2f3a44' : '#5b6470';
      const gates = T.ROADS.map(r => Math.atan2(r[1][1] - r[0][1], r[1][0] - r[0][0]));
      const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      const segs = Math.round(WR * 2 * Math.PI / 1.7);
      for (let i = 0; i < segs; i++) {
        const am = (i + .5) / segs * Math.PI * 2; if (gates.some(g => angDiff(am, g) < .13)) continue;
        const x = Math.cos(am) * WR, z = Math.sin(am) * WR, y = T.H(x, z); if (y < .3 || T.riverDist(x, z) < 2 || occupied(x, z, .6) || T.inField(x, z, .4)) continue;   // never across a field
        wallSegment(K, x, y, z, am, 2 * WR * Math.sin(Math.PI / segs) + .08, stone, culture);
      }
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, x = Math.cos(a) * WR, z = Math.sin(a) * WR, y = T.H(x, z); if (y > .3 && !gates.some(g => angDiff(a, g) < .2) && T.riverDist(x, z) > 2 && !T.inField(x, z, 1) && !occupied(x, z, .8)) tower(K, x, y, z, stone, roof, culture); }
      for (const g of gates) for (const sg of [-1, 1]) {
        const a = g + sg * .16, x = Math.cos(a) * WR, z = Math.sin(a) * WR, y = T.H(x, z); if (y < .3) continue;
        gateTower(K, x, y, z, stone, roof, culture);
        if (sg > 0) { const f = makeFlag(K, ownerTex, .5, 1.2); f.group.position.set(x, y + 4, z); f.group.rotation.y = -Math.PI / 4; scene.add(f.group); this.flags.push(f); }
      }
    }
    const capFlag = makeFlag(K, ownerTex, 1.3, 4.5); capFlag.group.position.set(-2.8, T.H(-2.8, 2.5), 2.5); capFlag.group.rotation.y = -Math.PI / 4;
    scene.add(capFlag.group); this.flags.push(capFlag);

    // ---- countryside: windmills (1810) and haystacks near fields
    if (era !== '2014' && culture === 'european' && !info.isPlayer) {   // (the player's farms bring their own windmill)
      for (const [fx, fz] of T.FIELDS.slice(0, 2)) { const s = findSpot(fx + 5, fz, 1.6); if (s) { const w = makeWindmill(K, s[0], T.H(...s), s[1]); scene.add(w.cap, w.hub); this.blades.push(w.hub); obstacles.push([...s, 1.6]); } }
    }
    for (let i = 0; i < T.FIELDS.length * 2; i++) { const f = T.FIELDS[i % T.FIELDS.length], x = f[0] + (rng() - .5) * f[2] * .6, z = f[1] + (rng() - .5) * f[3] * .6; haystack(K, x, T.H(x, z), z); }
    for (const p of T.BRIDGES) bridge(K, p);

    // ---- town life: stalls, well, barrels, lamps, carts, fences (before trees, so the forest keeps clear of them)
    addTownProps(scene, T, info, rng, occupied, (x, z, r) => obstacles.push([x, z, r]));

    // ---- ground texture (after all patches are known)
    const tcv = paintGround(T, B, info, patches, 3072);
    const ttex = new THREE.CanvasTexture(tcv); ttex.colorSpace = THREE.SRGBColorSpace; ttex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.groundCanvas = tcv;
    const tg = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1); tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) tp.setY(i, T.HG[i]);
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ map: ttex, roughness: .96 }));
    terrain.receiveShadow = true; scene.add(terrain);
    // the land runs on past the playable square and fades into the haze
    const outer = new THREE.Mesh(outerGround(T, B, HALF + 205), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97 }));
    outer.receiveShadow = true; scene.add(outer);
    this.addOuterRoads(T, rng, era);
    const wtex = new THREE.CanvasTexture(waterNormals()); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set((2 * HALF + 440) / 7, (2 * HALF + 440) / 7); this.wtex = wtex;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 440, 2 * HALF + 440).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: B.water, transparent: true, opacity: .8, roughness: .22, metalness: .05, normalMap: wtex, normalScale: new THREE.Vector2(.55, .55), envMap: this.env, envMapIntensity: .45 }));
    water.position.y = .02; water.receiveShadow = true; scene.add(water);

    // ---- vegetation last, around everything placed
    // natural forest first; then what has been built over or felled is taken out of it
    const cut = new Set(info.cleared || []);
    // (own random stream, and the town's clearing applied afterwards: the town growing never moves a tree)
    const veg = addVegetation(scene, T, B, makeRng(hashStr(info.name + '|forest')), (x, z) => {
      const h = T.Hraw(x, z); if (h < .45 || h > B.snowAt + 1.5) return false;
      return T.riverDist(x, z) > 3.2 && T.roadDist(x, z) > 1.6 && T.slope(x, z) < 1.2;
    }, (x, z) => cut.has(treeKey(x, z)) ? 'cut' : (Math.hypot(x, z) < T.townR + 6.5 || T.inField(x, z, .6) || occupied(x, z, .4)));
    addOuterTrees(scene, T, B, rng);
    this.treeCount = veg.count; this.veg = veg.items; this.terrain = terrain; this.groundTex = ttex;
    this.indexTrees(); this.makeStumps(veg.stumps); this.jobs = [];
    this.addIdentity(K, rng, freeSpot);
    this.cover = [];
    this.tufts = addGroundCover(scene, T, B, info, rng, (x, z) => Math.hypot(x, z) > 4.2 && T.roadDist(x, z) > 1.15 && T.riverDist(x, z) > 1.6
      && !T.inField(x, z, .15) && !occupied(x, z, .25) && Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1, this.cover);
    // a light haze in the distance gives the region depth
    this.haze = new THREE.Fog('#b9cbd8', 190, 430); scene.fog = this.haze;
    K.flush(scene);
    this.hearths = K.smoke.slice();   // house chimneys that smoke now and then
    this.life = new Life(scene, T, info, rng);   // traffic and townsfolk

    // a sailing ship offshore when there is a coast
    if (T.coast) {
      const d = T.coast.d, s = makeShip(K, era); const p0 = [d[0] * (T.coast.D + 14), d[1] * (T.coast.D + 14)];
      if (T.H(...p0) < -.6 && Math.abs(p0[0]) < HALF - 5 && Math.abs(p0[1]) < HALF - 5) { s.position.set(p0[0], 0, p0[1]); scene.add(s); this.ships.push({ g: s, ph: rng() * 6, path: { c: p0, r: 5 } }); }
    }

    this.fx = new FX(scene, 1, 260);
    // soldiers drilling next to the player's barracks (roughly one figure per 400 men)
    if (this.basePos && info.army > 0) {
      const [bx, bz, br] = this.basePos, n = Math.max(6, Math.min(42, Math.round(info.army / 400)));
      const f = new Formation(scene, { era, team: info.ownerColor, culture: info.ownerCulture || culture, count: n, cols: 7, vehicles: Math.min(3, info.vehicles || 0) });
      const sx = bx + Math.sin(br + 1.2) * 7, sz = bz + Math.cos(br + 1.2) * 7;
      f.group.position.set(sx, T.H(sx, sz), sz); f.group.rotation.y = br; f.drill = true; this.forms.push(f);
    }
    if (this.battleSource && this.battleSource(info.name)) this.setupBattle(info, T);
    this.makeLabels(info);
    this.resetCamera();
    return info;
  }

  // where a unit stands: on the bridge deck over rivers, never in the water
  unitY(x, z) {
    const T = this.T;
    for (const p of T.BRIDGES) {
      const dx = x - p.x, dz = z - p.z, a = dx * p.dx + dz * p.dz, c = -dx * p.dz + dz * p.dx;
      if (Math.abs(a) < 5.8 && Math.abs(c) < 1.6) return 1.1;
    }
    return Math.max(T.H(x, z), .05);
  }
  // first point along a road from arc length s (moving by `dir`) that is dry land
  dryAlong(road, s, dir = 1) {
    const L = polyLen(road);
    for (let k = 0; k < 40; k++) { const q = along(road, s); if (this.T.H(q.x, q.z) > .35 || s <= 0 || s >= L) return q; s += dir; }
    return along(road, s);
  }

  // close-up of the battle for this country: attackers march in along a road, defenders hold the town edge
  setupBattle(info, T) {
    const st = this.battleSource(info.name);
    // the longest road that ends on land, so neither army stands in a river or the sea
    const road = T.ROADS.slice().sort((a, b) => polyLen(b) - polyLen(a))[0]; if (!road) return;
    const L = polyLen(road), hold = this.dryAlong(road, Math.min(L - 2, T.townR + 7), 1), start = this.dryAlong(road, L - 2, -1);
    const contact = this.dryAlong(road, Math.min(L - 2, T.townR + 7 + 11), 1);
    const era = info.era, scen = st.scenario || 'frontal';
    const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
    const dx = contact.x - hold.x, dz = contact.z - hold.z, dl = Math.hypot(dx, dz) || 1, d = [dx / dl, dz / dl], pp = [-d[1], d[0]];
    const dfn = new Formation(this.scene, { era, team: st.defColor, culture: st.defCulture || info.culture, count: 36, cols: 9, vehicles: era === '2014' ? 1 : 2 });
    dfn.group.position.set(hold.x, this.unitY(hold.x, hold.z), hold.z); dfn.group.rotation.y = face(hold, contact);
    dfn.target = new THREE.Vector3(contact.x, T.H(contact.x, contact.z) + .2, contact.z);
    const B = this.battle = { scenario: scen, dfn, start, contact, hold, last: st, extra: [], fires: 0 };
    if (scen === 'charge' && era !== '2014') {
      // cavalry gallops in, infantry follows
      B.atk = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 24, cols: 8, spacing: .9, kind: 'cavalry' });
      B.inf = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 27, cols: 9, vehicles: 1 }); B.extra.push(B.inf);
    } else if (scen === 'charge') {
      B.atk = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 36, cols: 9, vehicles: 4, vehFront: true });   // armour leads
    } else if (scen === 'siege') {
      B.atk = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 40, cols: 8, stance: 'loose' });
      B.art = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 8, cols: 8, vehicles: 5 }); B.extra.push(B.art);
      const back = this.dryAlong(road, Math.min(L - 2, T.townR + 7 + 24), 1);
      B.artPos = back; B.art.group.position.set(back.x, this.unitY(back.x, back.z), back.z); B.art.group.rotation.y = face(back, hold);
      B.art.target = new THREE.Vector3(hold.x * .5, 1, hold.z * .5);
    } else {
      B.atk = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 45, cols: 9, vehicles: era === '2014' ? 3 : 2 });
    }
    if (scen === 'flank') {   // a second column swings round the side
      const side = (st.seed || 1) > .5 ? 1 : -1;
      B.flank = new Formation(this.scene, { era, team: st.attColor, culture: st.attCulture || info.culture, count: 24, cols: 6, stance: 'loose' }); B.extra.push(B.flank);
      B.flankStart = { x: contact.x + pp[0] * 26 * side + d[0] * 8, z: contact.z + pp[1] * 26 * side + d[1] * 8 };
      B.flankEnd = { x: hold.x + pp[0] * 8 * side + d[0] * 4, z: hold.z + pp[1] * 8 * side + d[1] * 4 };
      B.flank.target = new THREE.Vector3(hold.x, T.H(hold.x, hold.z) + .2, hold.z);
      for (let k = 0; k <= 1; k += .1) this.clearTrees(lerp(B.flankStart.x, B.flankEnd.x, k), lerp(B.flankStart.z, B.flankEnd.z, k), 5);
    }
    B.atk.group.rotation.y = face(contact, hold);
    B.atk.target = new THREE.Vector3(hold.x, T.H(hold.x, hold.z) + .2, hold.z);
    if (B.inf) { B.inf.group.rotation.y = B.atk.group.rotation.y; B.inf.target = B.atk.target; }
    // keep the battlefield readable: no trees on the road between the armies or around the camera spots
    for (let s = Math.max(0, T.townR + 3); s < L; s += 2) { const q = along(road, s); this.clearTrees(q.x, q.z, 7); }
    this.forms.push(B.atk, dfn, ...B.extra);
    this.setWeather(st.weather || 'clear');
  }
  // time of day: 'sunset' / 'day', or a blend { s: sunset amount, n: night amount } that follows the calendar
  setLighting(mode) {
    if (!this.scene) return;
    const sky = typeof mode === 'string' ? { s: mode === 'sunset' ? 1 : 0, n: 0 } : mode;
    if (this.weather === 'dusk' && typeof mode !== 'string') return;   // a dusk battle keeps its own light
    const b = this._base || (this._base = { sun: this.sun.color.clone(), si: this.sun.intensity, off: this.sunOff.clone(), sky: this.hemi.color.clone(), gnd: this.hemi.groundColor.clone(), hi: this.hemi.intensity, bg: this.scene.background.clone() });
    const C = h => new THREE.Color(h), mix = (d, s, n, out) => out.copy(d).lerp(C(s), sky.s).lerp(C(n), sky.n);
    mix(b.sun, '#ffb072', '#9db4ff', this.sun.color); this.sun.intensity = b.si * (1 + .1 * sky.s) * (1 - .55 * sky.n);
    this.sunOff.copy(b.off).lerp(new THREE.Vector3(-60, 24, -28), sky.s);
    mix(b.sky, '#ffd2ad', '#6f86b8', this.hemi.color); mix(b.gnd, '#5a4450', '#141a2e', this.hemi.groundColor);
    this.hemi.intensity = b.hi * (1 - .3 * sky.n);
    setWindowGlow(sky.s * .8 + sky.n * 2.2);   // lamps are lit as the sun goes down
    if (this.weather !== 'fog' && this.weather !== 'rain') { mix(b.bg, '#e9c0a0', '#0b1020', this.scene.background); if (this.haze) mix(C('#b9cbd8'), '#d8a88a', '#1a2338', this.haze.color); }
  }
  // battle weather: fog, rain or a dusk fight
  setWeather(w) {
    this.weather = w;
    if (w === 'fog') this.scene.fog = new THREE.Fog('#aab4bd', 18, 75);
    if (w === 'rain') { this.scene.fog = new THREE.Fog('#7f8a94', 30, 110); this.fx.setRain(true, new THREE.Vector3()); this.sun.intensity *= .45; this.hemi.intensity *= .75; }
    if (w === 'dusk') this.setLighting('sunset');
    if (w === 'fog' || w === 'rain') this.scene.background = new THREE.Color(w === 'fog' ? '#aab4bd' : '#5d6873');
  }

  // one player building -> models (exact: use the given spot instead of searching nearby)
  placeModel(K, b, exact = false) {
    const { T, rng, era, obstacles, findSpot, roadAngle, town, ownerTex, patches, typeR } = this._ctx, scene = this.scene;
    if (b.type === 'field') return false;   // fields are painted into the ground
    if (b.type === 'port' || b.type === 'shipyard' || b.type === 'fishery') return this.addPort(K, b, rng, patches);
    const r = typeR[b.type] || 3, spot = (b.type === 'city' || b.type === 'town' || exact) ? [b.x, b.z] : findSpot(b.x, b.z, r);
    if (!spot) return false;
    const [x, z] = spot, y = T.H(x, z), rot = roadAngle(x, z);
    if (b.type === 'city') { town(K, x, z, 7, era === '2014' ? 16 : 14); this.placed.push(b.type); return true; }
    if (b.type === 'town') { town(K, x, z, 4.5, 7); this.placed.push(b.type); return true; }
    let fr = 3;
    if (b.type === 'base') {
      fr = barracks(K, x, y, z, rot, era); if (!this.basePos) this.basePos = [x, z, rot];
      const f = makeFlag(K, ownerTex, 1.2, 4); f.group.position.set(x + 3, y, z - 3); f.group.rotation.y = -Math.PI / 4; scene.add(f.group); this.flags.push(f);
    } else if (b.type === 'ranch') {
      fr = farmhouse(K, x, y, z, rot);
      this.addHerd(x + Math.sin(rot) * 5, z + Math.cos(rot) * 5, 8, this.info.profile && this.info.profile.livestock > 1.3 ? 'cow' : (rng() < .5 ? 'cow' : 'sheep'), 3.2, true);
    } else if (b.type === 'oilwell') {
      const beam = pumpjack(K, x, y, z, rot); scene.add(beam); this.pumps.push(beam); fr = 2.6;
    } else if (b.type === 'factory') {
      fr = factory(K, x, y, z, rot, 'garage');
      for (const sx of [-1.6, 1.6]) { const B = K.M4(x, y, z, rot); K.part(B, cyl(.3, .4, 4.4, 10), '#7d7f86', sx, 2.2, -1.3); }
      for (const sx of [-1.6, 1.6]) this.chimneys.push([x + Math.cos(rot) * sx - Math.sin(rot) * -1.3, y + 4.6, z - Math.sin(rot) * sx + Math.cos(rot) * -1.3]);
    } else if (b.type === 'mine') fr = mine(K, x, y, z, rot, rng);
    else if (b.type === 'bank') fr = bank(K, x, y, z, rot);
    else if (b.type === 'garage' || b.type === 'choco') fr = factory(K, x, y, z, rot, b.type);
    else if (b.type === 'farm') {
      fr = farmhouse(K, x, y, z, rot);
      if (era !== '2014') { const w = makeWindmill(K, x + 3, T.H(x + 3, z + 1), z + 1); scene.add(w.cap, w.hub); this.blades.push(w.hub); }
    } else return false;
    obstacles.push([x, z, fr]); patches.push([x, z, fr + 1.5, .55]); this.placed.push(b.type);
    return true;
  }

  // what the country is known for shows up in the countryside
  addIdentity(K, rng, freeSpot) {
    const m = this.info.profile || {}, T = this.T;
    if ((m.livestock || 0) >= 1.3 && this.info.biome !== 'polar') {
      const herds = m.livestock >= 1.8 ? 4 : 2;
      for (let h = 0, tries = 0; h < herds && tries < 200; tries++) {
        const a = rng() * Math.PI * 2, r = T.townR + 10 + rng() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!freeSpot(x, z, 4)) continue;
        this.addHerd(x, z, 6 + Math.floor(rng() * 6), m.livestock >= 1.9 && rng() < .5 ? 'sheep' : (rng() < .65 ? 'cow' : 'sheep'), 4, false); h++;
      }
    }
    if ((m.fish || 0) >= 1.4 && T.coast) {
      const d = T.coast.d;
      for (let i = 0; i < 3; i++) {
        const along = (i - 1) * 9, p = [d[0] * (T.coast.D + 6 + i * 3) - d[1] * along, d[1] * (T.coast.D + 6 + i * 3) + d[0] * along];
        if (T.H(p[0], p[1]) > -.5 || Math.abs(p[0]) > HALF - 5 || Math.abs(p[1]) > HALF - 5) continue;
        const fb = fishingBoat(K); fb.position.set(p[0], 0, p[1]); fb.rotation.y = rng() * 6; this.scene.add(fb); this.boats.push({ g: fb, ph: rng() * 6, drift: true });
      }
    }
    if ((m.oil || 0) >= 1.6 && this.info.era === '2014') {
      for (let i = 0, tries = 0; i < 3 && tries < 200; tries++) {
        const a = rng() * Math.PI * 2, r = T.townR + 12 + rng() * 24, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!freeSpot(x, z, 2.6)) continue;
        const beam = pumpjack(K, x, T.H(x, z), z, rng() * 6); this.scene.add(beam); this.pumps.push(beam); this._ctx.obstacles.push([x, z, 2.6]); i++;
      }
    }
  }
  addHerd(cx, cz, n, kind, spread, fenced) {
    const T = this.T, geo = animalGeo(kind), mesh = new THREE.InstancedMesh(geo, ANIMAL_MAT, n), o = new THREE.Object3D(), items = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      items.push({ x, z, yaw: Math.random() * 6, ph: Math.random() * 6 });
      o.position.set(x, T.H(x, z), z); o.rotation.set(0, items[i].yaw, 0); o.scale.setScalar(kind === 'cow' ? 1 : .9); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
    this.herds.push({ mesh, items, kind, cx, cz, spread });
    this.clearTrees(cx, cz, spread + 1);
    if (fenced) {
      const K = new Kit(), R = spread + 1;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
        const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, B = K.M4(x, T.H(x, z), z, -a);
        K.part(B, cyl(.05, .05, .6, 5), '#6b5236', 0, .3, 0); K.part(B, box(.05, .05, R * .45), '#8a6a48', 0, .45, 0);
      }
      K.flush(this.scene);
    }
  }

  // ---- building directly in the region view ----
  addBuilding(type, x, z, rot = 0) {
    if (!this.scene) return false;
    const r = this._ctx.typeR[type] || 3;
    if (type === 'field') { this.addField(x, z, -rot); this.placed.push(type); return true; }
    this.clearTrees(x, z, r + .4); this.clearCover((px, pz) => Math.hypot(px - x, pz - z) < r * .8);
    const K = new Kit(), ok = this.placeModel(K, { type, x, z }, true);
    K.flush(this.scene); this.hearths.push(...K.smoke);
    return ok;
  }
  clearTrees(x, z, r) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), touched = new Set();
    for (const it of this.veg || []) if (!it.dead && Math.hypot(it.x - x, it.z - z) < r) { it.dead = true; for (const m of it.meshes) { m.setMatrixAt(it.i, zero); touched.add(m); } }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }
  // hide grass tufts, flowers and pebbles where something new now stands
  clearCover(test) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { m, list } of this.cover || []) {
      if (!m) continue; let any = false;
      list.forEach((p, i) => { if (!p.gone && test(p.x, p.z)) { p.gone = true; m.setMatrixAt(i, zero); any = true; } });
      if (any) m.instanceMatrix.needsUpdate = true;
    }
  }
  // a new field looks exactly like the ones the countryside is generated with: painted strip, crop rows, fence, haystacks
  addField(x, z, a) {
    const T = this._ctx.T, cv = this.groundCanvas, ctx = cv.getContext('2d'), S = cv.width, w = 6, h = 5, n = T.FIELDS.length;
    const f = [x, z, w, h, a];
    ctx.setTransform(S / SIZE, 0, 0, S / SIZE, S / 2, S / 2); ctx.translate(x, z); ctx.rotate(a);
    ctx.fillStyle = FIELD_COLORS[n % 7]; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(70,55,25,.35)'; ctx.lineWidth = .09;
    for (let k = -w / 2 + .2; k < w / 2; k += .32) { ctx.beginPath(); ctx.moveTo(k, -h / 2 + .1); ctx.lineTo(k, h / 2 - .1); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(60,80,30,.8)'; ctx.lineWidth = .25; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.groundTex.needsUpdate = true;
    T.FIELDS.push(f);
    const inF = (px, pz, m = .15) => { const dx = px - x, dz = pz - z, c = Math.cos(-a), s = Math.sin(-a); return Math.abs(dx * c - dz * s) < w / 2 + m && Math.abs(dx * s + dz * c) < h / 2 + m; };
    this.clearCover((px, pz) => inF(px, pz));
    for (const it of this.veg || []) if (!it.dead && !it.tree && inF(it.x, it.z, .4)) this.clearTrees(it.x, it.z, .05);   // bushes
    addCrops(this.scene, T, this.info, Math.random, [f], n);
    const K = new Kit(); addFences(K, T, [f], n);
    for (let i = 0; i < 2; i++) { const u = (Math.random() - .5) * w * .6, v = (Math.random() - .5) * h * .6, hx = x + u * Math.cos(a) - v * Math.sin(a), hz = z + u * Math.sin(a) + v * Math.cos(a); haystack(K, hx, T.H(hx, hz), hz); }
    K.flush(this.scene);
  }

  // ---- trees: a grid index of the living ones, for placement checks and woodcutting ----
  indexTrees() {
    this.treeGrid = new Map();
    for (const it of this.veg || []) if (it.tree) { const k = Math.floor(it.x / 4) + ',' + Math.floor(it.z / 4); if (!this.treeGrid.has(k)) this.treeGrid.set(k, []); this.treeGrid.get(k).push(it); }
  }
  treesNear(x, z, r) {
    const out = [], c0 = Math.floor((x - r) / 4), c1 = Math.floor((x + r) / 4), d0 = Math.floor((z - r) / 4), d1 = Math.floor((z + r) / 4);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) for (const it of this.treeGrid.get(cx + ',' + cz) || []) if (!it.dead && !it.busy && Math.hypot(it.x - x, it.z - z) < r) out.push(it);
    return out;
  }
  hasTree(x, z, r) {
    const c0 = Math.floor((x - r) / 4), c1 = Math.floor((x + r) / 4), d0 = Math.floor((z - r) / 4), d1 = Math.floor((z + r) / 4);
    for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) for (const it of this.treeGrid.get(cx + ',' + cz) || []) if (!it.dead && Math.hypot(it.x - x, it.z - z) < r) return true;
    return false;
  }
  // the wood the player clicked on: trees linked to each other (a few metres apart), up to a sensible size
  forestAt(x, z) {
    const near = this.treesNear(x, z, 1.8); if (!near.length) return null;
    const start = near.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    const seen = new Set([start]), queue = [start];
    while (queue.length && seen.size < 40) {
      const t = queue.shift();
      for (const n of this.treesNear(t.x, t.z, 2.6)) if (!seen.has(n) && Math.hypot(n.x - start.x, n.z - start.z) < 11) { seen.add(n); queue.push(n); if (seen.size >= 40) break; }
    }
    return [...seen];
  }
  // yellow-tinted crowns show which trees an order would fell
  highlightTrees(list) {
    const touched = new Set(), c = new THREE.Color();
    for (const it of this._hl || []) { if (it.col0 && !it.dead) { it.crown.setColorAt(it.i, it.col0); touched.add(it.crown); } }
    this._hl = list || null;
    for (const it of list || []) { if (!it.crown.instanceColor) continue; it.crown.getColorAt(it.i, c); it.col0 = c.clone(); it.crown.setColorAt(it.i, c.clone().lerp(new THREE.Color('#ffd84a'), .55)); touched.add(it.crown); }
    for (const m of touched) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  makeStumps(list) {
    if (this.stumps) { this.scene.remove(this.stumps); this.stumps.geometry.dispose(); }
    const g = new THREE.CylinderGeometry(.075, .1, .16, 7).translate(0, .06, 0).toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { c.set(p.getY(i) > .13 ? '#c9a46e' : '#5a4330'); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = this.stumps = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), list.length + 600);
    m.count = 0; m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    for (const t of list) this.addStump(t.x, t.z, t.s, t.r);
  }
  addStump(x, z, s = 1, r = 0) {
    const m = this.stumps; if (!m || m.count >= m.instanceMatrix.count) return;
    const o = this._so || (this._so = new THREE.Object3D());
    o.position.set(x, this.T.H(x, z) - .02, z); o.rotation.set(0, r, 0); o.scale.setScalar(s); o.updateMatrix();
    m.setMatrixAt(m.count++, o.matrix); m.instanceMatrix.needsUpdate = true;
  }

  // woodcutters walk out to the trees, chop for `secs` seconds, the trees fall, then onDone(trees) and they go home
  startChop(trees, secs, onDone) {
    if (!this.scene || !trees.length) return null;
    const T = this.T, info = this.info;
    for (const t of trees) t.busy = true;
    let cx = 0, cz = 0; for (const t of trees) { cx += t.x; cz += t.z; } cx /= trees.length; cz /= trees.length;
    // where they come from: the nearest road, else straight from the village
    let sp = null, sd = 1e9;
    for (const r of T.ROADS) for (let s0 = 0, L = polyLen(r); s0 < L; s0 += 2) { const q = along(r, s0), d = Math.hypot(q.x - cx, q.z - cz); if (d < sd && T.H(q.x, q.z) > .3) { sd = d; sp = [q.x, q.z]; } }
    if (!sp || sd > 16) { const d = Math.hypot(cx, cz) || 1, k = Math.max(0, d - 12) / d; sp = [cx * k, cz * k]; }
    const edge = trees.slice().sort((a, b) => Math.hypot(a.x - sp[0], a.z - sp[1]) - Math.hypot(b.x - sp[0], b.z - sp[1]));
    const n = Math.max(2, Math.min(4, Math.ceil(trees.length / 8))), workers = [];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    for (let i = 0; i < n; i++) {
      const tree = edge[Math.min(edge.length - 1, i * 2)], name = humanName('worker', info.era, info.culture), h = makeHuman(RIGS_HAVE(name) ? name : humanName('civ', info.era, info.culture), {
        team: pick(info.era === '2014' ? ['#c8463a', '#3f6fa8', '#e07a2a', '#5a8a4a'] : ['#6b4a32', '#8a3a28', '#3f5a3a', '#c9b48a', '#a85a3a']),
        pants: pick(info.era === '2014' ? ['#2f4a6a', '#3a3a3e', '#6b5a48'] : ['#4a3a2a', '#5e4630', '#3a3836', '#6b5236']), skin: pick(['#f2cfb0', '#e0b48c', '#c99470', '#9a6a48']) });
      if (!h) continue;
      const dx = tree.x - sp[0], dz = tree.z - sp[1], dl = Math.hypot(dx, dz) || 1;
      const st = { x: tree.x - dx / dl * .55, z: tree.z - dz / dl * .55 };   // stand just in front of the trunk
      const ox = (Math.random() - .5) * 1.2, oz = (Math.random() - .5) * 1.2;
      h.g.scale.setScalar(.52); h.g.position.set(sp[0] + ox, T.H(sp[0] + ox, sp[1] + oz), sp[1] + oz); this.scene.add(h.g);
      workers.push({ h, x: sp[0] + ox, z: sp[1] + oz, st, tree, home: [sp[0] + ox, sp[1] + oz], yaw: Math.atan2(dx, dz), ph: Math.random() * 6 });
    }
    const label = document.createElement('div'); label.className = 'rl chop'; this.labelsEl.appendChild(label);
    const job = { trees, workers, secs, onDone, phase: 'walk', t: 0, fall: 0, label, sp, pos: new THREE.Vector3(cx, T.H(cx, cz) + 3.2, cz) };
    this.labels.push({ el: label, pos: job.pos });
    this.jobs.push(job);
    return job;
  }
  // finish every job at once (leaving the region): the wood still arrives
  finishJobs() {
    for (const j of this.jobs || []) { if (j.phase === 'walk' || j.phase === 'chop' || j.phase === 'fall') this.fellNow(j); this.endJob(j); }
    this.jobs = [];
  }
  fellNow(j) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), touched = new Set();
    for (const t of j.trees) { if (t.dead) continue; t.dead = true; t.busy = false; for (const m of t.meshes) { m.setMatrixAt(t.i, zero); touched.add(m); } this.addStump(t.x, t.z, t.s, t.r); }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    if (j.phase !== 'home') { j.phase = 'home'; j.onDone && j.onDone(j.trees); }
  }
  endJob(j) {
    for (const w of j.workers) { this.scene && this.scene.remove(w.h.g); }
    j.workers = []; j.label.remove(); this.labels = this.labels.filter(l => l.el !== j.label); j.phase = 'gone';
  }
  updateJobs(dt) {
    if (!this.jobs || !this.jobs.length) return;
    const T = this.T, q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), o = this._fo || (this._fo = new THREE.Object3D());
    for (const j of this.jobs) {
      j.t += dt;
      if (j.phase === 'walk' && (j.workers.every(w => w.arrived) || j.t > 14)) { j.phase = 'chop'; j.t = 0; }
      if (j.phase === 'chop' && j.t >= j.secs) { j.phase = 'fall'; j.t = 0; }
      if (j.phase === 'fall') {   // trees topple one after another, away from the cutters
        const touched = new Set();
        j.trees.forEach((t, i) => {
          if (t.dead) return;
          const k = clamp((j.t - i * .025) / 1.1, 0, 1), e = k * k;
          let dx = t.x - j.sp[0], dz = t.z - j.sp[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          ax.set(dz, 0, -dx); q1.setFromAxisAngle(ax, e * 1.45); q2.setFromAxisAngle(up, t.r);
          o.position.set(t.x, t.y, t.z); o.quaternion.multiplyQuaternions(q1, q2); o.scale.setScalar(t.s * (k >= 1 ? 0 : 1)); o.updateMatrix();
          for (const m of t.meshes) { m.setMatrixAt(t.i, o.matrix); touched.add(m); }
          if (k >= 1) { t.dead = true; t.busy = false; this.addStump(t.x, t.z, t.s, t.r); if (this.fx && i % 3 === 0) this.fx.puff(t.x + dx * 1.2, T.H(t.x, t.z) + .2, t.z + dz * 1.2, .5, 1.6, '#b8a888', .45); }
        });
        for (const m of touched) m.instanceMatrix.needsUpdate = true;
        if (j.trees.every(t => t.dead)) { j.phase = 'home'; j.t = 0; j.onDone && j.onDone(j.trees); }
      }
      j.label.textContent = j.phase === 'walk' ? '🪓 Oduncular yolda…' : j.phase === 'chop' ? '🪓 Odun toplanıyor · ' + Math.ceil(j.secs - j.t) + ' sn' : j.phase === 'fall' ? '🌲 Ağaçlar devriliyor…' : j.woodText || '';
      if (j.phase === 'home' && j.t > 2.2) j.label.style.opacity = Math.max(0, 1 - (j.t - 2.2) / .8);
      for (const w of j.workers) {
        let tx, tz, moving = false;
        if (j.phase === 'walk') { tx = w.st.x; tz = w.st.z; } else if (j.phase === 'home') { tx = w.home[0]; tz = w.home[1]; } else { tx = w.x; tz = w.z; }
        const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d > .06) { const s = Math.min(d, 1.4 * dt); w.x += dx / d * s; w.z += dz / d * s; moving = true; const want = Math.atan2(dx, dz); w.yaw += Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw)) * Math.min(1, dt * 6); }
        else if (j.phase === 'walk') w.arrived = true;
        if (!moving && (j.phase === 'chop' || j.phase === 'fall')) { const want = Math.atan2(w.tree.x - w.x, w.tree.z - w.z); w.yaw += Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw)) * Math.min(1, dt * 6); }
        w.h.g.position.set(w.x, T.H(w.x, w.z), w.z); w.h.g.rotation.y = w.yaw;
        const chopping = j.phase === 'chop' && !moving;
        w.h.play(moving ? 'walk' : chopping && w.h.acts.chop ? 'chop' : 'idle', dt, moving ? 1.4 / (.36 * .52) : 1);
        // chips fly at each stroke
        if (chopping && this.fx && Math.random() < dt * 1.6) this.fx.puff(w.tree.x, T.H(w.tree.x, w.tree.z) + .25, w.tree.z, .12, .9, '#d8b888', .5);
      }
      if (j.phase === 'home' && (j.workers.every(w => Math.hypot(w.x - w.home[0], w.z - w.home[1]) < .1) || j.t > 20)) this.endJob(j);
    }
    this.jobs = this.jobs.filter(j => j.phase !== 'gone');
  }

  // translucent preview that follows the cursor; blue = can build, red = cannot
  setGhost(type) {
    if (this.ghost) { this.scene && this.scene.remove(this.ghost); this.ghost = null; }
    this.ghostType = type || null;
    if (!type || !this.scene) return;
    const { era, culture, rng, typeR } = this._ctx, K = new Kit(), g = new THREE.Group();
    if (type === 'city' || type === 'town') { const n = type === 'city' ? 5 : 3; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; house(K, Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, a, 1, culture, era, rng); } }
    else if (type === 'base') barracks(K, 0, 0, 0, 0, era);
    else if (type === 'mine') mine(K, 0, 0, 0, 0, rng);
    else if (type === 'bank') bank(K, 0, 0, 0, 0);
    else if (type === 'garage' || type === 'choco') factory(K, 0, 0, 0, 0, type);
    else if (type === 'farm' || type === 'ranch') farmhouse(K, 0, 0, 0, 0);
    else if (type === 'oilwell') g.add(pumpjack(K, 0, 0, 0, 0));
    else if (type === 'factory') factory(K, 0, 0, 0, 0, 'garage');
    else if (type === 'port' || type === 'shipyard' || type === 'fishery') dock(K, 0, 0, [0, 1], 7);
    else if (type === 'field') g.add(new THREE.Mesh(new THREE.BoxGeometry(6, .15, 5)));
    K.flush(g);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: .45, depthWrite: false });
    g.traverse(o => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; o.receiveShadow = false; } });
    if (type !== 'field') { const R = typeR[type] || 3, ring = new THREE.Mesh(new THREE.RingGeometry(R, R + .25, 40).rotateX(-Math.PI / 2), this.ghostMat); ring.position.y = .08; g.add(ring); }
    g.visible = false; this.ghost = g; this.scene.add(g);
  }
  // ground point under the cursor (region coordinates) or null
  pickGround(ndcX, ndcY) {
    if (!this.terrain) return null;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam);
    const hit = ray.intersectObject(this.terrain, false)[0];
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }
  // can `type` stand at (x,z) turned by rot? -> null if yes, else why not ('forest' | 'field' | 'building' | 'ground' | 'coast')
  blockedFootprint(type, x, z, rot) {
    const { T, typeR, occupied } = this._ctx, R = typeR[type] || 3;
    if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) return 'ground';
    if (type === 'port' || type === 'shipyard' || type === 'fishery') {   // must stand on the shore with deep water close by
      const ok = T.H(x, z) > .2 && T.H(x, z) < 1.4 && [...Array(16)].some((_, i) => { const a = i / 16 * Math.PI * 2; return T.H(x + Math.cos(a) * 6, z + Math.sin(a) * 6) < -.5; });
      return !ok ? 'coast' : occupied(x, z, 1.6) ? 'building' : this.hasTree(x, z, 1.8) ? 'forest' : null;
    }
    // sample the whole footprint: a 6×5 rectangle for fields, a disc for buildings
    const pts = [];
    if (type === 'field') { const c = Math.cos(rot), s = Math.sin(rot); for (let u = -3; u <= 3.01; u += 1) for (let v = -2.5; v <= 2.51; v += 1.25) pts.push([x + u * c + v * s, z - u * s + v * c]); }
    else { pts.push([x, z]); for (let k = 0; k < 2; k++) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = R * (k ? .85 : .45); pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]); } }
    for (const [px, pz] of pts) {
      if (T.H(px, pz) < .4 || T.slope(px, pz) > .8 || T.riverDist(px, pz) < 1.2 || T.roadDist(px, pz) < 1.2) return 'ground';
      if (T.inField(px, pz, .2)) return 'field';
      if (occupied(px, pz, .3)) return 'building';
      if (this.hasTree(px, pz, .75)) return 'forest';
    }
    return null;
  }
  updateGhost(ndcX, ndcY, legal) {
    if (!this.ghost) return null;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cam);
    const hit = ray.intersectObject(this.terrain, false)[0];
    if (!hit) { this.ghost.visible = false; return null; }
    const { T, roadAngle } = this._ctx, x = hit.point.x, z = hit.point.z, type = this.ghostType, rot = roadAngle(x, z);
    const why = this.blockedFootprint(type, x, z, rot), fits = !why, ok = fits && legal(x, z);
    this.ghost.visible = true;
    this.ghost.position.set(x, T.H(x, z) + .02, z); this.ghost.rotation.y = rot;
    this.ghostMat.color.set(ok ? GHOST_OK : GHOST_BAD);
    return { x, z, ok, fits, why, rot };
  }

  addPort(K, b, rng, patches) {
    const T = this.T;
    let best = null;
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      let shore = null;
      for (let r = 0; r < 26; r += .5) {
        const x = b.x + dx * r, z = b.z + dz * r, h = T.H(x, z);
        if (!shore && h < .25) shore = [x, z, r];
        if (h < -.7) { if (shore && (!best || shore[2] < best.r)) best = { x: shore[0], z: shore[1], r: shore[2], dir: [dx, dz] }; break; }
      }
    }
    if (!best) return false;
    dock(K, best.x, best.z, best.dir, 7);
    patches.push([best.x - best.dir[0] * 2, best.z - best.dir[1] * 2, 3.5, .5]);
    if (b.type === 'fishery') {
      for (let i = 0; i < 2; i++) {
        const fb = fishingBoat(K), sx = best.x + best.dir[0] * (5 + i * 2.5) + best.dir[1] * (i ? -2 : 2), sz = best.z + best.dir[1] * (5 + i * 2.5) - best.dir[0] * (i ? -2 : 2);
        fb.position.set(sx, 0, sz); fb.rotation.y = Math.atan2(best.dir[0], best.dir[1]) + Math.PI / 2; this.scene.add(fb); this.boats.push({ g: fb, ph: rng() * 6 });
      }
      this.placed.push(b.type); return true;
    }
    if (b.type === 'shipyard' || this.ships.length < 3) {
      const s = makeShip(K, this.info.era), sx = best.x + best.dir[0] * 7 + best.dir[1] * 2.6, sz = best.z + best.dir[1] * 7 - best.dir[0] * 2.6;
      s.position.set(sx, 0, sz); s.rotation.y = Math.atan2(best.dir[0], best.dir[1]) - Math.PI / 2; this.scene.add(s);
      this.ships.push({ g: s, ph: rng() * 6, path: null });
    }
    this.placed.push(b.type);
    return true;
  }

  // roads keep going into the countryside instead of stopping at the edge of the square
  addOuterRoads(T, rng, era) {
    const pos = [], idx = [], edge = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > HALF - .2;
    for (const r of T.ROADS) {
      const pts = r.map(p => [p[0], p[1]]), [ax, az] = pts[pts.length - 2], [bx, bz] = pts[pts.length - 1];
      if (!edge(bx, bz) && Math.max(Math.abs(bx), Math.abs(bz)) < HALF - 6) continue;   // ends in town or at the coast
      let ang = Math.atan2(bz - az, bx - ax), x = bx, z = bz;
      for (let k = 0; k < 40 && Math.hypot(x, z) < HALF + 180; k++) { ang += (rng() - .5) * .35; x += Math.cos(ang) * 8; z += Math.sin(ang) * 8; pts.push([x, z]); }
      const w = era === '2014' ? 1.05 : .95;
      let prev = null;
      for (let s = 0, L = polyLen(pts); s < L; s += 1) {
        const q = along(pts, s), q2 = along(pts, Math.min(L, s + .5)), dx = q2.x - q.x, dz = q2.z - q.z, l = Math.hypot(dx, dz) || 1;
        const h = T.Hraw(q.x, q.z);
        if (!edge(q.x, q.z)) { prev = null; continue; }
        if (h < .25) break;   // no road into the sea or a river
        const v = pos.length / 3, nx = -dz / l * w, nz = dx / l * w;
        pos.push(q.x + nx, h + .06, q.z + nz, q.x - nx, h + .06, q.z - nz);
        if (prev !== null) idx.push(prev, prev + 1, v, prev + 1, v + 1, v);
        prev = v;
      }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: era === '2014' ? '#4b4b4d' : '#a3825a', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.receiveShadow = true; this.scene.add(m);
  }

  makeLabels(info) {
    this.labelsEl.innerHTML = '';
    this.labels = [];
    const add = (html, cls, pos) => { const el = document.createElement('div'); el.className = 'rl ' + cls; el.innerHTML = html; this.labelsEl.appendChild(el); this.labels.push({ el, pos }); };
    add(info.displayName.toLocaleUpperCase(/[ıİşŞğĞüÜöÖçÇ]/.test(info.displayName) ? 'tr' : 'en'), 'town', new THREE.Vector3(0, 9, -1));
    if (info.ownerName) add('<i style="background:' + info.ownerColor + '"></i>' + info.ownerName, 'owner', new THREE.Vector3(-2.8, 6, 2.5));
  }

  resetCamera(zoom = 1.15) {
    // during a battle the camera starts on the front line instead of the town centre
    const B = this.battle, target = B ? new THREE.Vector3((B.hold.x + B.contact.x) / 2, 1, (B.hold.z + B.contact.z) / 2) : new THREE.Vector3(0, 1, 0);
    this.controls.target.copy(target);
    this.cam.position.copy(target).add(CAM_OFFSET);
    this.cam.zoom = zoom; this.cam.updateProjectionMatrix();
  }

  // fly-in after entering: start wide, settle closer
  activate() {
    this.active = true; this.controls.enabled = true; this.t = 0;
    this.resetCamera(.7); this.zoomFrom = .7; this.zoomTo = this.battle ? 1.7 : 1.15;
    this.labelsEl.style.display = '';
  }
  deactivate() {
    this.finishJobs(); this.highlightTrees(null);
    this.active = false; this.controls.enabled = false;
    this.labelsEl.style.display = 'none';
  }

  resize(w, h) {
    const a = w / h; this.aspect = a;
    if (this.cineCam) { this.cineCam.aspect = a; this.cineCam.updateProjectionMatrix(); }
    Object.assign(this.cam, { left: -VIEW_H * a / 2, right: VIEW_H * a / 2, top: VIEW_H / 2, bottom: -VIEW_H / 2 });
    this.cam.updateProjectionMatrix();
  }

  update(dt) {
    if (!this.scene) return;
    this.t += dt;
    if (this.zoomFrom != null) {   // entry animation
      const k = Math.min(1, this.t / .9), e = 1 - Math.pow(1 - k, 3);
      this.cam.zoom = lerp(this.zoomFrom, this.zoomTo, e); this.cam.updateProjectionMatrix();
      if (k >= 1) this.zoomFrom = null;
    }
    if (this.cinematic) { this.updateScene(dt); return; }
    // keyboard pan along the ground, relative to the camera
    const k = this.keys; let mx = 0, mz = 0;
    if (k['w'] || k['arrowup']) mz += 1; if (k['s'] || k['arrowdown']) mz -= 1;
    if (k['d'] || k['arrowright']) mx += 1; if (k['a'] || k['arrowleft']) mx -= 1;
    if (mx || mz) {
      const fwd = new THREE.Vector3().subVectors(this.controls.target, this.cam.position).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x), sp = 22 * dt / this.cam.zoom;
      const mv = fwd.multiplyScalar(mz * sp).add(right.multiplyScalar(mx * sp));
      this.controls.target.add(mv); this.cam.position.add(mv);
    }
    this.controls.update();
    const tg = this.controls.target, cx = clamp(tg.x, 10 - HALF, HALF - 10), cz = clamp(tg.z, 10 - HALF, HALF - 10);
    if (cx !== tg.x || cz !== tg.z) { this.cam.position.x += cx - tg.x; this.cam.position.z += cz - tg.z; tg.x = cx; tg.z = cz; }
    this.sun.position.copy(tg).add(this.sunOff); this.sun.target.position.copy(tg);
    // the shadow box follows the zoom: wide when overlooking the province, tight (sharp) up close
    const ext = Math.round(clamp(VIEW_H * (this.aspect || 1.6) / this.cam.zoom * .62, 24, 95)), sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix(); }
    this.updateScene(dt);
  }

  // everything that moves on its own (water, flags, mills, ships, armies, smoke)
  updateScene(dt) {
    const t = this.t;
    windTick(t);
    if (this.life) { this.life.group.visible = !this.battle; if (!this.battle) this.life.update(dt, t); }
    if (this._follow) { const d = this._follow.g.position.clone().sub(this.controls.target); d.y = 0; this.controls.target.add(d); this.cam.position.add(d); }   // test close-ups: track a vehicle
    this.wtex.offset.set(t * .012, t * .007);
    for (const f of this.flags) {
      const p = f.mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const bx = f.base[i * 3]; p.setZ(i, Math.sin(bx * 5 / f.size - t * 6) * .09 * bx / f.size); }
      p.needsUpdate = true;
    }
    this.blades.forEach((b, i) => b.children.forEach((a, j) => { a.rotation.z = j * Math.PI / 2 + t * (.7 + i * .15); }));
    // armies
    const B = this.battle;
    if (B) {
      const st = (this.battleSource && this.battleSource(this.info.name)) || { ...B.last, done: true };
      B.last = st;
      const p = st.prog, sc = B.scenario, place = (f, a, b, k) => { const x = lerp(a.x, b.x, k), z = lerp(a.z, b.z, k); f.group.position.set(x, this.unitY(x, z), z); };
      // when each block reaches the front depends on the plan of attack
      const arrive = sc === 'charge' ? .1 : sc === 'siege' ? .6 : .18;
      const k = sc === 'siege' ? Math.min(1, Math.max(0, (p - .45) / .15)) : Math.min(1, p / arrive);
      place(B.atk, B.start, B.contact, k);
      B.atk.moving = k < 1 && (sc !== 'siege' || p > .45); B.atk.charge = sc === 'charge';
      B.atk.firing = k >= 1 && !st.done; B.dfn.firing = !st.done && p > .05;
      if (B.inf) { const k2 = Math.min(1, p / .3); place(B.inf, B.start, { x: B.contact.x + (B.start.x - B.contact.x) * .25, z: B.contact.z + (B.start.z - B.contact.z) * .25 }, k2); B.inf.moving = k2 < 1; B.inf.firing = k2 >= 1 && !st.done; B.inf.setCasualties(p * st.lossA * .6); }
      if (B.flank) { const k3 = Math.min(1, p / .35); place(B.flank, B.flankStart, B.flankEnd, k3); B.flank.group.rotation.y = Math.atan2(B.hold.x - B.flank.group.position.x, B.hold.z - B.flank.group.position.z); B.flank.moving = k3 < 1; B.flank.firing = k3 >= 1 && !st.done; B.flank.setCasualties(p * st.lossA * .7); }
      if (B.art) {
        B.art.firing = !st.done && p > .03;
        // shelling sets the town on fire, one house after another
        const want = Math.floor(p * 5);
        while (B.fires < want && B.fires < 4) {
          const o = this._ctx.obstacles[2 + Math.floor(Math.random() * Math.max(1, this._ctx.obstacles.length - 2))] || [0, 0];
          this.fx.fire(o[0], this.T.H(o[0], o[1]) + 1, o[1], 1 + Math.random() * .6); B.fires++;
        }
        if (this.fx && Math.random() < dt * .8) { const tgt = B.art.target; this.fx.shell(B.art.toFx(this.fx, 0, .5, -1).clone(), new THREE.Vector3(tgt.x + (Math.random() - .5) * 14, this.T.H(tgt.x, tgt.z), tgt.z + (Math.random() - .5) * 14), 2); }
      }
      B.atk.setCasualties(p * st.lossA); B.dfn.setCasualties(p * st.lossD);
    }
    for (const f of this.forms) {
      if (f.drill) { f.moving = Math.sin(t * .5) > 0; f.group.position.y = this.unitY(f.group.position.x, f.group.position.z); }
      f.update(dt, this.fx);
    }
    this.updateJobs(dt);
    if (this.fx) this.fx.update(dt);
    for (const b of this.pumps) b.rotation.z = Math.sin(t * 1.6 + b.position.x) * .32;
    for (const b of this.boats) { b.g.position.y = Math.sin(t * 1.4 + b.ph) * .05; b.g.rotation.z = Math.sin(t * 1.1 + b.ph) * .06; if (b.drift) b.g.rotation.y += dt * .03; }
    // thin wood smoke from house chimneys (fewer fires lit in 2014)
    const hn = this.hearths ? this.hearths.length : 0;
    if (this.fx && hn && !this.battle && Math.random() < dt * Math.min(6, hn * (this.info.era === '2014' ? .04 : .15))) {
      const c = this.hearths[Math.floor(Math.random() * hn)]; this.fx.puff(c.x, c.y, c.z, .45, 4.5, '#cfcac2', .35);
    }
    if (this.fx && this.chimneys.length && Math.random() < dt * 2.5) { const c = this.chimneys[Math.floor(Math.random() * this.chimneys.length)]; this.fx.puff(c[0], c[1], c[2], 1.1, 4, '#9a9a9a', .6); }
    // animals graze: each wanders to a new spot inside its pasture, stops, lowers its head, moves on
    const ho = this._ho || (this._ho = new THREE.Object3D());
    for (const h of this.herds) {
      for (const it of h.items) {
        if (it.tx === undefined || (Math.hypot(it.tx - it.x, it.tz - it.z) < .05 && Math.random() < dt * .15)) {
          const a = Math.random() * 6.3, r = Math.sqrt(Math.random()) * h.spread; it.tx = h.cx + Math.cos(a) * r; it.tz = h.cz + Math.sin(a) * r;
        }
        const dx = it.tx - it.x, dz = it.tz - it.z, d = Math.hypot(dx, dz), walk = d > .05;
        if (walk) { const sp = Math.min(d, (h.kind === 'cow' ? .28 : .38) * dt); it.x += dx / d * sp; it.z += dz / d * sp; const want = Math.atan2(dx, dz); it.yaw += Math.atan2(Math.sin(want - it.yaw), Math.cos(want - it.yaw)) * Math.min(1, dt * 3); }
        ho.position.set(it.x, this.T.H(it.x, it.z) + (walk ? Math.abs(Math.sin(t * 6 + it.ph)) * .02 : 0), it.z);
        ho.rotation.set(walk ? 0 : Math.max(0, Math.sin(t * .8 + it.ph)) * .18, it.yaw, 0); ho.scale.setScalar(h.kind === 'cow' ? 1 : .9); ho.updateMatrix();
        h.mesh.setMatrixAt(h.items.indexOf(it), ho.matrix);
      }
      h.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const s of this.ships) {
      if (s.path) { const a = t * .05 + s.ph; s.g.position.x = s.path.c[0] + Math.cos(a) * s.path.r; s.g.position.z = s.path.c[1] + Math.sin(a) * s.path.r; s.g.rotation.y = -a; }
      s.g.position.y = Math.sin(t * 1.3 + s.ph) * .06; s.g.rotation.z = Math.sin(t * 1.1 + s.ph) * .04;
    }
  }

  render() {
    this.post.setGrade('region-' + (this.info.era === '2014' ? '2014' : '1810'));
    if (this.cinematic) { this.post.render(this.scene, this.cineCam, this.t); return; }
    this.post.render(this.scene, this.cam, this.t);
    const el = this.renderer.domElement, w = el.clientWidth, h = el.clientHeight, v = new THREE.Vector3();
    for (const l of this.labels) {
      v.copy(l.pos).project(this.cam);
      const on = Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      l.el.style.display = on ? '' : 'none';
      if (on) l.el.style.transform = `translate(${(v.x * .5 + .5) * w}px,${(-v.y * .5 + .5) * h}px) translate(-50%,-100%)`;
    }
  }

  // ---- battle cutscene: a perspective camera flown along scripted shots ----
  setCinematic(on) {
    this.cinematic = on; this.controls.enabled = !on && this.active;
    if (on && !this.cineCam) this.cineCam = new THREE.PerspectiveCamera(40, this.aspect || 1.6, .1, 600);
    if (this.cineCam) { this.cineCam.aspect = this.aspect || 1.6; this.cineCam.updateProjectionMatrix(); }
    this.labelsEl.style.display = on ? 'none' : '';
    this.shake = 0; this.nextShake = 0;
  }
  // shot = 0..4, k = 0..1 within the shot; returns nothing, just places the camera
  cineFrame(shot, k, t) {
    const B = this.battle, cam = this.cineCam, T = this.T; if (!B || !cam) return;
    const M = new THREE.Vector3((B.hold.x + B.contact.x) / 2, 0, (B.hold.z + B.contact.z) / 2);
    const dx = B.contact.x - B.hold.x, dz = B.contact.z - B.hold.z, L = Math.hypot(dx, dz) || 1, d = [dx / L, dz / L], p = [-d[1], d[0]];
    const y0 = Math.max(T.H(M.x, M.z), .2), ease = k * k * (3 - 2 * k);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    if (shot === 0) {          // establishing: slow orbit high above town and front
      const a = Math.atan2(d[1], d[0]) + .9 + ease * .5, R = 36 - ease * 6;
      pos.set(M.x * .5 + Math.cos(a) * R, 26 - ease * 4, M.z * .5 + Math.sin(a) * R); look.set(M.x * .55, 1, M.z * .55);
    } else if (shot === 1) {   // following the move that makes this battle: column, flank, cavalry or the guns
      const A = (B.flank || B.art || B.atk).group.position;
      pos.set(A.x + d[0] * (9 - 2 * ease) + p[0] * 4, A.y + 5 - ease, A.z + d[1] * (9 - 2 * ease) + p[1] * 4);
      look.set(A.x - d[0] * 7, A.y + .6, A.z - d[1] * 7);
    } else if (shot === 2) {   // orbit around the clash
      const a = Math.atan2(p[1], p[0]) + ease * .9, R = 13.5;
      pos.set(M.x + Math.cos(a) * R, y0 + 5.5, M.z + Math.sin(a) * R); look.set(M.x, y0 + 1, M.z);
    } else if (shot === 3) {   // over the defenders' shoulders
      pos.set(B.hold.x - d[0] * (4.5 - ease * 1.5) + p[0] * 2.6, Math.max(T.H(B.hold.x, B.hold.z), .2) + 1.4, B.hold.z - d[1] * (4.5 - ease * 1.5) + p[1] * 2.6);
      look.set(B.contact.x, y0 + .8, B.contact.z);
    } else {                   // crane up and away for the verdict
      pos.set(M.x + p[0] * 12 - d[0] * 8, y0 + 4 + ease * 24, M.z + p[1] * 12 - d[1] * 8); look.set(M.x, y0, M.z);
    }
    // camera shake while the guns are firing
    if (shot === 2 || shot === 3) {
      if (t > this.nextShake) { this.shake = .18 + Math.random() * .14; this.nextShake = t + .6 + Math.random() * .9; }
      this.shake *= .9;
      pos.x += (Math.random() - .5) * this.shake; pos.y += (Math.random() - .5) * this.shake; pos.z += (Math.random() - .5) * this.shake;
    }
    pos.y = Math.max(pos.y, T.H(pos.x, pos.z) + 1.3);   // never dip into a hill
    // never inside a building or a wall: rise above anything standing near the camera
    for (const o of this._ctx.obstacles) if (Math.hypot(o[0] - pos.x, o[1] - pos.z) < o[2] + 1.2) pos.y = Math.max(pos.y, T.H(o[0], o[1]) + 6.5);
    if (this._wallR && Math.abs(Math.hypot(pos.x, pos.z) - this._wallR) < 2.6) pos.y = Math.max(pos.y, T.H(pos.x, pos.z) + 6.2);   // town walls and towers
    cam.position.copy(pos); cam.lookAt(look);
    this.sun.position.copy(look).add(this.sunOff); this.sun.target.position.copy(look);
  }

  dispose() {
    if (!this.scene) return;
    for (const f of this.forms || []) f.dispose();
    this.ghost = null; this.ghostType = null;
    if (this.fx) this.fx.dispose();
    this.forms = []; this.battle = null; this.fx = null;
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { if (m.map) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); m.dispose(); }
    });
    this.scene = null; this.labels = []; if (this.labelsEl) this.labelsEl.innerHTML = '';
  }
}
