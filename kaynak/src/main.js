import './styles.css';
import './hud.css';
import * as THREE from 'three';
import * as d3geo from 'd3-geo';
import { feature } from 'topojson-client';
import polygonClipping from 'polygon-clipping';
import { Peer } from 'peerjs';
import { S, pick } from './core/state.js';
import { RegionView, treeKey } from './region/RegionView.js';
import { HALF as REGION_HALF } from './region/terrain.js';
import { loadPrefabs, PREFABS } from './region/prefabs.js';
import { prefabGroup } from './region/life.js';
loadPrefabs();
import { paintWorldTexture, detailTexture, landMaterial } from './world/mapTexture.js';
import { splitCountry, provincesFromRegions, makeProvinceIndex } from './world/provinces.js';
import { makeRng, hashStr } from './region/noise.js';
import { startMenuGlobe } from './menu/globe.js';
import { GOODS, GOOD_KEYS, goodLabel, profileFor } from './data/countryProfiles.js';
import { biomeFor } from './region/biomes.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { histFlagURL, HIST_FLAG_FILE, ISO2, flagFor } from './data/flags.js';
import { MIL_K, USA_K, MIL_1810, MIL_1810_MAX } from './data/military.js';
import { MINERALS, DEPOSITS, resourceAt } from './data/resources.js';
import { MTN, FOR, MTN_FOOTPRINT, TREE_FOOTPRINT } from './data/terrain.js';
import { EMPIRES, BOT_COLORS, BOT_NAMES, PLAYER_COLORS } from './data/empires.js';
import { MONTHS_TR, CITY_BREAD_COST, TOWN_BREAD_COST, BANK_CAP, M_SHIP, CITY_POP, TOWN_POP, ARMY_UNIT, ARMY_UNIT_COST, ARMY_UNIT_POP, COSTS, TANK_COST_MONEY, SHIP_COST, BATTLE_TIME, EARTH_KM2_PER_STER, BUILD_R, b_label, M_FARM, M_FIELD, M_PORTYARD, M_CITY, M_TOWN, M_BASE, M_OTHER, TANK_COST_POP, TANK_COST_IRON, TANK_ARMY,
  SETTLE_NAMES, SETTLE_POP, UPGRADE_BASE, UPGRADE_MULT, WOOD_PER_TREE, WOOD_COSTS, SHIP_WOOD_1810, TANK_TECH, SHIP_TECH, CANNON_COST_MONEY, setLabelEra } from './sim/constants.js';
import { make2xLabel, mountain, tree, BUILDERS, makeCat, makeFire, makeCapitalMarker, setModelContext } from './render/models.js';
import { cultureFor } from './region/biomes.js';
import { Formation } from './units/Formation.js';
import { FX } from './units/fx.js';
import { Post, skyEnvironment, QUALITIES, QUALITY_LABEL } from './render/post.js';
import { shipGeo, UNIT_MAT } from './units/models.js';
import { genColors, area, pointInRing, ringToShape, simplifyRingB } from './world/geo.js';

const wrap = document.getElementById('wrap');
const loadingEl = document.getElementById('loading');

function fail(msg){ loadingEl.style.display='flex'; loadingEl.innerHTML = msg; }
window.addEventListener('error', e => fail('Hata: ' + (e.message||e.error)));
window.addEventListener('unhandledrejection', e => fail('Hata: ' + ((e.reason&&e.reason.message)||e.reason)));

const RANDOM = genColors(360);
// the player's empire color (owned countries take this color)
const OWN_COLOR = new THREE.Color('#2e8bff');

// ---- scene ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f3b5c');
scene.fog = new THREE.Fog('#0f3b5c', 1800, 4200);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 8000);
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias:true }); }
catch(e){ fail('Bu tarayıcı 3B (WebGL) desteklemiyor.'); throw e; }
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
if('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.appendChild(renderer.domElement);
// screen effects (AO, bloom, era colour grade) and the chosen graphics quality
const post = new Post(renderer);
const GFX_KEY='mbr-gfx';
let gfxPref = (()=>{ const q=new URLSearchParams(location.search).get('gfx'); if(q) return q; try{ return localStorage.getItem(GFX_KEY)||'auto'; }catch(e){ return 'auto'; } })();
// software GPUs (no graphics card driver) cannot afford the screen effects: 'auto' starts them on low
const softwareGPU=(()=>{ try{ const gl=renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
  return /swiftshader|llvmpipe|software|basic render/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); }catch(e){ return false; } })();
const autoStart=()=>softwareGPU ? 'low' : 'high';
post.setQuality(gfxPref==='auto' ? autoStart() : gfxPref);
const skyEnv = skyEnvironment(renderer);
camera.userData.aoRadius = 3.5;

// soft sky + warm sun for a more realistic, dimensional look
const worldHemi = new THREE.HemisphereLight('#eaf4ff', '#1a3550', 0.85);
scene.add(worldHemi);
scene.add(new THREE.AmbientLight('#ffffff', 0.15));
const sun = new THREE.DirectionalLight('#fff3dc', 1.25);
sun.position.set(-520, 820, 420);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=10; sun.shadow.camera.far=3000;
sun.shadow.camera.left=-1200; sun.shadow.camera.right=1200;
sun.shadow.camera.top=1200; sun.shadow.camera.bottom=-1200;
sun.shadow.bias=-0.0005;
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fc4e8', 0.35);
fill.position.set(500, 300, -400);
scene.add(fill);

const W=960, H=500, DEPTH=5;

// ---- ocean: layered, gently animated water for realism ----
function waterNormalTexture(){
  const s=256, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const ctx=cv.getContext('2d'); const img=ctx.createImageData(s,s);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){
    const nx=Math.cos(x*0.08)*0.5, ny=Math.cos(y*0.11+1.3)*0.5;
    const n=Math.sin(x*0.08)*0.5+Math.sin(y*0.11+1.3)*0.5+Math.sin((x+y)*0.05)*0.3;
    const i=(y*s+x)*4;
    img.data[i]=128+nx*60; img.data[i+1]=128+ny*60; img.data[i+2]=200+n*20; img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(cv);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(26,26);
  return tex;
}
const oceanNormal = waterNormalTexture();
oceanNormal.anisotropy = renderer.capabilities.getMaxAnisotropy();   // less moiré on the far ocean
// real 3D waves: a subdivided plane whose vertices rise & fall each frame
const OCEAN_SEG_X=160, OCEAN_SEG_Y=96;
const oceanGeo = new THREE.PlaneGeometry(W*8, H*8, OCEAN_SEG_X, OCEAN_SEG_Y);
const ocean = new THREE.Mesh(oceanGeo,
  new THREE.MeshStandardMaterial({ color:'#15567f', roughness:.5, metalness:.12,
    normalMap:oceanNormal, normalScale:new THREE.Vector2(0.45,0.45), flatShading:false }));
ocean.rotation.x = -Math.PI/2; ocean.position.y = -2.2; ocean.receiveShadow=true;
scene.add(ocean);
// cache the flat base x/y of every vertex (plane is in its own local space, pre-rotation)
const oceanPos = oceanGeo.attributes.position;
const oceanBase = new Float32Array(oceanPos.count*2);
for(let i=0;i<oceanPos.count;i++){ oceanBase[i*2]=oceanPos.getX(i); oceanBase[i*2+1]=oceanPos.getY(i); }
// animate the wave height: tiny, dense ripples that never rise above the land surface.
// land top sits at y=DEPTH(5); ocean base is y=-2.2, so we clamp peaks well below that.
function animateOcean(t){
  for(let i=0;i<oceanPos.count;i++){
    const x=oceanBase[i*2], y=oceanBase[i*2+1];
    // higher frequency (0.03-0.06) + small amplitude => little bobbing crests, not big swells
    const h = Math.sin(x*0.045 + t*2.2)*0.5
            + Math.sin(y*0.05  - t*1.8)*0.45
            + Math.sin((x+y)*0.03 + t*2.6)*0.35;
    oceanPos.setZ(i, h);   // total amplitude ~1.3, stays far below land top
  }
  oceanPos.needsUpdate=true;
  oceanGeo.computeVertexNormals();
}
const deep = new THREE.Mesh(new THREE.PlaneGeometry(W*8, H*8),
  new THREE.MeshBasicMaterial({ color:'#0a3350' }));
deep.rotation.x=-Math.PI/2; deep.position.y=-9; scene.add(deep);

const worldGroup = new THREE.Group();
const worldFx = new FX(worldGroup, 1.8);   // smoke + flashes for battles on the world map
worldGroup.scale.setScalar(1.45);   // bigger map
scene.add(worldGroup);

const projection = d3geo.geoNaturalEarth1();
function toWorld(px,py){ return [px-W/2, -(py-H/2)]; }
// world XZ where objects must sit to line up with the extruded+rotated land.
// Geometry uses shape (sx,sy)=toWorld then rotateX(-90°): worldZ = -sy.
function sceneXZ(lon,lat){ const q=projection([lon,lat]); if(!q) return null;
  return [q[0]-W/2, q[1]-H/2]; }   // == [sx, -sy]

// ---- camera rig (orbit: yaw + pitch) ----
const target = new THREE.Vector3(0,0,0);
let dist = 1080;
const DMIN=8, DMAX=4200;          // DMIN lowered -> can zoom in much closer
let pitch = 1.0;                  // 0 = horizon, PI/2 = straight down
let yaw = 0;                       // rotation around the vertical axis
const PITCH_MIN=0.12, PITCH_MAX=1.45;
function place(){
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  // horizontal direction from yaw; vertical from pitch
  const hx=Math.sin(yaw)*cp, hz=Math.cos(yaw)*cp;
  camera.position.set(target.x + hx*dist, target.y + sp*dist, target.z + hz*dist);
  camera.lookAt(target);
}
function zoom(f){
  if(view!=='world') return;
  worldTween=null;
  dist=Math.min(DMAX,Math.max(DMIN,dist*f)); place();
  // zooming in close over a country opens its region view
  if(f<1 && dist<=ENTER_DIST && worldBuilt && !pickingHome){ const n=provAtScreen(0,0); if(n) enterRegion(n); }
}

const keys={};
function key(d){ return e=>{ const k=(e.key||'').toLowerCase();
  if('wasd'.includes(k)||k.startsWith('arrow')){ keys[k]=d; if(d)e.preventDefault(); } }; }
document.addEventListener('keydown',key(true));
document.addEventListener('keyup',key(false));

document.querySelectorAll('#pad .pb').forEach(b=>{
  const k=b.dataset.key;
  const dn=e=>{e.preventDefault(); keys[k]=true;};
  const up=e=>{e.preventDefault(); keys[k]=false;};
  b.addEventListener('mousedown',dn); b.addEventListener('mouseup',up);
  b.addEventListener('mouseleave',up); b.addEventListener('touchstart',dn,{passive:false}); b.addEventListener('touchend',up);
});
document.getElementById('zin').onclick=()=>zoom(.85);
document.getElementById('zout').onclick=()=>zoom(1/.85);
function wheel(e){ e.preventDefault(); if(view!=='world') return; zoom(e.deltaY<0?.9:1.1); }
renderer.domElement.addEventListener('wheel',wheel,{passive:false});

document.getElementById('resetBtn').onclick=()=>{ target.set(0,0,0); dist=1080; yaw=0; pitch=1.0; place(); };

// ---- painting ----
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
let countryMeshes = [];
let shipyards = [];     // placed shipyard groups (clickable)
let ports = [];         // placed port groups (needed to build ships)
let ships = [];         // produced ship meshes
let bases = [];         // placed military base groups (clickable to recruit)
let garages = [];       // placed garage groups (clickable to build tanks)
let fields = [];        // {group, rate} each field; rate 1 normally, 2 if boosted by a farm
let placedBuildings = []; // all placed building groups (right-click to delete)
let obstacles = [];       // {x,z,r} mountains/trees/buildings for army steering & overlap
let down=null;
// right-button drag to orbit (rotate) the map
let rdrag=null;          // {x,y, moved} while right button held
renderer.domElement.addEventListener('pointerdown',e=>{
  if(view!=='world') return;
  if(e.button===0) down={x:e.clientX,y:e.clientY};
  if(e.button===2){ rdrag={x:e.clientX,y:e.clientY,moved:0}; }
});
window.addEventListener('pointermove',e=>{
  if(!rdrag) return;
  const ddx=e.clientX-rdrag.x, ddy=e.clientY-rdrag.y;
  rdrag.x=e.clientX; rdrag.y=e.clientY; rdrag.moved+=Math.abs(ddx)+Math.abs(ddy);
  yaw += ddx*0.006;
  pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch + ddy*0.004));
  place();
});
window.addEventListener('pointerup',e=>{ if(e.button===2){ setTimeout(()=>{ rdrag=null; }, 0); } });
renderer.domElement.addEventListener('pointerup',e=>{
  if(view!=='world') return;
  if(e.button!==0||!down) return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y); down=null;
  if(moved>10) return;
  const r=renderer.domElement.getBoundingClientRect();
  ptr.x=((e.clientX-r.left)/r.width)*2-1; ptr.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ptr,camera);

  // during a rebellion, clicking a fire shows a "send 1000 soldiers" button
  if(S.rebellionActive && rebelFires.length){
    const groups=rebelFires.filter(fo=>!fo.done).map(fo=>fo.group);
    const fHit=ray.intersectObjects(groups,true)[0];
    if(fHit){ let o=fHit.object; while(o&&!o.userData.fire) o=o.parent;
      const fo=rebelFires.find(x=>x.group===o); if(fo){ showSendArmyButton(fo, e.clientX, e.clientY); } return; }
  }

  // clicking a shipyard opens the ship menu (unless actively placing a building)
  if(!buildType && shipyards.length){
    const sHit=ray.intersectObjects(shipyards.filter(o=>o.visible),true)[0];
    if(sHit){ let o=sHit.object; while(o && !shipyards.includes(o)) o=o.parent; openShipMenu(o); return; }
  }
  // clicking a military base opens the army recruitment menu
  if(!buildType && bases.length){
    const bHit=ray.intersectObjects(bases.filter(o=>o.visible),true)[0];
    if(bHit){ let o=bHit.object; while(o && !o.userData.buildRec) o=o.parent; openArmyMenu(o && o.userData.buildRec.prov); return; }
  }
  // clicking a garage opens the tank menu
  if(!buildType && garages.length){
    const gHit=ray.intersectObjects(garages.filter(o=>o.visible),true)[0];
    if(gHit){ let o=gHit.object; while(o && !o.userData.buildRec) o=o.parent; openTankMenu(o && o.userData.buildRec.prov); return; }
  }

  const hit=ray.intersectObjects(countryMeshes,false)[0];
  if(!hit) return;
  const lp=worldGroup.worldToLocal(hit.point.clone());   // world -> local (handles map scaling)
  // region-pick mode: toggle cells of the conquered country
  if(regionMode){
    const m=hit.object;
    if((meshesByCountry[conquerTarget]||[]).includes(m)){
      if(regionPicked.has(m)){ regionPicked.delete(m); m.material.color.set('#ffd35a'); }
      else { regionPicked.add(m); m.material.color.copy(OWN_COLOR); }
      document.getElementById('regionInfo').textContent=conquerTarget+': '+regionPicked.size+' bölge seçildi';
    }
    return;
  }
  // building happens inside a region: clicking one of your regions opens it with the building ready to place
  if(buildType){
    const pv=provAt(lp.x, lp.z);
    if(!pv || !ownsProv(pv.id)){ hintEl.textContent='İnşa etmek için kendi bölgelerinden birine tıkla.'; return; }
    hintEl.textContent=b_label(buildType)+' — '+pv.label+' bölgesinde yerini seç.';
    enterRegion(pv.id); return;
  }
  // picking your home country by clicking on the map
  if(pickingHome){
    const nm=hit.object.userData.country;
    if(nm && featByName[nm]){ pickingHome=false; chooseCountry(featByName[nm], nm); }
    return;
  }
  // clicking a country: if it's not ours, offer to invade
  const cname = hit.object.userData.country, pid = hit.object.userData.prov;
  if(movePick){ finishMovePick(pid); return; }
  if(pid && ownsProv(pid)){ hideInvade(); showProvince(pid); }
  else if(cname){ hideProvince(); showInvade(cname, pid); }
  else { hideInvade(); hideProvince(); }
});

// (the old world-map placement hologram: buildings are placed only in the region view now)
let ghost=null;
function clearGhost(){ if(ghost){ worldGroup.remove(ghost); ghost=null; } }

renderer.domElement.addEventListener('pointermove',e=>{
  if(view!=='world') return;
  const r=renderer.domElement.getBoundingClientRect();
  ptr.x=((e.clientX-r.left)/r.width)*2-1; ptr.y=-((e.clientY-r.top)/r.height)*2+1;
  // hover highlight: glow the country under the cursor (with a building chosen: shows which region it will open)
  {
    ray.setFromCamera(ptr,camera);
    const h=ray.intersectObjects(countryMeshes,false)[0];
    const name = h && h.object.userData.country;
    const pid = pickingHome ? null : h && h.object.userData.prov;   // choosing a home country: whole countries only
    if(name!==hoverCountry || (pid||null)!==hoverProvId){ hoverProvId=pid||null; setHoverCountry(name||null); }
  }
  if(ghost) clearGhost();   // buildings are placed (and seen) only in the region close-up
});

// ---- hover highlight helpers ----
let hoverCountry=null;
let hoverProvId=null, hoverMeshes=[];
function setHoverCountry(name){
  // revert previous
  hoverMeshes.forEach(m=>{ if(m.material && m.material.emissive){ m.material.emissive.setHex(0x000000); } });
  hoverCountry=name;
  const box=document.getElementById('hoverInfo');
  if(name){
    hoverMeshes = (hoverProvId && meshesByProv[hoverProvId]) || meshesByCountry[name] || [];
    hoverMeshes.forEach(m=>{ if(m.material && m.material.emissive){ m.material.emissive.setHex(0x3a4a2a); } });
    const f=featByName[name];
    let km2='—';
    try{ if(f){ const st=d3geo.geoArea(f); km2=Math.round(st*EARTH_KM2_PER_STER).toLocaleString('tr-TR')+' km²'; } }catch(e){}
    const ruler = (f&&f.properties&&(f.properties.ruler||f.properties.RULER||f.properties.leader||f.properties.SOVEREIGN)) || null;
    let iso=ISO2[name];
    if(!iso && f && f.properties){
      const p=f.properties;
      iso = p.iso_a2 || p.ISO_A2 || p.ISO_A2_EH || p.wb_a2 || p.iso_a2_eh || null;
      if(iso==='-99') iso=null;
    }
    let flag;
    if(iso) flag='<img src="https://flagcdn.com/'+String(iso).toLowerCase()+'.svg" alt="">';
    else if(HIST_FLAG_FILE[name]) flag='<img src="'+histFlagURL(HIST_FLAG_FILE[name])+'" alt="">';
    else flag='🌐';
    const pv=hoverProvId && PI && PI.byId[hoverProvId];
    const pvLine = !pv ? '' : ownsProv(pv.id) ? pv.label+' · '+devInfo(pv.id).name+' · 🪖 '+(S.troops[pv.id]||0).toLocaleString('tr-TR')
      : pv.label+' · savunma '+provDefense(pv.id).toLocaleString('tr-TR');
    box.innerHTML = flag+'<span><b>'+name+'</b>'+(pv? '<br><span style="font-size:12px;color:#e0ae45">'+pvLine+'</span>' : '')+'<br><span style="opacity:.85;font-size:12px">'+km2+(ruler?(' · '+ruler):'')+'</span></span>';
    box.classList.add('show');
    if(pickingHome) showPickPreview(name, iso, km2);
  } else { hoverMeshes=[]; if(box) box.classList.remove('show'); }
  if(!name) pickPreview.classList.remove('show');
}
// big flag + name at the top of the screen while choosing a home country
const pickPreview=document.getElementById('pickPreview');
// pointer moved off the map (onto a panel, the header, outside the window): clear the hover
window.addEventListener('pointermove', e=>{ if(hoverCountry && e.target!==renderer.domElement) setHoverCountry(null); });
document.addEventListener('pointerleave', ()=>{ if(hoverCountry) setHoverCountry(null); });
function showPickPreview(name, iso, km2){
  const img=document.getElementById('ppFlag'), globe=document.getElementById('ppGlobe');
  const src = iso ? 'https://flagcdn.com/w320/'+String(iso).toLowerCase()+'.png'
            : HIST_FLAG_FILE[name] ? histFlagURL(HIST_FLAG_FILE[name], 320) : null;
  globe.style.display = src ? 'none' : '';
  img.style.display = src ? '' : 'none';
  if(src && img.getAttribute('src')!==src){ img.onerror=()=>{ img.style.display='none'; globe.style.display=''; }; img.src=src; }
  document.getElementById('ppName').textContent=name;
  const oid=ownerOf[name], taken = oid!==undefined && oid!==playerId && oid!=='player';
  document.getElementById('ppInfo').textContent = km2+' · Savunma: '+baseArmyFor(name).toLocaleString('tr-TR')+' asker';
  document.getElementById('ppHint').textContent = taken ? 'Bu ülke başka bir oyuncunun' : 'Seçmek için tıkla';
  const pr=profileOf(name);
  document.getElementById('ppIdent').innerHTML = pr ? '<b>'+pr.title+'</b> · '+pr.strengths.map(k=>GOODS[k].icon+' '+goodLabel(k,S.currentEra)).join(', ')+(pr.weaknesses.length? ' <span class="dn">· zayıf: '+pr.weaknesses.map(k=>goodLabel(k,S.currentEra).toLocaleLowerCase('tr')).join(', ')+'</span>' : '') : '';
  pickPreview.classList.toggle('taken', taken);
  pickPreview.classList.add('show');
}

// ---- right-click to delete a building (75% refund) ----
renderer.domElement.addEventListener('contextmenu',e=>{
  e.preventDefault();
  if(view!=='world') return;
  // if the right button was dragged (rotating the map), don't treat it as a delete click
  if(rdrag && rdrag.moved>8) return;
  const r=renderer.domElement.getBoundingClientRect();
  ptr.x=((e.clientX-r.left)/r.width)*2-1; ptr.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(ptr,camera);
  const hit=ray.intersectObjects(placedBuildings,true)[0];
  if(!hit){ return; }
  let o=hit.object; while(o && !o.userData.buildRec) o=o.parent;
  const rec = o && o.userData.buildRec;
  if(!rec) return;
  // refund 75% of the build cost
  const refund=Math.round((rec.cost||0)*0.75);
  if(refund>0){ S.money += refund; updateMoney(); }
  if(rec.undo) rec.undo();
  // remove from scene + registry
  worldGroup.remove(rec.group);
  rec.group.traverse(x=>{ if(x.geometry)x.geometry.dispose(); if(x.material&&x.material.dispose)x.material.dispose(); });
  const i=placedBuildings.indexOf(rec.group); if(i>=0) placedBuildings.splice(i,1);
  if(rec.obstacle){ const oi=obstacles.indexOf(rec.obstacle); if(oi>=0) obstacles.splice(oi,1); }
  hintEl.textContent=b_label(rec.type)+' yıkıldı. İade: +'+refund+' para (%75).';
});

function resize(){
  const w=wrap.clientWidth,h=wrap.clientHeight;
  renderer.setSize(w,h); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  camera.aspect=w/h; camera.updateProjectionMatrix();
  if(regionView) regionView.resize(w,h);
  post.setSize(w,h);
  for(const m of borderMats) m.resolution.set(w,h);
}
window.addEventListener('resize',resize);

// ---- economy ----
// ideology effects
// socialism halves the people's anger; capitalism increases it
function ideoAngerMult(){
  if(S.ideology==='socialism') return 0.5;   // socialism: rebellion risk cut in half
  if(S.ideology==='capitalism') return 1.6;  // capitalism: angrier people
  return 1;
}
function ideoIncomeMult(){ return S.ideology==='capitalism' ? 2 : 1; } // capitalism: double income
function ideoMilitaryCostMult(){ return S.ideology==='militarism' ? 0.6 : 1; } // militarism: cheaper army
function ideoWinBonus(){ return S.ideology==='militarism' ? 1.5 : 1; } // militarism: stronger in battle

// ---- national personality (chosen after ideology) ----
// anger adjustment (percentage points) from personality
function persAngerAdd(){
  if(S.personality==='peaceful') return -15;   // happier people, less unrest
  if(S.personality==='warlike')  return  20;   // always angry
  return 0;                                   // hardworking: unchanged
}
// battle strength multiplier when WE are attacking
function persAttackMult(){
  if(S.personality==='peaceful') return 0.7;   // worse on the offensive
  if(S.personality==='warlike')  return 1.4;   // strong attackers
  return 1;
}
// battle strength multiplier when WE are being attacked (defending) — used for enemy attacks
function persDefendMult(){
  if(S.personality==='peaceful') return 1.5;   // strong defenders
  if(S.personality==='warlike')  return 0.7;   // weak defenders
  return 1;
}
function monthlyUpkeep(){
  recountSettlements();   // provinces won or lost change how many towns and cities we keep
  return S.shipCount*M_SHIP + S.farmCount*M_FARM + S.fieldCount*M_FIELD + S.portShipyardCount*M_PORTYARD
    + (S.cityCount-S.freeCityCount)*M_CITY + S.townCount*M_TOWN + S.baseCount*M_BASE + S.nonChocoBuildings*M_OTHER;
}
// daily upkeep: halve the old monthly amount, then divide by 30 -> charged every in-game day
function dailyUpkeep(){ return monthlyUpkeep()*0.5/30; }
const moneyVal = document.getElementById('moneyVal');
const popVal = document.getElementById('popVal');
const armyVal = document.getElementById('armyVal');
const ironVal = document.getElementById('ironVal');
const breadVal = document.getElementById('breadVal');
const calDate = document.getElementById('calDate');
const taxInput = document.getElementById('taxInput');
function updateMoney(){ if(S.money>S.moneyCap) S.money=S.moneyCap; if(S.money<0) S.money=0;
  moneyVal.textContent = Math.floor(S.money)+' / '+S.moneyCap;
  moneyVal.style.color = '#ffd35a'; }
function updatePop(){ if(popVal) popVal.textContent = Math.floor(S.population)+' / '+S.popCap; }
function updateArmy(){ if(armyVal) armyVal.textContent = S.army; }
function updateIron(){ if(ironVal) ironVal.textContent = Math.floor(S.iron); }
function updateBread(){ if(breadVal) breadVal.textContent = Math.floor(S.bread); }
function updateWood(){ const el=document.getElementById('woodVal'); if(el) el.textContent = Math.floor(S.wood); }
// 1810: piers and ports are built of timber
function woodCost(type){ return S.currentEra==='1810' ? (WOOD_COSTS[type]||0) : 0; }
function updateCalendar(){
  const totalDays=Math.floor(S.gameDays);
  const day=(totalDays%30)+1;
  const monthIdx=Math.floor(totalDays/30)%12;
  const year=S.START_YEAR+Math.floor(totalDays/360);
  if(calDate) calDate.textContent=day+' '+MONTHS_TR[monthIdx]+' '+year;
}
function monthIndexTotal(){ return Math.floor(Math.floor(S.gameDays)/30); }
// rebellion chance for a given month scales with tax level (0% at tax<=2, rising after)
function rebellionReduction(){
  // buildings calm the people (percentage points off the anger meter)
  return S.chocoCount*8 + S.cityCount*10 + S.townCount*5 + S.fieldCount*3;
}
// people's anger as a percentage 0..100. every +5 tax adds 10%. buildings lower it.
function angerPercent(){
  let a = (S.taxPerPerson/5*10)*ideoAngerMult() - rebellionReduction() + persAngerAdd() - (S.fed? 5 : 0);
  return Math.max(0, Math.min(100, Math.round(a)));
}
// called once for each pay period (collects taxes; upkeep is charged daily elsewhere)
function onMonthPassed(){
  const taxIncome=Math.round(S.taxPerPerson*S.population*ideoIncomeMult()*(1+devTaxBonus()));
  S.money+=taxIncome; if(S.money>S.moneyCap)S.money=S.moneyCap; if(S.money<0)S.money=0; updateMoney();
  const pl=peaceMonthsLeft();
  hintEl.textContent='📅 Vergi toplandı: +'+taxIncome+' para.'+feedPeople()
    + (pl>0 && pl<=1.01 ? ' ⚠️ Barış dönemi bitiyor: komşular artık saldırabilir!' : pl>0 ? ' 🕊️ Barış dönemi: '+Math.ceil(pl)+' ay.' : '');
  rollTradeOffers();
}
// charge building upkeep once per in-game day; money can never go below 0
function chargeDailyUpkeep(){
  S._upkeepDebt += dailyUpkeep();
  if(S._upkeepDebt<1) return;
  const due=Math.floor(S._upkeepDebt); S._upkeepDebt-=due;
  if(due<=0) return;
  if(S.money>=due){ S.money-=due; updateMoney(); }
  else {
    // can't cover upkeep: pay what we can, clamp at 0, and warn
    S.money=0; updateMoney();
    hintEl.textContent='⚠️ Yapı giderlerini karşılayamıyorsun! (günlük gider: '+due+' para) Gelirini artır ya da yapı sat.';
  }
}
let rebelFires=[];        // active fire objects {group, x, z, done}
let rebelDeadline=0;      // performance.now() deadline
let rebelExtinguished=0;
function ownedPointsForFire(){
  // random points that fall INSIDE the owned countries' polygons
  const pts=[];
  ownedCountries.forEach(nm=>{
    const meshes=(meshesByCountry[nm]||[]).filter(m=>!m.userData.prov || ownsProv(m.userData.prov));
    for(const m of meshes){
      const r=m.userData.ring; if(!r||r.length<3) continue;
      // ring is in toWorld space: worldX=p[0], worldZ=-p[1]
      let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9;
      for(const p of r){ const x=p[0], z=-p[1];
        if(x<minx)minx=x; if(x>maxx)maxx=x; if(z<minz)minz=z; if(z>maxz)maxz=z; }
      const ringXZ=r.map(p=>[p[0],-p[1]]);
      // try to sample a few random interior points
      let got=0;
      for(let tries=0; tries<40 && got<3; tries++){
        const x=minx+Math.random()*(maxx-minx), z=minz+Math.random()*(maxz-minz);
        if(pointInRing(x,z,ringXZ)){ pts.push([x,z]); got++; }
      }
      if(got===0){ // fallback: centroid
        let cx=0,cz=0; for(const p of r){ cx+=p[0]; cz+=-p[1]; } cx/=r.length; cz/=r.length; pts.push([cx,cz]);
      }
    }
  });
  return pts;
}
function startRebellion(){
  if(S.rebellionActive) return;
  S.rebellionActive=true; rebelExtinguished=0;
  document.getElementById('dangerVignette').classList.add('show');
  document.getElementById('rebelBar').classList.add('show');
  hintEl.textContent='🔥 HALK İSYAN ETTİ! Ateşlere tıklayıp asker gönder butonuna bas. 2 dakikan var!';
  // prefer city/town locations for fires; fill the rest with random owned points
  const cityTown=[];
  for(const g of placedBuildings){ const rec=g.userData.buildRec;
    if(rec && (rec.type==='city'||rec.type==='town')) cityTown.push([rec.x, rec.z]); }
  const randomPts=ownedPointsForFire();
  const spots=[];
  // shuffle city/town spots
  const ct=cityTown.slice();
  for(let i=ct.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [ct[i],ct[j]]=[ct[j],ct[i]]; }
  for(let i=0;i<5;i++){
    if(i<ct.length) spots.push(ct[i]);
    else if(randomPts.length) spots.push(randomPts[(Math.random()*randomPts.length)|0]);
    else spots.push([0,0]);
  }
  rebelFires=[];
  for(let i=0;i<5;i++){
    const p=spots[i]; const x=p[0]+(Math.random()-.5)*4, z=p[1]+(Math.random()-.5)*4;
    const g=makeFire(); g.position.set(x,DEPTH,z); worldGroup.add(g);
    rebelFires.push({group:g, x, z, done:false});
  }
  rebelDeadline=performance.now()+120000;  // 2 minutes
  updateRebelBar();
}
function updateRebelBar(){
  const fe=document.getElementById('rebelFires'); if(fe) fe.textContent=rebelExtinguished;
  const left=Math.max(0, Math.ceil((rebelDeadline-performance.now())/1000));
  const te=document.getElementById('rebelTimer'); if(te) te.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
}
function extinguishFire(fireObj){
  if(!S.rebellionActive || fireObj.done) return;
  if(S.army<1000){ hintEl.textContent='Yetersiz ordu! Her ateş için 1000 asker gerekir. (Ordun: '+S.army+')'; return; }
  takeTroops(1000);
  fireObj.done=true; rebelExtinguished++;
  worldGroup.remove(fireObj.group);
  updateRebelBar();
  if(rebelExtinguished>=5) rebellionWon();
}
let _selectedFire=null;
function showSendArmyButton(fo, sx, sy){
  _selectedFire=fo;
  const btn=document.getElementById('sendArmyBtn');
  btn.style.left=sx+'px'; btn.style.top=sy+'px'; btn.style.display='block';
}
function hideSendArmyButton(){ const b=document.getElementById('sendArmyBtn'); if(b) b.style.display='none'; _selectedFire=null; }
document.getElementById('sendArmyBtn').onclick=(ev)=>{
  ev.stopPropagation();
  if(_selectedFire && !_selectedFire.done){ extinguishFire(_selectedFire); }
  hideSendArmyButton();
};
function rebellionWon(){
  endRebellionVisuals();
  const lost=Math.round(S.population*0.35);
  S.population=Math.max(0,S.population-lost); updatePop();
  hintEl.textContent='İsyan bastırıldı! Ama halkın %35\'i ('+lost+' kişi) ülkeyi terk etti.';
  S.rebellionActive=false;
}
function rebellionLost(){
  endRebellionVisuals();
  S.rebellionActive=false;
  hintEl.textContent='💀 İsyanı zamanında bastıramadın — ülken yıkıldı!';
  gameOver('Ülken bir halk isyanıyla yıkıldı.');
}
function endRebellionVisuals(){
  document.getElementById('dangerVignette').classList.remove('show');
  document.getElementById('rebelBar').classList.remove('show');
  hideSendArmyButton();
  rebelFires.forEach(fo=>{ if(!fo.done) worldGroup.remove(fo.group); });
  rebelFires=[];
}
function gameOver(msg){
  // clear owned territory and return to menu
  clearWorldObjects();
  document.body.classList.remove('ingame','tax-open'); document.getElementById('saveBtn').classList.remove('show');
  document.getElementById('taxbar').classList.remove('show');
  document.getElementById('exitBtn').classList.remove('show');
  selinfo.classList.remove('show');
  gameStarted=false;
  try{ if(gameId) localStorage.removeItem(GAME_KEY+gameId); }catch(e){}
  setGameLink(null);
  alert('Oyun bitti: '+msg);
  mainmenu.classList.add('open');
}
// leave the current game and go back to the main menu (no "game over" alert)
function exitToMenu(){
  if(!confirm('Ana menüye dönülsün mü? Oyunun kendi linkinde kayıtlı kalır.')) return;
  autosaveGame(); setGameLink(null);
  clearWorldObjects();
  pickingHome=false;
  document.body.classList.remove('selecting');
  document.body.classList.remove('ingame','tax-open'); document.getElementById('saveBtn').classList.remove('show');
  document.getElementById('taxbar').classList.remove('show');
  document.getElementById('exitBtn').classList.remove('show');
  selinfo.classList.remove('show');
  if(hintEl) hintEl.textContent='';
  gameStarted=false;
  // close any open modals
  ['eraModal','ideoModal','persModal','conquerModal','rebelModal','savesModal'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.classList.remove('open');
  });
  document.getElementById('dangerVignette').classList.remove('show');
  document.getElementById('rebelBar').classList.remove('show');
  mainmenu.classList.add('open');
}
document.getElementById('exitBtn').onclick=exitToMenu;
document.getElementById('rankBtn').onclick=()=>{
  rankOpen=!rankOpen;
  const p=document.getElementById('rankPanel');
  p.classList.toggle('show', rankOpen);
  if(rankOpen) renderRanking();
};
// legacy no-op (old modal button)
function resolveRebellion(){}
updateMoney(); updatePop(); updateArmy(); updateIron();
updateBread(); updateCalendar();
function angerColor(a){
  // 0 -> green, 50 -> yellow, 100 -> red
  let r,g,b=40;
  if(a<50){ const t=a/50; r=Math.round(60+t*(255-60)); g=Math.round(200+t*(210-200)); }
  else { const t=(a-50)/50; r=255; g=Math.round(210-t*210); }
  return 'rgb('+r+','+g+','+b+')';
}
function updateTaxFace(){
  const a=angerPercent();
  const av=document.getElementById('angerVal'); if(av){ av.textContent='%'+a; av.style.color=angerColor(a); }
  const pct=document.getElementById('taxPct'); if(pct){ pct.textContent=a+'%'; pct.style.color=angerColor(a); }
  const svg=document.getElementById('taxFace'); if(!svg) return;
  const col=angerColor(a);
  const t=a/100;                 // 0 happy .. 1 angry
  // mouth: smile (curve up) at 0, frown (curve down) at 1
  const my=23, curve= 6 - t*14;  // +6 smile -> -8 frown
  const mouth='M 11 '+my+' Q 17 '+(my+curve)+' 23 '+my;
  // eyebrows: flat at 0, angled/angry at 1
  const browIn=6*t, browOut=3*t;
  const lBrow='M 9 '+(11+browOut)+' L 14 '+(11+browOut+browIn);
  const rBrow='M 25 '+(11+browOut)+' L 20 '+(11+browOut+browIn);
  svg.innerHTML=
    '<circle cx="17" cy="17" r="15" fill="'+col+'" stroke="#0e1b2a" stroke-width="2"/>'+
    '<circle cx="12" cy="15" r="1.8" fill="#0e1b2a"/>'+
    '<circle cx="22" cy="15" r="1.8" fill="#0e1b2a"/>'+
    '<path d="'+mouth+'" stroke="#0e1b2a" stroke-width="2" fill="none" stroke-linecap="round"/>'+
    '<path d="'+lBrow+'" stroke="#0e1b2a" stroke-width="2" fill="none" stroke-linecap="round"/>'+
    '<path d="'+rBrow+'" stroke="#0e1b2a" stroke-width="2" fill="none" stroke-linecap="round"/>';
}
function refreshTaxHint(){
  const h=document.getElementById('taxHint');
  const a=angerPercent();
  if(h) h.textContent = a>=100 ? 'Halk isyan ediyor!' : ('Halkın öfkesi: %'+a+' (100'+'\u2019'+'de isyan)');
  updateTaxFace();
}
if(taxInput){
  taxInput.value=S.taxPerPerson;
  taxInput.oninput=()=>{ let v=parseInt(taxInput.value); if(isNaN(v)||v<0)v=0; if(v>2000)v=2000; S.taxPerPerson=v; refreshTaxHint(); };
}
refreshTaxHint();
let lastT = performance.now();

// resource at a world (scene) XZ point
function resourceAtXZ(x,z){
  const ll=projection.invert([x+W/2, z+H/2]);
  if(!ll) return null;
  return resourceAt(ll[0], ll[1]);
}

let mines = [];   // {group, mineral}
// total mine money income per second (each mine yields its mineral value per minute)
// ---- region specialisation: each of our regions can be made a farming, industrial, military or trade region
const SPECS={
  tarim:{ icon:'🌾', name:'Tarım', desc:'Ekmek, balık ve et üretimi +%50', goods:{ grain:1.5, fish:1.5, livestock:1.5 } },
  sanayi:{ icon:'⚙️', name:'Sanayi', desc:'Maden geliri, demir, petrol, teknoloji +%50 · tank -%20', goods:{ money:1.5, iron:1.5, oil:1.5, tech:1.5 } },
  askeri:{ icon:'🪖', name:'Askeri', desc:'Asker -%25 · tank -%10 ucuz', goods:{} },
  ticaret:{ icon:'💰', name:'Ticaret', desc:'Bölgenin vergi katkısı 2 kat', goods:{} },
};
const SPEC_COST=1500;
const specOf=id=>(S.spec && id && S.spec[id]) || null;
const specGood=(id, good)=>{ const s=SPECS[specOf(id)]; return (s && s.goods[good]) || 1; };
const recOfGroup=g=>g && g.userData && g.userData.buildRec;
function mineIncomePerSec(){
  let s=0; for(const m of mines){ const r=recOfGroup(m.group); s += (MINERALS[m.mineral].value||0)/60*specGood(r && r.prov, 'money'); } return s;
}
// iron produced per second across all iron mines (10 iron/min each)
function mineIronPerSec(){
  let s=0; for(const m of mines){ const mi=MINERALS[m.mineral], r=recOfGroup(m.group); if(mi.iron) s += mi.iron/60*specGood(r && r.prov, 'iron'); } return s;
}

// ---- resource map overlay ----
let resourceOverlay=null;
function buildResourceOverlay(){
  resourceOverlay=new THREE.Group();
  for(const key in DEPOSITS){
    const col=new THREE.Color(MINERALS[key].color);
    for(const [lon,lat,r] of DEPOSITS[key]){
      const p=sceneXZ(lon,lat); if(!p) continue;
      const radius = r*2.6;  // degrees -> world units (approx)
      const disc=new THREE.Mesh(new THREE.CircleGeometry(radius,24),
        new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.55, side:THREE.DoubleSide, depthWrite:false}));
      disc.rotation.x=-Math.PI/2; disc.position.set(p[0], DEPTH+1.0, p[1]);
      resourceOverlay.add(disc);
      const ring=new THREE.Mesh(new THREE.RingGeometry(radius*0.96,radius,24),
        new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false}));
      ring.rotation.x=-Math.PI/2; ring.position.set(p[0], DEPTH+1.1, p[1]);
      resourceOverlay.add(ring);
    }
  }
  resourceOverlay.visible=false;
  worldGroup.add(resourceOverlay);
}
const resBtn=document.getElementById('resBtn');
const resLegend=document.getElementById('resLegend');
resBtn.onclick=()=>{
  if(!resourceOverlay) return;
  const on = !resourceOverlay.visible;
  resourceOverlay.visible=on;
  resBtn.classList.toggle('active',on);
  resLegend.classList.toggle('show',on);
};

// 'auto' starts on high and steps down once a level when the frame rate stays under ~40 fps for a few seconds
let _fpsT=0, _fpsN=0, _fpsWarm=0;
function autoQuality(rdt){
  if(gfxPref!=='auto') return;
  if((_fpsWarm+=rdt)<3) return;                 // ignore the hitches right after loading a scene
  _fpsT+=rdt; _fpsN++;
  if(_fpsT<4) return;
  const fps=_fpsN/_fpsT; _fpsT=0; _fpsN=0;
  const i=QUALITIES.indexOf(post.quality);
  if(fps<40 && i>0){ post.setQuality(QUALITIES[i-1]); _fpsWarm=0; updateGfxBtn(); }
}
const gfxBtn=document.getElementById('gfxBtn');
function updateGfxBtn(){ if(gfxBtn) gfxBtn.textContent='✦ '+(gfxPref==='auto' ? QUALITY_LABEL.auto+' ('+QUALITY_LABEL[post.quality]+')' : QUALITY_LABEL[gfxPref]); }
if(gfxBtn){ updateGfxBtn(); gfxBtn.onclick=()=>{
  const order=['auto', ...QUALITIES]; gfxPref=order[(order.indexOf(gfxPref)+1)%order.length];
  post.setQuality(gfxPref==='auto' ? autoStart() : gfxPref); _fpsWarm=0;
  try{ localStorage.setItem(GFX_KEY, gfxPref); }catch(e){}
  updateGfxBtn();
}; }

function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();
  const rdt=Math.min(0.1,(now-lastT)/1000); lastT=now;   // real seconds (camera, animation)
  const dt=rdt*gameSpeed;                                 // simulated seconds (economy, calendar, armies)
  if((_hudT+=rdt)>.5){ _hudT=0; updateGoodsHud(); if(tradePanel.classList.contains('show')) renderTrade(); }
  if(gameSpeed===0 && S.rebellionActive) rebelDeadline+=rdt*1000;   // the rebellion clock stops while paused
  // continuous money: only mine income (upkeep is now charged monthly; capitalism doubles it)
  const income  = mineIncomePerSec()*ideoIncomeMult();
  const net = income;
  if(net!==0){ S.money += net*dt; if(S.money>S.moneyCap) S.money=S.moneyCap; updateMoney(); }
  const ir=mineIronPerSec(); if(ir>0){ S.iron += ir*dt; updateIron(); }
  // fields produce bread (+1/sec each)
  if(fields.length>0){ let br=0; for(const fd of fields){ const rec=fd.group.userData.buildRec; br+=fd.rate*(rec? recMult(rec,'grain') : 1); } if(br>0){ S.bread += br*dt; updateBread(); } }
  stepGoods(dt);
  // ---- calendar: 1 real second = 1 in-game day ----
  if(gameStarted){
    const prevDay=Math.floor(S.gameDays);
    S.gameDays += dt;
    updateCalendar();
    // charge building upkeep once for each in-game day that elapsed
    const newDay=Math.floor(S.gameDays);
    for(let d=prevDay; d<newDay; d++) chargeDailyUpkeep();
    // payday: hardworking collects on the 15th of each month, everyone else at month end
    const payOffset = (S.personality==='hardworking') ? 15 : 30;
    const payIndex = Math.floor((Math.floor(S.gameDays) - payOffset)/30) + 1;
    if(payIndex>S.lastMonthCounted){
      const times=payIndex-S.lastMonthCounted; S.lastMonthCounted=payIndex;
      for(let i=0;i<times && i<24;i++){ onMonthPassed(); if(!MP||isHost) botsMonthlyTick(); }
      if(!MP||isHost) hostBroadcastWorld();
      if(rankOpen) renderRanking();
    }
    // anger meter: at 100% the people rise up (no randomness)
    updateTaxFace();
    if(!S.rebellionActive && angerPercent()>=100) startRebellion();
    // host keeps joiners in sync with the shared world
    if(MP && isHost){ _mpSyncT+=dt; if(_mpSyncT>=1.5){ _mpSyncT=0; hostBroadcastWorld(); } }
  }
  // population grows faster with each city/town built (base 2/sec + bonuses)
  const popRate = (4 + S.cityCount*2 + S.townCount*1) * 0.4 * (S.fed? 1.5 : 1);   // a fed people grows faster
  if(S.population < S.popCap){ S.population = Math.min(S.popCap, S.population + popRate*dt); updatePop(); }
  stepInvasion(dt);
  if(S.rebellionActive){
    updateRebelBar();
    // flicker fires
    for(const fo of rebelFires){ if(!fo.done && fo.group){
      const fg=fo.group; fg.userData.t=(fg.userData.t||0)+dt*6;
      const parts=fg.userData.parts||[];
      for(let i=0;i<parts.length;i++){ const p=parts[i];
        const f=Math.sin(fg.userData.t + i*1.3)*0.18;
        p.scale.set(p.userData.baseS*(1+f), p.userData.baseS*1.4*(1+f*1.4), 1);
        p.position.y=p.userData.baseY + Math.sin(fg.userData.t*1.4+i)*0.3;
        p.material.opacity=0.75+Math.sin(fg.userData.t*2+i)*0.25;
      }
    } }
    if(performance.now()>rebelDeadline) rebellionLost();
  }

  const rateEl=document.getElementById('rateVal');
  if(rateEl){ const r=Math.round(net); rateEl.textContent=(r>=0?'+':'')+r+'/sn';
    rateEl.style.color = r<0?'#ff6b6b':'#8be38b'; }
  if(view==='region' && regionView){ if(!cine) applySky(currentSky()); updateCinematic(rdt); regionView.update(rdt); regionView.render(); autoQuality(rdt); return; }
  if(worldTween){ worldTween.t+=rdt; const k=Math.min(1,worldTween.t/worldTween.dur), e=1-Math.pow(1-k,3);
    dist=worldTween.from+(worldTween.to-worldTween.from)*e; place(); if(k>=1) worldTween=null; }
  let dx=0,dz=0;
  if(keys['w']||keys['arrowup'])dz-=1;
  if(keys['s']||keys['arrowdown'])dz+=1;
  if(keys['a']||keys['arrowleft'])dx-=1;
  if(keys['d']||keys['arrowright'])dx+=1;
  if(dx||dz){ const l=Math.hypot(dx,dz),sp=dist*0.012;
    // pan relative to the current yaw so "up" moves away from the camera
    const cy=Math.cos(yaw), sy=Math.sin(yaw);
    const wx=(dx*cy - dz*sy)/l*sp, wz=(dx*sy + dz*cy)/l*sp;
    target.x=Math.min(700,Math.max(-700,target.x+wx));
    target.z=Math.min(460,Math.max(-460,target.z+wz)); place(); }
  // living ocean: drifting ripples (normal map) + real 3D swell (vertex waves)
  if(oceanNormal){ oceanNormal.offset.x += rdt*0.01; oceanNormal.offset.y += rdt*0.006; }
  _oceanT += rdt;
  if(--_oceanSkip<=0){ animateOcean(_oceanT); _oceanSkip=2; }   // every ~2 frames for perf
  applySky(currentSky());
  updateMapNames();
  updateWorldUnits(rdt);
  post.setGrade('world-'+(S.currentEra==='1810'?'1810':'2014')); post.render(scene,camera,now/1000); autoQuality(rdt);
  updateEmpireLabels(rdt);
}
let _oceanT=0, _oceanSkip=0, _hudT=0;
let _mpSyncT=0;

// (render loop is started at the very end, after all declarations exist)

// ---- build countries (simple, no extra data, no heavy loops) ----
function ringPts(ring){
  const p=[]; for(const c of ring){ const q=projection(c);
    if(!q||!isFinite(q[0])||!isFinite(q[1]))continue; const[x,z]=toWorld(q[0],q[1]); p.push([x,z]); } return p;
}
function shapes(f){
  const out=[]; const g=f.geometry; if(!g)return out;
  const polys = g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  for(const rings of polys){
    let o=ringPts(rings[0]||[]); if(o.length<3)continue;
    let mn=1e9,mx=-1e9; for(const q of o){ if(q[0]<mn)mn=q[0]; if(q[0]>mx)mx=q[0]; }
    if(mx-mn>W*0.9)continue; if(Math.abs(area(o))<1)continue;
    if(area(o)<0)o.reverse();
    const s=new THREE.Shape(); s.moveTo(o[0][0],o[0][1]); for(let i=1;i<o.length;i++)s.lineTo(o[i][0],o[i][1]); s.closePath();
    for(let h=1;h<rings.length;h++){ let hl=ringPts(rings[h]); if(hl.length<3)continue; if(Math.abs(area(hl))<1)continue;
      if(area(hl)>0)hl.reverse(); const pa=new THREE.Path(); pa.moveTo(hl[0][0],hl[0][1]);
      for(let i=1;i<hl.length;i++)pa.lineTo(hl[i][0],hl[i][1]); pa.closePath(); s.holes.push(pa); }
    out.push(s);
  }
  return out;
}

function load(url){ return fetch(url).then(r=>{ if(!r.ok)throw new Error('HTTP '+r.status); return r.json(); }); }

// --- get a country's outer polygons as world-space rings (array of [x,z] loops) ---
function countryPolys(f){
  const g=f.geometry; if(!g) return [];
  const raw = g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  const polys=[];
  for(const rings of raw){
    const lonlat = rings[0]||[];
    // detect antimeridian wrap from RAW longitudes
    let hasFarEast=false, hasFarWest=false;
    for(const c of lonlat){ const lon=c[0];
      if(lon>150) hasFarEast=true; if(lon<-150) hasFarWest=true; }
    // a ring that crosses the date line projects part of itself to the far side
    // (a displaced strip). Keep only the dominant (eastern) side and drop the
    // small wrapping sliver so mainland Russia stays put with no stray line.
    let coords = lonlat;
    if(hasFarEast && hasFarWest){
      coords = lonlat.filter(c=> c[0] >= -150);   // remove the across-the-line sliver
      if(coords.length<3) continue;
    }

    const outer=ringPts(coords);
    if(outer.length<3) continue;
    let mn=1e9,mx=-1e9,zmn=1e9,zmx=-1e9;
    for(const q of outer){ if(q[0]<mn)mn=q[0]; if(q[0]>mx)mx=q[0]; if(q[1]<zmn)zmn=q[1]; if(q[1]>zmx)zmx=q[1]; }
    if(mx-mn>W*0.95) continue;           // near-full-width artifacts only (antimeridian wrap)
    if(Math.abs(area(outer))<0.02) continue;   // drop only degenerate rings
    // polygon-clipping wants closed rings [ [x,y]... ] with first==last
    const ring=outer.map(p=>[p[0],p[1]]); ring.push([ring[0][0],ring[0][1]]);
    polys.push([ring]); // one polygon = [outerRing] (ignore holes for cells; fine visually)
  }
  return polys;
}

const meshesByCountry = {};   // name -> [meshes]
const meshesByProv = {};      // province id -> [meshes]
const PROVS = [];             // every province on the map
let REGIONS = {};             // real geographic regions per country (public/data/regions-<era>.json)
let PI = null;                // province index (by id / country / point)
let landTex=null, landDetail=null;   // painted world texture, built once per map in buildWorld
const CLIFF=new THREE.Color('#c4ab84');   // sandy rock on the extruded coast walls
function regionMesh(shapeList, color, idx, name, ringXZ, prov){
  const eg=new THREE.ExtrudeGeometry(shapeList,{depth:DEPTH,bevelEnabled:false});
  eg.rotateX(-Math.PI/2); eg.computeVertexNormals();
  const pos=eg.attributes.position, nrm=eg.attributes.normal, vc=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){ const top=nrm.getY(i)>.5; vc[i*3]=top?1:CLIFF.r; vc[i*3+1]=top?1:CLIFF.g; vc[i*3+2]=top?1:CLIFF.b; }
  eg.setAttribute('color', new THREE.BufferAttribute(vc,3));
  const baseCol=new THREE.Color(color);
  const mat=landTex? landMaterial(landTex, landDetail) : new THREE.MeshStandardMaterial({roughness:.92,metalness:.02});
  if(name){ let ll=null;
    if(ringXZ && ringXZ.length){ let sx=0, sz=0; for(const [x,z] of ringXZ){ sx+=x; sz+=z; } ll=projection.invert([sx/ringXZ.length+W/2, sz/ringXZ.length+H/2]); }
    baseCol.copy(neutralColor(name, ll)); }
  mat.color.copy(baseCol);
  const m=new THREE.Mesh(eg,mat);
  m.userData.i=idx; m.userData.country=name; if(ringXZ) m.userData.ring=ringXZ;
  m.userData.baseColor=baseCol.clone();   // geographic colour; ownership shows via border, not fill
  m.castShadow=true; m.receiveShadow=true;
  worldGroup.add(m); countryMeshes.push(m);
  if(name){ (meshesByCountry[name]||(meshesByCountry[name]=[])).push(m); }
  if(prov){ m.userData.prov=prov; (meshesByProv[prov]||(meshesByProv[prov]=[])).push(m); }
}

// subdivide one country polygon into area-proportional clipped cells
// every country is split into provinces; each province piece is its own mesh (userData.prov)
function buildCountry(f, color, idx){
  const cname=f.properties && f.properties.name;
  const reg=REGIONS[cname] || (cname==='Türkiye' && REGIONS.Turkey);
  const provs=(reg && reg.length>1 && provincesFromRegions(cname, reg.map(r=>({ label:r.n, polys:countryPolys({ geometry:{ type:'MultiPolygon', coordinates:r.p } }) })), capitalXZ(cname)))
    || splitCountry(cname, countryPolys(f), capitalXZ(cname));
  for(const p of provs){
    PROVS.push(p);
    for(const ring of p.rings) regionMesh([ringToShape(ring)], color, idx, cname, ring.map(q=>[q[0],q[1]]), p.id);
  }
}

// ---- map era loading ----
// 2014 = modern (world-atlas topojson). 1810 = historical (world_1815 geojson).
let worldBuilt=false;
const timings={};   // load-time measurements, exposed to the test hook
function buildWorld(features){
  const _tb=performance.now();
  // features: array of GeoJSON features with properties.name
  projection.fitExtent([[10,10],[W-10,H-10]],{type:'FeatureCollection',features});
  LANDFEATS = features;
  { const _t=performance.now();
  buildLandGrid();
  timings.landGrid=Math.round(performance.now()-_t); }
  features.forEach(f=>{ const n=f.properties&&f.properties.name; if(n) featByName[n]=f; });
  if(landTex) landTex.dispose();
  const _t0=performance.now();
  landTex=new THREE.CanvasTexture(paintWorldTexture(projection, W, H));
  timings.mapTexture=Math.round(performance.now()-_t0);
  landTex.colorSpace=THREE.SRGBColorSpace; landTex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  landTex.repeat.set(1/W, 1/H); landTex.offset.set(.5, .5);   // extrude cap UVs are shape coords
  if(!landDetail) landDetail=detailTexture();
  { const _t=performance.now();
  features.forEach((f,idx)=>{ buildCountry(f, '#ffffff', idx); });
  timings.countries=Math.round(performance.now()-_t); }
  // remove wide+thin strip artifacts ONLY if they hug the extreme north edge
  const box=new THREE.Box3(); const toRemove=[]; const TOPZ=H/2-12;
  for(const m of countryMeshes){ box.setFromObject(m);
    const sx=box.max.x-box.min.x, sz=box.max.z-box.min.z;
    if(sx>300 && sz<6 && box.min.z>TOPZ-30) toRemove.push(m); }
  toRemove.forEach(m=>{ worldGroup.remove(m); const i=countryMeshes.indexOf(m); if(i>=0)countryMeshes.splice(i,1);
    m.geometry.dispose(); m.material.dispose(); });
  ALL_FEATURES = features;
  buildResourceOverlay();
  { const _t=performance.now();
  addDecorations(features);
  timings.decorations=Math.round(performance.now()-_t); }
  { const _t=performance.now();
  buildAllCountryBorders();   // thin white outline for EVERY country (shows sizes & empty lands)
  PI=makeProvinceIndex(PROVS); buildProvinceLines(); rebuildMapNames();
  timings.borders=Math.round(performance.now()-_t); }
  worldBuilt=true;
  document.getElementById('regionBtn').classList.add('show');
  timings.buildWorld=Math.round(performance.now()-_tb);
}

// static thin white outline of every country (built once per map)
let allBordersGroup=null;
function buildAllCountryBorders(){
  if(allBordersGroup){ worldGroup.remove(allBordersGroup);
    allBordersGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); }); }
  allBordersGroup=new THREE.Group();
  const mat=new THREE.LineBasicMaterial({color:0x1b1712, transparent:true, opacity:0.7});   // country borders: dark ink
  for(const f of (ALL_FEATURES||[])){
    const polys=countryPolys(f);
    for(const poly of polys){ const ring=poly[0];
      const pts=ring.map(c=> new THREE.Vector3(c[0], DEPTH+0.08, -c[1]));
      if(pts.length>1){ const geo=new THREE.BufferGeometry().setFromPoints(pts);
        allBordersGroup.add(new THREE.Line(geo, mat)); } }
  }
  worldGroup.add(allBordersGroup);
}

function normFeatures(features, era){
  // give every feature a clean properties.name; keep only valid polygon geometry
  const out=[];
  for(const f of features){
    if(!f || !f.geometry) continue;
    const gt=f.geometry.type;
    if(gt!=='Polygon' && gt!=='MultiPolygon') continue;   // skip points/lines/collections
    const coords=f.geometry.coordinates;
    if(!coords || !coords.length) continue;
    const p=f.properties||{};
    let name = p.name || p.NAME || p.NAME_EN || p.SUBJECTO || p.ABBREVN || p.name_en;
    if(!name) continue;
    if(era==='2014'){ if(name==='Israel') continue; if(name==='Turkey'||name==='Turkiye') name='Türkiye'; }
    f.properties = Object.assign({}, p, {name:String(name)});
    out.push(f);
  }
  return out;
}

let mapLoading=false;
// ---- every game lives at its own link (?oyun=<id>) and is saved there continuously, so a refresh resumes it ----
const GAME_KEY='mbr-game-';
let gameId=new URLSearchParams(location.search).get('oyun'), pendingRestore=null;
function setGameLink(id){
  gameId=id;
  const u=new URL(location.href); if(id) u.searchParams.set('oyun', id); else u.searchParams.delete('oyun');
  history.replaceState(null, '', u);
}
function autosaveGame(){
  if(!gameId || !worldBuilt || MP) return;
  try{ localStorage.setItem(GAME_KEY+gameId, JSON.stringify({ era:S.currentEra, t:Date.now(), state: S.homeName && gameStarted ? collectState() : null })); }catch(e){}
}
setInterval(autosaveGame, 5000);
addEventListener('pagehide', autosaveGame);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) autosaveGame(); });

// what differs between the eras in the menus: 1810 has wood and cannons, 2014 technology and tanks
function applyEraUI(era){
  document.body.dataset.era=era; setLabelEra(era);
  const is1810=era==='1810';
  const gb=document.querySelector('.bopt[data-b="garage"]');
  if(gb) gb.innerHTML= is1810? '💣 Top Dökümhanesi (1000)<span class="binfo">Top döker · Üstüne tıkla</span>' : '🏭 Garaj (1000)<span class="binfo">Tank üretir · teknoloji ister</span>';
  for(const [t, ico, name] of [['port','⚓','Liman'],['shipyard','🚢','Tersane'],['fishery','🐟','Balıkçı Limanı']]){
    const b=document.querySelector('.bopt[data-b="'+t+'"]'); if(!b) continue;
    const info=b.querySelector('.binfo'), keep=info? info.outerHTML : '';
    b.innerHTML=ico+' '+name+' ('+COSTS[t]+(is1810? ' + '+WOOD_COSTS[t]+'🪵' : '')+')'+keep;
  }
  const ta=document.querySelector('#tankAct span'); if(ta) ta.textContent= is1810? 'Top' : 'Tank';
  document.getElementById('tankAct').title= is1810? 'Top' : 'Tank';
  document.getElementById('tankPer').textContent= is1810? '10 👥 · '+CANNON_COST_MONEY+' 💰 · 20 ⛓️ · 5 kömür' : '10 👥 · '+TANK_COST_MONEY+' 💰 · 20 ⛓️ · '+TANK_TECH+' ⚙️ · 15 petrol';
  document.getElementById('tankPerLbl').textContent= is1810? 'Top başına' : 'Tank başına';
  document.getElementById('tankBuildBtn').textContent= is1810? 'Top Dök' : 'Tank Üret';
  document.getElementById('tankNote').textContent= is1810? 'Her top orduya +500 güç katar' : 'Her tank orduya +500 güç katar';
  document.getElementById('shipPrice').textContent= is1810? SHIP_COST+' 💰 · '+SHIP_WOOD_1810+' 🪵' : SHIP_COST+' 💰 · 20 petrol · '+SHIP_TECH+' ⚙️';
  updateWood();
}
function loadEra(era){
  if(worldBuilt || mapLoading) return;
  if(!gameId) setGameLink(Math.random().toString(36).slice(2, 8)+Date.now().toString(36).slice(-3));
  S.currentEra=era;
  applyEraUI(era);
  S.START_YEAR = (era==='1810') ? 1810 : 2014;
  updateCalendar();
  mapLoading=true;
  loadingEl.style.display='flex';
  loadingEl.innerHTML = (era==='1810'?'1810 haritası yükleniyor…':'2014 haritası yükleniyor…');
  const done=async (features)=>{
    try{ REGIONS = await load(import.meta.env.BASE_URL+'data/regions-'+era+'.json'); }catch(e){ REGIONS = {}; }
    features = normFeatures(features, era);
    buildWorld(features);
    loadingEl.style.display='none';
    if(era==='2014'){ const skp=sceneXZ(127.8,36.4);
      if(skp){ const cat=makeCat(); cat.position.set(skp[0],DEPTH,skp[1]); cat.scale.setScalar(1.1); cat.rotation.y=-0.6; worldGroup.add(cat); } }
    if(pendingRestore){ const st=pendingRestore; pendingRestore=null; applyState(st); hintEl.textContent='Oyun kaldığın yerden devam ediyor.'; }
    else startCountrySelection();
    mapLoading=false;
  };
  const failMap=(err)=>{ mapLoading=false;
    fail('Harita yüklenemedi.<br>İnternet bağlantısını kontrol edip yenileyin.<br><span style="font-size:11px;opacity:.7">('+(err&&err.message?err.message:err)+')</span>'); };
  if(era==='1810'){
    // try the bundled local copy first (same-origin, always works), then remote fallbacks
    load(import.meta.env.BASE_URL+'data/world_1815.geojson')
      .catch(()=>load('https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson/world_1815.geojson'))
      .then(gj=> done(gj.features||[]))
      .catch(failMap);
  } else {
    load(import.meta.env.BASE_URL+'data/countries-50m.json')
      .catch(()=>load('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'))
      .catch(()=>load('https://unpkg.com/world-atlas@2/countries-50m.json'))
      .then(topo=>{ const geo=feature(topo,topo.objects.countries); done(geo.features); })
      .catch(failMap);
  }
}

// show the menu right away; the map loads after the player picks an era
loadingEl.style.display='none';
document.getElementById('mainmenu').classList.add('open');
startMenuGlobe(document.getElementById('menuGlobe'), import.meta.env.BASE_URL+'data/world-menu.json',
  ()=>document.getElementById('mainmenu').classList.contains('open') || document.getElementById('lobby').classList.contains('open'));

// ---- build mode UI ----
let buildType=null;
const buildPanel=document.getElementById('buildpanel');
const hintEl=document.getElementById('hint');
document.getElementById('buildBtn').onclick=()=>buildPanel.classList.toggle('open');
document.querySelectorAll('.bopt').forEach(b=>{
  b.onclick=()=>{
    const t=b.dataset.b;
    document.querySelectorAll('.bopt').forEach(x=>x.classList.remove('active'));
    if(t==='none'){ buildType=null; buildPanel.classList.remove('open');
      return; }
    buildType=t; b.classList.add('active');
    const label=(b.childNodes[0]&&b.childNodes[0].textContent||b.textContent).trim();
    hintEl.textContent='Yapı modu: '+label+' — karaya tıklayıp yerleştir. Kapatmak için "Kapat".';
  };
});

// place a building where the user clicked on the land (called from pointerup)
let LANDFEATS = null;
let ALL_FEATURES = null;   // full feature list for the country picker

// is (x,z) over land?
// per-feature lon/lat bounding boxes, computed once, to prune geoContains calls
let FEAT_BBOX=null;
function buildFeatBBox(){
  FEAT_BBOX=[];
  for(const f of LANDFEATS){
    try{ const b=d3geo.geoBounds(f); // [[wLon,sLat],[eLon,nLat]]
      FEAT_BBOX.push({f, w:b[0][0], s:b[0][1], e:b[1][0], n:b[1][1]}); }
    catch(e){ FEAT_BBOX.push({f, w:-180,s:-90,e:180,n:90}); }
  }
}
function isLandPtExact(x,z){
  if(!LANDFEATS) return true;
  const ll = projection.invert([x+W/2, z+H/2]);
  if(!ll) return false;
  const lon=ll[0], lat=ll[1];
  if(FEAT_BBOX){
    for(const b of FEAT_BBOX){
      if(lat<b.s||lat>b.n) continue;
      // handle normal and antimeridian-spanning boxes
      const inLon = (b.w<=b.e) ? (lon>=b.w&&lon<=b.e) : (lon>=b.w||lon<=b.e);
      if(!inLon) continue;
      if(d3geo.geoContains(b.f, ll)) return true;
    }
    return false;
  }
  for(const f of LANDFEATS){ if(d3geo.geoContains(f, ll)) return true; }
  return false;
}
// ---- fast land/water lookup via a precomputed grid (built once at load) ----
let LAND_GRID=null;           // Uint8Array, 1=land
const LG_CELL=6;              // world units per grid cell (finer = more accurate, slower build)
const LG_X0=-W, LG_X1=W, LG_Z0=-H, LG_Z1=H;
const LG_NX=Math.ceil((LG_X1-LG_X0)/LG_CELL), LG_NZ=Math.ceil((LG_Z1-LG_Z0)/LG_CELL);
function buildLandGrid(){
  { const _t=performance.now(); buildFeatBBox(); timings.featBBox=Math.round(performance.now()-_t); }
  LAND_GRID=new Uint8Array(LG_NX*LG_NZ);
  // rasterise the projected country outlines (4 px per cell) and sample each cell centre;
  // matches the drawn meshes and is ~100x faster than a spherical point-in-polygon test per cell
  const SS=4, cv=document.createElement('canvas'); cv.width=LG_NX*SS; cv.height=LG_NZ*SS;
  const ctx=cv.getContext('2d',{willReadFrequently:true}); ctx.fillStyle='#fff';   // CPU canvas: fast readback
  for(const f of LANDFEATS){ for(const poly of countryPolys(f)){ const ring=poly[0];
    ctx.beginPath();
    ring.forEach((p,i)=>{ const px=(p[0]-LG_X0)/LG_CELL*SS, pz=(-p[1]-LG_Z0)/LG_CELL*SS; if(i) ctx.lineTo(px,pz); else ctx.moveTo(px,pz); });
    ctx.closePath(); ctx.fill(); } }
  const a=ctx.getImageData(0,0,cv.width,cv.height).data;
  for(let iz=0; iz<LG_NZ; iz++) for(let ix=0; ix<LG_NX; ix++)
    LAND_GRID[iz*LG_NX+ix]= a[((iz*SS+SS/2)*cv.width + ix*SS+SS/2)*4+3]>127 ? 1 : 0;
  buildLandComponents();
}
function isLandPt(x,z){
  if(!LAND_GRID) return isLandPtExact(x,z);
  if(x<LG_X0||x>=LG_X1||z<LG_Z0||z>=LG_Z1) return false;  // outside map = water
  const ix=((x-LG_X0)/LG_CELL)|0, iz=((z-LG_Z0)/LG_CELL)|0;
  return LAND_GRID[iz*LG_NX+ix]===1;
}
// connected landmasses on the land grid: armies walk (around bays) within one, need ships between them
let LAND_COMP=null;
function buildLandComponents(){
  LAND_COMP=new Int32Array(LG_NX*LG_NZ).fill(-1);
  let id=0; const q=new Int32Array(LG_NX*LG_NZ);
  for(let s0=0; s0<LAND_COMP.length; s0++){
    if(!LAND_GRID[s0] || LAND_COMP[s0]>=0) continue;
    let h=0, t=0; q[t++]=s0; LAND_COMP[s0]=id;
    while(h<t){ const c=q[h++], x=c%LG_NX, z=(c/LG_NX)|0;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, nz=z+dz; if(nx<0||nz<0||nx>=LG_NX||nz>=LG_NZ) continue;
        const n=nz*LG_NX+nx; if(LAND_GRID[n] && LAND_COMP[n]<0){ LAND_COMP[n]=id; q[t++]=n; } } }
    id++;
  }
}
function landCompAt(x,z){
  if(!LAND_COMP) return -1;
  const cx=((x-LG_X0)/LG_CELL)|0, cz=((z-LG_Z0)/LG_CELL)|0;
  for(let r=0; r<=2; r++) for(let dz=-r; dz<=r; dz++) for(let dx=-r; dx<=r; dx++){   // coastal points: nearest land cell
    const nx=cx+dx, nz=cz+dz; if(nx<0||nz<0||nx>=LG_NX||nz>=LG_NZ) continue;
    const c=LAND_COMP[nz*LG_NX+nx]; if(c>=0) return c; }
  return -1;
}
const overseasBetween=(ax,az,bx,bz)=>{ const a=landCompAt(ax,az), b=landCompAt(bx,bz); return a<0 || b<0 ? pathCrossesWater(ax,az,bx,bz) : a!==b; };

// coastal = on land, but water within a short distance in some direction
function isCoast(x,z){
  if(!isLandPt(x,z)) return false;
  const R=22; // sample distance in world units (allows building a bit further inland)
  for(let a=0;a<12;a++){
    const ang=a/12*Math.PI*2;
    if(!isLandPt(x+Math.cos(ang)*R, z+Math.sin(ang)*R)) return true; // water within reach
  }
  return false;
}

// does the straight path from (ax,az) to (bx,bz) cross open water?
function pathCrossesWater(ax,az,bx,bz){
  const steps=40;
  for(let i=1;i<steps;i++){ const t=i/steps;
    const x=ax+(bx-ax)*t, z=az+(bz-az)*t;
    if(!isLandPt(x,z)) return true;
  }
  return false;
}
// find a water point adjacent to the target land, on the side facing `from`
function coastApproach(fromX,fromZ, landX,landZ){
  // step from the land point toward `from` until we hit water
  const dx=fromX-landX, dz=fromZ-landZ; const d=Math.hypot(dx,dz)||1;
  const ux=dx/d, uz=dz/d;
  for(let r=6;r<=200;r+=6){ const x=landX+ux*r, z=landZ+uz*r;
    if(!isLandPt(x,z)) return [x,z];
  }
  return [landX+ux*30, landZ+uz*30];
}
// nearest water point next to a land point (to launch from our coast)
function nearestWater(x,z){
  for(let r=6;r<=160;r+=6){ for(let a=0;a<16;a++){ const ang=a/16*Math.PI*2;
    const tx=x+Math.cos(ang)*r, tz=z+Math.sin(ang)*r;
    if(!isLandPt(tx,tz)) return [tx,tz]; } }
  return [x,z];
}

// ---- sea routing: A* over a grid of water cells so ships never cross land ----
const SEA_CELL = 14;              // grid resolution in world units
function worldToCell(x,z){ return [Math.round((x+W*3)/SEA_CELL), Math.round((z+H*3)/SEA_CELL)]; }
function cellToWorld(cx,cz){ return [cx*SEA_CELL - W*3, cz*SEA_CELL - H*3]; }
const _waterCache=new Map();
function cellIsWater(cx,cz){
  const k=cx+','+cz; const c=_waterCache.get(k);
  if(c!==undefined) return c;
  const [x,z]=cellToWorld(cx,cz); const w=!isLandPt(x,z);
  _waterCache.set(k,w); return w;
}
// find a water route [ [x,z], ... ] from start water-point to goal water-point
function nearestWaterCell(cx,cz){
  if(cellIsWater(cx,cz)) return [cx,cz];
  for(let r=1;r<=8;r++){
    for(let dx=-r;dx<=r;dx++) for(let dz=-r;dz<=r;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
      if(cellIsWater(cx+dx,cz+dz)) return [cx+dx,cz+dz];
    }
  }
  return [cx,cz];
}
function seaRoute(sx,sz, gx,gz){
  const start=nearestWaterCell(...worldToCell(sx,sz));
  const goal=nearestWaterCell(...worldToCell(gx,gz));
  const margin=40;
  const minX=Math.min(start[0],goal[0])-margin, maxX=Math.max(start[0],goal[0])+margin;
  const minZ=Math.min(start[1],goal[1])-margin, maxZ=Math.max(start[1],goal[1])+margin;
  const inBox=(cx,cz)=> cx>=minX&&cx<=maxX&&cz>=minZ&&cz<=maxZ;
  const key=(a,b)=>a+','+b;
  const open=[start]; const came={}; const g={}; g[key(...start)]=0;
  const goalK=key(...goal);
  const h=(a,b)=>Math.hypot(a-goal[0], b-goal[1]);
  const f={}; f[key(...start)]=h(...start);
  const seen=new Set([key(...start)]);
  let iter=0; const MAXITER=8000;
  const t0=performance.now();          // hard wall-clock budget so the tab can never freeze
  const neighbors=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  while(open.length && iter++<MAXITER){
    if((iter & 1023)===0 && performance.now()-t0>250) break;  // bail after 250ms
    let bi=0; for(let i=1;i<open.length;i++){ if(f[key(...open[i])]<f[key(...open[bi])]) bi=i; }
    const cur=open.splice(bi,1)[0]; const ck=key(...cur);
    if(ck===goalK){
      const path=[]; let k=ck, c=cur;
      while(k!==key(...start)){ const w=cellToWorld(c[0],c[1]); path.push([w[0],w[1]]);
        c=came[k]; if(!c) break; k=key(...c); }
      path.reverse(); return path;
    }
    for(const [dx,dz] of neighbors){
      const nx=cur[0]+dx, nz=cur[1]+dz, nk=key(nx,nz);
      if(!inBox(nx,nz)) continue;
      if(!cellIsWater(nx,nz)) continue;
      if(dx&&dz && (!cellIsWater(cur[0]+dx,cur[1]) || !cellIsWater(cur[0],cur[1]+dz))) continue;
      const step=(dx&&dz)?1.414:1;
      const ng=g[ck]+step;
      if(seen.has(nk) && ng>=(g[nk]??Infinity)) continue;
      came[nk]=cur; g[nk]=ng; f[nk]=ng+h(nx,nz);
      if(!seen.has(nk)){ seen.add(nk); open.push([nx,nz]); }
    }
    if(open.length>4000) break;   // safety cap on frontier size
  }
  return null; // no water route found in budget
}

function overlapsObstacle(x,z, r){
  r = (r!=null)?r:BUILD_R;
  for(const o of obstacles){
    // only block if we'd sit inside the thing: buildings use a tiny core,
    // decorations (trees/mountains) only block their small trunk/base.
    const core = (o.core!=null)? o.core : Math.min(o.r, 0.6);
    if(Math.hypot(x-o.x, z-o.z) < r + core) return true;
  }
  return false;
}

// can a building of `type` be placed at world (x,z)? (no side effects)
function colonyAt(x,z){
  const f=countryAt(LANDFEATS, x, z);
  const n = f && f.properties ? f.properties.name : null;
  return (n && colonies.has(n)) ? n : null;
}
function canPlaceAt(type, x, z){
  if(!inSelected(x,z)) return false;
  if(colonyAt(x,z) && (type==='port'||type==='shipyard'||type==='mine')) return false;
  if(type==='port' || type==='shipyard' || type==='fishery'){ if(!isCoast(x,z)) return false; }
  if(type==='oilwell'){ const pv=provAt(x,z), pr=pv && profileOf(pv.country); if(!pr || pr.mult.oil<.8) return false; }
  if(type==='mine'){ if(!resourceAtXZ(x,z)) return false; }
  if(overlapsObstacle(x,z)) return false;   // no building on top of another / on decorations
  return true;
}

// opts.fromRegion: the region view already checked coast and spacing at its own (much finer) scale
function placeBuilding(point, opts={}){
  const fn=BUILDERS[buildType]; if(!fn) return;
  // restrict to the chosen country
  if(!inSelected(point.x, point.z)){
    const ll=projection.invert([point.x+W/2, point.z+H/2]);
    const here = ll ? countryAt(LANDFEATS, point.x, point.z) : null;
    const hereName = here && here.properties ? here.properties.name : 'deniz/bilinmiyor';
    hintEl.textContent = (S.selectedName||'Seçtiğin ülke')+' dışına inşa edemezsin. Tıkladığın yer: '+hereName
      + (ll? ' ('+ll[0].toFixed(1)+', '+ll[1].toFixed(1)+')':'');
    return;
  }
  if(colonyAt(point.x, point.z)){
    if(buildType==='port'||buildType==='shipyard'||buildType==='mine'){
      hintEl.textContent='Liman, tersane ve maden ocağı yalnızca kendi ülkende kurulur — kolonide değil.';
      return;
    }
  }
  if((buildType==='port' || buildType==='shipyard' || buildType==='fishery') && !opts.fromRegion){
    if(!isCoast(point.x, point.z)){
      hintEl.textContent = b_label(buildType)+' yalnızca kıyıya kurulur. Deniz kenarındaki bir karaya tıkla.';
      return;
    }
  }
  if(buildType==='oilwell'){
    const pv=provAt(point.x, point.z), pr=pv && profileOf(pv.country);
    if(!pr || pr.mult.oil<.8){ hintEl.textContent='⚠️ '+(pv? pv.country : 'Burada')+' topraklarında çıkarılabilir '+goodLabel('oil', S.currentEra).toLocaleLowerCase('tr')+' yok. Ticaret\'ten alabilirsin.'; return; }
  }
  let mineMineral=null;
  if(buildType==='mine'){
    mineMineral = resourceAtXZ(point.x, point.z);
    if(!mineMineral){
      hintEl.textContent='Burada maden yok. Kaynak haritasını açıp (sağ üst düğme) bir yatağın üstüne kur.';
      return;
    }
  }
  if(!opts.fromRegion && overlapsObstacle(point.x, point.z)){
    hintEl.textContent='Buraya inşa edilemez — başka bir yapı veya doğal engel var.';
    return;
  }
  // cost check
  const cost = COSTS[buildType] || 0;
  if(cost>0 && S.money < cost){
    hintEl.textContent = 'Yetersiz para! '+b_label(buildType)+' için '+cost+' gerekli (elinde '+Math.floor(S.money)+').';
    return;
  }
  if(woodCost(buildType)>S.wood){
    hintEl.textContent = '🪵 Yetersiz odun! '+b_label(buildType)+' için '+woodCost(buildType)+' odun gerekli (elinde '+Math.floor(S.wood)+'). Bölgede bir ormana tıklayıp odun topla.';
    return;
  }
  if(buildType==='city' && S.bread < CITY_BREAD_COST){
    hintEl.textContent = 'Yetersiz ekmek! Şehir için '+CITY_BREAD_COST+' ekmek gerekli (elinde '+Math.floor(S.bread)+').';
    return;
  }
  if(buildType==='town' && S.bread < TOWN_BREAD_COST){
    hintEl.textContent = 'Yetersiz ekmek! Kasaba için '+TOWN_BREAD_COST+' ekmek gerekli (elinde '+Math.floor(S.bread)+').';
    return;
  }
  if(buildType==='city'){ S.bread-=CITY_BREAD_COST; updateBread(); }
  if(buildType==='town'){ S.bread-=TOWN_BREAD_COST; updateBread(); }
  spawnBuilding(buildType, point.x, point.z, mineMineral, false);
  // warn if we likely can't sustain the new daily upkeep
  const dailyIncome = mineIncomePerSec()*ideoIncomeMult() + (S.taxPerPerson*S.population*ideoIncomeMult())/30;
  if(dailyUpkeep() > dailyIncome){
    hintEl.textContent='⚠️ Dikkat: yapı giderlerin günlük gelirini aşıyor — paran tükenebilir. Gelirini artır.';
  }
}
// create a building mesh + apply its economy effects + track it (used by placeBuilding and load)
function spawnBuilding(type, x, z, mineral, silent){
  const fn=BUILDERS[type]; if(!fn) return;
  const cost = COSTS[type] || 0;
  setModelContext(modelContextAt(x, z));   // buildings look like the country they stand in
  const g=fn();
  g.position.set(x, DEPTH, z);
  g.rotation.y=Math.random()*Math.PI*2;
  g.scale.setScalar(0.06);
  g.visible=false;   // what we build is seen only in the region close-up, never from above on the world map
  worldGroup.add(g);
  if(!silent && cost>0){ S.money -= cost; updateMoney(); }
  if(!silent && woodCost(type)>0){ S.wood -= woodCost(type); updateWood(); }
  const prov=provAt(x,z), lvl0=prov && !silent ? devLevel(provDevPoints(prov.id)) : 0;
  const rec={ group:g, type:type, cost:cost, x:x, z:z, mineral:mineral||null, undo:null, prov: prov? prov.id : null };
  let undo=()=>{};
  if(type==='forest'||type==='mountain'){ S.nonChocoBuildings++; undo=()=>{ S.nonChocoBuildings--; }; }
  if(type==='port'||type==='shipyard') S.portShipyardCount++;
  if(type==='city'){ S.cityCount++; S.popCap += CITY_POP; updatePop();
    const isFree=S._spawnFreeCity; S._spawnFreeCity=false;
    if(isFree){ S.freeCityCount++; rec.freeCity=true; }
    undo=()=>{ S.cityCount--; if(isFree) S.freeCityCount--; S.popCap-=CITY_POP; S.population=Math.min(S.population,S.popCap); updatePop(); };
    if(!silent) hintEl.textContent='Şehir kuruldu (sınır +'+CITY_POP+', bakım -'+M_CITY/2+'/ay). Nüfus sınırı: '+S.popCap+'.'; }
  if(type==='town'){ S.townCount++; S.popCap += TOWN_POP; updatePop();
    undo=()=>{ S.townCount--; S.popCap-=TOWN_POP; S.population=Math.min(S.population,S.popCap); updatePop(); };
    if(!silent) hintEl.textContent='Kasaba kuruldu (sınır +'+TOWN_POP+', bakım -'+M_TOWN/2+'/ay). Nüfus sınırı: '+S.popCap+'.'; }
  if(type==='field'){ S.fieldCount++;
    const rec2={group:g, rate:1}; fields.push(rec2); g.userData.field=rec2;
    undo=()=>{ S.fieldCount--; const i=fields.indexOf(rec2); if(i>=0)fields.splice(i,1); };
    if(!silent) hintEl.textContent='Tarla kuruldu (+1 ekmek/sn). Toplam tarla: '+S.fieldCount+'.'; }
  if(type==='base'){ S.baseCount++;
    g.userData.base = true; g.traverse(o=>{ if(o.isMesh) o.userData.base = true; });
    bases.push(g);
    undo=()=>{ S.baseCount--; const i=bases.indexOf(g); if(i>=0)bases.splice(i,1); };
    if(!silent) hintEl.textContent='Askeri üs kuruldu (bakım -'+M_BASE/2+'/ay). Üstüne tıklayarak ordu kur.'; }
  if(type==='mine'){ const rm={group:g, mineral:mineral}; mines.push(rm);
    undo=()=>{ const i=mines.indexOf(rm); if(i>=0)mines.splice(i,1); };
    if(!silent){ const lab=MINERALS[mineral].label, v=MINERALS[mineral].value;
      hintEl.textContent=lab+' madeni kuruldu! Dakikada +'+v+' para (anlık olarak işliyor). Toplam maden: '+mines.length+'.'; } }
  if(type==='bank'){ S.bankCount++; S.moneyCap += BANK_CAP; updateMoney();
    undo=()=>{ S.bankCount--; S.moneyCap-=BANK_CAP; if(S.money>S.moneyCap)S.money=S.moneyCap; updateMoney(); };
    if(!silent) hintEl.textContent='Banka kuruldu! Para limiti +'+BANK_CAP+' → '+S.moneyCap+'.'; }
  if(type==='garage'){ g.userData.garage=true; g.traverse(o=>{ if(o.isMesh) o.userData.garage=true; });
    garages.push(g);
    undo=()=>{ const i=garages.indexOf(g); if(i>=0)garages.splice(i,1); };
    if(!silent) hintEl.textContent= S.currentEra==='1810' ? 'Top dökümhanesi kuruldu! Üstüne tıklayıp top dökebilirsin (10 insan + '+CANNON_COST_MONEY+' para + 20 demir + 5 kömür).' : 'Garaj kuruldu! Üstüne tıklayıp tank üretebilirsin (10 insan + 1500 para + 20 demir + '+TANK_TECH+' teknoloji).'; }
  if(type==='farm'){ S.farmCount++;
    // boost a random not-yet-boosted field to 2 bread/sec and mark it with a "2x" label
    const plain=fields.filter(fd=>fd.rate<2);
    let boosted=null;
    if(plain.length){ boosted=plain[(Math.random()*plain.length)|0]; boosted.rate=2; boosted.label=make2xLabel();
      boosted.group.add(boosted.label); }
    undo=()=>{ S.farmCount--; if(boosted){ boosted.rate=1; if(boosted.label){ boosted.group.remove(boosted.label); boosted.label=null; } } };
    if(!silent) hintEl.textContent= boosted? 'Çiftlik kuruldu! Bir tarla artık 2 ekmek/sn üretiyor (2x).' : 'Çiftlik kuruldu! (2x için önce tarla kur.)'; }
  if(type==='choco'){ S.chocoCount++; undo=()=>{ S.chocoCount--; };
    if(!silent) hintEl.textContent='Çikolata fabrikası kuruldu (+15000/dk, bakım yok). Toplam: '+S.chocoCount+'.'; }
  if(type==='port'){
    ports.push(g);
    undo=()=>{ S.portShipyardCount--; const i=ports.indexOf(g); if(i>=0)ports.splice(i,1); };
    if(!silent) hintEl.textContent='Liman kuruldu. Artık tersaneden gemi üretebilirsin.';
  }
  if(type==='shipyard'){
    g.userData.shipyard = true;
    g.traverse(o=>{ if(o.isMesh) o.userData.shipyard = true; });
    shipyards.push(g);
    undo=()=>{ S.portShipyardCount--; const i=shipyards.indexOf(g); if(i>=0)shipyards.splice(i,1); };
    if(!silent) hintEl.textContent='Tersane kuruldu. Gemi üretmek için bir de liman gerekir; tersaneye tıkla.';
  }
  rec.undo=undo;
  g.userData.buildRec=rec;
  g.traverse(o=>{ o.userData.buildRec=rec; });
  placedBuildings.push(g);
  if(prov && !silent){ const d=devInfo(prov.id); if(d.level>lvl0) setTimeout(()=>{ hintEl.textContent='🏙️ '+prov.name+' gelişti: artık '+d.name+'!'; }, 1200); }
  // register as an obstacle so nothing else overlaps here and armies steer around it
  const ob={x:x, z:z, r:BUILD_R, core:0.3, building:true}; obstacles.push(ob); rec.obstacle=ob;
  return rec;
}
// ---- ships & shipyard menu ----
let activeShipyard = null;
const shipMenu=document.getElementById('shipmenu');
function openShipMenu(yard){
  activeShipyard = yard || null;
  shipMenu.classList.add('open');
}
document.getElementById('closeShip').onclick=()=>shipMenu.classList.remove('open');
document.getElementById('buildShip').onclick=()=>{
  if(ports.length===0){
    hintEl.textContent='Gemi üretmek için önce bir LİMAN kurmalısın.';
    return;
  }
  const shipCost=Math.round(SHIP_COST*ideoMilitaryCostMult());
  if(S.money < shipCost){
    hintEl.textContent='Yetersiz para! Gemi için '+shipCost+' gerekli (elinde '+Math.floor(S.money)+').';
    return;
  }
  if(S.currentEra==='2014'){
    if(S.goods.oil<20){ hintEl.textContent='⚠️ Modern gemi için 20 petrol gerekir (elinde '+Math.floor(S.goods.oil)+'). Ticaret\'ten alabilirsin.'; return; }
    if(S.goods.tech<SHIP_TECH){ hintEl.textContent='⚙️ Savaş gemisi için '+SHIP_TECH+' teknoloji gerekir (elinde '+Math.floor(S.goods.tech)+'). Sanayi fabrikası kur ya da Ticaret\'ten al.'; return; }
    S.goods.oil-=20; S.goods.tech-=SHIP_TECH;
  } else {
    if(S.wood<SHIP_WOOD_1810){ hintEl.textContent='🪵 Yelkenli için '+SHIP_WOOD_1810+' odun gerekir (elinde '+Math.floor(S.wood)+'). Bölgelerindeki ormanlardan odun topla.'; return; }
    S.wood-=SHIP_WOOD_1810; updateWood();
  }
  S.money -= shipCost; updateMoney();
  const s=makeShip(S.currentEra);
  // ship appears in the water next to a port (nearest port to the active shipyard)
  let anchor = ports[ports.length-1];
  const yard = activeShipyard || shipyards[shipyards.length-1];
  if(yard && ports.length>1){
    let best=Infinity;
    for(const p of ports){ const d=(p.position.x-yard.position.x)**2+(p.position.z-yard.position.z)**2;
      if(d<best){ best=d; anchor=p; } }
  }
  const bx = anchor ? anchor.position.x : 0;
  const bz = anchor ? anchor.position.z : 0;
  // nudge outward from the port to find open water
  let px=bx, pz=bz;
  for(let r=10;r<=90;r+=6){
    for(let a=0;a<16;a++){ const ang=a/16*Math.PI*2;
      const tx=bx+Math.cos(ang)*r, tz=bz+Math.sin(ang)*r;
      if(!isLandPt(tx,tz)){ px=tx; pz=tz; r=999; break; } }
  }
  s.position.set(px, SHIP_Y, pz);
  s.rotation.y=Math.random()*Math.PI*2;
  worldGroup.add(s); ships.push(s); S.shipCount++;
  hintEl.textContent='Gemi üretildi (limanın yanında, bakım -'+M_SHIP/2+'/ay)! Toplam gemi: '+ships.length+'.';
};

// ---- army recruitment ----
const armyMenu=document.getElementById('armymenu');
const armyQty=document.getElementById('armyQty');
const armyPrice=document.getElementById('armyPrice');
function armyCost(n){ return Math.round(Math.ceil(n/ARMY_UNIT) * ARMY_UNIT_COST * ideoMilitaryCostMult() * (specOf(armyMenuProv)==='askeri'? .75 : 1)); }
function refreshArmyPrice(){
  let n=parseInt(armyQty.value)||0;
  if(n<ARMY_UNIT) n=ARMY_UNIT;
  armyPrice.textContent = armyCost(n);
}
let armyMenuProv=null, tankMenuProv=null;
const provsWith=type=>[...new Set(placedBuildings.map(g=>g.userData.buildRec).filter(r=>r && r.type===type && ownsProv(r.prov)).map(r=>r.prov))];
function openArmyMenu(prov){
  const withBase=provsWith('base');
  armyMenuProv = prov || (withBase.includes(selectedProv) ? selectedProv : withBase[0]) || (capitalProv(S.homeName)||{}).id;
  document.querySelector('#armymenu .sm-title').textContent='🪖 Askeri Üs — '+((PI.byId[armyMenuProv]||{}).name||'');
  armyQty.value=ARMY_UNIT; refreshArmyPrice();
  armyMenu.classList.add('open');
}
document.getElementById('closeArmy').onclick=()=>armyMenu.classList.remove('open');
document.getElementById('armyPlus').onclick=()=>{ armyQty.value=(parseInt(armyQty.value)||0)+ARMY_UNIT; refreshArmyPrice(); };
document.getElementById('armyMinus').onclick=()=>{ armyQty.value=Math.max(ARMY_UNIT,(parseInt(armyQty.value)||0)-ARMY_UNIT); refreshArmyPrice(); };
armyQty.oninput=refreshArmyPrice;
document.getElementById('recruitBtn').onclick=()=>{
  let n=parseInt(armyQty.value)||0;
  n=Math.max(ARMY_UNIT, Math.round(n/ARMY_UNIT)*ARMY_UNIT); // snap to 100s
  const cost=armyCost(n);
  if(S.money < cost){ hintEl.textContent='Yetersiz para! '+n+' asker için '+cost+' gerekli.'; return; }
  const draft=Math.ceil(n/ARMY_UNIT*ARMY_UNIT_POP);
  if(Math.floor(S.population) < draft){ hintEl.textContent='Yetersiz nüfus! '+n+' asker için '+draft+' kişi gerekli (mevcut: '+Math.floor(S.population)+').'; return; }
  S.money -= cost; updateMoney();
  S.population -= draft; updatePop(); addTroops(armyMenuProv, n);
  hintEl.textContent=n+' asker '+(PI.byId[armyMenuProv]||{label:''}).label+' bölgesine katıldı. Toplam ordu: '+S.army+'.';
};

// ---- tank menu (garage) ----
const tankMenu=document.getElementById('tankmenu');
const tankQty=document.getElementById('tankQty');
const vehMoney=()=>S.currentEra==='1810'? CANNON_COST_MONEY : TANK_COST_MONEY;   // 1810: cannons instead of tanks
function refreshTankCost(){
  let n=parseInt(tankQty.value)||0; if(n<1)n=1;
  document.getElementById('tankCostP').textContent=n*TANK_COST_POP;
  const sp=specOf(tankMenuProv); document.getElementById('tankCostM').textContent=Math.round(n*vehMoney()*ideoMilitaryCostMult()*(sp==='sanayi'? .8 : sp==='askeri'? .9 : 1));
  document.getElementById('tankCostI').textContent=n*TANK_COST_IRON;
  document.getElementById('tankCostT').textContent=n*TANK_TECH;
}
function openTankMenu(prov){
  const withGarage=provsWith('garage');
  tankMenuProv = prov || (withGarage.includes(selectedProv) ? selectedProv : withGarage[0]) || (capitalProv(S.homeName)||{}).id;
  document.querySelector('#tankmenu .sm-title').textContent=(S.currentEra==='1810'? '💣 Top Dökümhanesi — ' : '🏭 Garaj — ')+((PI.byId[tankMenuProv]||{}).name||'');
  tankQty.value=1; refreshTankCost(); tankMenu.classList.add('open');
}
document.getElementById('closeTank').onclick=()=>tankMenu.classList.remove('open');
document.getElementById('tankPlus').onclick=()=>{ tankQty.value=(parseInt(tankQty.value)||0)+1; refreshTankCost(); };
document.getElementById('tankMinus').onclick=()=>{ tankQty.value=Math.max(1,(parseInt(tankQty.value)||0)-1); refreshTankCost(); };
tankQty.oninput=refreshTankCost;
document.getElementById('tankBuildBtn').onclick=()=>{
  let n=parseInt(tankQty.value)||0; n=Math.max(1,n);
  const is1810=S.currentEra==='1810', un=is1810? 'top' : 'tank';
  const sp=specOf(tankMenuProv), cm=Math.round(n*vehMoney()*ideoMilitaryCostMult()*(sp==='sanayi'? .8 : sp==='askeri'? .9 : 1)), cp=n*TANK_COST_POP, ci=n*TANK_COST_IRON, ct=is1810? 0 : n*TANK_TECH;
  if(S.money<cm){ hintEl.textContent='Yetersiz para! '+n+' '+un+' için '+cm+' gerekli.'; return; }
  if(Math.floor(S.population)<cp){ hintEl.textContent='Yetersiz nüfus! '+n+' '+un+' için '+cp+' kişi gerekli.'; return; }
  if(S.iron<ci){ hintEl.textContent='Yetersiz demir! '+n+' '+un+' için '+ci+' demir gerekli (mevcut: '+Math.floor(S.iron)+').'; return; }
  if(S.goods.tech<ct){ hintEl.textContent='⚙️ Yetersiz teknoloji! '+n+' tank için '+ct+' teknoloji gerekli (elinde '+Math.floor(S.goods.tech)+'). Sanayi fabrikası kur ya da Ticaret\'ten al.'; return; }
  const co=n*(S.currentEra==='2014'? 15 : 5), oilName=goodLabel('oil', S.currentEra);
  if(S.goods.oil<co){ hintEl.textContent='⚠️ Yetersiz '+oilName.toLocaleLowerCase('tr')+'! '+n+' '+un+' için '+co+' gerekli (elinde '+Math.floor(S.goods.oil)+'). Petrol kuyusu kur ya da Ticaret\'ten al.'; return; }
  S.goods.oil-=co; S.goods.tech-=ct;
  S.money-=cm; S.population-=cp; S.iron-=ci; S.tankCount+=n; addTroops(tankMenuProv, n*TANK_ARMY);
  updateMoney(); updatePop(); updateIron(); updateArmy();
  hintEl.textContent=(is1810? '💣 '+n+' top döküldü' : n+' tank üretildi')+'! Orduya +'+(n*TANK_ARMY)+' güç. Toplam '+un+': '+S.tankCount+'.';
};

// projected area (world units) of a feature's largest polygon
function featureArea(f){
  const g=f.geometry; if(!g) return 0;
  const raw = g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
  let max=0;
  for(const rings of raw){
    const o=ringPts(rings[0]||[]); if(o.length<3) continue;
    const a=Math.abs(area(o)); if(a>max)max=a;
  }
  return max;
}

// return the country feature containing (x,z), or null
function countryAt(feats, x, z){
  const ll = projection.invert([x+W/2, z+H/2]);
  if(!ll) return null;
  for(const f of feats){ if(d3geo.geoContains(f, ll)) return f; }
  return null;
}

function addDecorations(feats){
  const areaCache = new Map();
  function areaOf(f){ if(!f) return 0; if(!areaCache.has(f)) areaCache.set(f, featureArea(f)); return areaCache.get(f); }
  // mountains: only where land sits and host country >= 2x mountain footprint
  MTN.forEach(p=>{ const q=projection(p); if(!q)return; const[bx,bz]=sceneXZ(p[0],p[1])||[];
    if(bx===undefined) return;
    const f=countryAt(feats,bx,bz); if(areaOf(f) < 2*MTN_FOOTPRINT) return;   // host country, looked up once per range
    for(let i=0;i<5;i++){ const x=bx+(Math.random()-.5)*14, z=bz+(Math.random()-.5)*14;
      if(!isLandPt(x,z)) continue;
      const m=mountain(); m.position.set(x,DEPTH,z);
      const s=.2+Math.random()*.12; m.scale.set(s, s*1.25, s);
      m.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
      worldGroup.add(m);
      obstacles.push({x, z, r:7*s+3}); } });
  // forests: only where land sits and host country >= 2x tree footprint
  FOR.forEach(p=>{ const[bx,bz]=sceneXZ(p[0],p[1])||[];
    if(bx===undefined) return;
    const f=countryAt(feats,bx,bz); if(areaOf(f) < 2*TREE_FOOTPRINT) return;   // host country, looked up once per forest
    for(let i=0;i<14;i++){ const x=bx+(Math.random()-.5)*20, z=bz+(Math.random()-.5)*20;
      if(!isLandPt(x,z)) continue;
      const t=tree(); t.position.set(x,DEPTH,z);
      const s=.32+Math.random()*.16; t.scale.setScalar(s);
      t.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
      worldGroup.add(t);
      obstacles.push({x, z, r:3.5*s+2}); } });
}
// ---- country selection ----

const cpOverlay=document.getElementById('countrypick');
const cpList=document.getElementById('cpList');
const cpSearch=document.getElementById('cpSearch');
const selinfo=document.getElementById('selinfo');

function populateCountryPicker(feats){
  // sort by name; build a button per country
  const items=feats.map(f=>({f, name:(f.properties&&f.properties.name)||'—'}))
    .filter(o=>o.name && o.name!=='Antarctica')
    .sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  function render(filter){
    cpList.innerHTML='';
    const q=(filter||'').toLocaleLowerCase('tr');
    for(const o of items){
      if(q && !o.name.toLocaleLowerCase('tr').includes(q)) continue;
      const btn=document.createElement('button'); btn.className='cp-item';
      btn.innerHTML=flagFor(o.name)+'<span class="cp-name">'+o.name+'</span>';
      btn.onclick=()=>chooseCountry(o.f, o.name);
      cpList.appendChild(btn);
    }
  }
  render('');
  cpSearch.value='';
  cpSearch.oninput=()=>render(cpSearch.value);
  cpOverlay.classList.add('open');
}

function renderEmpires(items){
  const have=new Set(items.map(o=>o.name));
  const box=document.getElementById('cpEmpireList'); if(!box) return;
  box.innerHTML='';
  EMPIRES.forEach(emp=>{
    const btn=document.createElement('button'); btn.className='cp-emp';
    const n=emp.countries.filter(c=>have.has(c)).length;
    btn.innerHTML='<span class="cp-emp-ico">'+emp.ico+'</span><span>'+emp.label+'<br><span style="opacity:.7;font-size:11px">'+n+' ülke</span></span>';
    btn.onclick=()=>chooseEmpire(emp);
    box.appendChild(btn);
  });
}

function chooseEmpire(emp){
  // pick a home country that exists; fall back to first available
  let home = featByName[emp.home] ? emp.home : null;
  const present = emp.countries.filter(c=>featByName[c]);
  if(!home) home = present[0];
  if(!home){ hintEl.textContent='Bu imparatorluğun ülkeleri bulunamadı.'; return; }
  S.selectedFeature=featByName[home]; S.selectedName=home; S.homeName=home;
  cpOverlay.classList.remove('open');
  selinfo.classList.add('show');
  selinfo.innerHTML=emp.ico+' <b>'+emp.label+'</b>';
  // annex every present country of the empire (silent), then redraw once
  present.forEach(c=>{ ownedCountries.add(c); colonies.delete(c);
    (meshesByCountry[c]||[]).forEach(m=>m.material.color.copy(OWN_COLOR)); });
  redrawBorders();
  // capital city on the home country (free)
  S.popCap += CITY_POP; updatePop();   // the capital's people (every province starts as a village: upgrade it from the region view)
  document.body.classList.add('ingame'); document.getElementById('saveBtn').classList.add('show'); document.getElementById('taxbar').classList.add('show'); document.getElementById('exitBtn').classList.add('show'); document.getElementById('rankBtn').classList.add('show');
  hintEl.textContent=emp.label+' kuruldu! '+present.length+' ülke senin. Başka ülkelere saldırabilirsin.';
}

// ---- ownership / invasion ----
const ownedCountries = new Set();
const featByName = {};   // name -> feature (for capital/centroid)

let _pendingHome=null;
function chooseCountry(f, name){
  pickPreview.classList.remove('show');
  // first pick an ideology, then finalize the home country
  _pendingHome={f, name};
  document.getElementById('ideoCountry').textContent=name;
  document.getElementById('ideoModal').classList.add('open');
}
function finalizeHome(ideo){
  if(!_pendingHome) return;   // modal already handled (double click)
  S.ideology=ideo;
  document.getElementById('ideoModal').classList.remove('open');
  // next: pick the national personality
  document.getElementById('persCountry').textContent=_pendingHome? _pendingHome.name : '';
  document.getElementById('persModal').classList.add('open');
}
function finalizeHome2(pers){
  if(!_pendingHome) return;   // modal already handled (double click)
  S.personality=pers;
  document.getElementById('persModal').classList.remove('open');
  endCountrySelectDim();   // restore screen (remove selection darkening)
  const {f, name}=_pendingHome; _pendingHome=null;
  S.selectedFeature=f; S.selectedName=name; S.homeName=name;
  cpOverlay.classList.remove('open');
  selinfo.classList.add('show');
  const ideoLabel = S.ideology==='socialism'?'☭ Sosyalizm':S.ideology==='capitalism'?'💰 Kapitalizm':'⚔️ Militarizm';
  const persLabel = pers==='peaceful'?'🕊️ Barışçıl':pers==='warlike'?'🗡️ Savaşçı':'🛠️ Çalışkan';
  selinfo.innerHTML=flagFor(name)+' <b>'+name+'</b> — '+ideoLabel+' · '+persLabel;
  hintEl.textContent=name+' senin ülken ('+ideoLabel+', '+persLabel+'). 🕊️ İlk '+Math.round(peaceMonthsLeft())+' ay barış: kimse sana saldırmaz — bu sürede köylerini kasabaya yükselt, maden ve ordu kur.';
  annexCountry(name, true);   // claim the home country (isHome)
  S.popCap += CITY_POP; updatePop();   // the capital's people (every province starts as a village: upgrade it from the region view)
  document.body.classList.add('ingame'); document.getElementById('saveBtn').classList.add('show'); document.getElementById('taxbar').classList.add('show'); document.getElementById('exitBtn').classList.add('show'); document.getElementById('rankBtn').classList.add('show');
  document.getElementById('rankBtn').classList.add('show');
  refreshTaxHint();
  // bots are authoritative on the host (or in solo); joiners receive them via world sync
  if(!MP || isHost){ spawnBots(10); if(MP) hostBroadcastWorld(); }
}
document.getElementById('ideoSoc').onclick=()=>finalizeHome('socialism');
document.getElementById('ideoCap').onclick=()=>finalizeHome('capitalism');
document.getElementById('ideoMil').onclick=()=>finalizeHome('militarism');
document.getElementById('persPeace').onclick=()=>finalizeHome2('peaceful');
document.getElementById('persWar').onclick=()=>finalizeHome2('warlike');
document.getElementById('persWork').onclick=()=>finalizeHome2('hardworking');

// recolor all regions of a country to our empire color, mark owned, redraw borders
const COLONY_COLOR = new THREE.Color('#7fb0e6');  // paler than OWN_COLOR
const colonies = new Set();
const partialOwned = new Set();              // countries owned only partially (region-pick)
const partialCellsByCountry = {};            // name -> [taken cell meshes]
function annexCountry(name, isHome){
  ownedCountries.add(name);
  partialOwned.delete(name); delete partialCellsByCountry[name];
  if(PI) for(const q of PI.byCountry[name]||[]) playerProvs.delete(q.id);
  colonies.delete(name);
  // networked joiner: ask the host to assign it; the authoritative world state comes back
  if(MP && !isHost){
    try{ hostConn.send(isHome? {t:'pickHome', id:playerId, name:playerName, home:name}
                             : {t:'conquer', id:playerId, name:name}); }catch(e){}
  }
  // if a bot/other held this country, take it from them (host + solo)
  const prev=ownerOf[name];
  if(prev && prev!=='player' && prev!==playerId){ const b=botById(prev); if(b) b.owned.delete(name); }
  ownerOf[name]= MP? playerId : 'player';
  colorCountry(name, MP? new THREE.Color(playerColorHex(playerId)) : OWN_COLOR);
  redrawBorders(); garrisonDirty=true;
  if(MP && isHost) hostBroadcastWorld();
}
// architecture + era for a building placed at (x, z)
function modelContextAt(x, z){
  const ll=projection.invert([x+W/2, z+H/2]) || [0, 30];
  return { era:S.currentEra, culture:cultureFor(ll[0], ll[1]) };
}
// dress of a country's soldiers: the architecture culture around its capital
function cultureOfCountry(name){ const c=name && capitalXZ(name); return c? modelContextAt(c[0], c[1]).culture : 'european'; }
// ================= economy: country identities, goods and trade =================
// each country is good at some things and bad at others; production uses the profile of the country the building stands in
const profileCache={};
function profileOf(country){
  if(!country) return null;
  const key=country+'|'+S.currentEra; if(profileCache[key]) return profileCache[key];
  let lat=30, lon=null; try{ const c=d3geo.geoCentroid(featByName[country]); if(c && isFinite(c[1])){ lat=c[1]; lon=c[0]; } }catch(e){}
  const iso=ISO2[country]||null;
  let coastal=false;   // water close to any of its provinces
  for(const p of (PI && PI.byCountry[country])||[]){
    for(let a=0; a<12 && !coastal; a++){ const ang=a/12*Math.PI*2; for(const r of [4,9]) if(!isLandPt(p.center[0]+Math.cos(ang)*r, p.center[1]+Math.sin(ang)*r)) coastal=true; }
    if(coastal) break;
  }
  return profileCache[key]=profileFor(country, iso, { lat, coastal, biome:biomeFor(lat, iso, lon) }, S.currentEra);
}
function recMult(rec, good){
  const pv=rec.prov && PI && PI.byId[rec.prov], pr=profileOf(pv? pv.country : S.homeName);
  return (pr? pr.mult[good] : 1)*specGood(rec.prov, good);
}
function goodGet(k){ return k==='grain'? S.bread : k==='iron'? S.iron : (S.goods[k]||0); }
function goodAdd(k, n){
  if(k==='grain'){ S.bread=Math.max(0, S.bread+n); updateBread(); }
  else if(k==='iron'){ S.iron=Math.max(0, S.iron+n); updateIron(); }
  else S.goods[k]=Math.max(0, (S.goods[k]||0)+n);
}
const eraGoods=()=>S.currentEra==='1810'? GOOD_KEYS.filter(k=>k!=='tech') : GOOD_KEYS;   // 1810: no technology to trade
const PRODUCE={ fishery:['fish',1], ranch:['livestock',1], oilwell:['oil',.5], factory:['tech',.3] };
// per-second output of every good
function productionRates(){
  const r={ grain:0, fish:0, livestock:0, oil:0, iron:mineIronPerSec(), tech:0 };
  for(const fd of fields){ const rec=fd.group.userData.buildRec; r.grain+=fd.rate*(rec? recMult(rec,'grain') : 1); }
  for(const g of placedBuildings){ const rec=g.userData.buildRec, p=rec && PRODUCE[rec.type]; if(p) r[p[0]]+=p[1]*recMult(rec, p[0]); }
  return r;
}
let _prod=null, _prodT=9;
function stepGoods(dt){
  if((_prodT+=dt)>1 || !_prod){ _prodT=0; _prod=productionRates(); }
  S.goods.fish+=_prod.fish*dt; S.goods.livestock+=_prod.livestock*dt; S.goods.oil+=_prod.oil*dt;
  // factories turn iron into technology; without iron they limp along at 30%
  if(_prod.tech>0){ const need=_prod.tech*.6*dt; if(S.iron>=need){ S.iron-=need; S.goods.tech+=_prod.tech*dt; } else S.goods.tech+=_prod.tech*.3*dt; }
}
// fish and meat feed the people once a month: fed people grow faster and grumble less
function feedPeople(){
  const need=Math.ceil(S.population*.05); if(need<=0){ S.fed=false; return ''; }
  if(S.goods.fish+S.goods.livestock<need){ S.fed=false; return ' Gıda (balık/et) yetersiz.'; }
  let left=need; const f=Math.min(S.goods.fish, Math.ceil(need/2)); S.goods.fish-=f; left-=f;
  const l=Math.min(S.goods.livestock, left); S.goods.livestock-=l; left-=l; S.goods.fish-=left;
  S.fed=true; return ' Halk doyuruldu ('+need+' gıda).';
}
const techBonus=()=>S.currentEra==='1810'? 0 : Math.min(.3, (S.goods.tech||0)/3000);   // 1810 has no technology   // stockpiled technology: up to +30% attack

// ---- market + barter offers from the bot empires
let marketDrift={}, tradeOffers=[];
function price(k, side){ const d=marketDrift[k]||1, b=GOODS[k].base*d; return Math.max(1, Math.round(side==='buy'? b*1.25 : b*.8)); }
function rollTradeOffers(){
  for(const k of eraGoods()) marketDrift[k]=Math.max(.7, Math.min(1.4, (marketDrift[k]||1)*(.9+Math.random()*.2)));
  const me=profileOf(S.homeName); if(!me || !bots.length) return;
  const mine=eraGoods().slice().sort((a,b)=>me.mult[b]-me.mult[a]);
  tradeOffers=[];
  for(const b of bots.filter(b=>b.owned.size).sort(()=>Math.random()-.5).slice(0,3)){
    const home=b.home && b.owned.has(b.home)? b.home : [...b.owned][0], pr=profileOf(home); if(!pr) continue;
    // they give what they are best at and we lack; they want what we are good at
    const give=eraGoods().slice().sort((x,y)=>(pr.mult[y]-me.mult[y])-(pr.mult[x]-me.mult[x]))[0];
    const want=mine.find(k=>k!==give && pr.mult[k]<=me.mult[k]) || mine[0]; if(want===give) continue;
    const gq=Math.round((100+Math.random()*200)/10)*10, wq=Math.max(10, Math.round(gq*GOODS[give].base/GOODS[want].base*.9/5)*5);
    tradeOffers.push({ bot:b.name, color:b.colorHex, country:home, give, gq, want, wq });
  }
  if(tradePanel.classList.contains('show')) renderTrade();
}
const tradePanel=document.getElementById('tradePanel');
function renderTrade(){
  const pr=profileOf(S.homeName), era=S.currentEra; if(!pr) return;
  const rates=productionRates(), chip=(k,c)=>'<span class="'+c+'">'+GOODS[k].icon+' '+goodLabel(k,era)+' ×'+pr.mult[k].toFixed(1)+'</span>';
  document.getElementById('trIdent').innerHTML='<div class="tr-flag">'+flagFor(S.homeName)+'</div><div><b>'+pr.title+'</b><p>'+pr.desc+'</p>'+
    '<div class="tr-chips">'+pr.strengths.map(k=>chip(k,'up')).join('')+pr.weaknesses.map(k=>chip(k,'dn')).join('')+'</div></div>';
  document.getElementById('trGoods').innerHTML='<div class="tr-row tr-h"><span>Mal</span><span>Stok</span><span>Üretim/ay</span><span>Sat</span><span>Al</span></div>'+
    eraGoods().map(k=>'<div class="tr-row"><span>'+GOODS[k].icon+' '+goodLabel(k,era)+'</span><b>'+Math.floor(goodGet(k)).toLocaleString('tr-TR')+'</b><span>'+Math.round(rates[k]*30)+'</span>'+
      '<button data-sell="'+k+'" title="100 sat">−100 · +'+price(k,'sell')*100+'</button><button data-buy="'+k+'" title="100 al">+100 · −'+price(k,'buy')*100+'</button></div>').join('');
  document.getElementById('trOffers').innerHTML= tradeOffers.length ? tradeOffers.map((o,i)=>'<div class="tr-offer"><i style="background:'+o.color+'"></i><div><b>'+o.bot+'</b> <small>('+o.country+')</small><br>'+
    'Verir: <b>'+o.gq+' '+GOODS[o.give].icon+' '+goodLabel(o.give,era)+'</b> · İster: <b>'+o.wq+' '+GOODS[o.want].icon+' '+goodLabel(o.want,era)+'</b></div><button data-offer="'+i+'"'+(goodGet(o.want)<o.wq?' disabled':'')+'>Kabul et</button></div>').join('')
    : '<p class="muted">Bu ay teklif yok. Her ay başında yeni takas teklifleri gelir.</p>';
}
document.getElementById('tradePanel').addEventListener('click', e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.sell){ const k=b.dataset.sell; if(goodGet(k)<100){ hintEl.textContent='Satacak 100 '+goodLabel(k,S.currentEra)+' yok.'; return; }
    goodAdd(k,-100); S.money+=price(k,'sell')*100; updateMoney(); }
  else if(b.dataset.buy){ const k=b.dataset.buy, c=price(k,'buy')*100; if(S.money<c){ hintEl.textContent='Yetersiz para: 100 '+goodLabel(k,S.currentEra)+' '+c+' tutuyor.'; return; }
    S.money-=c; updateMoney(); goodAdd(k,100); }
  else if(b.dataset.offer!=null){ const o=tradeOffers[+b.dataset.offer]; if(!o || goodGet(o.want)<o.wq) return;
    goodAdd(o.want,-o.wq); goodAdd(o.give,o.gq); tradeOffers.splice(+b.dataset.offer,1);
    hintEl.textContent='🤝 '+o.bot+' ile takas: '+o.wq+' '+goodLabel(o.want,S.currentEra)+' → '+o.gq+' '+goodLabel(o.give,S.currentEra)+'.'; }
  else if(b.id==='trClose'){ tradePanel.classList.remove('show'); document.getElementById('tradeAct').classList.remove('on'); return; }
  renderTrade();
});
function updateGoodsHud(){
  const era=S.currentEra;
  document.getElementById('foodVal').textContent=Math.floor(S.goods.fish+S.goods.livestock).toLocaleString('tr-TR');
  document.getElementById('foodState').textContent=S.fed? 'doyuruldu' : '';
  document.getElementById('oilLbl').textContent=goodLabel('oil', era); document.getElementById('techLbl').textContent=goodLabel('tech', era);
  document.getElementById('oilVal').textContent=Math.floor(S.goods.oil).toLocaleString('tr-TR');
  document.getElementById('techVal').textContent=Math.floor(S.goods.tech).toLocaleString('tr-TR');
  document.getElementById('techBonus').textContent=techBonus()>0? 'saldırı +%'+Math.round(techBonus()*100) : '';
}

// ================= provinces: ownership, troops, development =================
const playerProvs=new Set();   // provinces we hold in countries we own only partly
const provGarrison={};         // enemy soldiers per province (lazy share of the country's garrison)
function provAt(x,z){ return PI? PI.at(x,z) : null; }
function capitalProv(country){ const l=PI && PI.byCountry[country]; return l? (l.find(p=>p.capital)||l[0]) : null; }
function resolveProv(idOrCountry){ if(!PI || !idOrCountry) return null; return PI.byId[idOrCountry] || capitalProv(idOrCountry); }
function ownsProv(id){ const p=PI && PI.byId[id]; return !!p && ownedCountries.has(p.country) && (!partialOwned.has(p.country) || playerProvs.has(id)); }
function myProvs(){ return PROVS.filter(p=>ownsProv(p.id)); }
// take one province; owning every province of a country makes it a full annexation
function annexProvince(id){
  const p=PI.byId[id], c=p.country;
  if(ownedCountries.has(c) && !partialOwned.has(c)) return;
  ownedCountries.add(c); colonies.delete(c); partialOwned.add(c); playerProvs.add(id);
  if(PI.byCountry[c].every(q=>playerProvs.has(q.id))){ annexCountry(c); return; }
  refreshPartial(c); recolorCountry(c); redrawBorders();
}
function refreshPartial(c){ partialCellsByCountry[c]=PI.byCountry[c].filter(q=>playerProvs.has(q.id)).flatMap(q=>meshesByProv[q.id]||[]); }
// tint every province of a country by whoever holds it
function recolorCountry(c){
  const oid=ownerOf[c], b=oid && botById(oid);
  const other = b? b.color : (oid && oid!=='player' && humanPlayers[oid])? new THREE.Color(playerColorHex(oid)) : null;
  const mine = colonies.has(c)? COLONY_COLOR : MP? new THREE.Color(playerColorHex(playerId)) : OWN_COLOR;
  for(const p of PI.byCountry[c]||[]) for(const m of meshesByProv[p.id]||[]){
    const base=m.userData.baseColor;
    if(ownsProv(p.id)) m.material.color.copy(mine);
    else if(other) m.material.color.copy(other);
    else m.material.color.copy(base);
  }
}
// we lose every province (and the soldiers in them) we had in a country
function loseCountryProvinces(c){
  for(const q of PI.byCountry[c]||[]){ playerProvs.delete(q.id); delete S.troops[q.id]; }
  ownedCountries.delete(c); colonies.delete(c); partialOwned.delete(c); delete partialCellsByCountry[c];
  syncArmy();
}
function provDefense(id){
  if(provGarrison[id]==null){
    const p=PI.byId[id], list=PI.byCountry[p.country], g=garrisonOf(p.country), capShare=list.length>1? .4 : 1;
    provGarrison[id]=Math.round(p.capital? g*capShare : g*(1-capShare)/Math.max(1, list.length-1));
  }
  return provGarrison[id];
}

// ---- troops are stationed per province; S.army is always the grand total
const troopMoves=[];   // soldiers marching between our provinces
let garrisonDirty=true;
function syncArmy(){
  let t=0; for(const k in S.troops) t+=S.troops[k];
  for(const m of troopMoves) t+=m.n;
  if(typeof invasion!=='undefined' && invasion && invasion.force) t+=invasion.force;
  S.army=Math.round(t); updateArmy(); garrisonDirty=true;
}
function addTroops(id, n){ if(!id) return; S.troops[id]=Math.max(0, (S.troops[id]||0)+n); if(S.troops[id]<1) delete S.troops[id]; syncArmy(); }
// remove up to n soldiers, from `prefer` first, then from the biggest garrisons
function takeTroops(n, prefer){
  let left=n; const order=Object.keys(S.troops).sort((a,b)=> (b===prefer)-(a===prefer) || S.troops[b]-S.troops[a]);
  for(const id of order){ if(left<=0) break; const k=Math.min(left, S.troops[id]); S.troops[id]-=k; left-=k; if(S.troops[id]<1) delete S.troops[id]; }
  syncArmy(); return n-left;
}
function troopsInCountry(c){ return (PI && PI.byCountry[c]||[]).reduce((s,p)=>s+(S.troops[p.id]||0), 0); }

// ---- development: buildings raise a province from countryside to a big city
const DEV_PTS={ city:6, town:3, base:2, bank:2, mine:1, field:1, farm:1, port:2, shipyard:2, garage:2, choco:3, fishery:2, ranch:1, oilwell:2, factory:3 };
const DEV_LEVELS=[[0,'Kırsal'],[3,'Köy'],[8,'Kasaba'],[16,'Şehir'],[28,'Büyük şehir']];
function provDevPoints(id){
  let s=PI && PI.byId[id] && PI.byId[id].capital ? 6 : 0;
  for(const g of placedBuildings){ const r=g.userData.buildRec; if(r && r.prov===id) s+=DEV_PTS[r.type]||1; }
  return s;
}
function devLevel(pts){ let l=0; DEV_LEVELS.forEach(([t],i)=>{ if(pts>=t) l=i; }); return l; }

// ---- settlements: every province of ours is a village of a few cottages; upgrading makes it a town, then a city.
// Each step costs ×1.5 the last (money, bread and — in 1810 — wood). Level 3 adds people only, the city stays the same size.
const SETTLE_MAX=3;
const SETTLE_TO=['Köye','Kasabaya','Şehre','Büyük şehre'];   // dative: "… yükselt"
function settleOf(id){ return S.settle[id]||0; }
function upgradeCost(lvl){
  const m=Math.pow(UPGRADE_MULT, lvl);
  return { money:Math.round(UPGRADE_BASE.money*m), bread:Math.round(UPGRADE_BASE.bread*m), wood: S.currentEra==='1810' ? Math.round(UPGRADE_BASE.wood*m) : 0 };
}
const costText=c=>c.money+'💰 '+c.bread+'🍞'+(c.wood? ' '+c.wood+'🪵' : '');
// towns and cities drive upkeep, growth and calm exactly like the old town/city buildings did
function recountSettlements(){
  let t=0, c=0;
  for(const id in S.settle){ if(!ownsProv(id)) continue; const l=S.settle[id]; if(l===1) t++; else if(l>=2) c++; }
  S.townCount=t; S.cityCount=c; S.freeCityCount=0;
}
function upgradeLabel(id){
  const l=settleOf(id); if(l>=SETTLE_MAX) return null;
  return { next:SETTLE_NAMES[l+1], cost:upgradeCost(l), pop:SETTLE_POP[l+1] };
}
function canAfford(c){ return S.money>=c.money && S.bread>=c.bread && S.wood>=c.wood; }
async function upgradeSettlement(id){
  if(!id || !ownsProv(id)) return;
  const u=upgradeLabel(id); if(!u){ hintEl.textContent='Burası zaten en yüksek seviyede.'; return; }
  const c=u.cost, miss=[];
  if(S.money<c.money) miss.push((c.money-Math.floor(S.money))+' para');
  if(S.bread<c.bread) miss.push((c.bread-Math.floor(S.bread))+' ekmek');
  if(S.wood<c.wood) miss.push((c.wood-Math.floor(S.wood))+' odun');
  if(miss.length){ hintEl.textContent='⚠️ '+u.next+' için eksik: '+miss.join(', ')+'.'+(S.wood<c.wood? ' Odunu bölgedeki ormanlara tıklayıp toplayabilirsin.' : ''); return; }
  S.money-=c.money; S.bread-=c.bread; S.wood-=c.wood; updateMoney(); updateBread(); updateWood();
  const l=settleOf(id)+1; S.settle[id]=l; S.popCap+=u.pop; updatePop(); recountSettlements();
  const nm=(PI.byId[id]||{}).name||id;
  hintEl.textContent='🏘️ '+nm+' artık bir '+SETTLE_NAMES[l].toLocaleLowerCase('tr')+'! Nüfus sınırı +'+u.pop+' → '+S.popCap+'.'+(l>=SETTLE_MAX? ' (en yüksek seviye)' : '');
  if(selectedProv===id) fillProvince(false);
  refreshUpgradeUI();
  // rebuild the close-up around the bigger settlement, keeping the camera where it was
  if(view==='region' && regionName===id && regionView && !_viewBusy){
    _viewBusy=true; fadeView(true, nm+' büyüyor…'); await sleep(250); await nextFrame();
    const cam={ t:regionView.controls.target.clone(), p:regionView.cam.position.clone(), z:regionView.cam.zoom };
    try{ const info=regionInfoFor(id); regionView.build(info); regionSig=null; regionView.setLighting(currentSky());
      regionView.resize(wrap.clientWidth, wrap.clientHeight); regionView.activate(); regionView.zoomFrom=null;
      regionView.controls.target.copy(cam.t); regionView.cam.position.copy(cam.p); regionView.cam.zoom=cam.z; regionView.cam.updateProjectionMatrix();
      document.getElementById('rhSub').textContent=regionSubtitle(id, regionView.info);
      if(buildType) regionView.setGhost(buildType);
    }catch(e){ console.error(e); }
    fadeView(false); _viewBusy=false;
  }
}
// the upgrade buttons (region header + province panel) show the next step and grey out when it can't be paid
function refreshUpgradeUI(){
  const set=(btn, id)=>{ if(!btn) return;
    const own=id && ownsProv(id), u=own && upgradeLabel(id);
    btn.style.display = own ? '' : 'none'; if(!own) return;
    if(!u){ btn.innerHTML='🏙️ '+SETTLE_NAMES[settleOf(id)]+' · en yüksek seviye'; btn.disabled=true; btn.classList.remove('poor'); return; }
    btn.disabled=false; btn.innerHTML='⬆️ '+SETTLE_TO[settleOf(id)+1]+' yükselt<small>'+costText(u.cost)+' · nüfus +'+u.pop+'</small>';
    btn.classList.toggle('poor', !canAfford(u.cost));
  };
  set(document.getElementById('rhUpgrade'), view==='region' ? regionName : null);
  set(document.getElementById('pvUpgrade'), selectedProv);
}
setInterval(refreshUpgradeUI, 500);
function devInfo(id){
  const pts=provDevPoints(id), l=devLevel(pts), next=DEV_LEVELS[l+1];
  return { pts, level:l, name:DEV_LEVELS[l][1], next: next? next[0] : null, prev: DEV_LEVELS[l][0], nextName: next? next[1] : null };
}
// developed provinces bring in a little more tax (up to +50%)
function devTaxBonus(){ let s=0; for(const p of myProvs()){ const l=devLevel(provDevPoints(p.id)); s+=specOf(p.id)==='ticaret'? l*2+1.5 : l; } return Math.min(.8, s*.03); }

// faint lines between the provinces of each country
let provLinesGroup=null;
function buildProvinceLines(){
  if(provLinesGroup){ worldGroup.remove(provLinesGroup); provLinesGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); }); }
  provLinesGroup=new THREE.Group();
  const mat=new THREE.LineBasicMaterial({ color:0x1b1712, transparent:true, opacity:.28 });   // province borders: fine ink
  for(const c in PI.byCountry){ if(PI.byCountry[c].length<2) continue;
    for(const p of PI.byCountry[c]) for(const ring of p.rings) for(const part of splitWrap(ring)){   // never draw across the date line
      const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(part.map(q=>new THREE.Vector3(q[0], DEPTH+0.06, -q[1]))), mat);
      provLinesGroup.add(l); } }
  worldGroup.add(provLinesGroup);
}

// colony: still its own country but bound to you; shown in a paler tint
function colonizeCountry(name, prov){
  ownedCountries.add(name);
  partialOwned.delete(name); delete partialCellsByCountry[name];
  if(PI) for(const q of PI.byCountry[name]||[]) playerProvs.delete(q.id);
  colonies.add(name);
  ownerOf[name]='player';
  colorCountry(name, COLONY_COLOR);
  // the colony's standing army joins you
  const g=garrisonOf(name);
  if(g>0){ addTroops(prov || (capitalProv(name)||{}).id, g); garrisons[name]=0; }
  redrawBorders();
}

// ================= BOTS (AI empires) =================
// Each bot owns a set of countries, grows an economy, and attacks/defends sensibly.
let bots = [];                 // [{id,name,color,colorHex,owned:Set,money,pop,army}]
const ownerOf = {};            // country name -> bot id (or 'player'); undefined = neutral
function botById(id){ return bots.find(b=>b.id===id)||null; }
function neutralCountries(){
  const out=[];
  for(const f of (ALL_FEATURES||[])){ const n=f.properties&&f.properties.name;
    if(n && !ownedCountries.has(n) && ownerOf[n]===undefined) out.push(n); }
  return out;
}
// ownership is shown by the coloured border, NOT by the fill (fill stays geographic).
// we apply only a faint tint of the owner colour so territory is still readable.
// muted, distinct colour for every unclaimed country (stable per name), like a classic political map
function neutralColor(name, ll){
  let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))>>>0;
  // Africa and Arabia keep earthy sand/ochre tints so the dry lands read as desert and savanna, not a patchwork
  if(ll && ll[0]>-20 && ll[0]<62 && ll[1]>-36 && ll[1]<36) return new THREE.Color().setHSL((24+h%26)/360, .3+((h>>9)%14)/100, .6+((h>>5)%10)/100);
  return new THREE.Color().setHSL((h%360)/360, .28+((h>>9)%20)/100, .58+((h>>5)%12)/100);
}
function colorCountry(name, col){
  (meshesByCountry[name]||[]).forEach(m=>{ m.material.color.copy(col); });   // the owner's colour fills the land
}
function restoreCountryColor(name){
  (meshesByCountry[name]||[]).forEach(m=>{ if(m.userData.baseColor) m.material.color.copy(m.userData.baseColor); });
}

function spawnBots(n){
  bots=[]; for(const k in ownerOf) delete ownerOf[k];
  // mark player's countries as owned by 'player'
  ownedCountries.forEach(nm=> ownerOf[nm]='player');
  const pool=neutralCountries();
  // shuffle pool
  for(let i=pool.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  for(let i=0;i<n && i<pool.length;i++){
    const home=pool[i];
    const col=new THREE.Color(BOT_COLORS[i%BOT_COLORS.length]);
    const bot={ id:'bot'+i, home, name:BOT_NAMES[i%BOT_NAMES.length], color:col, colorHex:BOT_COLORS[i%BOT_COLORS.length],
      owned:new Set([home]), money:800+Math.random()*400, pop:80+Math.random()*60,
      army:baseArmyFor(home)+Math.round(Math.random()*3000), aggr:0.3+Math.random()*0.5 };
    ownerOf[home]=bot.id;
    colorCountry(home, col);
    bots.push(bot);
  }
  redrawBorders();
}

// how many neutral/other countries border a bot's territory (for sensible expansion)
function botNeighbors(bot){
  // candidate targets: any country whose capital is near one of the bot's countries
  const targets=[];
  const mine=[...bot.owned].map(n=>capitalXZ(n)).filter(Boolean);
  if(!mine.length) return targets;
  for(const f of (ALL_FEATURES||[])){
    const n=f.properties&&f.properties.name; if(!n) continue;
    if(bot.owned.has(n)) continue;
    const cap=capitalXZ(n); if(!cap) continue;
    let best=Infinity; for(const m of mine){ const d=Math.hypot(cap[0]-m[0],cap[1]-m[1]); if(d<best)best=d; }
    if(best<140) targets.push({name:n, dist:best});   // only nearby countries
  }
  targets.sort((a,b)=>a.dist-b.dist);
  return targets;
}

function botDefense(name){
  // strength defending a country = that country's garrison, or its bot owner's army share
  const oid=ownerOf[name];
  if(oid && oid!=='player'){ const b=botById(oid); if(b) return Math.round(b.army/Math.max(1,b.owned.size)) + baseArmyFor(name)*0.4; }
  if(oid==='player'){ return troopsInCountry(name) + militiaOf(name); }   // stationed soldiers plus the local levy
  return garrisonOf(name);
}

// ---- pacing: nobody attacks a fresh player, then the danger grows slowly ----
const PEACE_MONTHS=12, THREAT_RAMP_MONTHS=18;
const monthsPlayed=()=>S.gameDays/30;
function peaceMonthsLeft(){ return Math.max(0, PEACE_MONTHS + (S.personality==='peaceful' ? 6 : 0) - monthsPlayed()); }
// 0..1: how likely a bot even considers one of our countries this month
function playerThreat(){ const m=monthsPlayed()-PEACE_MONTHS-(S.personality==='peaceful' ? 6 : 0); return m<=0 ? 0 : Math.min(1, .25 + .75*m/THREAT_RAMP_MONTHS); }
// every country we hold has a local levy that fights even without stationed troops (stronger at home, with bases)
function militiaOf(name){
  const k = name===S.homeName ? .35 : .12;
  return Math.round(baseArmyFor(name)*k*(1 + .15*Math.min(4, S.baseCount)));
}

// one monthly step for every bot: grow, then maybe attack a sensible target
function botsMonthlyTick(){
  if(!bots.length) return;
  for(const bot of bots){
    if(bot.owned.size===0) continue;
    // ---- economy growth (scales with territory) ----
    bot.pop += bot.owned.size*8 + 4;
    bot.money += Math.round(bot.pop*0.6 + bot.owned.size*40);
    bot.army += Math.round(bot.owned.size*120 + bot.money*0.02);
    // spend money to reinforce (keeps army believable)
    if(bot.money>1500){ const buy=Math.round(bot.money*0.3); bot.army+=buy; bot.money-=buy; }
    // ---- decide whether to attack (only if it makes sense) ----
    if(Math.random()>bot.aggr) continue;           // not every bot acts every month
    const targets=botNeighbors(bot);
    if(!targets.length) continue;
    // pick the easiest nearby target the bot can clearly beat
    let chosen=null;
    for(const t of targets){
      const def=botDefense(t.name), mine=ownedCountries.has(t.name);
      // the player is left alone during the peace months, then only clearly weaker countries of ours are picked
      if(mine && (Math.random()>=playerThreat() || bot.army <= def*1.6)) continue;
      if(bot.army > def*1.3){ chosen=t; break; }    // sensible: only attack when stronger
    }
    if(!chosen){ bot.warned=null; continue; }
    // our countries get a month's warning: the enemy masses at the border first, so troops can be moved in
    if(ownedCountries.has(chosen.name) && bot.warned!==chosen.name){
      bot.warned=chosen.name;
      hintEl.textContent='⚠️ '+bot.name+' ordusu '+chosen.name+' sınırında toplanıyor! Gelecek ay saldırabilir — oraya asker gönder ya da üs kur.';
      continue;
    }
    bot.warned=null;
    const def=botDefense(chosen.name);
    // resolve probabilistically (bigger army -> higher chance)
    const win = Math.random() < (bot.army/(bot.army+def));
    showBotBattle(bot, chosen.name, win);
    if(ownedCountries.has(chosen.name)) botAttackedPlayer(bot, chosen.name, win);
    if(win){ botConquer(bot, chosen.name); bot.army=Math.max(100, bot.army-Math.round(def*0.6)); }
    else { bot.army=Math.max(50, Math.round(bot.army*0.5)); }
  }
}

// a bot attacked one of our countries: tell the player and show the defence cutscene
function botAttackedPlayer(bot, name, win){
  if(!win) hintEl.textContent='🛡️ '+bot.name+' '+name+' ülkesine saldırdı ama püskürtüldü!';
  // the fight happens where most of our soldiers in that country stand (or its capital province)
  const dp=(PI.byCountry[name]||[]).filter(q=>ownsProv(q.id)).sort((a,b)=>(S.troops[b.id]||0)-(S.troops[a.id]||0))[0] || capitalProv(name);
  if(cineEnabled() && dp) playCinematic({ name:dp.id, title:upName(name)+' SAVUNMASI',
    sub:upName(bot.name)+'  ⚔  '+upName(S.homeName||name), attFlag:flagFor([...bot.owned][0]||''), defFlag:flagFor(name),
    advance:'DÜŞMAN YAKLAŞIYOR', won:!win, attColor:bot.colorHex, defColor:playerTeamColor(), attCulture:cultureOfCountry(bot.home), defCulture:cultureOfCountry(S.homeName||name),
    lossA: win ? .3 : .7, lossD: win ? .95 : .35, winSub:'SALDIRI PÜSKÜRTÜLDÜ', loseSub:upName(name)+' KAYBEDİLDİ' });
}
function botConquer(bot, name){
  const prev=ownerOf[name];
  const hadProvs=ownedCountries.has(name);
  if(hadProvs){
    // a bot took a country where we held provinces: they and their garrisons are lost
    loseCountryProvinces(name);
  }
  if(prev==='player'){
    // (the whole country was ours)
  } else if(prev && prev!==bot.id){
    const other=botById(prev); if(other) other.owned.delete(name);
  }
  ownerOf[name]=bot.id; bot.owned.add(name);
  colorCountry(name, bot.color);
  redrawBorders();
  if(hadProvs){ hintEl.textContent='⚠️ '+bot.name+' senden '+name+' topraklarını aldı!'; }
}
// ---- ranking panel (by economy; shows flag, pop, size, army) ----
let rankOpen=false;
function empireArea(names){
  let st=0; for(const n of names){ const f=featByName[n]; if(f){ try{ st+=d3geo.geoArea(f); }catch(e){} } }
  return Math.round(st*EARTH_KM2_PER_STER);
}
function renderRanking(){
  const list=document.getElementById('rankList'); if(!list) return;
  const rows=[];
  // the player
  rows.push({ me:true, name:(S.selectedName?('Sen · '+S.selectedName):'Sen'),
    flag: S.selectedName?flagFor(S.selectedName):'', swatch:'#2e8bff',
    money:Math.round(S.money), pop:Math.round(S.population), size:empireArea([...ownedCountries]), army:Math.round(S.army),
    countries:ownedCountries.size });
  // bots
  for(const b of bots){
    const home=[...b.owned][0];
    rows.push({ me:false, name:b.name, flag: home?flagFor(home):'', swatch:b.colorHex,
      money:Math.round(b.money), pop:Math.round(b.pop), size:empireArea([...b.owned]), army:Math.round(b.army),
      countries:b.owned.size });
  }
  rows.sort((a,b)=> b.money-a.money);   // rank by economy
  list.innerHTML='';
  rows.forEach((r,i)=>{
    const row=document.createElement('div'); row.className='rank-row'+(r.me?' me':'');
    const flagHtml = r.flag || '<span style="width:20px;display:inline-block">🏳️</span>';
    row.innerHTML =
      '<span class="rank-pos">'+(i+1)+'</span>'+
      '<span class="rank-swatch" style="background:'+r.swatch+'"></span>'+
      flagHtml+
      '<span class="rank-name">'+r.name+'</span>'+
      '<span class="rank-stats">💰'+r.money.toLocaleString('tr-TR')+' · 🪖'+r.army.toLocaleString('tr-TR')+'<br>'+
        '👥'+r.pop.toLocaleString('tr-TR')+' · 🗺️'+r.countries+' ülke · '+r.size.toLocaleString('tr-TR')+' km²</span>';
    list.appendChild(row);
  });
}
// ================= end bots =================

// is a clicked world point inside ANY country we own?
function inSelected(x,z){
  if(ownedCountries.size===0) return true;
  // a little tolerance for clicks right on a coast or border
  for(const [ox,oz] of [[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]]){ const p=provAt(x+ox, z+oz); if(p && ownsProv(p.id)) return true; }
  return false;
}

// world-space capital/centre point of a country (scene XZ)
// real capitals for the big players (lon, lat); everyone else: the centre of their largest landmass
// (the centroid of a whole empire can fall in the ocean or on a colony: 1810 Britain ended up in Jamaica)
const CAPITALS={ 'United Kingdom':[-.13,51.5], 'France':[2.35,48.86], 'Ottoman Empire':[28.98,41.01], 'Türkiye':[32.85,39.93], 'Russia':[37.62,55.75], 'Russian Empire':[30.3,59.94],
  'Germany':[13.4,52.52], 'Prussia':[13.4,52.52], 'Austrian Empire':[16.37,48.21], 'Austria':[16.37,48.21], 'Spain':[-3.7,40.42], 'Portugal':[-9.14,38.72], 'Netherlands':[4.9,52.37],
  'Italy':[12.5,41.9], 'Sweden':[18.07,59.33], 'Norway':[10.75,59.91], 'Denmark':[12.57,55.68], 'Japan':[139.69,35.69], 'China':[116.4,39.9], 'Qing Empire':[116.4,39.9], 'Manchu Empire':[116.4,39.9],
  'India':[77.21,28.61], 'United States of America':[-77.04,38.9], 'United States':[-77.04,38.9], 'Canada':[-75.7,45.42], 'Brazil':[-47.93,-15.78], 'Australia':[149.13,-35.28],
  'Egypt':[31.24,30.04], 'Iran':[51.39,35.69], 'Persia':[51.39,35.69], 'Mexico':[-99.13,19.43], 'Argentina':[-58.38,-34.6], 'South Africa':[28.19,-25.75], 'Poland':[21.01,52.23], 'Ukraine':[30.52,50.45] };
const _capCache={};
function capitalXZ(name){
  if(name in _capCache) return _capCache[name];
  const f=featByName[name]; if(!f) return null;
  let c=null;
  const cap=CAPITALS[name]; if(cap && sceneXZ(cap[0], cap[1])) c=cap;   // trusted even when a coarse coastline leaves it offshore (Istanbul in 1810)
  if(!c){
    const g=f.geometry, polys=g && (g.type==='Polygon'? [g.coordinates] : g.type==='MultiPolygon'? g.coordinates : []);
    let best=null, ba=-1; for(const p of polys||[]){ let a=0; try{ a=d3geo.geoArea({type:'Polygon', coordinates:p}); }catch(e){} if(a<6 && a>ba){ ba=a; best=p; } }   // geoArea>2π = inverted ring
    try{ c=d3geo.geoCentroid(best? {type:'Polygon', coordinates:best} : f); }catch(e){ return null; }
  }
  if(!c||!isFinite(c[0])) return null;
  return (_capCache[name]=sceneXZ(c[0], c[1]));
}

// ---- borders of owned territory, one colour per owner (player + each bot) ----
let borderGroup=null;
// build the merged outline of a set of country names, as lon/lat polygons
function outlineOf(names){
  const SNAP=0.1, BUF=0.08; const snap=v=>Math.round(v/SNAP)*SNAP;
  const allPolys=[];
  names.forEach(name=>{
    if(partialOwned.has(name)) return;
    const f=featByName[name]; if(!f||!f.geometry) return;
    const raw = f.geometry.type==='Polygon'?[f.geometry.coordinates]
              : f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
    for(const rings of raw){
      let lonlat=rings[0]||[];
      let fe=false,fw=false; for(const c of lonlat){ if(c[0]>150)fe=true; if(c[0]<-150)fw=true; }
      if(fe&&fw){ lonlat=lonlat.filter(c=> c[0]>=-150); }
      if(lonlat.length<4) continue;
      const simp=simplifyRingB(lonlat);
      let cx=0,cy=0; for(const c of simp){ cx+=c[0]; cy+=c[1]; } cx/=simp.length; cy/=simp.length;
      let ring=[]; let last=null;
      for(const c of simp){
        const dx=c[0]-cx, dy=c[1]-cy; const d=Math.hypot(dx,dy)||1;
        const p=[snap(c[0]+dx/d*BUF), snap(c[1]+dy/d*BUF)];
        if(!last || p[0]!==last[0] || p[1]!==last[1]){ ring.push(p); last=p; }
      }
      if(ring.length<4) continue;
      if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1]) ring.push([ring[0][0],ring[0][1]]);
      allPolys.push([ring]);
    }
  });
  if(!allPolys.length) return [];
  try{ return allPolys.reduce((acc,poly)=> acc ? polygonClipping.union(acc, [poly]) : [poly], null) || []; }
  catch(e){ return []; }
}
const borderMats=new Set();
function borderMat(col, width, opacity){
  const m=new LineMaterial({ color:col, linewidth:width, transparent:opacity<1, opacity, depthWrite:false });
  m.resolution.set(wrap.clientWidth, wrap.clientHeight); borderMats.add(m);
  m.addEventListener('dispose', ()=>borderMats.delete(m));
  return m;
}
// a ring that wraps around the date line would draw a line across the whole map: cut it at every big jump
function splitWrap(pts){
  const out=[]; let cur=[];
  for(let i=0;i<pts.length;i++){
    if(cur.length && Math.hypot(pts[i][0]-cur[cur.length-1][0], pts[i][1]-cur[cur.length-1][1])>W*.25){ if(cur.length>1) out.push(cur); cur=[]; }
    cur.push(pts[i]);
  }
  if(cur.length>1) out.push(cur);
  return out;
}
function addFatLine(seg, ...mats){
  const flat=[]; for(const p of seg) flat.push(p[0], DEPTH+0.25, p[1]);
  for(const m of mats){ const geo=new LineGeometry(); geo.setPositions(flat); const l=new Line2(geo, m); l.computeLineDistances(); borderGroup.add(l); }
}
function redrawBorders(){
  if(borderGroup){ worldGroup.remove(borderGroup);
    borderGroup.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); }); }
  borderGroup=new THREE.Group();

  // one BOLD outline per owner, each in its own colour (sits above the thin white country lines)
  const groups=[{ names:[...ownedCountries].filter(n=>!partialOwned.has(n)), col:0x37e0ff }];  // player: bright cyan
  for(const b of bots){ if(b.owned.size) groups.push({ names:[...b.owned], col:new THREE.Color(b.colorHex).getHex() }); }

  for(const g of groups){
    if(!g.names.length) continue;
    // wide soft glow + bright core, both screen-space thick lines
    const glow=borderMat(g.col, 9, .35), core=borderMat(g.col, 2.6, 1);
    const union=outlineOf(g.names);
    for(const poly of union){
      for(const ring of poly){
        const pts=[]; for(const c of ring){ const p=sceneXZ(c[0],c[1]); if(p) pts.push(p); }
        for(const seg of splitWrap(pts)) addFatLine(seg.map(p=>[p[0], p[1]]), glow, core);
      }
    }
  }


  // partial countries: outline ONLY the taken cells (their XZ rings are already scene coords)
  partialOwned.forEach(name=>{
    const cells=partialCellsByCountry[name]||[];
    const ringsXZ = cells.map(m=>m.userData.ring).filter(Boolean)
      .map(r=>{ const rr=r.map(p=>[p[0],p[1]]);
        if(rr[0][0]!==rr[rr.length-1][0]||rr[0][1]!==rr[rr.length-1][1]) rr.push([rr[0][0],rr[0][1]]);
        return [rr]; });
    if(!ringsXZ.length) return;
    let u=[];
    try{ u = ringsXZ.reduce((acc,poly)=> acc ? polygonClipping.union(acc,[poly]) : [poly], null) || []; }
    catch(e){ u=ringsXZ.map(p=>p); }
    // the provinces we hold get the same glowing outline as whole countries
    const glow=borderMat(0x37e0ff, 9, .35), core=borderMat(0x37e0ff, 2.6, 1);
    for(const poly of u){
      for(const ring of poly){
        for(const seg of splitWrap(ring.map(c=>[c[0], -c[1]]))) addFatLine(seg, glow, core);
      }
    }
  });

  worldGroup.add(borderGroup);
  rebuildEmpireLabels();
  rebuildMapNames();
}

// ---- invasion ----
const invadeBtn=document.getElementById('invadeBtn');
let invadeTarget=null;       // country name pending invasion
let capitalMarker=null;      // marker mesh at target capital
let armyUnit=null;           // marching army mesh
let invasion=null;           // {target, capital:[x,z], arrived:false, timer:0}

function clearCapitalMarker(){ if(capitalMarker){ worldGroup.remove(capitalMarker);
  capitalMarker.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose&&o.material.dispose(); });
  capitalMarker=null; } }
let invadeProv=null;
function showInvade(name, pid){
  invadeTarget=name; invadeProv=pid || (capitalProv(name)||{}).id;
  // mark the targeted province
  clearCapitalMarker();
  const cap=invadeProv? PI.byId[invadeProv].center : capitalXZ(name);
  if(cap){ capitalMarker=makeCapitalMarker(); capitalMarker.position.set(cap[0],DEPTH,cap[1]); worldGroup.add(capitalMarker); }
  fillCtxPanel(name);
  ctxPanel.classList.add('show');
}
function hideInvade(){ ctxPanel.classList.remove('show'); invadeTarget=null; if(!invasion) clearCapitalMarker(); }
const ctxPanel=document.getElementById('ctxPanel');
function fillCtxPanel(name){
  const src=attackSource(invadeProv), force=src? S.troops[src.id]||0 : 0;
  const def=provDefense(invadeProv), ours=force*ideoWinBonus()*persAttackMult()*(1+techBonus()), chance=force>0? ours/(ours+def||1) : 0;
  const oid=ownerOf[name], bot=oid && botById(oid);
  const ownerName = bot? bot.name : (oid && humanPlayers[oid])? humanPlayers[oid].name : 'Bağımsız';
  const ownerCol = bot? bot.colorHex : (oid && humanPlayers[oid])? playerColorHex(oid) : '#d9d2bf';
  document.getElementById('ctxFlag').innerHTML=flagFor(name);
  document.getElementById('ctxName').textContent=PI.byId[invadeProv].name;
  document.getElementById('ctxOwner').innerHTML='<i style="background:'+ownerCol+'"></i>'+ownerName;
  document.getElementById('ctxDef').textContent=Math.round(def).toLocaleString('tr-TR');
  document.getElementById('ctxArmy').textContent=Math.round(force).toLocaleString('tr-TR')+(src? ' ('+src.label+')' : '');
  document.getElementById('ctxChance').textContent='%'+Math.round(chance*100);
  document.getElementById('ctxBar').style.width=Math.round(chance*100)+'%';
}
document.getElementById('ctxClose').onclick=()=>hideInvade();
document.getElementById('ctxRegion').onclick=()=>{ const n=invadeProv; hideInvade(); if(n) enterRegion(n); };

// every non-owned country starts with a 1000-soldier garrison
const garrisons = {};
function baseArmyFor(name){
  if(S.currentEra==='1810'){
    const k=MIL_1810[name];
    if(k==null) return 8000;                       // small/unknown 1810 state
    let v=Math.round(k/MIL_1810_MAX*100000);        // relative to the strongest 1810 army
    if(v>100000) v=100000;
    if(v<1500) v=1500;
    return v;
  }
  if(name==='United States of America') return 100000;   // USA is always the highest (2014)
  const k = MIL_K[name];
  if(k==null) return 12000;                       // unknown small country default
  let v = Math.round(k / USA_K * 100000);          // relative to USA
  if(v>99000) v=99000;                             // never exceed USA
  if(v<2000) v=2000;
  return v;
}
function garrisonOf(name){ if(garrisons[name]==null) garrisons[name]=baseArmyFor(name); return garrisons[name]; }

// the province our attack starts from: the selected one if it has soldiers, else the nearest garrison
// (selected province first, then the nearest), preferring one with a land route unless we have ships
function attackSource(targetId){
  const t=PI.byId[targetId]; if(!t) return null;
  const cands=Object.keys(S.troops).filter(id=>PI.byId[id] && ownsProv(id) && S.troops[id]>=1).map(id=>PI.byId[id])
    .map(p=>({ p, d:Math.hypot(p.center[0]-t.center[0], p.center[1]-t.center[1]) }))
    .sort((a,b)=> (b.p.id===selectedProv)-(a.p.id===selectedProv) || a.d-b.d);
  if(!cands.length) return null;
  const byLand=cands.find(c=>!overseasBetween(c.p.center[0], c.p.center[1], t.center[0], t.center[1]));
  return (byLand || cands[0]).p;
}
invadeBtn.onclick=()=>{
  if(!invadeTarget || !invadeProv) return;
  if(invasion){ hintEl.textContent='⚠️ Ordun zaten bir harekâtta.'; return; }
  const src=attackSource(invadeProv);
  if(!src){ hintEl.textContent='⚠️ Saldıracak asker yok! Askeri üsten asker al ya da askerlerini bir bölgede topla.'; return; }
  const force=S.troops[src.id]||0, cap=landNear(PI.byId[invadeProv].center);   // a province centre can sit in a bay
  const start=src.center.slice();
  if(armyUnit){ disposeArmyGroup(armyUnit); armyUnit=null; }
  armyUnit=makeArmyGroup(playerTeamColor(), force, S.tankCount); armyUnit.position.set(start[0],DEPTH,start[1]); worldGroup.add(armyUnit);

  // overseas? the straight route from us to the capital crosses water
  const overseas = overseasBetween(start[0],start[1], cap[0],cap[1]);
  if(overseas){
    if(ships.length===0){
      hintEl.textContent='Deniz aşırı işgal için gemin yok! Askerler gidemez — önce liman+tersane kurup gemi üret.';
      disposeArmyGroup(armyUnit); armyUnit=null; return;
    }
    // board the EXISTING ship closest to our launch point (do not create a new one)
    let ship=ships[0], best=Infinity;
    for(const s of ships){ const d=(s.position.x-start[0])**2+(s.position.z-start[1])**2;
      if(d<best){ best=d; ship=s; } }
    const embarkPt=[ship.position.x, ship.position.z];     // go to where the ship waits
    const landPt=coastApproach(start[0],start[1], cap[0],cap[1]); // water beside enemy coast
    // find a sea-only route from the ship to the enemy coast (never crossing land)
    let route=seaRoute(embarkPt[0],embarkPt[1], landPt[0],landPt[1]);
    if(!route || route.length===0){
      // fallback: go straight (rare; only when pathfinder can't find a route in time)
      route=[ landPt.slice() ];
    }
    route.push(landPt);
    invasion={ target:invadeTarget, prov:invadeProv, src:src.id, force, capital:cap, phase:'embark',
      embark:embarkPt, land:landPt, ship:ship, returnPt:[ship.position.x,ship.position.z],
      route:route, leg:0, battle:0, holdTimer:0, defenderShown:false };
    hintEl.textContent=invadeTarget+' deniz aşırı! Ordu limandaki gemiye gidiyor…';
  } else {
    invasion={ target:invadeTarget, prov:invadeProv, src:src.id, force, capital:cap, phase:'march', battle:0, holdTimer:0, defenderShown:false };
    hintEl.textContent=PI.byId[invadeProv].name+' harekâtı başladı! '+src.label+' bölgesinden '+force.toLocaleString('tr-TR')+' asker · Savunma: '+provDefense(invadeProv).toLocaleString('tr-TR');
  }
  delete S.troops[src.id]; syncArmy();   // the attackers are now in the field
  ctxPanel.classList.remove('show');
};

// nearest land point to p (spiral search), so armies never aim at water
function landNear(p){
  if(isLandPt(p[0], p[1])) return p.slice();
  for(let r=1; r<=40; r+=1) for(let k=0; k<16; k++){ const a=k/16*Math.PI*2, x=p[0]+Math.cos(a)*r, z=p[1]+Math.sin(a)*r; if(isLandPt(x, z)) return [x, z]; }
  return p.slice();
}
// call the operation off before the fighting starts: the soldiers go home
function cancelInvasion(){
  if(!invasion || invasion.phase==='battle') return;
  const back=ownsProv(invasion.src) ? invasion.src : (capitalProv(S.homeName)||{}).id;
  if(invasion.ship && invasion.returnPt) invasion.ship.position.set(invasion.returnPt[0], SHIP_Y, invasion.returnPt[1]);
  const n=invasion.force; invasion.force=0;
  if(armyUnit){ disposeArmyGroup(armyUnit); armyUnit=null; }
  clearCapitalMarker(); invasion=null;
  addTroops(back, n);
  hintEl.textContent='↩️ Harekât iptal edildi: '+n.toLocaleString('tr-TR')+' asker '+((PI.byId[back]||{}).label||'')+' bölgesine döndü.';
  updateCancelBtn();
}
const cancelOpBtn=document.getElementById('cancelOpBtn');
function updateCancelBtn(){ if(cancelOpBtn) cancelOpBtn.classList.toggle('show', !!invasion && invasion.phase!=='battle'); }
if(cancelOpBtn) cancelOpBtn.onclick=cancelInvasion;

// advance the invasion each frame
function stepInvasion(dt){
  updateCancelBtn();
  if(!invasion||!armyUnit) return;
  const [tx,tz]=invasion.capital;

  // walk to the existing ship waiting near our port
  if(invasion.phase==='embark'){
    const [ex,ez]=invasion.embark;
    const dx=ex-armyUnit.position.x, dz=ez-armyUnit.position.z; const d=Math.hypot(dx,dz);
    const speed=18;
    if(d>3){ armyUnit.position.x+=dx/d*speed*dt; armyUnit.position.z+=dz/d*speed*dt; armyUnit.rotation.y=Math.atan2(dx,dz); }
    else {
      // board the existing ship (no new ship is created)
      invasion.phase='sail';
      hintEl.textContent=invasion.target+': ordu limandaki gemiye bindi, denizi geçiyor…';
    }
    return;
  }
  // sail along the water-only route to the enemy coast (army rides the ship)
  if(invasion.phase==='sail'){
    const sh=invasion.ship;
    const route=invasion.route;
    let wp=route[invasion.leg];
    const dx=wp[0]-sh.position.x, dz=wp[1]-sh.position.z; const d=Math.hypot(dx,dz);
    const speed=30;
    armyUnit.position.set(sh.position.x, DEPTH, sh.position.z); // army stays on the ship
    armyUnit.visible=false;
    if(d>4){ sh.position.x+=dx/d*speed*dt; sh.position.z+=dz/d*speed*dt;
      sh.rotation.y=Math.atan2(dx,dz); armyUnit.rotation.y=sh.rotation.y; }
    else {
      invasion.leg++;
      if(invasion.leg>=route.length){ invasion.phase='landing';
        hintEl.textContent=invasion.target+' kıyısına ulaşıldı, askerler iniyor…'; }
    }
    return;
  }
  // disembark: drop the army on the nearest land, send the ship home, then march
  if(invasion.phase==='landing'){
    const sh=invasion.ship;
    const dx=tx-sh.position.x, dz=tz-sh.position.z; const d=Math.hypot(dx,dz)||1;
    let lx=sh.position.x, lz=sh.position.z;
    for(let r=4;r<=120;r+=4){ const x=sh.position.x+dx/d*r, z=sh.position.z+dz/d*r;
      if(isLandPt(x,z)){ lx=x; lz=z; break; } }
    armyUnit.position.set(lx, DEPTH, lz); armyUnit.visible=true;
    // the existing ship returns to where it was (stays in the fleet)
    if(sh && invasion.returnPt){ sh.position.set(invasion.returnPt[0], SHIP_Y, invasion.returnPt[1]); }
    invasion.ship=null;
    invasion.phase='march';
    return;
  }

  if(invasion.phase==='march'){
    const dx=tx-armyUnit.position.x, dz=tz-armyUnit.position.z;
    const dlen=Math.hypot(dx,dz);
    const speed=11; // world units/sec (slower march)
    if(dlen>3){
      // head straight at the capital
      let hx=dx/dlen, hz=dz/dlen;
      // if an obstacle is right in front (between us and the goal), slide sideways a touch
      const ax=armyUnit.position.x, az=armyUnit.position.z;
      for(const o of obstacles){
        if(Math.hypot(o.x-tx, o.z-tz) < o.r+14) continue;  // ignore near-goal obstacles
        const ox=o.x-ax, oz=o.z-az; const od=Math.hypot(ox,oz);
        if(od>0.01 && od < o.r+5){
          const ahead = (ox/od)*hx + (oz/od)*hz;            // obstacle in front?
          if(ahead>0.3){ hx += -hz*0.6; hz += hx*0.6; }
        }
      }
      let hl=Math.hypot(hx,hz)||1; hx/=hl; hz/=hl;
      const stepLen=speed*dt;
      // soldiers must stay on land: if the next step is on water, fan out the heading
      // (try increasing angles to both sides) to find a land route along the coast.
      let nx=ax+hx*stepLen, nz=az+hz*stepLen;
      if(!isLandPt(nx,nz)){
        const baseAng=Math.atan2(hz,hx); let found=false;
        for(let d=1; d<=12 && !found; d++){
          for(const s of [1,-1]){
            const a=baseAng + s*d*(Math.PI/12);   // up to ±180° in 15° steps
            const cx=ax+Math.cos(a)*stepLen, cz=az+Math.sin(a)*stepLen;
            if(isLandPt(cx,cz)){ nx=cx; nz=cz; hx=Math.cos(a); hz=Math.sin(a); found=true; break; }
          }
        }
        if(!found){ nx=ax; nz=az; }   // fully surrounded by water: hold (shouldn't happen on land)
      }
      armyUnit.position.x=nx; armyUnit.position.z=nz;
      armyUnit.rotation.y=Math.atan2(hx,hz); armyUnit.userData.form.moving=true;
      // stuck watchdog: coasts, lakes and obstacles can trap the simple steering; if the army has not got
      // closer for a few seconds it forces its way to the target instead of marching on the spot forever
      if(invasion.best==null || dlen<invasion.best-1){ invasion.best=dlen; invasion.stall=0; }
      else if((invasion.stall=(invasion.stall||0)+dt)>3){
        invasion.stall=0;
        const jump=Math.min(dlen-2, 25), jx=ax+dx/dlen*jump, jz=az+dz/dlen*jump, q=landNear([jx, jz]);
        armyUnit.position.x=q[0]; armyUnit.position.z=q[1]; invasion.best=Math.hypot(tx-q[0], tz-q[1]);
        if(invasion.best>=dlen-1){ armyUnit.position.x=tx; armyUnit.position.z=tz; }   // no land on the way: arrive
      }
    }
    else {
      invasion.phase='battle'; invasion.battle=0; invasion.holdTimer=0;
      // the dice are rolled now (same probability as before) so the fight on screen can show the real outcome
      const def0=provDefense(invasion.prov), our0=invasion.force*ideoWinBonus()*persAttackMult()*(1+techBonus());
      invasion.winChance0=our0/(our0+def0||1); invasion._roll=Math.random(); invasion.def0=def0; invasion.army0=invasion.force;
      invasion.wonVisual=invasion._roll<invasion.winChance0; invasion.defColor=ownerColorOf(invasion.target);
      Object.assign(invasion, pickBattleStyle());
      if(!invasion.defenderShown){ invasion.defender=makeArmyGroup(ownerColorOf(invasion.target), def0, 0, undefined, cultureOfCountry(invasion.target));
        invasion.defender.position.set(tx+7, DEPTH, tz); invasion.defender.rotation.y=-Math.PI/2; worldGroup.add(invasion.defender);
        invasion.defenderShown=true; }
      armyUnit.position.set(tx-7, DEPTH, tz); armyUnit.rotation.y=Math.PI/2;
      const fa=armyUnit.userData.form, fd=invasion.defender.userData.form;
      fa.moving=false; fa.firing=true; fd.firing=true;
      fa.target=new THREE.Vector3(tx+7, DEPTH, tz); fd.target=new THREE.Vector3(tx-7, DEPTH, tz);
      showBattlePanel(invasion);
      hintEl.textContent=invasion.target+' başkentinde çatışma başladı!';
      if(cineEnabled()){
        const inv=invasion, w=inv.wonVisual, b=botById(ownerOf[inv.target]);
        playCinematic({ name:inv.prov, title:upName(inv.target)+' MUHAREBESİ',
          sub:upName(PI.byId[inv.prov].label)+' · '+upName(S.homeName||'')+'  ⚔  '+upName(b? b.name : inv.target), attFlag:flagFor(S.homeName), defFlag:flagFor(inv.target),
          advance:'ORDUMUZ İLERLİYOR', won:w, attColor:playerTeamColor(), defColor:inv.defColor, attCulture:cultureOfCountry(S.homeName), defCulture:cultureOfCountry(inv.target), scenario:inv.scenario, weather:inv.weather, seed:inv.seed,
          lossA: w ? Math.min(.85, inv.def0*.6/Math.max(1,inv.army0)) : .7, lossD: w ? .95 : .35,
          winSub:upName(inv.target)+' DÜŞTÜ', loseSub:'ORDUMUZ GERİ ÇEKİLİYOR',
          onDone:()=>{ if(invasion===inv && inv.phase==='battle') inv.battle=BATTLE_TIME; } });
      }
    }
    return;
  }

  if(invasion.phase==='battle'){
    const def=provDefense(invasion.prov);
    // casualties follow the (already rolled) outcome as the clash goes on
    const prog=Math.min(1, invasion.battle/BATTLE_TIME), won0=invasion.wonVisual;
    const lossA = won0 ? Math.min(.85, invasion.def0*.6/Math.max(1,invasion.army0)) : .7;
    armyUnit.userData.form.setCasualties(prog*lossA);
    if(invasion.defender) invasion.defender.userData.form.setCasualties(prog*(won0? .95 : .35));
    updateBattlePanel(invasion, prog, lossA);

    // effective strength: militarism + warlike/peaceful attack modifier (we are the attacker here)
    const ourPower = invasion.force * ideoWinBonus() * persAttackMult() * (1+techBonus());
    // win chance scales with the strength ratio (bigger army => higher chance, not a guarantee)
    const winChance = ourPower / (ourPower + def || 1);
    // run the 5-second clash, then resolve by probability
    invasion.battle+=dt;
    if(invasion.battle>=BATTLE_TIME){
      // the roll was made when the clash began
      if(invasion._roll==null) invasion._roll=Math.random();
      const won = invasion._roll < winChance;
      const target = invasion.target, prov=invasion.prov, pname=PI.byId[prov].name;
      if(won){
        // survivors hold the province they just took
        const surv=Math.max(0, Math.round(invasion.force-def*0.6));
        provGarrison[prov]=0; invasion.force=0; S.troops[prov]=(S.troops[prov]||0)+surv; syncArmy();
        hintEl.textContent=pname+' fethedildi! (kazanma şansı %'+Math.round(winChance*100)+')';
      } else {
        const surv=Math.round(invasion.force*0.3); invasion.force=0; addTroops(invasion.src, surv);
        hintEl.textContent=pname+' savunmayı başardı. Ordumuz büyük kayıp verip geri çekildi!';
      }
      if(invasion.defender){ disposeArmyGroup(invasion.defender); }
      finishBattlePanel(won);
      if(invasion.ship && invasion.returnPt){ invasion.ship.position.set(invasion.returnPt[0],SHIP_Y,invasion.returnPt[1]); }
      disposeArmyGroup(armyUnit); armyUnit=null; clearCapitalMarker(); invasion=null;
      if(won) openConquerChoice(target, prov);   // let the player decide: this province or the whole country
    }
  }
}

// ---- conquest choice (take all / colonize / pick regions) ----
const conquerModal=document.getElementById('conquerModal');
const regionBar=document.getElementById('regionBar');
let conquerTarget=null;
let regionMode=false;
let regionPicked=new Set();   // mesh indices chosen during pick-regions
let dimmed=[];                // meshes we darkened, with original colors

let conquerProv=null;
function openConquerChoice(name, prov){
  conquerTarget=name; conquerProv=prov;
  const p=PI.byId[prov], n=PI.byCountry[name].length;
  document.getElementById('conquerTitle').textContent=p.name+' fethedildi';
  document.getElementById('takeOne').textContent='Sadece bu bölgeyi al ('+p.label+')';
  document.getElementById('takeOne').style.display= n>1 ? '' : 'none';
  document.getElementById('takeAll').textContent= n>1 ? 'Bütün ülkeyi al ('+n+' bölge)' : 'Ülkeyi al';
  document.getElementById('conquerSub').textContent= n>1 ? 'Bölge bölge ilerlersen ordun bir arada kalır; bütün ülkeyi alırsan diğer bölgeler garnizonsuz kalır.' : 'Bu toprakla ne yapmak istersin?';
  conquerModal.classList.add('open');
}
document.getElementById('takeOne').onclick=()=>{
  conquerModal.classList.remove('open');
  if(conquerProv){ annexProvince(conquerProv); hintEl.textContent=PI.byId[conquerProv].name+' artık senin. Ülkenin geri kalanı düşmanda.'; }
  conquerTarget=null; conquerProv=null;
};
document.getElementById('rebelFight').onclick=()=>{ resolveRebellion(); };
document.getElementById('takeAll').onclick=()=>{
  conquerModal.classList.remove('open');
  if(conquerTarget){ annexCountry(conquerTarget); hintEl.textContent=conquerTarget+' tamamen imparatorluğuna katıldı.'; }
  conquerTarget=null; conquerProv=null;
};
document.getElementById('colonize').onclick=()=>{
  conquerModal.classList.remove('open');
  if(conquerTarget){ colonizeCountry(conquerTarget, conquerProv); hintEl.textContent=conquerTarget+' kolonin oldu (sana bağlı).'; }
  conquerTarget=null; conquerProv=null;
};
document.getElementById('pickRegions').onclick=()=>{
  conquerModal.classList.remove('open');
  startRegionPick(conquerTarget);
};

// "Sen Seç": darken everything except the conquered country; click its cells to take them
function startRegionPick(name){
  if(!name) return;
  regionMode=true; regionPicked=new Set();
  const keep=new Set(meshesByCountry[name]||[]);
  dimmed=[];
  for(const m of countryMeshes){
    if(keep.has(m)) continue;
    dimmed.push({m, c:m.material.color.clone()});
    m.material.color.multiplyScalar(0.18);  // darken the rest of the world
  }
  // make the conquered country's cells clearly highlighted
  (meshesByCountry[name]||[]).forEach(m=>{ m.userData._origColor=m.material.color.clone();
    m.material.color.set('#ffd35a'); });
  regionBar.classList.add('show');
  document.getElementById('regionInfo').textContent=name+': almak istediğin bölgelere tıkla';
}
function endRegionPick(){
  regionMode=false;
  // restore dimmed world colors
  dimmed.forEach(d=>d.m.material.color.copy(d.c)); dimmed=[];
  regionBar.classList.remove('show');
}
document.getElementById('regionConfirm').onclick=()=>{
  if(!conquerTarget){ endRegionPick(); return; }
  const name=conquerTarget;
  const cells=meshesByCountry[name]||[];
  let took=0; const takenMeshes=[];
  cells.forEach(m=>{
    if(regionPicked.has(m)){ m.material.color.copy(OWN_COLOR); m.userData.country=name; took++; takenMeshes.push(m); }
    else { if(m.userData._origColor) m.material.color.copy(m.userData._origColor); }
  });
  endRegionPick();
  if(took>0){
    // partial ownership: remember the exact taken cells; the rest stays independent
    ownedCountries.add(name); colonies.delete(name);
    partialOwned.add(name);
    partialCellsByCountry[name]=takenMeshes;
    redrawBorders();
    hintEl.textContent=name+' içinden '+took+' bölge aldın.';
  } else {
    hintEl.textContent='Hiç bölge seçilmedi.';
  }
  conquerTarget=null;
};

// ---- main menu + multiplayer lobby (shared storage) ----
const mainmenu=document.getElementById('mainmenu');
const lobbyEl=document.getElementById('lobby');
const playerId = 'p'+Math.random().toString(36).slice(2,8);
const playerName = 'Oyuncu-'+playerId.slice(1,4).toUpperCase();
let lobbyCode=null, lobbyPoll=null, isReady=false, gameStarted=false;

// build random cute "country balls" in the menu background
function buildCountryballs(){
  const bg=document.getElementById('ballbg'); if(!bg||bg.childElementCount) return;
  const palettes=[
    ['#e74c3c','#ffffff'],['#2980b9','#ffffff','#e74c3c'],['#27ae60','#ffffff'],
    ['#f1c40f','#e74c3c'],['#111','#e74c3c','#f1c40f'],['#2980b9','#f1c40f'],
    ['#e67e22','#ffffff','#27ae60'],['#9b59b6','#ffffff'],['#1abc9c','#ffffff'],
    ['#34495e','#ecf0f1'],['#c0392b','#ecf0f1','#2980b9'],['#16a085','#f1c40f']
  ];
  const N=16;
  for(let i=0;i<N;i++){
    const size=40+Math.random()*70;
    const pal=palettes[(Math.random()*palettes.length)|0];
    const vertical=Math.random()<0.5;
    const stops=pal.map((c,idx)=>{ const a=(idx/pal.length*100).toFixed(1), b=((idx+1)/pal.length*100).toFixed(1);
      return c+' '+a+'%, '+c+' '+b+'%'; }).join(', ');
    const ball=document.createElement('div'); ball.className='cball';
    ball.style.width=size+'px'; ball.style.height=size+'px';
    ball.style.left=(Math.random()*92)+'%'; ball.style.top=(Math.random()*88)+'%';
    ball.style.background='linear-gradient('+(vertical?'90deg':'180deg')+', '+stops+')';
    ball.style.animationDuration=(5+Math.random()*6)+'s';
    ball.style.animationDelay=(-Math.random()*6)+'s';
    ball.style.opacity=0.85;
    ball.innerHTML='<span class="eye l"></span><span class="eye r"></span>';
    bg.appendChild(ball);
  }
}

let pickingHome=false;
function startCountrySelection(){
  mainmenu.classList.remove('open');
  lobbyEl.classList.remove('open');
  if(!worldBuilt){ loadEra('2014'); return; }   // multiplayer defaults to modern map
  // no menu: pick your country by clicking it on the map
  pickingHome=true;
  document.body.classList.add('selecting');   // darken edges + hide side panels
  document.getElementById('exitBtn').classList.add('show');   // allow backing out during selection
  hintEl.textContent='Başlamak için haritadan bir ülkeye tıkla — orası senin ülken olacak.';
}
function endCountrySelectDim(){ document.body.classList.remove('selecting'); }

// single player
document.getElementById('playSolo').onclick=()=>{
  gameStarted=true;
  mainmenu.classList.remove('open'); document.getElementById('eraModal').classList.add('open');
};
document.getElementById('eraBack').onclick=()=>{ gameStarted=false; document.getElementById('eraModal').classList.remove('open'); mainmenu.classList.add('open'); };
document.getElementById('era2014').onclick=()=>{ document.getElementById('eraModal').classList.remove('open'); mainmenu.classList.remove('open'); loadEra('2014'); };
document.getElementById('era1810').onclick=()=>{ document.getElementById('eraModal').classList.remove('open'); mainmenu.classList.remove('open'); loadEra('1810'); };

// ---- lobby over PeerJS (serverless P2P; no storage service needed) ----
// Host creates a Peer with a short invite code as its id. Joiners connect to it.
// The HOST is authoritative: it keeps the roster and broadcasts it to everyone.
let peer=null, isHost=false, hostConn=null;     // joiner's connection to host
const hostConns=[];                              // host's connections to joiners
let roster={};                                   // playerId -> {name, ready}
const CODE_PREFIX='MBR-';                         // namespace to avoid id clashes on public PeerServer

// ========== shared-world multiplayer ==========
let MP=false;                                    // are we in a networked game?
const humanPlayers={};                           // pid -> {name, color, home, owned:[...]}
function playerColorHex(pid){
  const p=humanPlayers[pid]; if(p&&p.color) return p.color;
  const ids=Object.keys(humanPlayers).sort(); const i=ids.indexOf(pid);
  return PLAYER_COLORS[(i<0?0:i)%PLAYER_COLORS.length];
}
// paint the whole shared world from a state object {owners:{country:ownerId}, players:{pid:{name,home}}, bots:[{id,name,colorHex,owned:[]}]}
function applyWorldState(st){
  if(!st) return;
  // reset ownership visuals
  for(const k in ownerOf) delete ownerOf[k];
  ownedCountries.clear();
  // rebuild humans
  for(const pid in (st.players||{})){ humanPlayers[pid]=Object.assign(humanPlayers[pid]||{}, st.players[pid]); }
  // rebuild bots (visual only on joiners)
  if(st.bots){
    bots = st.bots.map(b=>({ id:b.id, name:b.name, color:new THREE.Color(b.colorHex), colorHex:b.colorHex,
      owned:new Set(b.owned||[]), money:b.money||0, pop:b.pop||0, army:b.army||0, aggr:0.4 }));
  }
  // apply owners
  const owners=st.owners||{};
  for(const name in owners){
    const oid=owners[name]; ownerOf[name]=oid;
    if(oid===playerId) ownedCountries.add(name);
  }
  // recolor every owned/tinted country
  restoreAllCountryColors();
  for(const name in owners){
    const oid=owners[name];
    if(oid&&oid.startsWith&&oid.startsWith('bot')){ const b=botById(oid); if(b) colorCountry(name,b.color); }
    else { colorCountry(name, new THREE.Color(playerColorHex(oid))); }
  }
  redrawBorders();
  if(rankOpen) renderRanking();
}
function restoreAllCountryColors(){
  for(const name in meshesByCountry) restoreCountryColor(name);
}
// host: assemble the full world state to broadcast
function buildWorldState(){
  const owners={};
  for(const name in ownerOf){ owners[name]=ownerOf[name]; }
  const players={};
  for(const pid in humanPlayers){ const p=humanPlayers[pid]; players[pid]={name:p.name,home:p.home,color:p.color}; }
  const botsOut=bots.map(b=>({id:b.id,name:b.name,colorHex:b.colorHex,owned:[...b.owned],money:Math.round(b.money),pop:Math.round(b.pop),army:Math.round(b.army)}));
  return {t:'world', owners, players, bots:botsOut};
}
function hostBroadcastWorld(){ if(isHost && MP){ hostBroadcast(buildWorldState()); } }
// ========== end shared-world ==========

function code6(){ let s=''; for(let i=0;i<6;i++) s+=Math.floor(Math.random()*10); return s; }
function setLobbyStatus(t){ const e=document.getElementById('lbStatus'); if(e) e.textContent=t||''; }

function renderRoster(){
  const ids=Object.keys(roster);
  document.getElementById('lbCount').textContent=ids.length;
  const box=document.getElementById('lbPlayers'); box.innerHTML='';
  ids.forEach(id=>{
    const p=roster[id];
    const row=document.createElement('div'); row.className='lb-player';
    const me=id===playerId?' (sen)':'';
    row.innerHTML='<span>'+(p.name||'Oyuncu')+me+'</span>'+
      (p.ready?'<span class="lb-ready">Hazır ✓</span>':'<span class="lb-wait">Bekliyor…</span>');
    box.appendChild(row);
  });
  const allReady = ids.length>0 && ids.every(id=>roster[id].ready);
  if(!document.getElementById('lbStatus').textContent.startsWith('Lobiye katıldın'))
    setLobbyStatus(allReady?'Herkes hazır — oyun başlıyor!':'Herkesin "Hazır" demesi bekleniyor…');
}

// host: broadcast a message to all joiners
function hostBroadcast(msg){ hostConns.forEach(c=>{ try{ c.send(msg); }catch(e){} }); }
// host: recompute roster + maybe start
function hostSync(){
  hostBroadcast({t:'roster', roster});
  renderRoster();
  const ids=Object.keys(roster);
  const allReady = ids.length>0 && ids.every(id=>roster[id].ready);
  if(allReady && !gameStarted){
    // assign a colour to every human player
    const sorted=ids.slice().sort();
    sorted.forEach((pid,i)=>{ humanPlayers[pid]={ name:roster[pid].name, color:PLAYER_COLORS[i%PLAYER_COLORS.length], home:null }; });
    hostBroadcast({t:'start', players:humanPlayers});
    MP=true; gameStarted=true; startCountrySelection();
  }
}

function makeTeam(){
  // open lobby UI immediately
  mainmenu.classList.remove('open'); lobbyEl.classList.add('open');
  document.getElementById('lobbyCode').textContent='...';
  document.getElementById('readyBtn').textContent='Hazır';
  document.getElementById('readyBtn').classList.add('mm-primary');
  setLobbyStatus('Lobi oluşturuluyor…');
  if(typeof Peer==='undefined'){ setLobbyStatus('Bağlantı kütüphanesi yüklenemedi (internet gerekli).'); return; }
  isHost=true; isReady=false;
  const code=code6();
  roster={}; roster[playerId]={ name:playerName, ready:false };
  let opened=false;
  peer=new Peer(CODE_PREFIX+code);
  // if the signalling server never responds, stop waiting and report it
  const t0=setTimeout(()=>{ if(!opened) setLobbyStatus('Lobi sunucusuna ulaşılamadı. İnternet/erişim engeli olabilir — tekrar dene.'); }, 9000);
  peer.on('open', id=>{
    opened=true; clearTimeout(t0);
    lobbyCode=code;
    document.getElementById('lobbyCode').textContent=code;
    setLobbyStatus('Lobi hazır — bu kodu arkadaşına gönder.');
    renderRoster();
  });
  peer.on('connection', conn=>{
    conn.on('open', ()=>{ hostConns.push(conn); });
    conn.on('data', d=>{
      if(d&&d.t==='join'){
        if(Object.keys(roster).length>=5 && !roster[d.id]){ try{ conn.send({t:'full'}); }catch(e){} return; }
        roster[d.id]={ name:d.name||'Oyuncu', ready:false }; conn._pid=d.id; hostSync();
      } else if(d&&d.t==='ready'){
        if(roster[d.id]) roster[d.id].ready=!!d.ready; hostSync();
      } else if(d&&d.t==='pickHome'){
        // a joiner chose their home country: grant it only if still free
        if(ownerOf[d.home]===undefined){
          ownerOf[d.home]=d.id; if(humanPlayers[d.id]) humanPlayers[d.id].home=d.home;
          colorCountry(d.home, new THREE.Color(playerColorHex(d.id)));
          redrawBorders(); hostBroadcastWorld();
        } else { try{ conn.send({t:'homeTaken', home:d.home}); }catch(e){} hostBroadcastWorld(); }
      } else if(d&&d.t==='conquer'){
        // a joiner conquered a country: assign it to them if they can (host is authoritative)
        const nm=d.name;
        if(ownerOf[nm]!==d.id){
          const prev=ownerOf[nm];
          if(prev&&prev.startsWith&&prev.startsWith('bot')){ const b=botById(prev); if(b) b.owned.delete(nm); }
          ownerOf[nm]=d.id;
          colorCountry(nm, new THREE.Color(playerColorHex(d.id)));
          redrawBorders(); hostBroadcastWorld();
        }
      }
    });
    conn.on('close', ()=>{ const i=hostConns.indexOf(conn); if(i>=0)hostConns.splice(i,1);
      if(conn._pid){ delete roster[conn._pid]; hostSync(); } });
  });
  peer.on('error', e=>{
    clearTimeout(t0);
    const msg=(e&&e.type)||'' ;
    if(msg==='unavailable-id'){ try{ peer.destroy(); }catch(_){} setTimeout(makeTeam,100); }   // code clash: retry with a new code
    else if(msg==='network'||msg==='server-error'||msg==='socket-error'||msg==='socket-closed'){
      setLobbyStatus('Lobi sunucusuna bağlanılamadı ('+msg+'). Ortam bağlantıyı engelliyor olabilir.');
    } else setLobbyStatus('Bağlantı hatası: '+(msg||'bilinmiyor'));
  });
}

function joinTeam(code){
  code=String(code).trim();
  if(!/^\d{6}$/.test(code)){ setLobbyStatus('Kod 6 haneli olmalı.'); return; }
  if(typeof Peer==='undefined'){ setLobbyStatus('Bağlantı kütüphanesi yüklenemedi (internet gerekli).'); return; }
  // open lobby UI immediately
  mainmenu.classList.remove('open'); lobbyEl.classList.add('open');
  document.getElementById('lobbyCode').textContent=code;
  document.getElementById('readyBtn').textContent='Hazır';
  document.getElementById('readyBtn').classList.add('mm-primary');
  setLobbyStatus('Lobiye bağlanılıyor…');
  isHost=false; isReady=false; lobbyCode=code;
  peer=new Peer();   // random id for joiner
  peer.on('open', ()=>{
    hostConn=peer.connect(CODE_PREFIX+code, {reliable:true});
    let connected=false;
    hostConn.on('open', ()=>{ connected=true;
      hostConn.send({t:'join', id:playerId, name:playerName});
      setLobbyStatus('Lobiye katıldın!');
    });
    hostConn.on('data', d=>{
      if(d&&d.t==='roster'){ roster=d.roster||{}; renderRoster(); }
      else if(d&&d.t==='start'){ if(!gameStarted){ if(d.players){ for(const pid in d.players) humanPlayers[pid]=d.players[pid]; } MP=true; gameStarted=true; startCountrySelection(); } }
      else if(d&&d.t==='world'){ applyWorldState(d); }
      else if(d&&d.t==='homeTaken'){ hintEl.textContent='O ülke başkası tarafından seçildi — başka bir ülke seç.'; pickingHome=true; }
      else if(d&&d.t==='full'){ setLobbyStatus('Lobi dolu (5/5).'); }
    });
    hostConn.on('close', ()=>{ setLobbyStatus('Bağlantı koptu (host ayrıldı).'); });
    hostConn.on('error', ()=>{ setLobbyStatus('Bu kodla lobiye ulaşılamadı. Kodu kontrol et.'); });
    setTimeout(()=>{ if(!connected) setLobbyStatus('Lobiye ulaşılamadı — kodu ve interneti kontrol et.'); }, 8000);
  });
  peer.on('error', e=>{
    if(e&&e.type==='peer-unavailable') setLobbyStatus('Bu kodla lobi bulunamadı.');
    else setLobbyStatus('Bağlantı hatası: '+(e&&e.type?e.type:'bilinmiyor'));
  });
}

function setReady(v){
  isReady=v;
  if(isHost){ if(roster[playerId]) roster[playerId].ready=v; hostSync(); }
  else if(hostConn){ try{ hostConn.send({t:'ready', id:playerId, ready:v}); }catch(e){} }
}
function leaveLobbyFn(){
  try{ if(peer) peer.destroy(); }catch(e){}
  peer=null; hostConn=null; hostConns.length=0; roster={}; isHost=false; isReady=false; lobbyCode=null;
  lobbyEl.classList.remove('open'); mainmenu.classList.add('open');
}

document.getElementById('makeTeam').onclick=()=>{ makeTeam(); };
document.getElementById('joinBtn').onclick=()=>{ joinTeam(document.getElementById('joinInput').value); };
document.getElementById('menuJoinBtn').onclick=()=>{ joinTeam(document.getElementById('menuJoinInput').value); };
document.getElementById('copyCode').onclick=()=>{
  if(!lobbyCode) return;
  try{ navigator.clipboard.writeText(lobbyCode); setLobbyStatus('Kod kopyalandı.'); }catch(e){}
};
document.getElementById('readyBtn').onclick=()=>{
  const v=!isReady;
  document.getElementById('readyBtn').textContent= v?'Hazır ✓ (iptal için tıkla)':'Hazır';
  document.getElementById('readyBtn').classList.toggle('mm-primary', !v);
  setReady(v);
};
document.getElementById('leaveLobby').onclick=()=>{ leaveLobbyFn(); };

// everything is declared now — start rendering and input
// ================= HUD: speed, toasts, action bar, shortcuts =================
let gameSpeed=1;
function setSpeed(v){
  gameSpeed=v;
  document.querySelectorAll('#speed button[data-speed]').forEach(b=>b.classList.toggle('on', +b.dataset.speed===v));
  document.body.classList.toggle('paused', v===0);
}
document.querySelectorAll('#speed button[data-speed]').forEach(b=>{ b.onclick=()=>setSpeed(+b.dataset.speed); });

// every status message written to the (hidden) hint line becomes a toast
const toastsEl=document.getElementById('toasts');
let lastToast=null;
function toast(text){
  if(!text || document.body.classList.contains('selecting')) return;
  const kind = /⚠️|Yetersiz|yıkıldı|💀|edemezsin|yok!|kuramaz|alınamadı|isyan/i.test(text) ? 'warn' : /fethedildi|kuruldu|üretildi|katıldı|bastırıldı|kaydedildi/i.test(text) ? 'good' : '';
  // countdowns and repeated messages update the newest toast instead of stacking
  if(lastToast && lastToast.isConnected && performance.now()-lastToast._t<3500 && lastToast.textContent.slice(0,14)===text.slice(0,14)){
    lastToast.textContent=text; lastToast.className='toast '+kind; lastToast._t=performance.now(); clearTimeout(lastToast._k); lastToast._k=setTimeout(()=>dropToast(lastToast), 4500); return;
  }
  const el=document.createElement('div'); el.className='toast '+kind; el.textContent=text; el._t=performance.now();
  toastsEl.appendChild(el); lastToast=el;
  while(toastsEl.children.length>4) toastsEl.firstChild.remove();
  el._k=setTimeout(()=>dropToast(el), kind==='warn'? 6500 : 4500);
}
function dropToast(el){ if(!el.isConnected) return; el.classList.add('out'); setTimeout(()=>el.remove(), 400); }
new MutationObserver(()=>toast(hintEl.textContent.trim())).observe(hintEl, { childList:true, characterData:true, subtree:true });

// action bar
const needs=(list, msg)=>{ if(list.length) return true; hintEl.textContent=msg; return false; };
document.getElementById('armyAct').onclick=()=>{ if(needs(bases,'⚠️ Ordu kurmak için önce bir Askeri Üs inşa et (İnşa → Askeri Üs).')) openArmyMenu(); };
document.getElementById('tankAct').onclick=()=>{ if(needs(garages, S.currentEra==='1810'? '⚠️ Top dökmek için önce bir Top Dökümhanesi inşa et.' : '⚠️ Tank üretmek için önce bir Garaj inşa et.')) openTankMenu(); };
document.getElementById('navyAct').onclick=()=>{ if(needs(shipyards,'⚠️ Gemi üretmek için kıyıya bir Tersane ve Liman inşa et.')) openShipMenu(shipyards[0]); };
document.getElementById('tradeAct').onclick=()=>{
  const on=!tradePanel.classList.contains('show'); tradePanel.classList.toggle('show', on); document.getElementById('tradeAct').classList.toggle('on', on);
  if(on){ if(!tradeOffers.length) rollTradeOffers(); renderTrade(); }
};
document.getElementById('taxAct').onclick=()=>{ const on=document.body.classList.toggle('tax-open'); document.getElementById('taxAct').classList.toggle('on', on); if(on) taxInput.focus(); };
// keep the action buttons' "on" state in sync with their panels
new MutationObserver(()=>document.getElementById('buildBtn').classList.toggle('on', buildPanel.classList.contains('open'))).observe(buildPanel, { attributes:true, attributeFilter:['class'] });
new MutationObserver(()=>{ const on=document.getElementById('rankPanel').classList.contains('show'); document.getElementById('rankBtn').classList.toggle('on', on); document.body.classList.toggle('rank-open', on); }).observe(document.getElementById('rankPanel'), { attributes:true, attributeFilter:['class'] });

// keyboard: Space pause, 1/2/3 speed, B build, Esc closes the topmost panel
document.addEventListener('keydown', e=>{
  if(cine && e.key==='Escape'){ endCinematic(); return; }
  if(movePick && e.key==='Escape'){ cancelMovePick(); hintEl.textContent='Asker taşıma iptal edildi.'; return; }
  if(e.target.matches && e.target.matches('input, textarea') || e.metaKey || e.ctrlKey) return;
  if(!document.body.classList.contains('ingame')) return;
  const k=e.key.toLowerCase();
  if(k===' '){ e.preventDefault(); setSpeed(gameSpeed===0? 1 : 0); }
  else if(k==='1') setSpeed(1); else if(k==='2') setSpeed(2); else if(k==='3') setSpeed(4);
  else if(k==='b' && (view==='world' || document.body.classList.contains('region-own'))) document.getElementById('buildBtn').click();
  else if(k==='escape'){
    if(buildType || buildPanel.classList.contains('open')){ document.querySelector('.bopt[data-b="none"]').click(); }
    else if(document.body.classList.contains('tax-open')) document.getElementById('taxAct').click();
    else if(ctxPanel.classList.contains('show')) hideInvade();
    else if(provPanel.classList.contains('show')) hideProvince();
    else if(tradePanel.classList.contains('show')) document.getElementById('trClose').click();
    else if(rankOpen) document.getElementById('rankBtn').click();
    else if(view==='region') exitRegion();
  }
});

// hover tooltip follows the cursor
const hoverBox=document.getElementById('hoverInfo');
renderer.domElement.addEventListener('pointermove', e=>{ hoverBox.style.transform='translate('+(e.clientX+16)+'px,'+(e.clientY+14)+'px)'; });

// ================= units & battles on the world map =================
const UNIT_SCALE=2.2;     // soldier models are region-sized; this makes them readable on the world map
const SHIP_Y=-0.6;
const playerTeamColor=()=> MP? playerColorHex(playerId) : '#2e8bff';
function ownerColorOf(name){
  if(ownedCountries.has(name)) return playerTeamColor();
  const oid=ownerOf[name], b=oid && botById(oid);
  return b? b.colorHex : (oid && humanPlayers[oid])? playerColorHex(oid) : '#d9d2bf';
}
function makeShip(era){
  const g=new THREE.Group();
  if(PREFABS['ship_'+era]){ const s=prefabGroup('ship_'+era, { team:playerTeamColor() }); s.rotation.y=-Math.PI/2; s.scale.setScalar(1.66); s.position.y=.25; g.add(s); return g; }   // Blender ship, bow along +z
  const m=new THREE.Mesh(shipGeo(era, playerTeamColor()), UNIT_MAT);
  m.scale.setScalar(1.3); m.castShadow=true; g.add(m); return g;
}
// a marching block of soldiers (+ tanks in 2014, cannons in 1810), centred on the group origin, facing +z
function makeArmyGroup(team, strength, tanks, count, culture){
  const g=new THREE.Group();
  const n=count || Math.max(8, Math.min(30, Math.round(strength/700)));
  const veh = S.currentEra==='2014' ? Math.min(4, Math.ceil((tanks||0)/3)) : Math.min(3, Math.floor(strength/15000));
  const form=new Formation(g, { era:S.currentEra, team, count:n, cols:6, vehicles:veh, scale:UNIT_SCALE, culture:culture||cultureOfCountry(S.homeName) });
  const depth=(Math.ceil(n/6)-1)*.62*1.05 + (veh? 1.4 : 0);
  form.group.position.z=depth*UNIT_SCALE/2;
  g.userData.form=form;
  return g;
}
function disposeArmyGroup(g){ if(!g) return; worldGroup.remove(g); if(g.userData.form) g.userData.form.dispose(); }

// live battle panel for the player's invasion
const battlePanel=document.getElementById('battlePanel');
let _bpHide=null;
function showBattlePanel(inv){
  clearTimeout(_bpHide);
  battlePanel.className='show';
  document.getElementById('bpTitle').textContent=inv.target+' cephesi';
  document.getElementById('bpAFlag').innerHTML=S.homeName? flagFor(S.homeName) : '';
  document.getElementById('bpDFlag').innerHTML=flagFor(inv.target);
  const oid=ownerOf[inv.target], b=oid && botById(oid);
  document.getElementById('bpDName').textContent=b? b.name : inv.target;
  const mods=[];
  if(ideoWinBonus()!==1) mods.push(['up','Militarizm ×'+ideoWinBonus()]);
  const pm=persAttackMult(); if(pm!==1) mods.push([pm>1?'up':'dn', (S.personality==='warlike'?'Savaşçı':'Barışçıl')+' saldırı ×'+pm]);
  mods.push(['', 'Kazanma şansı %'+Math.round(inv.winChance0*100)]);
  if(S.tankCount) mods.push(['up', S.tankCount+(S.currentEra==='2014'?' tank':' top')]);
  if(techBonus()>0) mods.push(['up', goodLabel('tech', S.currentEra)+' +%'+Math.round(techBonus()*100)]);
  document.getElementById('bpMods').innerHTML=mods.map(([c,t])=>'<span class="'+c+'">'+t+'</span>').join('');
}
function updateBattlePanel(inv, prog, lossA){
  const a=inv.army0*(1-prog*lossA), d=inv.def0*(1-prog*(inv.wonVisual? .95 : .35));
  document.getElementById('bpA').textContent=Math.round(a).toLocaleString('tr-TR');
  document.getElementById('bpD').textContent=Math.round(d).toLocaleString('tr-TR');
  document.getElementById('bpTug').style.width=(a/(a+d||1)*100).toFixed(1)+'%';
  const left=Math.max(0, Math.ceil(BATTLE_TIME-inv.battle));
  document.getElementById('bpTime').textContent='● Çatışma sürüyor · 0:'+String(left).padStart(2,'0');
}
function finishBattlePanel(won){
  battlePanel.className='show '+(won?'won':'lost');
  document.getElementById('bpTime').textContent= won? 'Zafer!' : 'Yenilgi';
  _bpHide=setTimeout(()=>{ battlePanel.className=''; }, 2600);
}
document.getElementById('bpWatch').onclick=()=>{ if(invasion) enterRegion(invasion.prov); };

// bots' wars: no soldiers on the map, just a pulsing red alert at the front; clicking it replays the fight
const warAlertsEl=document.getElementById('warAlerts');
const botBattles=[];   // active alerts
function showBotBattle(bot, target, win){
  const to=capitalXZ(target); if(!to) return;
  if(botBattles.length>=6) dropWarAlert(botBattles[0]);
  const oid=ownerOf[target], ob=oid && botById(oid);
  const a={ bot:{ name:bot.name, colorHex:bot.colorHex, home:[...bot.owned][0]||'' }, target, win,
    defColor:ownerColorOf(target), defName: ob? ob.name : target,
    pos:new THREE.Vector3(to[0], DEPTH+3, to[1]), until:performance.now()+30000 };
  const el=document.createElement('button'); el.type='button'; el.className='war-alert';
  el.innerHTML='<i>⚔</i><span><b>Savaş!</b> '+bot.name+' → '+target+'</span><small>izle</small>';
  el.title=bot.name+', '+target+' ülkesine saldırdı. Tıkla ve savaşı izle.';
  el.onclick=e=>{ e.stopPropagation(); watchBotBattle(a); };
  warAlertsEl.appendChild(el); a.el=el; botBattles.push(a);
  // a war right next to our lands also gets a toast
  const near=myProvs().some(p=>Math.hypot(p.center[0]-to[0], p.center[1]-to[1])<45);   // a neighbour's war
  if(near && !ownedCountries.has(target)) hintEl.textContent='⚔️ Yakında savaş çıktı: '+bot.name+', '+target+' ülkesine saldırdı!';
}
function dropWarAlert(a){ a.el.remove(); const i=botBattles.indexOf(a); if(i>=0) botBattles.splice(i,1); }
function clearBotBattles(){ for(const a of botBattles.slice()) dropWarAlert(a); }
function watchBotBattle(a){
  dropWarAlert(a);
  const prov=capitalProv(a.target); if(!prov) return;
  playCinematic({ name:prov.id, title:upName(a.target)+' MUHAREBESİ', sub:upName(a.bot.name)+'  ⚔  '+upName(a.defName),
    attFlag:flagFor(a.bot.home), defFlag:flagFor(a.target), advance:upName(a.bot.name)+' SALDIRIYOR', won:a.win, attColor:a.bot.colorHex, defColor:a.defColor, attCulture:cultureOfCountry(a.bot.home), defCulture:cultureOfCountry(a.target),
    lossA: a.win ? .3 : .7, lossD: a.win ? .95 : .35, verdict: a.win ? upName(a.bot.name)+' KAZANDI' : 'SAVUNMA TUTTU', neutral:true,
    winSub:upName(a.target)+' DÜŞTÜ', loseSub:'SALDIRI PÜSKÜRTÜLDÜ' });
}
function updateWarAlerts(){
  const now=performance.now(), w=wrap.clientWidth, h=wrap.clientHeight, v=new THREE.Vector3(), show=view==='world';
  warAlertsEl.style.display=show?'':'none';
  for(const a of botBattles.slice()){
    if(now>a.until){ dropWarAlert(a); continue; }
    if(!show) continue;
    v.copy(a.pos); worldGroup.localToWorld(v); v.project(camera);
    const on=v.z<1 && Math.abs(v.x)<1.02 && Math.abs(v.y)<1.02;
    a.el.style.display=on?'':'none';
    if(on) a.el.style.transform='translate('+((v.x*.5+.5)*w)+'px,'+((-v.y*.5+.5)*h)+'px) translate(-50%,-50%)';
  }
}

const armyLabel=document.getElementById('armyLabel');
let _pvRefresh=0;
function updateWorldUnits(rdt){
  const adt = gameSpeed>0 ? rdt*Math.min(gameSpeed,2) : 0;   // frozen while paused
  if(armyUnit && armyUnit.userData.form) armyUnit.userData.form.update(adt, worldFx);
  if(invasion && invasion.defender && invasion.defender.userData.form) invasion.defender.userData.form.update(adt, worldFx);
  updateWarAlerts();
  if(provLinesGroup) provLinesGroup.visible = !pickingHome;   // province lines matter only once the game is running
  if(garrisonDirty && PI) refreshGarrisons();
  updateTroopMoves(rdt, adt);
  updateGarrisonLabels();
  if(selectedProv && (_pvRefresh+=rdt)>1){ _pvRefresh=0; fillProvince(); }
  worldFx.update(rdt);
  // strength label over the marching army
  const show=armyUnit && armyUnit.visible && view==='world';
  armyLabel.style.display=show?'flex':'none';
  if(show){
    const v=new THREE.Vector3(armyUnit.position.x, DEPTH+6, armyUnit.position.z); worldGroup.localToWorld(v); v.project(camera);
    armyLabel.style.transform='translate('+((v.x*.5+.5)*wrap.clientWidth)+'px,'+((-v.y*.5+.5)*wrap.clientHeight)+'px) translate(-50%,-100%)';
    armyLabel.querySelector('span').textContent='🪖 '+fmtK(S.army);
  }
}

// ================= province panel & troop movement =================
let selectedProv=null, movePick=null;
const provPanel=document.getElementById('provPanel'), pvMoveN=document.getElementById('pvMoveN');
function showProvince(pid){
  selectedProv=pid; fillProvince(true); provPanel.classList.add('show');
}
function hideProvince(){ selectedProv=null; provPanel.classList.remove('show', 'in-rv'); cancelMovePick(); }
document.getElementById('rhManage').onclick=()=>{ if(regionName){ showProvince(regionName); provPanel.classList.add('in-rv'); } };
function fillProvince(resetSlider){
  const p=PI.byId[selectedProv]; if(!p) return;
  const d=devInfo(p.id), n=S.troops[p.id]||0, bs=placedBuildings.map(g=>g.userData.buildRec).filter(r=>r && r.prov===p.id);
  document.getElementById('pvFlag').innerHTML=flagFor(p.country);
  document.getElementById('pvName').textContent=p.label;
  document.getElementById('pvSub').textContent=p.country+(p.capital? ' · başkent' : '');
  if(ownsProv(p.id)){   // ours: the settlement (village → town → city), grown with the upgrade button
    const l=settleOf(p.id), u=upgradeLabel(p.id);
    document.getElementById('pvDevName').textContent=SETTLE_NAMES[l]+' (seviye '+(l+1)+'/'+(SETTLE_MAX+1)+')';
    document.getElementById('pvDevPts').textContent='';
    document.getElementById('pvDevBar').style.width=(l/SETTLE_MAX*100)+'%';
    document.getElementById('pvDevNext').textContent=u? 'Sonraki: '+u.next+' · '+costText(u.cost) : 'En yüksek seviye';
  } else {
    document.getElementById('pvDevName').textContent=d.name+' (seviye '+(d.level+1)+'/5)';
    document.getElementById('pvDevPts').textContent=d.pts+' puan';
    document.getElementById('pvDevBar').style.width=(d.next? (d.pts-d.prev)/(d.next-d.prev)*100 : 100)+'%';
    document.getElementById('pvDevNext').textContent=d.next? (d.next-d.pts)+' puan sonra '+d.nextName : 'En yüksek seviye';
  }
  refreshUpgradeUI();
  document.getElementById('pvTroops').textContent=n.toLocaleString('tr-TR');
  document.getElementById('pvBuild').textContent=bs.length? bs.length+' ('+[...new Set(bs.map(r=>b_label(r.type)))].slice(0,3).join(', ')+(new Set(bs.map(r=>r.type)).size>3?'…':'')+')' : 'yok';
  document.getElementById('pvTax').textContent='+%'+Math.round(d.level*3);
  pvMoveN.max=n; pvMoveN.step=n>=1000? 100 : 1; if(resetSlider || +pvMoveN.value>n) pvMoveN.value=n;
  document.getElementById('pvMoveLbl').textContent=(+pvMoveN.value).toLocaleString('tr-TR');
  document.getElementById('pvMove').style.display= n>0 ? '' : 'none';
  document.getElementById('pvRecruit').style.display= provsWith('base').includes(p.id) ? '' : 'none';
  const sp=specOf(p.id), box=document.getElementById('pvSpec');
  box.style.display= ownsProv(p.id) ? '' : 'none';
  box.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.spec===sp));
  document.getElementById('pvSpecDesc').textContent= sp? SPECS[sp].icon+' '+SPECS[sp].name+' bölgesi: '+SPECS[sp].desc : 'Bir uzmanlık seç ('+SPEC_COST+' 💰). Bölgedeki binalar bu alanda daha verimli çalışır.';
}
document.querySelectorAll('#pvSpec button').forEach(b=>b.onclick=()=>{
  const id=selectedProv, k=b.dataset.spec; if(!id || !ownsProv(id) || specOf(id)===k) return;
  if(S.money<SPEC_COST){ hintEl.textContent='Uzmanlık değiştirmek için '+SPEC_COST+' para gerekli.'; return; }
  S.money-=SPEC_COST; updateMoney(); S.spec[id]=k; _prod=null;
  hintEl.textContent=PI.byId[id].label+' artık bir '+SPECS[k].name.toLocaleLowerCase('tr')+' bölgesi: '+SPECS[k].desc+'.';
  fillProvince(false);
});
pvMoveN.oninput=()=>{ document.getElementById('pvMoveLbl').textContent=(+pvMoveN.value).toLocaleString('tr-TR'); };
document.getElementById('pvClose').onclick=()=>hideProvince();
document.getElementById('pvRegion').onclick=()=>{ const id=selectedProv; hideProvince(); if(id) enterRegion(id); };
document.getElementById('pvBuildHere').onclick=()=>{ const id=selectedProv; hideProvince(); if(id) enterRegion(id).then(()=>{ if(!buildPanel.classList.contains('open')) document.getElementById('buildBtn').click(); }); };
document.getElementById('pvRecruit').onclick=()=>openArmyMenu(selectedProv);
document.getElementById('pvUpgrade').onclick=()=>upgradeSettlement(selectedProv);
document.getElementById('pvMoveBtn').onclick=()=>{
  const n=+pvMoveN.value; if(n<=0){ hintEl.textContent='Taşınacak asker sayısını seç.'; return; }
  movePick={ from:selectedProv, n }; document.body.classList.add('pick-move');
  hintEl.textContent='🪖 '+n.toLocaleString('tr-TR')+' asker için hedef bölgene tıkla (Esc: iptal).';
};
function cancelMovePick(){ movePick=null; document.body.classList.remove('pick-move'); }
function finishMovePick(pid){
  const mp=movePick; cancelMovePick();
  if(!pid || !ownsProv(pid) || pid===mp.from){ hintEl.textContent='Asker taşıma iptal: kendi başka bir bölgene tıklamalısın.'; return; }
  startTroopMove(mp.from, pid, mp.n);
}
// soldiers march from one of our provinces to another (by sea only if we have ships)
function startTroopMove(from, to, n){
  const a=PI.byId[from], b=PI.byId[to]; n=Math.min(n, S.troops[from]||0); if(n<=0) return false;
  const sea=overseasBetween(a.center[0], a.center[1], b.center[0], b.center[1]);
  if(sea && ships.length===0){ hintEl.textContent='⚠️ '+b.name+' denizin öbür yanında: asker taşımak için gemi gerekir.'; return false; }
  S.troops[from]-=n; if(S.troops[from]<1) delete S.troops[from];
  const dx=b.center[0]-a.center[0], dz=b.center[1]-a.center[1], d=Math.hypot(dx,dz);
  const g=makeArmyGroup(playerTeamColor(), n, 0); g.position.set(a.center[0], DEPTH, a.center[1]); g.rotation.y=Math.atan2(dx,dz);
  g.userData.form.moving=true; worldGroup.add(g);
  troopMoves.push({ from, to, n, g, t:0, dur:Math.max(1.5, d/11) }); syncArmy();
  hintEl.textContent='🪖 '+n.toLocaleString('tr-TR')+' asker '+b.label+' bölgesine yürüyor…';
  if(selectedProv) fillProvince();
  return true;
}
function updateTroopMoves(rdt, adt){
  for(let i=troopMoves.length-1; i>=0; i--){
    const m=troopMoves[i], a=PI.byId[m.from], b=PI.byId[m.to];
    m.t+=rdt*gameSpeed; const k=Math.min(1, m.t/m.dur);
    m.g.position.set(a.center[0]+(b.center[0]-a.center[0])*k, DEPTH, a.center[1]+(b.center[1]-a.center[1])*k);
    m.g.userData.form.update(adt, worldFx);
    if(k>=1){
      disposeArmyGroup(m.g); troopMoves.splice(i,1);
      const dest = ownsProv(m.to) ? m.to : ownsProv(m.from) ? m.from : null;   // destination lost meanwhile: turn back
      if(dest){ S.troops[dest]=(S.troops[dest]||0)+m.n; hintEl.textContent='🪖 '+m.n.toLocaleString('tr-TR')+' asker '+PI.byId[dest].label+' bölgesine ulaştı.'; }
      syncArmy(); if(selectedProv) fillProvince();
    }
  }
}
// a small standing block of soldiers + count label in every province we garrison
const garrisonViz={}, garrisonLabelsEl=document.getElementById('garrisonLabels');
function refreshGarrisons(){
  garrisonDirty=false;
  for(const id in garrisonViz) if(!(S.troops[id]>0)){ disposeArmyGroup(garrisonViz[id].g); garrisonViz[id].el.remove(); delete garrisonViz[id]; }
  for(const id in S.troops){
    const p=PI && PI.byId[id], n=S.troops[id]; if(!p) continue;
    const count=Math.max(3, Math.min(12, Math.round(n/1500)));
    let v=garrisonViz[id];
    if(v && v.count!==count){ disposeArmyGroup(v.g); v.el.remove(); v=null; }
    if(!v){
      const g=makeArmyGroup(playerTeamColor(), n, 0, count); g.position.set(p.center[0]+2.5, DEPTH, p.center[1]+2.5); g.rotation.y=Math.PI/4; worldGroup.add(g); g.userData.form.update(0);
      const el=document.createElement('div'); el.className='emp-label garr'; el.innerHTML='<span></span>'; garrisonLabelsEl.appendChild(el);
      v=garrisonViz[id]={ g, count, el, p };
    }
    v.el.querySelector('span').textContent='🪖 '+fmtK(n);
  }
}
function updateGarrisonLabels(){
  const show=view==='world' && dist<900, w=wrap.clientWidth, h=wrap.clientHeight, v=new THREE.Vector3();
  garrisonLabelsEl.style.display=show?'':'none'; if(!show) return;
  for(const id in garrisonViz){ const g=garrisonViz[id];
    v.set(g.p.center[0]+2.5, DEPTH+4, g.p.center[1]+2.5); worldGroup.localToWorld(v); v.project(camera);
    const on=v.z<1 && Math.abs(v.x)<1.05 && Math.abs(v.y)<1.05; g.el.style.display=on?'':'none';
    if(on) g.el.style.transform='translate('+((v.x*.5+.5)*w)+'px,'+((-v.y*.5+.5)*h)+'px) translate(-50%,-100%)'; }
}
function clearProvinceState(){
  for(const m of troopMoves) disposeArmyGroup(m.g); troopMoves.length=0;
  for(const id in garrisonViz){ disposeArmyGroup(garrisonViz[id].g); garrisonViz[id].el.remove(); delete garrisonViz[id]; }
  playerProvs.clear(); for(const k in provGarrison) delete provGarrison[k];
  S.troops={}; S.spec={}; hideProvince(); garrisonDirty=true;
}

// ================= time of day: follows the calendar (day → sunset → night → dawn) =================
// four in-game months are one "day", but it never gets dark: a warm morning glow, daylight, a gentle golden evening
function skyAt(days){
  const p=(((days%120)+120)%120)/120, ramp=(a,b,x)=>Math.max(0, Math.min(1, (x-a)/(b-a)));
  if(p<.1) return { s:(1-ramp(0,.1,p))*.45, n:0 };   // morning glow fades
  if(p<.7) return { s:0, n:0 };
  if(p<.85) return { s:ramp(.7,.85,p)*.55, n:0 };     // golden evening
  return { s:.55*(1-ramp(.85,1,p)), n:0 };            // back to daylight, no night
}
const DAYLIGHT={ sun:sun.color.clone(), si:sun.intensity, pos:sun.position.clone(), sky:worldHemi.color.clone(), gnd:worldHemi.groundColor.clone(), hi:worldHemi.intensity,
  bg:scene.background.clone(), ocean:ocean.material.color.clone(), fill:fill.intensity };
const C=h=>new THREE.Color(h), SUNSET={ sun:C('#ff9d57'), sky:C('#ffc39a'), gnd:C('#3a2440'), bg:C('#2d2338'), ocean:C('#24476a') },
  NIGHT={ sun:C('#9db4ff'), sky:C('#6f86b8'), gnd:C('#141a2e'), bg:C('#0b1020'), ocean:C('#10243e') };
const SUN_SET_POS=new THREE.Vector3(-900, 260, 300);
let lastSky={ s:-1, n:-1 };
const mix3=(day, set, night, sky, out)=>out.copy(day).lerp(set, sky.s).lerp(night, sky.n);
function applySky(sky){
  if(Math.abs(sky.s-lastSky.s)<.004 && Math.abs(sky.n-lastSky.n)<.004) return;
  lastSky=sky;
  mix3(DAYLIGHT.sun, SUNSET.sun, NIGHT.sun, sky, sun.color);
  sun.intensity=DAYLIGHT.si*(1+.15*sky.s)*(1-.6*sky.n);
  sun.position.copy(DAYLIGHT.pos).lerp(SUN_SET_POS, sky.s);
  mix3(DAYLIGHT.sky, SUNSET.sky, NIGHT.sky, sky, worldHemi.color); mix3(DAYLIGHT.gnd, SUNSET.gnd, NIGHT.gnd, sky, worldHemi.groundColor);
  worldHemi.intensity=DAYLIGHT.hi*(1-.18*sky.s)*(1-.35*sky.n);
  fill.intensity=DAYLIGHT.fill*(1-.6*sky.s);
  mix3(DAYLIGHT.bg, SUNSET.bg, NIGHT.bg, sky, scene.background); scene.fog.color.copy(scene.background);
  mix3(DAYLIGHT.ocean, SUNSET.ocean, NIGHT.ocean, sky, ocean.material.color);
  if(regionView && regionView.scene && !cine) regionView.setLighting(sky);
  const ic=document.getElementById('skyIcon'); if(ic) ic.textContent = sky.n>.5 ? '🌙' : sky.s>.4 ? '🌇' : '☀️';
}
const currentSky=()=>skyAt(S.gameDays);

// ================= names written across the land (political-map style) =================
// one label per empire (across all its countries) and per unclaimed country, sized and turned to fit the territory
let mapNamesGroup=null;
const nameTexCache=new Map();
function nameTexture(text){
  if(nameTexCache.has(text)) return nameTexCache.get(text);
  const c=document.createElement('canvas'), x=c.getContext('2d'), fs=72;
  x.font='800 '+fs+'px "Saira Condensed", "Arial Narrow", sans-serif';
  const sp=fs*.12, w=Math.ceil([...text].reduce((a,ch)=>a+x.measureText(ch).width+sp, 0))+24;
  c.width=w; c.height=fs+24; x.font='800 '+fs+'px "Saira Condensed", "Arial Narrow", sans-serif'; x.textBaseline='middle';
  x.lineJoin='round'; x.lineWidth=10; x.strokeStyle='rgba(20,16,12,.55)'; x.fillStyle='rgba(255,252,240,.92)';
  let px=12; for(const ch of text){ x.strokeText(ch, px, c.height/2); x.fillText(ch, px, c.height/2); px+=x.measureText(ch).width+sp; }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const r={ tex:t, aspect:c.width/c.height }; nameTexCache.set(text, r); return r;
}
// principal axis of a set of points -> where to centre the name, how long and at what angle
function fitName(points){
  let cx=0, cz=0; for(const [x,z] of points){ cx+=x; cz+=z; } cx/=points.length; cz/=points.length;
  let sxx=0, szz=0, sxz=0; for(const [x,z] of points){ const dx=x-cx, dz=z-cz; sxx+=dx*dx; szz+=dz*dz; sxz+=dx*dz; }
  let ang=.5*Math.atan2(2*sxz, sxx-szz);
  if(Math.abs(ang)>Math.PI/2.6) ang=0;   // keep names readable: never close to vertical
  const ux=Math.cos(ang), uz=Math.sin(ang); let lo=1e9, hi=-1e9, wlo=1e9, whi=-1e9;
  for(const [x,z] of points){ const a=(x-cx)*ux+(z-cz)*uz, b=-(x-cx)*uz+(z-cz)*ux; lo=Math.min(lo,a); hi=Math.max(hi,a); wlo=Math.min(wlo,b); whi=Math.max(whi,b); }
  return { cx, cz, ang, len:hi-lo, thick:whi-wlo };
}
function rebuildMapNames(){
  if(!PI) return;
  if(mapNamesGroup){ worldGroup.remove(mapNamesGroup); mapNamesGroup.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }); }
  mapNamesGroup=new THREE.Group(); mapNamesGroup.renderOrder=5;
  const groups=new Map();   // owner key -> { name, countries[] }
  for(const f of ALL_FEATURES||[]){
    const n=f.properties&&f.properties.name; if(!n || !PI.byCountry[n]) continue;
    const oid=ownedCountries.has(n) && !partialOwned.has(n) ? 'me' : ownerOf[n];
    const b=oid && oid!=='me' && botById(oid);
    const key=oid==='me' ? 'me' : b ? b.id : (oid && humanPlayers[oid]) ? oid : 'c:'+n;
    const label=oid==='me' ? (S.homeName||'Sen') : b ? b.name : (oid && humanPlayers[oid]) ? humanPlayers[oid].name : n;
    if(!groups.has(key)) groups.set(key, { label, countries:[] });
    groups.get(key).countries.push(n);
  }
  const placed=[];   // footprints of names already written, biggest territories first
  const order=[...groups.values()].map(g=>({ g, a:g.countries.reduce((t,c)=>t+PI.byCountry[c].reduce((u,p)=>u+p.area,0),0) })).sort((x,y)=>y.a-x.a).map(o=>o.g);
  for(const g of order){
    // only the main body of the territory: provinces near the biggest one (no names floating over the ocean)
    const provs=g.countries.flatMap(c=>PI.byCountry[c]), big=provs.reduce((a,b)=>b.area>a.area? b : a);
    const total=provs.reduce((t,p)=>t+p.area, 0), reach=Math.max(20, Math.sqrt(total)*1.3);
    const near=provs.filter(p=>Math.hypot(p.center[0]-big.center[0], p.center[1]-big.center[1])<reach);
    const pts=[]; for(const p of near) for(const r of p.ringsXZ) for(let i=0;i<r.length;i+=Math.max(1, r.length>>6)) pts.push(r[i]);
    if(pts.length<3) continue;
    const fit=fitName(pts); if(fit.len<4) continue;
    const text=g.label.toLocaleUpperCase(/[ıİşŞğĞüÜöÖçÇ]/.test(g.label)?'tr':'en'), nt=nameTexture(text);
    let L=fit.len*.55, Hh=L/nt.aspect; if(Hh>fit.thick*.28){ Hh=fit.thick*.28; L=Hh*nt.aspect; }
    if(Hh>9){ Hh=9; L=Hh*nt.aspect; }   // even the largest empires get a modest title
    if(L<3) continue;
    // skip a name that would cover one already written
    const c=Math.cos(fit.ang), sn=Math.sin(fit.ang), hx=Math.abs(c)*L/2+Math.abs(sn)*Hh/2, hz=Math.abs(sn)*L/2+Math.abs(c)*Hh/2;
    if(placed.some(q=>Math.abs(q.x-fit.cx)<q.hx+hx+.5 && Math.abs(q.z-fit.cz)<q.hz+hz+.5)) continue;
    placed.push({ x:fit.cx, z:fit.cz, hx, hz });
    const m=new THREE.Mesh(new THREE.PlaneGeometry(L, Hh).rotateX(-Math.PI/2), new THREE.MeshBasicMaterial({ map:nt.tex, transparent:true, depthWrite:false, opacity:.9 }));
    m.position.set(fit.cx, DEPTH+.4, fit.cz); m.rotation.y=-fit.ang; m.renderOrder=5; m.userData.size=L;
    mapNamesGroup.add(m);
  }
  worldGroup.add(mapNamesGroup);
}
// big names read best from far away; close up the land and units take over
function updateMapNames(){
  if(!mapNamesGroup) return;
  mapNamesGroup.visible=view==='world' && !pickingHome;
  for(const m of mapNamesGroup.children){ const sz=m.userData.size*worldGroup.scale.x; m.material.opacity=Math.max(0, Math.min(.9, (dist/sz-2.4)*1.5)); m.visible=m.material.opacity>.02; }
}

// ================= empire labels (name + army at each empire's capital) =================
const empireLabelsEl=document.getElementById('empireLabels');
let empireLabels=[], _labelT=0;
const fmtK=n=> n>=1e6? (n/1e6).toFixed(1).replace('.',',')+' M' : n>=1e4? Math.round(n/1e3)+'k' : Math.round(n).toLocaleString('tr-TR');
function rebuildEmpireLabels(){
  empireLabelsEl.innerHTML=''; empireLabels=[];
  const add=(home, color, name, armyFn, me)=>{
    const cap=home && capitalXZ(home); if(!cap) return;
    const el=document.createElement('div'); el.className='emp-label'+(me?' me':'');
    el.innerHTML='<i style="background:'+color+'"></i><b></b><span></span>';
    el.querySelector('b').textContent=name;
    empireLabelsEl.appendChild(el);
    empireLabels.push({ el, armyFn, pos:new THREE.Vector3(cap[0], DEPTH+4, cap[1]) });
  };
  if(S.homeName && ownedCountries.size) add(S.homeName, '#37e0ff', 'Sen', ()=>S.army, true);
  for(const b of bots){ if(b.owned.size){ const home=b.owned.has(b.home)? b.home : [...b.owned][0]; add(home, b.colorHex, b.name, ()=>b.army, false); } }
  _labelT=99;
}
function updateEmpireLabels(dt){
  _labelT+=dt; const refresh=_labelT>1; if(refresh) _labelT=0;
  const w=wrap.clientWidth, h=wrap.clientHeight, v=new THREE.Vector3();
  const fade=Math.max(0, Math.min(1, (2600-dist)/900));
  empireLabelsEl.style.opacity=fade;
  for(const l of empireLabels){
    v.copy(l.pos); worldGroup.localToWorld(v); v.project(camera);
    const on=v.z<1 && Math.abs(v.x)<1.05 && Math.abs(v.y)<1.05;
    l.el.style.display=on?'':'none'; if(!on) continue;
    l.el.style.transform='translate('+((v.x*.5+.5)*w)+'px,'+((-v.y*.5+.5)*h)+'px) translate(-50%,-100%)';
    if(refresh) l.el.querySelector('span').textContent='🪖 '+fmtK(l.armyFn());
  }
  // hide labels that collide with a more important one (player first, then bigger armies)
  const shown=empireLabels.filter(l=>l.el.style.display!=='none').sort((a,b)=>(b.el.classList.contains('me')-a.el.classList.contains('me'))||(b.armyFn()-a.armyFn()));
  const rects=[];
  for(const l of shown){ const r=l.el.getBoundingClientRect();
    if(rects.some(q=>r.left<q.right+4 && r.right>q.left-4 && r.top<q.bottom+2 && r.bottom>q.top-2)) l.el.style.display='none'; else rects.push(r); }
}

// ================= region view (close-up of one country) =================
const ENTER_DIST = 26;          // world camera distance below which zooming in opens the region view
let view = 'world';             // 'world' | 'region'
let regionView = null, regionName = null, regionSig = null, _viewBusy = false, worldTween = null;
const viewFade = document.getElementById('viewFade');
const CULTURE_TR = { islamic:'İslam mimarisi', eastasia:'Doğu Asya mimarisi', african:'Afrika köy mimarisi', european:'Avrupa mimarisi' };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fadeView(on, text){ viewFade.classList.toggle('show', on); document.getElementById('viewFadeText').textContent = text || ''; }

// country under a screen point (NDC -1..1)
function provAtScreen(nx, ny){
  ptr.set(nx, ny); ray.setFromCamera(ptr, camera);
  const h = ray.intersectObjects(countryMeshes, false)[0];
  return h ? h.object.userData.prov : null;
}

// everything the region generator needs to know about a country, as plain data
// everything the region generator needs to know about one province, as plain data
function regionInfoFor(idOrName){
  const p = resolveProv(idOrName); if(!p) return null;
  const country=p.country, cap0=capitalXZ(country);
  // the capital province is centred on the capital city itself
  const center = (p.capital && cap0 && provAt(cap0[0], cap0[1])===p) ? cap0.slice() : p.center.slice();
  const ll = projection.invert([center[0]+W/2, center[1]+H/2]) || [0, 30];
  const rnd = makeRng(hashStr('region|'+p.id));
  // province extent in map units -> region scale k
  let x0=1e9, x1=-1e9, z0=1e9, z1=-1e9;
  for(const r of p.ringsXZ) for(const [x,z] of r){ if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z; }
  const span=Math.max(x1-x0, z1-z0, 1), k=Math.min(24, Math.max(.6, (REGION_HALF*2-50)/span));   // the province fills most of the square
  // sea only where the region itself touches it: walk the region's own border and look just outside it
  let coast=null;
  { let sx=0, sz=0, n=0, dmin=1e9;
    for(const r of p.ringsXZ){ const st=Math.max(1, Math.floor(r.length/120));
      for(let i=0;i<r.length;i+=st){ const [x,z]=r[i], dx=x-center[0], dz=z-center[1], d=Math.hypot(dx,dz)||1;
        const o=Math.max(.35, span*.01);
        if(!isLandPtExact(x+dx/d*o, z+dz/d*o)){ sx+=dx/d; sz+=dz/d; n++; dmin=Math.min(dmin, d); } } }
    if(n>=2){ const l=Math.hypot(sx,sz)||1; coast={ dir:[sx/l, sz/l], dist:Math.min(dmin*k, REGION_HALF-16) }; } }
  // nearest real mountain range; otherwise some provinces are simply hilly highlands
  let mountains=null, md=1e9;
  for(const m of MTN){ const q=sceneXZ(m[0], m[1]); if(!q) continue;
    const d=Math.hypot(q[0]-center[0], q[1]-center[1]);
    if(d<md && d<span*.9+8){ md=d; mountains={ dir:[(q[0]-center[0])/(d||1), (q[1]-center[1])/(d||1)], dist:d*k }; } }
  if(!mountains && rnd()<.35){ const a=rnd()*Math.PI*2; mountains={ dir:[Math.cos(a), Math.sin(a)], dist:(22+rnd()*14)*REGION_HALF/55 }; }
  // owner of this province
  const isPlayer=ownsProv(p.id), oid=ownerOf[country], bot=oid && botById(oid);
  const ownerColor = isPlayer ? playerTeamColor() : bot ? bot.colorHex : (oid && humanPlayers[oid]) ? playerColorHex(oid) : '#d9d2bf';
  const ownerName = isPlayer ? 'Sen' : bot ? bot.name : (oid && humanPlayers[oid]) ? humanPlayers[oid].name : 'Bağımsız';
  // our buildings in this province, mapped into region coordinates
  const buildings=[];
  for(const g of placedBuildings){ const rec=g.userData.buildRec; if(!rec || rec.prov!==p.id) continue;
    const x=(rec.x-center[0])*k, z=(rec.z-center[1])*k;
    if(Math.abs(x)<REGION_HALF-7 && Math.abs(z)<REGION_HALF-7) buildings.push({ type:rec.type, x, z }); }
  // how built-up it is: ours from the settlement level (village → town → city), others from size and rank
  const settle=isPlayer? settleOf(p.id) : 0;
  const devLvl = isPlayer ? [0,1,2,2][settle] : p.capital ? 3 : Math.min(2, Math.floor(rnd()*2.2 + (p.area>300? .8 : 0)));
  const troops=isPlayer? (S.troops[p.id]||0) : 0;
  return { name:p.id, displayName:p.name, country, label:p.label, center, lon:ll[0], lat:ll[1], iso:ISO2[country] || null, era:S.currentEra, k, coast, mountains,
    isPlayer, ownerColor, ownerName, ownerCulture: isPlayer ? cultureOfCountry(S.homeName) : null, buildings, devLevel:devLvl, devName: isPlayer ? SETTLE_NAMES[settle] : DEV_LEVELS[devLvl][1], profile:(profileOf(country)||{}).mult,
    landmark: isPlayer ? settle>=2 : (p.capital || devLvl>=3), walls: isPlayer ? settle>=2 : (p.capital || devLvl>=3),
    // ours: no ready-made fields (every field is one we built), 3–5 cottages that grow with each upgrade, felled woods stay felled
    noFields: isPlayer, houses: isPlayer ? [3 + hashStr(p.id) % 3, 11, 22, 22][settle] : null, settle, cleared: isPlayer ? (S.cleared[p.id]||[]) : [],
    army: troops, vehicles: S.currentEra==='2014' ? Math.min(3, Math.ceil(S.tankCount/3)) : Math.min(3, Math.floor(troops/15000)) };
}

async function enterRegion(name){
  if(view !== 'world' || _viewBusy || !worldBuilt) return;
  const prov=resolveProv(name); if(!prov) return; name=prov.id;   // accepts a province id or a country name
  const info = regionInfoFor(name); if(!info) return;
  _viewBusy = true;
  setHoverCountry(null); hideInvade();
  fadeView(true, name + ' bölgesi hazırlanıyor…');
  await sleep(350); await nextFrame();
  try{
    getRegionView();
    regionView.battleSource = regionBattleState;
    const sig = name + '|' + info.era + '|' + info.ownerColor + '|' + info.settle + '|' + info.cleared.length + '|' + info.buildings.map(b => b.type + b.x.toFixed(1)).join(',')
      + '|' + Math.round(info.army/400) + '|' + (regionBattleState(name) ? 'battle' : '');
    if(sig !== regionSig || !regionView.scene){ regionView.build(info); regionSig = sig; }
    regionView.setLighting(currentSky());
  }catch(e){
    console.error(e); fadeView(false); _viewBusy = false; hintEl.textContent = 'Bölge oluşturulamadı: ' + e.message; return;
  }
  const ri = regionView.info;
  regionView.resize(wrap.clientWidth, wrap.clientHeight);
  view = 'region'; regionName = name; document.body.classList.add('in-region');
  document.body.classList.toggle('region-own', !!ri.isPlayer);
  if(ri.isPlayer && buildType) regionView.setGhost(buildType);
  document.getElementById('rhName').textContent = ri.displayName;
  document.getElementById('rhSub').textContent = regionSubtitle(name, ri);
  regionView.activate(); refreshUpgradeUI();
  fadeView(false); _viewBusy = false;
}
function regionSubtitle(name, ri){
  return ri.devName + ' · ' + ri.biomeLabel + ' · ' + CULTURE_TR[ri.culture] + ' · ' + ri.era + ' · ' + ri.ownerName + (specOf(name)? ' · ' + SPECS[specOf(name)].icon + ' ' + SPECS[specOf(name)].name + ' bölgesi' : '');
}
function exitRegion(){
  if(view !== 'region' || _viewBusy) return;
  _viewBusy = true; fadeView(true, '');
  setTimeout(() => {
    leaveRegionNow();
    const cap = regionName && PI.byId[regionName] && PI.byId[regionName].center;
    if(cap){ target.set(cap[0]*worldGroup.scale.x, 0, cap[1]*worldGroup.scale.z); }
    dist = ENTER_DIST + 8; place();
    worldTween = { from:dist, to:220, t:0, dur:.9 };
    fadeView(false); _viewBusy = false;
  }, 300);
}
function getRegionView(){
  if(!regionView) regionView = new RegionView(renderer, { post, env:skyEnv, keys, labelsEl:document.getElementById('regionLabels'), onExit:() => exitRegion() });
  return regionView;
}

// ================= battle cutscene (full screen, game paused) =================
const SHOTS=[2.8, 3.0, 3.0, 2.8, 3.2];   // establishing, advance, clash orbit, front line, verdict
// every battle gets a plan of attack and weather, so no two look the same
const SCENARIOS=['frontal','flank','charge','siege'], WEATHERS=['clear','clear','fog','rain','dusk'];
const SCEN_TR=era=>({ frontal:'CEPHEDEN TAARRUZ', flank:'KANATTAN SARMA', charge: era==='2014'? 'ZIRHLI HÜCUM' : 'SÜVARİ HÜCUMU', siege:'KUŞATMA' });
const WEATHER_TR={ clear:'', fog:'SİSLİ SABAH', rain:'YAĞMURLU GÜN', dusk:'GÜN BATIMI' };
const pickBattleStyle=()=>({ scenario:SCENARIOS[Math.floor(Math.random()*SCENARIOS.length)], weather:WEATHERS[Math.floor(Math.random()*WEATHERS.length)], seed:Math.random() });
const CINE_LEN=SHOTS.reduce((a,b)=>a+b, 0);
const cineEl=document.getElementById('cine');
let cine=null;
const cineQueue=[];
const upName=n=> n.toLocaleUpperCase(/[ıİşŞğĞüÜöÖçÇ]/.test(n) ? 'tr' : 'en');
function cineEnabled(){ try{ return localStorage.getItem('mbr-cinematics')!=='off'; }catch(e){ return true; } }
document.getElementById('cineOff').onchange=e=>{ try{ localStorage.setItem('mbr-cinematics', e.target.checked ? 'off' : 'on'); }catch(_){} };
document.getElementById('cineSkip').onclick=()=>endCinematic();
// how far the fight has gone at cutscene time t: armies close in during shot 2, fight through shots 3–4
function cineProg(t){
  const a=SHOTS[0], b=a+SHOTS[1], c=b+SHOTS[2]+SHOTS[3];
  return t<a ? 0 : t<b ? .18*(t-a)/SHOTS[1] : t<c ? .18+.82*(t-b)/(c-b) : 1;
}
async function playCinematic(c){
  if(cine){ if(cineQueue.length<2) cineQueue.push(c); return; }
  cine=c; c.t=0; c.running=false; c.prevSpeed=gameSpeed; gameSpeed=0;
  if(!c.scenario) Object.assign(c, pickBattleStyle());
  c.state={ prog:0, lossA:c.lossA, lossD:c.lossD, won:c.won, attColor:c.attColor, defColor:c.defColor, attCulture:c.attCulture, defCulture:c.defCulture, scenario:c.scenario, weather:c.weather, seed:c.seed };
  if(view==='region') leaveRegionNow();
  document.getElementById('ccA').innerHTML=c.attFlag; document.getElementById('ccD').innerHTML=c.defFlag;
  document.getElementById('ccTitle').textContent=c.title;
  document.getElementById('ccSub').textContent=calDate.textContent.toLocaleUpperCase('tr')+(WEATHER_TR[c.weather]? ' · '+WEATHER_TR[c.weather] : '')+' · '+c.sub;
  document.getElementById('cineOff').checked=!cineEnabled();
  cineEl.className='card'; document.body.classList.add('cinematic');
  const t0=performance.now();
  await nextFrame();
  try{
    const rv=getRegionView(); rv.battleSource=regionBattleState;
    rv.build(regionInfoFor(c.name)); regionSig=null;
    if(c.weather!=='dusk') rv.setLighting(currentSky());
    rv.resize(wrap.clientWidth, wrap.clientHeight);
    view='region'; regionName=c.name; document.body.classList.add('in-region');
    rv.activate(); rv.setCinematic(true); rv.cineFrame(0, 0, 0);
  }catch(e){ console.error(e); c.t=CINE_LEN; c.running=true; endCinematic(); return; }
  await sleep(Math.max(0, 2200-(performance.now()-t0)));   // the title card also hides the scene build
  if(cine!==c) return;
  cineEl.className='bars'; c.running=true;
}
function updateCinematic(rdt){
  const c=cine; if(!c || !c.running || c.ending) return;
  c.t+=rdt;
  c.state.prog=cineProg(c.t); c.state.done=c.t>=CINE_LEN-SHOTS[4];
  let acc=0, shot=0; while(shot<SHOTS.length-1 && c.t>=acc+SHOTS[shot]){ acc+=SHOTS[shot]; shot++; }
  regionView.cineFrame(shot, Math.min(1, (c.t-acc)/SHOTS[shot]), c.t);
  const cap=[c.title, SCEN_TR(S.currentEra)[c.scenario]+' · '+c.advance, 'ÇATIŞMA', 'CEPHE HATTI', ''][shot], capEl=document.getElementById('cineCaption');
  if(capEl.textContent!==cap){ capEl.textContent=cap; capEl.classList.toggle('show', !!cap); }
  if(shot===4 && c.t-acc>.4 && !cineEl.classList.contains('result')){
    document.getElementById('crTitle').textContent=c.verdict || (c.won? 'ZAFER' : 'YENİLGİ');
    document.getElementById('crSub').textContent=c.won? c.winSub : c.loseSub;
    cineEl.classList.add('result'); if(!c.won && !c.neutral) cineEl.classList.add('lost');
  }
  if(c.t>=CINE_LEN) endCinematic();
}
async function endCinematic(){
  const c=cine; if(!c || c.ending) return; c.ending=true;
  fadeView(true, ''); await sleep(380);
  if(regionView) regionView.setCinematic(false);
  leaveRegionNow(); document.body.classList.remove('cinematic'); cineEl.className='';
  const cap=PI.byId[c.name] ? PI.byId[c.name].center : capitalXZ(c.name);
  if(cap){ target.set(cap[0]*worldGroup.scale.x, 0, cap[1]*worldGroup.scale.z); dist=110; place(); worldTween={ from:110, to:260, t:0, dur:1.2 }; }
  gameSpeed=c.prevSpeed; cine=null;
  if(c.onDone) c.onDone();
  fadeView(false);
  if(cineQueue.length) setTimeout(()=>playCinematic(cineQueue.shift()), 900);
}

// ---- building directly in the region view (own countries only) ----
function regionToWorld(rx, rz){ const c=regionView.info.center, k=regionView.info.k; return [c[0]+rx/k, c[1]+rz/k]; }
function regionLegal(type, rx, rz){
  const [wx, wz]=regionToWorld(rx, rz), p=provAt(wx, wz);
  if(!p || p.id!==regionName || !ownsProv(p.id)) return false;   // build inside this province only
  if(colonyAt(wx, wz) && (type==='port'||type==='shipyard'||type==='mine')) return false;
  if(type==='mine' && !resourceAtXZ(wx, wz)) return false;
  return S.money>=(COSTS[type]||0) && S.wood>=woodCost(type) && (type!=='city'||S.bread>=CITY_BREAD_COST) && (type!=='town'||S.bread>=TOWN_BREAD_COST);
}
// why the preview is red, in words
function regionWhy(type, g){
  if(g.why==='forest') return '🌲 Burada orman var — önce ağaçlara tıklayıp odunlarını topla, sonra inşa et.';
  if(g.why==='field') return '🌾 Bir tarlanın üstüne gelemez — biraz kaydır.';
  if(g.why==='building') return '🏠 Başka bir yapıyla birleşiyor — boş bir yer seç.';
  if(g.why==='coast') return '⚓ Liman ve iskele kıyıya, derin suyun hemen yanına kurulur.';
  if(g.why==='ground') return '⚠️ Zemin uygun değil — düz, kuru ve yoldan uzak bir yer seç.';
  const [wx, wz]=regionToWorld(g.x, g.z), p=provAt(wx, wz);
  if(!p || p.id!==regionName || !ownsProv(p.id)) return '⚠️ Yalnızca bu bölgenin sınırları içine inşa edebilirsin.';
  if(type==='mine' && !resourceAtXZ(wx, wz)) return '⛏️ Burada maden yatağı yok.';
  if(colonyAt(wx, wz) && (type==='port'||type==='shipyard'||type==='mine')) return '⚠️ Sömürgeye liman, tersane ve maden kurulamaz.';
  if(S.money<(COSTS[type]||0)) return '💰 Yetersiz para: '+b_label(type)+' '+COSTS[type]+' tutuyor.';
  if(S.wood<woodCost(type)) return '🪵 Yetersiz odun: '+b_label(type)+' için '+woodCost(type)+' odun gerekli (elinde '+Math.floor(S.wood)+').';
  return '⚠️ Buraya inşa edilemez.';
}
const ndcOf=e=>{ const r=renderer.domElement.getBoundingClientRect(); return [((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1]; };
let regionDown=null;
renderer.domElement.addEventListener('pointerdown', e=>{ if(view==='region' && e.button===0) regionDown={ x:e.clientX, y:e.clientY }; });
// our building under the cursor in the region view (its record), so clicking it opens what it produces
function regionBuildingAt(e){
  if(!regionView || !regionView.info || !regionView.info.isPlayer) return null;
  const g=regionView.pickGround(...ndcOf(e)); if(!g) return null;
  const { center, k }=regionView.info; let best=null, bd=1e9;
  for(const b of placedBuildings){ const r=b.userData.buildRec; if(!r || r.prov!==regionName) continue;
    const d=Math.hypot((r.x-center[0])*k-g.x, (r.z-center[1])*k-g.z); if(d<bd){ bd=d; best=r; } }
  return bd<3.2 ? best : null;
}
function openRegionBuilding(r){
  const prov=r.prov, mult=g=>{ const m=recMult(r, g); return m!==1? ' (×'+m.toFixed(2).replace(/\.?0+$/,'')+')' : ''; };
  if(r.type==='base') return openArmyMenu(prov);
  if(r.type==='garage') return openTankMenu(prov);
  if(r.type==='shipyard'){ const y=shipyards.find(s=>recOfGroup(s)===r); return openShipMenu(y||null); }
  const info={
    field:'🌾 Tarla: saniyede 1 ekmek'+mult('grain'), farm:'🚜 Çiftlik: yakındaki tarlaların verimini artırır', ranch:'🐄 Hayvancılık: et ve süt'+mult('livestock'),
    fishery:'🐟 Balıkçı limanı: balık'+mult('fish'), oilwell:'🛢️ Petrol kuyusu: petrol'+mult('oil'), factory:'⚙️ Sanayi fabrikası: demirden teknoloji'+mult('tech'),
    mine:'⛏️ Maden ocağı: '+((MINERALS[r.mineral]||{}).label||'maden')+(specGood(prov,'money')>1? ' (sanayi bölgesi ×1.5)' : ''), bank:'🏦 Banka: para limitini artırır',
    port:'⚓ Liman: gemiler buradan sefere çıkar', city:'🏙️ Şehir: nüfus +500', town:'🏘️ Kasaba: nüfus +250', choco:'🍫 Çikolata fabrikası: halkı mutlu eder',
  }[r.type];
  hintEl.textContent=(info||b_label(r.type))+(specOf(prov)? ' · '+SPECS[specOf(prov)].icon+' '+SPECS[specOf(prov)].name+' bölgesi' : '');
}
renderer.domElement.addEventListener('pointermove', e=>{
  if(view==='region' && !buildType && regionView){ renderer.domElement.style.cursor = regionBuildingAt(e) ? 'pointer' : ''; return; }
  if(view!=='region' || !buildType || !regionView || !regionView.ghost) return;
  regionGhost=regionView.updateGhost(...ndcOf(e), (x,z)=>regionLegal(buildType, x, z));
});
let regionGhost=null;
renderer.domElement.addEventListener('pointerup', e=>{
  if(view!=='region' || e.button!==0 || !regionDown) return;
  const moved=Math.hypot(e.clientX-regionDown.x, e.clientY-regionDown.y); regionDown=null;
  if(moved>6) return;
  if(!buildType){ const r=regionBuildingAt(e); if(r){ hideWoodPop(); openRegionBuilding(r); return; } offerWood(e); return; }
  if(!regionView.ghost) return;
  const g=regionView.updateGhost(...ndcOf(e), (x,z)=>regionLegal(buildType, x, z)); if(!g) return;
  if(!g.ok){ hintEl.textContent=regionWhy(buildType, g); return; }   // red preview: nothing gets built
  const [wx, wz]=regionToWorld(g.x, g.z), before=placedBuildings.length, type=buildType;
  placeBuilding({ x:wx, z:wz }, { fromRegion:true });
  if(placedBuildings.length>before){ regionView.addBuilding(type, g.x, g.z, g.rot); regionSig=null; }
});

// ---- woodcutting: click a wood in one of our regions → the villagers fell it (5 s) → wood (1810) / cleared land
const woodPop=document.getElementById('woodPop');
let woodPick=null;
function hideWoodPop(){ woodPop.classList.remove('show'); woodPick=null; if(regionView) regionView.highlightTrees(null); }
function offerWood(e){
  hideWoodPop();
  if(!regionView || !regionView.info || !regionView.info.isPlayer) return;
  const g=regionView.pickGround(...ndcOf(e)); if(!g) return;
  const trees=regionView.forestAt(g.x, g.z); if(!trees) return;
  if((regionView.jobs||[]).length>=3){ hintEl.textContent='🪓 Oduncuların hepsi şu an çalışıyor — biraz bekle.'; return; }
  woodPick={ trees, prov:regionName };
  regionView.highlightTrees(trees);
  const wood=trees.length*WOOD_PER_TREE, is1810=S.currentEra==='1810';
  document.getElementById('woodPopTitle').textContent=is1810? '🌲 Orman · '+trees.length+' ağaç' : '🌲 Koru · '+trees.length+' ağaç';
  document.getElementById('woodPopBtn').innerHTML=is1810? '🪓 Odun topla <b>+'+wood+' 🪵</b>' : '🪓 Ağaçları kes, alanı aç';
  const r=renderer.domElement.getBoundingClientRect();
  woodPop.style.left=Math.min(r.width-230, Math.max(8, e.clientX-r.left+12))+'px'; woodPop.style.top=Math.min(r.height-110, Math.max(8, e.clientY-r.top-20))+'px';
  woodPop.classList.add('show');
}
document.getElementById('woodPopBtn').onclick=()=>{
  if(!woodPick || !regionView || regionName!==woodPick.prov) return hideWoodPop();
  const { trees, prov }=woodPick; regionView.highlightTrees(null);
  const job=regionView.startChop(trees, 5, felled=>{
    const n=felled.length, list=S.cleared[prov]||(S.cleared[prov]=[]);
    for(const t of felled) list.push(treeKey(t.x, t.z));
    regionSig=null;   // the next visit rebuilds with the stumps
    if(S.currentEra==='1810'){ S.wood+=n*WOOD_PER_TREE; updateWood(); hintEl.textContent='🪵 +'+(n*WOOD_PER_TREE)+' odun toplandı (toplam '+Math.floor(S.wood)+'). Açılan alana inşa edebilirsin.'; if(job) job.woodText='+'+(n*WOOD_PER_TREE)+' 🪵'; }
    else { hintEl.textContent='🌲 '+n+' ağaç kesildi; alan inşaata açıldı.'; if(job) job.woodText='Alan açıldı'; }
  });
  woodPop.classList.remove('show'); woodPick=null;
  if(job) hintEl.textContent='🪓 Oduncular ormana gidiyor…';
};
document.getElementById('woodPopClose').onclick=()=>hideWoodPop();
document.querySelectorAll('.bopt').forEach(b=>b.addEventListener('click', ()=>{
  if(view!=='region' || !regionView) return;
  regionView.setGhost(document.body.classList.contains('region-own') ? buildType : null);
  if(buildType) buildPanel.classList.remove('open');   // the menu would cover the ground we are about to build on (B opens it again)
}));

// battle state for the region close-up (the world-map battle drives it; the result stays visible for a while)
let lastBattle=null;
function regionBattleState(name){
  if(cine && cine.name===name) return cine.state;   // the cutscene drives the fight on screen
  if(invasion && invasion.phase==='battle' && invasion.prov===name && invasion.def0!=null){
    const won=invasion.wonVisual, st={ prog:Math.min(1, invasion.battle/BATTLE_TIME), won,
      lossA: won ? Math.min(.85, invasion.def0*.6/Math.max(1,invasion.army0)) : .7, lossD: won ? .95 : .35,
      attColor:playerTeamColor(), defColor:invasion.defColor, attCulture:cultureOfCountry(S.homeName), defCulture:cultureOfCountry(invasion.target), scenario:invasion.scenario, weather:invasion.weather, seed:invasion.seed };
    lastBattle={ name, st:{ ...st, prog:1, done:true }, until:performance.now()+60000 };
    return st;
  }
  if(lastBattle && lastBattle.name===name && performance.now()<lastBattle.until) return lastBattle.st;
  return null;
}
// instant switch back (menu exit, load, game over)
function leaveRegionNow(){
  if(view !== 'region') return;
  hideProvince(); hideWoodPop(); regionView.setGhost(null); regionView.deactivate(); view = 'world'; document.body.classList.remove('in-region', 'region-own');
}
document.getElementById('rhBack').onclick = () => exitRegion();
document.getElementById('rhUpgrade').onclick = () => upgradeSettlement(regionName);
document.getElementById('regionBtn').onclick = () => {
  const n = provAtScreen(0, 0) || S.homeName;
  if(n) enterRegion(n); else hintEl.textContent = 'Önce haritada bir ülkeyi ekranın ortasına getir.';
};

applySky(currentSky());   // after every declaration (regionView, cine) exists
place(); resize(); loop();

// ---- save / load ----
// soldiers marching or out on an operation are saved back in the province they left, so a reload never loses them
function savedTroops(){
  const t={ ...S.troops };
  for(const m of troopMoves) t[m.from]=(t[m.from]||0)+m.n;
  if(invasion && invasion.force && invasion.src) t[invasion.src]=(t[invasion.src]||0)+invasion.force;
  return t;
}
function collectState(){
  return {
    ...pick(S, ['money','moneyCap','population','popCap','army','iron','tankCount','bread','wood','settle','cleared','taxPerPerson','ideology','personality','gameDays',
      'fieldCount','farmCount','chocoCount','shipCount','portShipyardCount','cityCount','townCount','baseCount','nonChocoBuildings',
      'homeName','selectedName','troops','goods','fed','spec']),
    troops: savedTroops(),
    partial: Array.from(partialOwned), playerProvs: Array.from(playerProvs), provGarrison: { ...provGarrison },
    owned: Array.from(ownedCountries),
    colonies: Array.from(colonies),
    era: S.currentEra,
    bots: bots.map(b=>({ id:b.id, home:b.home, name:b.name, colorHex:b.colorHex, owned:[...b.owned], money:b.money, pop:b.pop, army:b.army, aggr:b.aggr })),
    garrisons: garrisons,
    shipPositions: ships.map(s=>[s.position.x, s.position.z]),
    buildings: placedBuildings.map(g=>{ const r=g.userData.buildRec; return r?{type:r.type,x:r.x,z:r.z,mineral:r.mineral,freeCity:!!r.freeCity}:null; }).filter(Boolean)
  };
}
function clearWorldObjects(){
  leaveRegionNow();
  S.goods={ fish:0, livestock:0, oil:0, tech:0 }; S.fed=false; tradeOffers=[]; tradePanel.classList.remove('show');
  clearBotBattles();
  clearProvinceState();
  // remove placed buildings
  placedBuildings.forEach(g=>{ worldGroup.remove(g); });
  placedBuildings.length=0;
  ports.length=0; shipyards.length=0; bases.length=0; mines.length=0; garages.length=0; fields.length=0;
  ships.forEach(s=>worldGroup.remove(s)); ships.length=0;
  // drop building obstacles; keep natural decoration obstacles
  obstacles = obstacles.filter(o=> !o.building);
  // reset counters
  S.fieldCount=S.farmCount=S.chocoCount=S.shipCount=S.portShipyardCount=S.cityCount=S.townCount=S.baseCount=S.nonChocoBuildings=0;
  S.freeCityCount=0;
  S.bankCount=0; S.moneyCap=5000; S.iron=0; S.tankCount=0;
  S.wood=0; S.settle={}; S.cleared={};
  S.money=2500; S.bread=0; S.taxPerPerson=2; S.gameDays=0; S.lastMonthCounted=0; S.rebellionActive=false; S.ideology=null; S.personality=null; S._upkeepDebt=0;
  if(typeof rebelFires!=='undefined'){ rebelFires.forEach(fo=>{ if(fo.group) worldGroup.remove(fo.group); }); rebelFires=[]; }
  const dv=document.getElementById('dangerVignette'); if(dv) dv.classList.remove('show');
  const rb=document.getElementById('rebelBar'); if(rb) rb.classList.remove('show');
  ownedCountries.clear();
  colonies.clear();
  partialOwned.clear(); for(const k in partialCellsByCountry) delete partialCellsByCountry[k];
  for(const k in garrisons) delete garrisons[k];
  bots=[]; for(const k in ownerOf) delete ownerOf[k];
  MP=false; _mpSyncT=0; for(const k in humanPlayers) delete humanPlayers[k];
  const rb2=document.getElementById('rankBtn'); if(rb2) rb2.classList.remove('show');
  const rp2=document.getElementById('rankPanel'); if(rp2) rp2.classList.remove('show'); rankOpen=false;
}
function applyState(st){
  clearWorldObjects();
  S.money=st.money; S.moneyCap=st.moneyCap||5000; S.population=st.population; S.popCap=st.popCap; S.army=st.army;
  S.iron=st.iron||0; S.tankCount=st.tankCount||0;
  S.wood=st.wood||0; S.settle={ ...(st.settle||{}) }; S.cleared={ ...(st.cleared||{}) };
  S.bread=st.bread||0; S.taxPerPerson=(st.taxPerPerson!=null?st.taxPerPerson:2); S.ideology=st.ideology||null;
  S.personality=st.personality||null;
  S.gameDays=st.gameDays||0;
  { const off=(S.personality==='hardworking')?15:30; S.lastMonthCounted=Math.floor((Math.floor(S.gameDays)-off)/30)+1; }
  S.homeName=st.homeName; S.selectedName=st.selectedName;
  // counters are recomputed by spawnBuilding(silent); start from zero
  (st.owned||[]).forEach(n=>ownedCountries.add(n));
  (st.colonies||[]).forEach(n=>colonies.add(n));
  if(st.garrisons) for(const k in st.garrisons) garrisons[k]=st.garrisons[k];
  (st.partial||[]).forEach(n=>partialOwned.add(n)); (st.playerProvs||[]).forEach(id=>playerProvs.add(id));
  if(st.provGarrison) Object.assign(provGarrison, st.provGarrison);
  // recolor owned countries (colonies paler) + borders — keep geographic fill, tint for ownership
  ownedCountries.forEach(name=>{
    if(partialOwned.has(name)){ refreshPartial(name); recolorCountry(name); return; }
    ownerOf[name]='player'; colorCountry(name, colonies.has(name)?COLONY_COLOR:OWN_COLOR); });
  // troops per province (older saves only had a single army number: it waits in the capital province)
  S.troops = st.troops ? { ...st.troops } : {}; S.spec = { ...(st.spec||{}) };
  S.goods = { fish:0, livestock:0, oil:0, tech:0, ...(st.goods||{}) }; S.fed=!!st.fed;
  if(!st.troops && st.army>0 && capitalProv(st.homeName)) S.troops[capitalProv(st.homeName).id]=st.army;
  // saves from before marching soldiers were stored lost them; the army total still counts them: send them home
  else if(st.troops && st.army>0 && capitalProv(st.homeName)){
    const kept=Object.values(st.troops).reduce((a,b)=>a+b, 0), lost=Math.round(st.army-kept);
    if(lost>0){ const c=capitalProv(st.homeName).id; S.troops[c]=(S.troops[c]||0)+lost; }
  }
  syncArmy();
  // rival empires: restore them as they were (older saves had none: start fresh rivals)
  if(st.bots && st.bots.length){
    bots=st.bots.map(b=>({ ...b, color:new THREE.Color(b.colorHex), owned:new Set(b.owned) }));
    for(const b of bots) for(const n of b.owned){ ownerOf[n]=b.id; colorCountry(n, b.color); }
  } else if(S.homeName) spawnBots(10);
  redrawBorders();
  // rebuild buildings (silent: no cost charged, counters incremented inside)
  // (older saves had city/town buildings: they become the settlement level of their province; the population cap is saved as it was)
  (st.buildings||[]).forEach(b=>{
    if(b.type==='city' || b.type==='town'){ const pv=provAt(b.x, b.z); if(pv) S.settle[pv.id]=Math.max(S.settle[pv.id]||0, b.type==='city'? 2 : 1); return; }
    spawnBuilding(b.type, b.x, b.z, b.mineral, true); });
  recountSettlements(); updateWood();
  // re-create ships at saved positions
  (st.shipPositions||[]).forEach(p=>{ const s=makeShip(S.currentEra); s.position.set(p[0],SHIP_Y,p[1]); worldGroup.add(s); ships.push(s); });
  S.shipCount=ships.length;
  updateMoney(); updatePop(); updateArmy(); updateIron(); updateBread(); updateCalendar();
  if(taxInput) taxInput.value=S.taxPerPerson; if(typeof refreshTaxHint==='function') refreshTaxHint();
  // show HUD + save button, hide menus
  if(S.selectedName){ selinfo.classList.add('show'); selinfo.innerHTML=flagFor(S.selectedName)+' <b>'+S.selectedName+'</b> — imparatorluğun'; }
  document.body.classList.add('ingame'); document.getElementById('saveBtn').classList.add('show'); document.getElementById('taxbar').classList.add('show'); document.getElementById('exitBtn').classList.add('show'); document.getElementById('rankBtn').classList.add('show');
  mainmenu.classList.remove('open'); lobbyEl.classList.remove('open');
  cpOverlay.classList.remove('open'); document.getElementById('savesModal').classList.remove('open');
  gameStarted=true;
}

const SAVES_KEY='gamesaves';
const HAS_WSTORAGE = (typeof window!=='undefined' && window.storage && window.storage.get);
async function readSaves(){
  if(HAS_WSTORAGE){ try{ const r=await window.storage.get(SAVES_KEY, true); return r? JSON.parse(r.value):[]; }catch(e){ /* fall through */ } }
  try{ return JSON.parse(localStorage.getItem(SAVES_KEY)||'[]'); }catch(e){ return []; }
}
async function writeSaves(list){
  if(HAS_WSTORAGE){ try{ await window.storage.set(SAVES_KEY, JSON.stringify(list), true); return; }catch(e){ /* fall through */ } }
  try{ localStorage.setItem(SAVES_KEY, JSON.stringify(list)); }catch(e){}
}
async function doSave(){
  if(!gameStarted){ hintEl.textContent='Önce bir ülke seçip oyuna başla.'; return; }
  const list=await readSaves();
  const name=(S.selectedName||'Oyun')+' — '+new Date().toLocaleString('tr-TR');
  const entry={ id:'s'+Date.now().toString(36), name, time:Date.now(), owner:playerName, state:collectState() };
  list.unshift(entry);
  while(list.length>30) list.pop();   // keep last 30
  await writeSaves(list);
  hintEl.textContent='Oyun kaydedildi: '+name;
}
async function openSaves(){
  const list=await readSaves();
  const box=document.getElementById('savesList'); box.innerHTML='';
  if(list.length===0){ box.innerHTML='<div class="mm-sub">Henüz kayıt yok.</div>'; }
  list.forEach(s=>{
    const row=document.createElement('div'); row.className='save-item';
    const left=document.createElement('span'); left.textContent=s.name;
    const right=document.createElement('span');
    const load=document.createElement('button'); load.textContent='Aç';
    load.onclick=()=>{ document.getElementById('savesModal').classList.remove('open');
      if(!worldBuilt){ pendingRestore=s.state; mainmenu.classList.remove('open'); lobbyEl.classList.remove('open'); loadEra(s.state.era||'2014'); }   // load that save's map first
      else applyState(s.state); };
    const del=document.createElement('button'); del.textContent='Sil'; del.className='save-del';
    del.onclick=async()=>{ const l=(await readSaves()).filter(x=>x.id!==s.id); await writeSaves(l); openSaves(); };
    right.appendChild(load); right.appendChild(del);
    row.appendChild(left); row.appendChild(right); box.appendChild(row);
  });
  document.getElementById('savesModal').classList.add('open');
}

document.getElementById('saveBtn').onclick=doSave;
document.getElementById('closeSaves').onclick=()=>document.getElementById('savesModal').classList.remove('open');
document.getElementById('savesMenuBtn').onclick=openSaves;
document.getElementById('savesLobbyBtn').onclick=openSaves;

// opening a game link (or refreshing inside a game) resumes it
if(gameId){
  let rec=null; try{ rec=JSON.parse(localStorage.getItem(GAME_KEY+gameId)||'null'); }catch(e){}
  if(rec && rec.era){ mainmenu.classList.remove('open'); pendingRestore=rec.state; if(rec.state) gameStarted=true; loadEra(rec.era); }
  else setGameLink(null);   // unknown link on this browser: start from the menu
}

// ---- test hook (only with ?test in the URL): lets scripts/smoke.mjs drive the game ----
if (new URLSearchParams(location.search).has('test')) {
  window.__mbr = {
    get post(){ return post; },
    regionSky(s, n=0){ if(regionView && regionView.scene) regionView.setLighting({ s, n }); },
    get worldBuilt(){ return worldBuilt; },
    snapshot(){ return { ...pick(S, ['money','population','popCap','army','bread','gameDays','ideology','personality']),
      owned:[...ownedCountries], bots:bots.length, buildings:placedBuildings.length, home:S.homeName }; },
    chooseCountry(name){ pickingHome=false; chooseCountry(featByName[name], name); },   // same as clicking it on the map
    capital(name){ return capitalXZ(name); },
    build(type, x, z){ const prev=buildType; buildType=type; placeBuilding({x, z}); buildType=prev; },
    hint(){ return hintEl.textContent; },
    set(key, value){ S[key] = value; },
    get(key){ return S[key]; }, get bots(){ return bots.length; },
    invade(name, prov){ showInvade(name, prov); invadeBtn.click(); },
    get invasionPhase(){ return invasion ? invasion.phase : null; },
    get regionGhost(){ return regionGhost; },
    get cineT(){ return cine && cine.running ? cine.t : -1; },
    troops(where, n){ const p=resolveProv(where); S.troops[p.id]=n; syncArmy(); return p.id; },
    provinces(country){ return (PI.byCountry[country]||[]).map(p=>({ id:p.id, label:p.label, capital:p.capital, own:ownsProv(p.id), troops:S.troops[p.id]||0, dev:devInfo(p.id).name })); },
    provCount(){ return PROVS.length; },
    buildingsInfo(){ return placedBuildings.map(g=>{ const r=g.userData.buildRec; return [r.type, r.prov, +r.x.toFixed(1), +r.z.toFixed(1)]; }); },
    regionInfoOf(id){ const i=regionInfoFor(id); return i && { center:i.center, k:i.k, buildings:i.buildings, dev:i.devName }; },
    showProv(id){ showProvince(id); },
    moveTroops(from, to, n){ return startTroopMove(from, to, n); },
    conquerChoice(kind){ document.getElementById(kind).click(); },
    defenceTest(win){ botAttackedPlayer(bots[0], S.homeName, win); },
    cineTest(scenario, weather, prov){ const p=resolveProv(prov||S.homeName); playCinematic({ name:p.id, title:'TEST', sub:scenario+' '+weather, attFlag:'', defFlag:'', advance:'TEST', won:true,
      attColor:'#c0392b', defColor:playerTeamColor(), lossA:.5, lossD:.6, winSub:'', loseSub:'', scenario, weather, seed:.7 }); },
    openTrade(){ document.getElementById('tradeAct').click(); },
    give(k, n){ goodAdd(k, n); },
    profile(c){ return profileOf(c); },
    regionPlaced(){ return regionView && regionView.placed.slice(); },
    get rv(){ return regionView; }, get regionName(){ return regionName; }, upgrade(id){ return upgradeSettlement(id); }, settleOf(id){ return settleOf(id); },
    myProvIds(){ return myProvs().map(p=>p.id); }, wood(){ return S.wood; },
    // aim the region camera at a moving vehicle / person (index i) or a point, for close-up screenshots
    regionFocus(what, zoom, i=0, pitch=0){
      const rv=regionView; if(!rv || !rv.life) return false;
      let p=null;
      if(what==='vehicle'){ const v=rv.life.vehicles[i]; p=v && v.g.position; }
      else if(what==='civ'){ const q=rv.life.civ && rv.life.civ[i]; p=q && q.h.g.position.clone(); }
      else if(what==='person'){ const q=rv.life.people[i]; p=q && (q.road ? null : new THREE.Vector3(q.x, 0, q.z)); if(!p){ const m=new THREE.Matrix4(); rv.life.rig.torso.getMatrixAt(i, m); p=new THREE.Vector3().setFromMatrixPosition(m); } }
      else p=new THREE.Vector3(what[0], 0, what[1]);
      if(!p) return false;
      const off=rv.cam.position.clone().sub(rv.controls.target);
      if(pitch){ const r=off.length(), az=Math.atan2(off.x, off.z); rv.controls.maxPolarAngle=1.45; off.set(Math.sin(pitch)*Math.sin(az)*r, Math.cos(pitch)*r, Math.sin(pitch)*Math.cos(az)*r); }
      rv.controls.target.copy(p); rv.cam.position.copy(p).add(off);
      rv.zoomTo=rv.zoomFrom=zoom; rv.cam.zoom=zoom; rv.cam.updateProjectionMatrix(); rv.controls.update(); rv._follow=what==='vehicle'? rv.life.vehicles[i] : null; return true;
    },
    lookAtBotBattle(d){ const b=botBattles[0]; if(!b) return false; target.set(b.pos.x*worldGroup.scale.x,0,b.pos.z*worldGroup.scale.z); dist=d; pitch=.85; worldTween=null; place(); return true; },
    botsTick(){ for(const b of bots){ b.aggr=1; b.army*=6; } botsMonthlyTick(); return botBattles.length; },
    watchFirstWar(){ const a=botBattles[0]; if(a) watchBotBattle(a); return !!a; },
    warAlertAt(){ const a=botBattles[0]; if(!a) return null; const r=a.el.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2, a.target]; },
    look(name, d, p){ const c=capitalXZ(name); target.set(c[0]*worldGroup.scale.x,0,c[1]*worldGroup.scale.z); dist=d; if(p!=null) pitch=p; worldTween=null; place(); },
    get view(){ return view; },
    get timings(){ return timings; },
    screenOf(name){ const c=capitalXZ(name); const v=new THREE.Vector3(c[0],DEPTH,c[1]); worldGroup.localToWorld(v); v.project(camera);
      const r=renderer.domElement.getBoundingClientRect(); return [r.left+(v.x*.5+.5)*r.width, r.top+(-v.y*.5+.5)*r.height]; },
    borderInfo(){ return { lines: borderGroup? borderGroup.children.length : 0, player: outlineOf([...ownedCountries]).length, owned:[...ownedCountries] }; },
    enterRegion(name){ return enterRegion(name); },
    exitRegion(){ exitRegion(); },
    regionInfo(){ return regionView && regionView.info && { name:regionView.info.name, biome:regionView.info.biome, culture:regionView.info.culture,
      coast:!!regionView.info.coast, trees:regionView.treeCount, placed:regionView.placed }; },
  };
}
