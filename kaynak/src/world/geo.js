// Small geometry helpers shared by map building, borders and placement.
import * as THREE from 'three';

// ---- colors ----
export function genColors(n){ const out=[]; for(let i=0;i<n;i++){ const h=(i*137.508)%360;
  out.push('hsl('+h.toFixed(0)+','+[62,78,90][i%3]+'%,'+[48,60,70][(i/3|0)%3]+'%)'); } return out; }

export function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.random()*(i+1)|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

export function area(p){ let a=0; for(let i=0;i<p.length;i++){ const[x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length]; a+=x1*y2-x2*y1; } return a/2; }

// point-in-polygon (ray cast) for a closed ring of [x,z]
export function pointInRing(x,z,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],zi=ring[i][1],xj=ring[j][0],zj=ring[j][1];
    if(((zi>z)!==(zj>z)) && (x < (xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside;
  }
  return inside;
}

// build a THREE shape from a clipped polygon ring (array of [x,z])
export function ringToShape(ring){
  const s=new THREE.Shape();
  s.moveTo(ring[0][0],ring[0][1]);
  for(let i=1;i<ring.length;i++) s.lineTo(ring[i][0],ring[i][1]);
  s.closePath();
  return s;
}

export function simplifyRingB(r){
  if(r.length<=2500) return r;
  const step=Math.ceil(r.length/2500);
  const out=[]; for(let i=0;i<r.length;i+=step) out.push(r[i]);
  if(out[out.length-1]!==r[r.length-1]) out.push(r[r.length-1]);
  return out;
}
