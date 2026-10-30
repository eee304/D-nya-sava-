// Rigged Blender humans (blender/human.py): skinned clone + one AnimationMixer per person.
// Vertex-colour markers are swapped for real colours: magenta = team / shirt, cyan = trousers, yellow = skin.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RIGS } from '../region/prefabs.js';

const MARKERS = [['team', 1, 0, 1], ['pants', 0, 1, 1], ['skin', 1, 1, 0]];
const geoCache = new Map(), _c = new THREE.Color();
// geometry with the markers recoloured; shared by everyone wearing the same colours
function recolored(geo, colors) {
  const key = geo.uuid + '|' + (colors.team || '') + '|' + (colors.pants || '') + '|' + (colors.skin || '');
  if (geoCache.has(key)) return geoCache.get(key);
  const g = geo.clone(), col = g.attributes.color;
  if (col) {
    const n = col.count, it = col.itemSize, arr = new Float32Array(n * it);
    for (let i = 0; i < n; i++) {
      let r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      for (const [k, mr, mg, mb] of MARKERS) {
        if (colors[k] && Math.abs(r - mr) < .1 && Math.abs(gg - mg) < .1 && Math.abs(b - mb) < .1) { _c.set(colors[k]); r = _c.r; gg = _c.g; b = _c.b; break; }
      }
      arr[i * it] = r; arr[i * it + 1] = gg; arr[i * it + 2] = b; if (it === 4) arr[i * it + 3] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, it));
  }
  geoCache.set(key, g);
  return g;
}
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78 });

export const humanReady = name => !!RIGS[name];
// local dress (blender/human.py variants): 1810 clothes follow the region's culture; falls back to the plain model
const CUL = { islamic: '_isl', eastasia: '_ea', african: '_af' };
export function humanName(kind, era, culture, fem = false) {
  let c = era === '1810' ? CUL[culture] || '' : '';
  if (kind === 'soldier') { if (c === '_af') c = '_isl'; fem = false; }
  for (const n of [kind + '_' + era + c + (fem ? '_f' : ''), kind + '_' + era + c, kind + '_' + era]) if (RIGS[n]) return n;
  return kind + '_' + era;
}
// colors: { team, pants, skin } ; returns { g, play(name, dt, speed) }
export function makeHuman(name, colors = {}) {
  const src = RIGS[name]; if (!src) return null;
  const g = cloneSkinned(src.scene);
  g.traverse(o => {
    if (!(o.isSkinnedMesh || o.isMesh)) return;
    o.geometry = recolored(o.geometry, colors); o.material = MAT; o.castShadow = true; o.receiveShadow = false;
    // cull off-screen figures with a padded bind-pose sphere (poses never reach far outside it)
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.boundingSphere = o.geometry.boundingSphere.clone(); o.boundingSphere.radius *= 1.6;
  });
  const mixer = new THREE.AnimationMixer(g), acts = {}, w = {};
  for (const clip of src.animations) {
    const a = mixer.clipAction(clip); a.play(); a.time = Math.random() * clip.duration; a.setEffectiveWeight(0);
    acts[clip.name] = a; w[clip.name] = 0;
  }
  let cur = acts.idle ? 'idle' : Object.keys(acts)[0], acc = 0, tick = 0, lod = 0;
  w[cur] = 1; acts[cur].setEffectiveWeight(1);
  return {
    g, acts,
    setLod(n) { lod = n; },
    // cross-fade towards `want`; speed scales the clip (e.g. ground speed / stride)
    play(want, dt, speed = 1) {
      if (!acts[want]) want = cur; cur = want;
      for (const k in acts) { w[k] += ((k === want ? 1 : 0) - w[k]) * Math.min(1, dt * 6); acts[k].setEffectiveWeight(w[k]); }
      acts[want].timeScale = speed;
      // skinning runs on the GPU; the CPU cost is the mixer, so far / crowded figures may tick it less often (lod = frames to skip)
      acc += dt; if (++tick <= lod) return; tick = 0;
      mixer.update(acc); acc = 0;
    },
    freeze() { /* fallen: keep the last pose */ },
  };
}
