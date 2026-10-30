// Models made in Blender (blender/*.py -> public/models/*.glb). Each material is named "role|#hex":
// the Kit recolours parts by role (walls, roof, shutters...) and textures them by colour, like the code-built parts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LIST = ['house_eu', 'house_ottoman', 'house_eastasia', 'apt_4', 'apt_6', 'house_2014', 'car_2014', 'van_2014', 'wagon_1810', 'ship_1810', 'ship_2014', 'boat_fishing'];
export const PREFABS = {};
export const RIGS = {};   // skinned + animated models kept whole: { scene, animations }
const RIG_LIST = ['horse', 'soldier_1810', 'soldier_1810_isl', 'soldier_1810_ea', 'soldier_2014', 'civ_1810', 'civ_1810_f', 'civ_1810_isl', 'civ_1810_isl_f',
  'civ_1810_ea', 'civ_1810_ea_f', 'civ_1810_af', 'civ_1810_af_f', 'civ_2014', 'civ_2014_f'];

export function loadPrefabs() {
  const loader = new GLTFLoader();
  for (const name of RIG_LIST) loader.loadAsync(import.meta.env.BASE_URL + 'models/' + name + '.glb').then(g => { RIGS[name] = g; }).catch(e => console.warn('rig', name, e.message));
  return Promise.all(LIST.map(name => loader.loadAsync(import.meta.env.BASE_URL + 'models/' + name + '.glb').then(g => {
    const parts = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const [role, hex] = (o.material.name || '').split('|');
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      // a wheel node ('wheel_N') also keeps its parts relative to the hub, so a moving vehicle can spin it
      let wn = o; while (wn && !/^wheel/.test(wn.name)) wn = wn.parent;
      let wheel = null;
      if (wn) { const hub = new THREE.Vector3().setFromMatrixPosition(wn.matrixWorld), loc = geo.clone().translate(-hub.x, -hub.y, -hub.z); wheel = { id: wn.name, hub, geo: loc.index ? loc.toNonIndexed() : loc }; }   // model-space orientation, centred on the hub
      parts.push({ role, color: hex || '#' + o.material.color.getHexString(), geo: geo.index ? geo.toNonIndexed() : geo, wheel });
    });
    PREFABS[name] = parts;
  }).catch(e => console.warn('prefab', name, e.message))));
}
