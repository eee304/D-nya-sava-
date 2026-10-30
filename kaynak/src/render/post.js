// Screen effects shared by the world map and the region view: ambient occlusion, bloom, a colour grade per era
// and a vignette, plus a soft sky environment map for reflections. Quality: 'low' renders straight to the screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const QUALITIES = ['low', 'medium', 'high'];
export const QUALITY_LABEL = { auto: 'Otomatik', low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

// display-space grade: saturation, contrast, split toning, sepia, vignette and a little film grain
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uSat: { value: 1 }, uCon: { value: 1 }, uSepia: { value: 0 },
    uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) },
    uVig: { value: .3 }, uGrain: { value: .02 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat, uCon, uSepia, uVig, uGrain, uTime; uniform vec3 uLift, uGain; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, uSat);
      c = (c - .5) * uCon + .5;
      c = mix(c, l * vec3(1.08, .97, .78), uSepia);
      c = c * uGain + uLift * (1.0 - c);
      vec2 d = (vUv - .5) * vec2(uRes.x / uRes.y, 1.0);
      c *= 1.0 - uVig * smoothstep(.45, 1.15, length(d));
      c += (h(vUv * uRes + fract(uTime) * 91.7) - .5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);   // opaque: blended sprites must not punch holes in the canvas
    }`,
};

// looks per scene: 1810 is warm and a touch faded, 2014 crisp and slightly cool
const GRADES = {
  'world-1810': { sat: .86, con: 1.05, sepia: .16, lift: [.02, .012, .0], gain: [1.03, 1.0, .93], vig: .55, grain: .025 },
  'world-2014': { sat: 1.04, con: 1.05, sepia: 0, lift: [0, .008, .02], gain: [1, 1, 1.02], vig: .4, grain: .012 },
  'region-1810': { sat: .98, con: 1.06, sepia: .06, lift: [.014, .008, 0], gain: [1.03, 1.0, .95], vig: .38, grain: .018 },
  'region-2014': { sat: 1.02, con: 1.07, sepia: 0, lift: [0, .006, .016], gain: [.99, 1, 1.02], vig: .32, grain: .01 },
};

// soft sky light for reflections: bright horizon, blue zenith, dull earth below
export function skyEnvironment(renderer) {
  const s = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), p = g.attributes.position, col = new Float32Array(p.count * 3);
  const zen = new THREE.Color('#5d86b8'), hor = new THREE.Color('#d9e3ea'), gnd = new THREE.Color('#5a5446'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(zen, Math.pow(y, .6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 4));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.6) }));
  sun.position.set(5, 7, -3); s.add(sun);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, .02);
  pm.dispose(); g.dispose();
  return rt.texture;
}

export class Post {
  constructor(renderer) {
    this.renderer = renderer; this.quality = 'high'; this.grade = 'region-2014';
    this.size = new THREE.Vector2(); renderer.getSize(this.size);
    this.ao = new Map();   // camera -> GTAO pass (each camera needs its own projection setup)
  }
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q; this.dispose();
  }
  setGrade(key) { this.grade = key; }
  setSize(w, h) {
    this.size.set(w, h);
    if (this.composer) { this.composer.setSize(w, h); this.bloom.setSize(w, h); for (const p of this.ao.values()) p.setSize(w * this.pr, h * this.pr); }
  }
  build() {
    const r = this.renderer, w = this.size.x, h = this.size.y; this.pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * this.pr, h * this.pr, { type: THREE.HalfFloatType, samples: r.capabilities.isWebGL2 ? 4 : 0 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(null, null); this.composer.addPass(this.renderPass);
    this.aoSlot = this.composer.passes.length;
    // only very bright things glow: fire, muzzle flashes, sun glints on water
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), .32, .55, .92); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(GradeShader); this.composer.addPass(this.gradePass);
  }
  aoFor(scene, camera) {
    let p = this.ao.get(camera);
    if (!p) {
      p = new GTAOPass(scene, camera, this.size.x * this.pr, this.size.y * this.pr);
      // r160 sets this define with a typo, so orthographic cameras got the perspective depth maths
      p.gtaoMaterial.defines.PERSPECTIVE_CAMERA = camera.isPerspectiveCamera ? 1 : 0; p.gtaoMaterial.needsUpdate = true;
      p.updateGtaoMaterial({ radius: camera.userData.aoRadius || 1.5, distanceExponent: 1, thickness: 2, scale: 1.4, samples: 12 });
      p.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      p.blendIntensity = 1;
      // smoke, flashes and decals are see-through: keep them out of the AO depth/normal pass or they cast square shadows
      p.overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse(o => {
          cache.set(o, o.visible);
          if (o.isPoints || o.isLine || o.isSprite || (o.material && o.material.transparent && !o.material.depthWrite)) o.visible = false;
        });
      };
      this.ao.set(camera, p);
    }
    p.scene = scene;
    return p;
  }
  render(scene, camera, t = 0) {
    if (this.quality === 'low') { this.renderer.render(scene, camera); return; }
    if (!this.composer) this.build();
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    // swap the AO pass in or out without rebuilding the chain
    const want = this.quality === 'high' && camera.userData.ao !== false ? this.aoFor(scene, camera) : null, cur = this.composer.passes[this.aoSlot];
    if (cur !== want) {
      if (cur instanceof GTAOPass) this.composer.passes.splice(this.aoSlot, 1);
      if (want) this.composer.passes.splice(this.aoSlot, 0, want);
    }
    const g = GRADES[this.grade] || GRADES['region-2014'], u = this.gradePass.uniforms;
    u.uSat.value = g.sat; u.uCon.value = g.con; u.uSepia.value = g.sepia; u.uVig.value = g.vig; u.uGrain.value = g.grain;
    u.uLift.value.setRGB(...g.lift); u.uGain.value.setRGB(...g.gain); u.uTime.value = t; u.uRes.value.copy(this.size);
    this.composer.render();
  }
  dispose() {
    if (!this.composer) return;
    for (const p of this.ao.values()) p.dispose();
    this.ao.clear();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.bloom.dispose(); this.composer = null;
  }
}
