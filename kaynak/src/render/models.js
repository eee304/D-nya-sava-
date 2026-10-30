// Procedural 3D models for the world map (buildings, decorations, units, markers).
import * as THREE from 'three';
import { Kit, house, landmark, barracks as barracksModel, mine as mineModel, bank as bankModel, factory as factoryModel, farmhouse, dock, makeWindmill, fishingBoat, pumpjack, animalGeo, ANIMAL_MAT } from '../region/builders.js';
import { shipGeo, UNIT_MAT } from '../units/models.js';
import { PREFABS } from '../region/prefabs.js';
import { prefabGroup } from '../region/life.js';

// ---- small building factories (all kept small, sit on land at y=DEPTH) ----
export function box(w,h,d,color){ return new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
  new THREE.MeshStandardMaterial({color, roughness:.85})); }

// small floating "2x" label for boosted fields
export function make2xLabel(){
  const cv=document.createElement('canvas'); cv.width=128; cv.height=64;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='rgba(20,35,58,0.85)'; ctx.strokeStyle='#ffd35a'; ctx.lineWidth=6;
  ctx.beginPath(); ctx.roundRect(6,6,116,52,12); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#ffd35a'; ctx.font='bold 40px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('2x',64,34);
  const tex=new THREE.CanvasTexture(cv);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex, depthTest:false}));
  spr.scale.set(45,22,1); spr.position.set(0, 60, 0);   // above the field (local space; group is scaled down)
  return spr;
}

export function bCity(){ const g=new THREE.Group();
  const cols=['#c8ccd4','#aeb4c0','#9aa3b2','#d6d2c4'];
  for(let i=0;i<7;i++){ const w=1.4+Math.random()*1.4, h=3+Math.random()*6;
    const b=box(w,h,w,cols[i%cols.length]); b.position.set((Math.random()-.5)*7,h/2,(Math.random()-.5)*7);
    b.castShadow=true; g.add(b); } return g; }

export function bTown(){ const g=new THREE.Group();
  for(let i=0;i<5;i++){ const h=1.6+Math.random()*1.6; const b=box(2,h,2,'#d9cbb2');
    b.position.set((Math.random()-.5)*7,h/2,(Math.random()-.5)*7); g.add(b);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(1.6,1.4,4),new THREE.MeshStandardMaterial({color:'#a0533a'}));
    roof.rotation.y=Math.PI/4; roof.position.set(b.position.x,h+0.7,b.position.z); g.add(roof); } return g; }

export function bPort(){ const g=new THREE.Group();
  const dock=box(10,0.8,4,'#8a6b4a'); dock.position.y=0.4; g.add(dock);
  for(let i=0;i<3;i++){ const c=box(1.6,1.6,1.6,['#d44','#48a','#4a4'][i]); c.position.set(-3+i*3,1.4,0); g.add(c); }
  const crane=box(0.5,5,0.5,'#cc3'); crane.position.set(4,2.5,0); g.add(crane);
  const arm=box(0.5,0.5,4,'#cc3'); arm.position.set(4,5,1.6); g.add(arm); return g; }

export function bShipyard(){ const g=new THREE.Group();
  const slip=box(6,0.6,9,'#7d7f86'); slip.position.y=0.3; g.add(slip);
  const hull=new THREE.Mesh(new THREE.CylinderGeometry(1.6,1.6,7,10,1,false,0,Math.PI),
    new THREE.MeshStandardMaterial({color:'#556'})); hull.rotation.z=Math.PI/2; hull.rotation.y=Math.PI/2;
  hull.position.set(0,1.6,0); g.add(hull);
  const crane=box(0.5,6,0.5,'#cc3'); crane.position.set(2.5,3,3); g.add(crane); return g; }

export function bField(){ const g=new THREE.Group();
  const base=box(6,0.4,6,'#caa94e'); base.position.y=0.2; g.add(base);
  for(let i=0;i<5;i++){ const row=box(5.4,0.45,0.45,'#9c7d2c'); row.position.set(0,0.45,-2+i*1); g.add(row);} return g; }

export function bFarm(){ const g=new THREE.Group();
  const barn=box(3.5,2.5,5,'#a23b2e'); barn.position.set(-2,1.25,0); barn.castShadow=true; g.add(barn);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(2.6,1.6,4),new THREE.MeshStandardMaterial({color:'#7a2b22'}));
  roof.rotation.y=Math.PI/4; roof.position.set(-2,3.3,0); g.add(roof);
  const fld=box(7,0.4,7,'#bda12e'); fld.position.set(3,0.2,0); g.add(fld); return g; }

export function mountain(){
  // jagged low-poly peak: displaced icosahedron, rock body, snow cap, small side peak
  const g=new THREE.Group();
  const rockGeo=(r, h, seed)=>{ const geo=new THREE.IcosahedronGeometry(r,1); const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){ const x=p.getX(i), y=p.getY(i), z=p.getZ(i), k=1+Math.sin(x*3.1+seed)*.18+Math.cos(z*2.7+seed*2)*.18;
      p.setXYZ(i, x*k, Math.max(0,y)*h/r*(y>r*.6?1.15:1), z*k); }
    geo.computeVertexNormals(); return geo; };
  const rock=new THREE.MeshStandardMaterial({color:'#9a8f80',roughness:.95,flatShading:true});
  const snow=new THREE.MeshStandardMaterial({color:'#f4f7f8',roughness:.8,flatShading:true});
  const s1=Math.random()*10;
  const main=new THREE.Mesh(rockGeo(7,15,s1), rock); g.add(main);
  const cap=new THREE.Mesh(rockGeo(3.4,5.5,s1+1), snow); cap.position.y=10.2; g.add(cap);
  const side=new THREE.Mesh(rockGeo(4.5,8,s1+2), rock); side.position.set(5,0,2); g.add(side);
  const sideCap=new THREE.Mesh(rockGeo(1.8,2.6,s1+3), snow); sideCap.position.set(5,5.6,2); g.add(sideCap);
  return g;
}

export function tree(){
  // pine or broadleaf, chosen at random
  const g=new THREE.Group();
  const t=new THREE.Mesh(new THREE.CylinderGeometry(.6,.9,4,6), new THREE.MeshStandardMaterial({color:'#5a4330'})); t.position.y=2; g.add(t);
  const greens=['#2f5f2c','#3a6e30','#4b7d2f','#2a4f2b'];
  const leaf=new THREE.MeshStandardMaterial({color:greens[(Math.random()*greens.length)|0],flatShading:true,roughness:.9});
  if(Math.random()<.55){
    for(const [r,h,y] of [[3.6,5,5.5],[2.8,4.2,8],[1.9,3.4,10.4]]){ const c=new THREE.Mesh(new THREE.ConeGeometry(r,h,7), leaf); c.position.y=y; g.add(c); }
  } else {
    for(const [r,x,y,z] of [[3.4,0,7,0],[2.5,1.8,5.6,.8],[2.4,-1.6,6,-1]]){ const c=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1), leaf); c.position.set(x,y,z); g.add(c); }
  }
  return g;
}

export function bForest(){ const g=new THREE.Group();
  for(let i=0;i<6;i++){ const t=tree(); t.position.set((Math.random()-.5)*9,0,(Math.random()-.5)*9);
    t.scale.setScalar(.7+Math.random()*.4); g.add(t); } return g; }

export function bMountain(){ const g=new THREE.Group(); const m=mountain(); m.scale.setScalar(.7); g.add(m); return g; }

export function bChoco(){ const g=new THREE.Group();
  // main building (brown like chocolate)
  const main=box(7,4,5,'#5a3210'); main.position.set(0,2,0); main.castShadow=true; g.add(main);
  const trim=box(7.2,0.6,5.2,'#caa15a'); trim.position.set(0,4.1,0); g.add(trim);
  // smoke stacks
  for(let i=0;i<2;i++){ const st=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,4,8),
    new THREE.MeshStandardMaterial({color:'#7a4a22'})); st.position.set(-1.6+i*3.2,5.5,-1.2); g.add(st); }
  // a giant chocolate bar on top
  const bar=box(3.4,0.8,2,'#3a2008'); bar.position.set(0,4.9,1.4); g.add(bar);
  for(let r=0;r<2;r++)for(let c=0;c<3;c++){ const sq=box(0.8,0.3,0.5,'#6b3d18');
    sq.position.set(-1+c, 5.45, 0.8+r*0.9); g.add(sq); }
  return g;
}

export function bBase(){ const g=new THREE.Group();
  // walled compound
  const ground=box(9,0.4,9,'#5b6650'); ground.position.y=0.2; g.add(ground);
  const hq=box(4,2.4,4,'#48533c'); hq.position.set(0,1.4,0); hq.castShadow=true; g.add(hq);
  const roof=box(4.4,0.4,4.4,'#3a4230'); roof.position.set(0,2.7,0); g.add(roof);
  // watch towers at corners
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    const t=box(0.8,3,0.8,'#3f4a33'); t.position.set(sx*3.6,1.5,sz*3.6); g.add(t); }
  // flag pole
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,4,6),
    new THREE.MeshStandardMaterial({color:'#ccc'})); pole.position.set(2.6,3.4,2.6); g.add(pole);
  const flag=box(1.4,0.9,0.08,'#c0392b'); flag.position.set(3.4,4.6,2.6); g.add(flag);
  return g;
}

export function bMine(){ const g=new THREE.Group();
  // mine entrance mound with a dark shaft and a headframe
  const mound=new THREE.Mesh(new THREE.ConeGeometry(4,2.4,7),
    new THREE.MeshStandardMaterial({color:'#6b5a47',flatShading:true})); mound.position.y=1.2; g.add(mound);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.1,0.6,8),
    new THREE.MeshStandardMaterial({color:'#16110c'})); shaft.position.y=2.4; g.add(shaft);
  // headframe (A-frame)
  for(const s of [-1,1]){ const leg=box(0.4,5,0.4,'#7a4a22'); leg.position.set(s*1.4,2.5,0); leg.rotation.z=s*0.25; g.add(leg); }
  const top=box(3.4,0.4,0.5,'#7a4a22'); top.position.set(0,4.8,0); g.add(top);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(0.8,0.18,8,16),
    new THREE.MeshStandardMaterial({color:'#999'})); wheel.position.set(0,4.8,0.4); g.add(wheel);
  // a little ore cart
  const cart=box(1.6,0.8,1,'#444'); cart.position.set(3,0.6,2); g.add(cart);
  return g;
}

export function bBank(){ const g=new THREE.Group();
  // classical bank: stone block with columns and a pediment
  const base=box(7,0.6,5,'#cfd3d8'); base.position.y=0.3; g.add(base);
  const body=box(6,3,4,'#e8ebee'); body.position.set(0,2,0); body.castShadow=true; g.add(body);
  for(let i=0;i<4;i++){ const col=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,3,10),
    new THREE.MeshStandardMaterial({color:'#f4f6f8'})); col.position.set(-2.4+i*1.6,2,2.1); g.add(col); }
  // pediment (triangular roof)
  const ped=new THREE.Mesh(new THREE.ConeGeometry(4.2,1.6,4),
    new THREE.MeshStandardMaterial({color:'#c9a14a',flatShading:true})); ped.position.set(0,4.4,0); ped.rotation.y=Math.PI/4; g.add(ped);
  // a golden $ sign block
  const sign=box(1,1,0.3,'#f1c40f'); sign.position.set(0,3,2.3); g.add(sign);
  return g;
}

export function bGarage(){ const g=new THREE.Group();
  // industrial shed with a roller door and a small tank silhouette
  const shed=box(7,3.4,5,'#5b6470'); shed.position.y=1.7; shed.castShadow=true; g.add(shed);
  const roof=box(7.4,0.5,5.4,'#3f4650'); roof.position.y=3.6; g.add(roof);
  const door=box(3,2.4,0.3,'#2b3038'); door.position.set(0,1.2,2.5); g.add(door);
  for(let i=0;i<3;i++){ const stripe=box(3,0.2,0.32,'#f1c40f'); stripe.position.set(0,0.5+i*0.7,2.55); g.add(stripe); }
  // tiny tank out front
  const body=box(2.4,0.8,1.4,'#6f7a4b'); body.position.set(0,0.6,4); g.add(body);
  const turret=box(1.1,0.6,1.1,'#5c6640'); turret.position.set(0,1.2,4); g.add(turret);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,1.6,8),
    new THREE.MeshStandardMaterial({color:'#3f4630'})); barrel.rotation.x=Math.PI/2; barrel.position.set(0,1.2,5); g.add(barrel);
  return g;
}

// ---- detailed world-map buildings, made with the region view's builders (era + culture aware) ----
let mctx={ era:'2014', culture:'european' };
export function setModelContext(c){ Object.assign(mctx, c); }
function kitModel(fn){
  const g=new THREE.Group(), inner=new THREE.Group(), K=new Kit();
  fn(K, inner); K.flush(inner); inner.scale.setScalar(1.25); g.add(inner);
  return g;
}
const R=()=>Math.random();
function houses(K, n, rad, rural){
  for(let i=0;i<n;i++){ const a=i/n*Math.PI*2+R()*.4, r=(i? rad*(.55+R()*.45) : 0);
    house(K, Math.cos(a)*r, 0, Math.sin(a)*r, a+Math.PI/2, .95+R()*.3, mctx.culture, mctx.era, R, rural); }
}
function wCity(){ return kitModel(K=>{ houses(K, 7, 4.2, false); landmark(K, 0, 0, 0, 0, mctx.culture, mctx.era); }); }
function wTown(){ return kitModel(K=>houses(K, 5, 3, true)); }
function wBase(){ return kitModel(K=>barracksModel(K, 0, 0, 0, 0, mctx.era)); }
function wMine(){ return kitModel(K=>mineModel(K, 0, 0, 0, 0, R)); }
function wBank(){ return kitModel(K=>bankModel(K, 0, 0, 0, 0)); }
function wGarage(){ return kitModel(K=>factoryModel(K, 0, 0, 0, 0, 'garage')); }
function wChoco(){ return kitModel(K=>factoryModel(K, 0, 0, 0, 0, 'choco')); }
function wFarm(){ return kitModel((K, g)=>{ farmhouse(K, -1.5, 0, 0, 0); if(mctx.era!=='2014'){ const w=makeWindmill(K, 2.5, 0, 1); g.add(w.cap, w.hub); } }); }
const portShip=()=>{ if(PREFABS['ship_'+mctx.era]){ const s=prefabGroup('ship_'+mctx.era); s.scale.setScalar(.95); return s; } const s=new THREE.Mesh(shipGeo(mctx.era), UNIT_MAT); s.rotation.y=Math.PI/2; s.scale.setScalar(.7); return s; };
function wPort(){ return kitModel((K, g)=>{ dock(K, -2, 0, [1, 0], 7); const s=portShip(); s.position.set(1, .1, 2.2); g.add(s); }); }
function wShipyard(){ return kitModel((K, g)=>{ dock(K, -2, 0, [1, 0], 6); factoryModel(K, -1, 0, -2.5, 0, 'garage'); const s=portShip(); s.position.set(1, .1, 1.5); s.scale.multiplyScalar(.86); g.add(s); }); }
function wFishery(){ return kitModel((K, g)=>{ dock(K, -2, 0, [1, 0], 6); const b=fishingBoat(K); b.position.set(1.5, 0, 1.6); g.add(b); }); }
function wRanch(){ return kitModel((K, g)=>{ farmhouse(K, -2, 0, -1, 0);
  const m=new THREE.InstancedMesh(animalGeo('cow'), ANIMAL_MAT, 5), o=new THREE.Object3D();
  for(let i=0;i<5;i++){ o.position.set(1+R()*2.5, 0, -1+R()*3); o.rotation.y=R()*6; o.updateMatrix(); m.setMatrixAt(i, o.matrix); } m.castShadow=true; g.add(m); }); }
function wOilwell(){ return kitModel((K, g)=>{ g.add(pumpjack(K, 0, 0, 0, 0)); }); }
function wFactory(){ return kitModel(K=>{ factoryModel(K, 0, 0, 0, 0, 'garage'); for(const sx of [-1.6, 1.6]){ const B=K.M4(0,0,0); K.part(B, new THREE.CylinderGeometry(.3,.4,4.4,10), '#7d7f86', sx, 2.2, -1.3); } }); }

export const BUILDERS={ city:wCity, town:wTown, port:wPort, shipyard:wShipyard, base:wBase, mine:wMine, bank:wBank, garage:wGarage,
  field:bField, farm:wFarm, forest:bForest, mountain:bMountain, choco:wChoco, fishery:wFishery, ranch:wRanch, oilwell:wOilwell, factory:wFactory };

// ---- cute blonde cat ----
export function makeCat(){
  const g=new THREE.Group();
  const fur='#f2cf8a', furDark='#e6bd6e', pink='#e88aa0';
  const M=c=>new THREE.MeshStandardMaterial({color:c, roughness:.8, flatShading:true});
  // body
  const body=new THREE.Mesh(new THREE.SphereGeometry(2.2,16,12), M(fur));
  body.scale.set(1,0.95,1.25); body.position.y=2.2; g.add(body);
  // head
  const head=new THREE.Mesh(new THREE.SphereGeometry(1.7,16,12), M(fur));
  head.position.set(0,4.3,1.1); g.add(head);
  // ears
  for(const sx of [-1,1]){
    const ear=new THREE.Mesh(new THREE.ConeGeometry(0.7,1.2,4), M(furDark));
    ear.position.set(sx*0.9,5.5,1.0); ear.rotation.y=Math.PI/4; g.add(ear);
    const inner=new THREE.Mesh(new THREE.ConeGeometry(0.35,0.7,4), M(pink));
    inner.position.set(sx*0.9,5.45,1.15); inner.rotation.y=Math.PI/4; g.add(inner);
  }
  // eyes
  for(const sx of [-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.22,8,8), M('#2b2b2b'));
    eye.position.set(sx*0.6,4.5,2.55); g.add(eye);
  }
  // nose
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.18,8,8), M(pink));
  nose.position.set(0,4.05,2.7); g.add(nose);
  // tail
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.18,3,8), M(furDark));
  tail.position.set(1.6,2.4,-1.4); tail.rotation.z=-0.7; tail.rotation.x=0.4; g.add(tail);
  // paws
  for(const sx of [-1,1]){
    const paw=new THREE.Mesh(new THREE.SphereGeometry(0.5,10,8), M(furDark));
    paw.position.set(sx*0.9,0.5,2.0); g.add(paw);
  }
  g.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
  return g;
}

export function makeShip(){
  const g=new THREE.Group();
  const hull=new THREE.Mesh(new THREE.BoxGeometry(2,1.2,6),
    new THREE.MeshStandardMaterial({color:'#3a4a63',roughness:.7})); hull.position.y=0.6; g.add(hull);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(1.4,1,2.4),
    new THREE.MeshStandardMaterial({color:'#dfe3e8'})); deck.position.set(0,1.5,-0.6); g.add(deck);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,3,6),
    new THREE.MeshStandardMaterial({color:'#caa14e'})); mast.position.set(0,2.6,1); g.add(mast);
  return g;
}

export let _flameTex=null;

export function flameTexture(){
  if(_flameTex) return _flameTex;
  const cv=document.createElement('canvas'); cv.width=64; cv.height=64;
  const ctx=cv.getContext('2d');
  const g=ctx.createRadialGradient(32,32,2, 32,32,30);
  g.addColorStop(0,'rgba(255,240,180,1)');
  g.addColorStop(0.35,'rgba(255,170,40,0.9)');
  g.addColorStop(0.7,'rgba(230,70,10,0.5)');
  g.addColorStop(1,'rgba(120,20,0,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(32,32,30,0,Math.PI*2); ctx.fill();
  _flameTex=new THREE.CanvasTexture(cv); return _flameTex;
}

export function makeFire(){
  const g=new THREE.Group();
  const tex=flameTexture();
  // several additive flame sprites of varying size = soft glowing fire
  const parts=[];
  const specs=[
    {s:6.5, y:2.6, c:0xff4a10},
    {s:4.8, y:3.4, c:0xff8a1e},
    {s:3.4, y:4.2, c:0xffd35a},
    {s:2.2, y:5.0, c:0xfff2b0}
  ];
  for(const sp of specs){
    const m=new THREE.SpriteMaterial({map:tex, color:sp.c, blending:THREE.AdditiveBlending, depthWrite:false, transparent:true});
    const spr=new THREE.Sprite(m); spr.scale.set(sp.s,sp.s*1.4,1); spr.position.y=sp.y;
    spr.userData.baseY=sp.y; spr.userData.baseS=sp.s;
    g.add(spr); parts.push(spr);
  }
  // glowing embers disc on the ground
  const disc=new THREE.Mesh(new THREE.CircleGeometry(3,16),
    new THREE.MeshBasicMaterial({color:0xff5a1f, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false}));
  disc.rotation.x=-Math.PI/2; disc.position.y=0.2; g.add(disc);
  g.userData.fire=true; g.userData.parts=parts; g.userData.t=Math.random()*10;
  g.scale.setScalar(0.7);
  return g;
}

export function makeCapitalMarker(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,16,6),
    new THREE.MeshStandardMaterial({color:'#ddd'})); pole.position.y=8; g.add(pole);
  const star=new THREE.Mesh(new THREE.OctahedronGeometry(2.4),
    new THREE.MeshStandardMaterial({color:'#ffd35a',emissive:'#7a5a00'})); star.position.y=16; g.add(star);
  return g;
}

export function makeArmyUnit(){
  const g=new THREE.Group();
  const flag=new THREE.Mesh(new THREE.BoxGeometry(3,2,0.2),
    new THREE.MeshStandardMaterial({color:'#2e8bff'})); flag.position.set(1.6,6,0); g.add(flag);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,7,6),
    new THREE.MeshStandardMaterial({color:'#ccc'})); pole.position.y=3.5; g.add(pole);
  for(let i=0;i<3;i++){ const s=new THREE.Mesh(new THREE.SphereGeometry(1.1,8,6),
    new THREE.MeshStandardMaterial({color:'#3a4a33'})); s.position.set(-2+i*1.6,1.1,0); g.add(s); }
  return g;
}

// a red enemy defender marker placed at the capital
export function makeDefender(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,7,6),
    new THREE.MeshStandardMaterial({color:'#ccc'})); pole.position.y=3.5; g.add(pole);
  const flag=new THREE.Mesh(new THREE.BoxGeometry(3,2,0.2),
    new THREE.MeshStandardMaterial({color:'#d23b3b'})); flag.position.set(1.6,6,0); g.add(flag);
  for(let i=0;i<3;i++){ const s=new THREE.Mesh(new THREE.SphereGeometry(1.1,8,6),
    new THREE.MeshStandardMaterial({color:'#5a2f2f'})); s.position.set(-2+i*1.6,1.1,0); g.add(s); }
  return g;
}
