// Seasons in the region close-up without rebuilding it: snow and autumn leaves are drawn by the materials themselves,
// driven by two shared uniforms that ease from one season to the next (no black fade, nothing re-generated).
//   uSnow   0..1  snow on every upward-facing surface (ground, roofs, tree tops), patchy at first, a full cover at 1
//   uAutumn 0..1  broadleaf crowns turn orange, gold and red (meshes flagged userData.leaf)
import * as THREE from 'three';

export const SEASON = { uSnow: { value: 0 }, uAutumn: { value: 0 } };

const NOISE = `
float sHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }   // (no big sin(): stays smooth at low float precision)
float sNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

export function seasonalize(mat, leaf = false) {
  if (!mat || !mat.isMeshStandardMaterial || mat.userData.season) return;
  mat.userData.season = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uSnow = SEASON.uSnow; sh.uniforms.uAutumn = SEASON.uAutumn;
    sh.vertexShader = 'varying vec3 vSP;\nvarying vec3 vSN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 sP = vec4(transformed, 1.0); vec3 sN = objectNormal;
      #ifdef USE_INSTANCING
        sP = instanceMatrix * sP; sN = mat3(instanceMatrix) * sN;
      #endif
      sP = modelMatrix * sP; vSP = sP.xyz; vSN = normalize(mat3(modelMatrix) * sN);`);
    sh.fragmentShader = 'uniform float uSnow;\nuniform float uAutumn;\nvarying vec3 vSP;\nvarying vec3 vSN;\n' + NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${leaf ? `if (uAutumn > .001) { float h = sHash(floor(vSP.xz * .5) + 3.1);
        vec3 a = h < .3 ? vec3(.80, .43, .14) : h < .58 ? vec3(.88, .64, .20) : h < .8 ? vec3(.64, .24, .12) : vec3(.52, .47, .18);
        float l = dot(diffuseColor.rgb, vec3(.3, .59, .11)); diffuseColor.rgb = mix(diffuseColor.rgb, a * (.55 + l * 1.1), uAutumn * .9); }` : ''}
      if (uSnow > .001) { float up = smoothstep(.35, .85, normalize(vSN).y);
        // broad soft drifts (fine noise with a hard edge aliased into a pixel pattern from afar)
        float n = sNoise(vSP.xz * .15) * .6 + sNoise(vSP.xz * .5 + 7.3) * .28 + sNoise(vSP.xz * 1.4 + 3.1) * .12;
        float s = up * smoothstep(1.0 - uSnow * .95, 1.22 - uSnow * .85, n + .1);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.92, .94, .97), s); }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|season' + (leaf ? 'L' : '');
  mat.needsUpdate = true;
}

// every material in the scene, except what never takes snow (water, glass, effects)
export function seasonalizeScene(root, skip = new Set()) {
  root.traverse(o => {
    if (!o.isMesh || skip.has(o) || o.userData.noSeason) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !m.transparent) seasonalize(m, !!o.userData.leaf);
  });
}

// how much snow / autumn a place gets in a season (by climate and latitude)
export function seasonTargets(season, lat, biome) {
  const al = Math.abs(lat), cold = biome === 'temperate' || biome === 'steppe' || biome === 'boreal';
  if (season === 'winter' && cold && al >= 33) return { snow: .3 + .35 * Math.min(1, (al - 33) / 12) + (biome === 'boreal' ? .2 : 0), autumn: 0 };   // patchy in the south, a fuller cover further north
  if (season === 'autumn' && cold && al >= 30) return { snow: 0, autumn: 1 };
  return { snow: 0, autumn: 0 };
}
