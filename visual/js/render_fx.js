// Render pipeline: physically based materials, sky + image-based environment light, true sun (frozen NOAA convention) with soft
// shadow maps, ground-truth ambient occlusion (GTAO), MSAA, ACES tone mapping and sRGB output. Every panel is rendered through the
// same composer into an off-screen target and then copied, pixel for pixel, into its rectangle on screen or in an export target.
// Lighting is ILLUSTRATIVE: it never changes geometry or camera, and shadows here are not a shadow study (see /study/).
import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from '../vendor/three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from '../vendor/three/addons/postprocessing/Pass.js';
import { CopyShader } from '../vendor/three/addons/shaders/CopyShader.js';
import { Sky } from '../vendor/three/addons/objects/Sky.js';
import { sunPosition, sunVectorLocal } from './sun.js';

// Aerial perspective: Beer–Lambert extinction exp(-beta d) with beta = 3.912 / V (Koschmieder; V = meteorological visibility),
// replacing three's squared FogExp2 term so the stated visibility means what it says. Display only: mask and occlusion renders
// never use fog (their materials have fog: false).
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace('1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth )', '1.0 - exp( - fogDensity * vFogDepth )');
export const VISIBILITY_M = { sun: 15000, overcast: 8000, dusk: 8000 };
const SITE_CENTRE = [60, -10, 30];                                   // local frame, centre of the shadow frustum
const L2T = (v) => new THREE.Vector3(v[0], v[2], -v[1]);
export const QUALITY = {
  high: { label: 'High (sun shadows 4096, AO, MSAA 4x, exports supersampled 2x)', shadow: 4096, ao: true, samples: 4, ssaa: 2 },
  medium: { label: 'Medium (shadows 2048, MSAA 4x, no AO)', shadow: 2048, ao: false, samples: 4, ssaa: 1 },
  low: { label: 'Low (no shadows, no AO)', shadow: 0, ao: false, samples: 0, ssaa: 1 },
};

function seeded(fn, seed = 20261121) {                              // run fn with a fixed Math.random sequence (mulberry32)
  const saved = Math.random; let a = seed >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = saved; }
}
function overcastDome() {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { Lz: { value: 1.25 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: 'uniform float Lz; varying vec3 vDir; void main() { float s = normalize(vDir).y; vec3 c = s >= 0.0 ? vec3(0.96, 0.97, 1.0) * Lz * (1.0 + 2.0 * s) / 3.0 : vec3(0.42, 0.41, 0.39) * Lz / 3.0; gl_FragColor = vec4(c, 1.0); }' });
  const d = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), m); d.name = 'OVERCAST_DOME'; d.frustumCulled = false; d.renderOrder = -1; return d;
}
function disposeComposer(c) { for (const p of c.passes) p.dispose?.(); c.dispose?.(); }

export class FX {
  constructor(app) {
    this.app = app; const R = app.renderer;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 0.85; R.outputColorSpace = THREE.SRGBColorSpace;
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap; R.shadowMap.autoUpdate = false;
    this.envI = 0.35; this.envOvercast = 1.0; this.expoOvercast = 1.0; this.hemiI = 0.12; this.sunI = 3.0; this.expo = 0.8;      // calibrated by eye against sunlit/shaded contrast (see QA.md)
    this.lighting = { mode: 'sun', date: [2026, 3, 21], time: [10, 0] }; this.quality = 'high'; this.interactive = false;
    // sky (rendered) and an identical sky in its own scene for the PMREM environment
    this.sky = new Sky(); this.sky.scale.setScalar(2500); this.sky.name = 'SKY'; app.scene.add(this.sky);
    this.envSky = new Sky(); this.envSky.scale.setScalar(2500); this.envScene = new THREE.Scene(); this.envScene.add(this.envSky);
    for (const s of [this.sky, this.envSky]) { const u = s.material.uniforms; u.turbidity.value = 3.5; u.rayleigh.value = 1.1; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8; }
    // overcast: CIE standard overcast sky, L(theta) = Lz (1 + 2 sin(elevation)) / 3, neutral; below the horizon a dim neutral ground
    this.dome = overcastDome(); app.scene.add(this.dome); this.envDome = overcastDome(); this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(R);
    this.hemi = new THREE.HemisphereLight(0xdfe8f5, 0x8f8a7e, 0.35); app.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e5, 3.2); this.sun.castShadow = true; app.scene.add(this.sun); app.scene.add(this.sun.target);
    const sc = this.sun.shadow.camera; sc.left = -330; sc.right = 330; sc.top = 330; sc.bottom = -330; sc.near = 1; sc.far = 2000;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35; this.sun.shadow.radius = 2.5;
    this.sun.target.position.copy(L2T(SITE_CENTRE));
    this.copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: CopyShader.vertexShader,       // opaque copy
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }', depthTest: false, depthWrite: false }));
    this.hdrType = R.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.composers = new Map(); this.setQuality(this.quality); this.applyLighting();
  }
  setQuality(q) {
    this.quality = q; const Q = QUALITY[q];
    this.sun.castShadow = Q.shadow > 0;
    if (Q.shadow && this.sun.shadow.mapSize.x !== Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    for (const c of this.composers.values()) disposeComposer(c); this.composers.clear();
  }
  dropComposers(prefix) { for (const [k, c] of [...this.composers]) if (k.startsWith(prefix + '')) { disposeComposer(c); this.composers.delete(k); } }
  sunNow() { const [y, m, d] = this.lighting.date, [hh, mi] = this.lighting.time; return sunPosition(y, m, d, hh, mi); }
  backgrounds() { return [this.sky, this.dome]; }
  applyLighting() {
    const L = this.lighting; const sunMode = L.mode === 'sun'; let up = false, v = new THREE.Vector3(0, 1, 0);
    if (sunMode) { const s = this.sunNow(); this.sunInfo = s; up = s.alt > 0.5; v = L2T(sunVectorLocal(Math.max(s.alt, -8), s.az)).normalize(); }
    else this.sunInfo = null;
    for (const s of [this.sky, this.envSky]) { s.visible = sunMode; s.material.uniforms.sunPosition.value.copy(v); }
    for (const d of [this.dome, this.envDome]) d.visible = !sunMode;
    this.sun.visible = sunMode && up; this.sun.intensity = this.sunI * Math.min(1, Math.max(0, (this.sunInfo?.alt ?? 0) / 4));   // fade in over the first 4 deg
    this.sun.position.copy(L2T(SITE_CENTRE)).addScaledVector(v, 900);
    this.hemi.intensity = sunMode ? (up ? this.hemiI : 0.05) : 0;
    this.envRT?.dispose(); this.envRT = this.pmrem.fromScene(this.envScene, 0.02); this.app.scene.environment = this.envRT.texture;
    const envI = !sunMode ? this.envOvercast : up ? this.envI : this.envI * 2.5;    // r160: per-material (scene.environmentIntensity is r163+)
    for (const m of Object.values(this.app.M)) if (m.isMeshStandardMaterial) m.envMapIntensity = envI;
    this.app.renderer.toneMappingExposure = !sunMode ? this.expoOvercast : up ? this.expo : this.expo * 2.2;
    const hazeKey = !sunMode ? 'overcast' : up ? 'sun' : 'dusk', hazeCol = { sun: 0xcfd9e3, overcast: 0xd6d8da, dusk: 0x6f7178 }[hazeKey];
    this.haze = { visibility_m: VISIBILITY_M[hazeKey], beta_per_m: 3.912 / VISIBILITY_M[hazeKey], colour: '#' + hazeCol.toString(16) };
    if (this.hazeOn === false) this.app.scene.fog = null;
    else if (this.app.scene.fog?.isFogExp2) { this.app.scene.fog.color.setHex(hazeCol); this.app.scene.fog.density = this.haze.beta_per_m; }
    else this.app.scene.fog = new THREE.FogExp2(hazeCol, this.haze.beta_per_m);
  }
  setHaze(on) { this.hazeOn = on; this.applyLighting(); }
  describe() {
    const L = this.lighting, p = (n) => String(n).padStart(2, '0');
    if (L.mode !== 'sun') return 'Lighting: overcast / neutral (no sun, no shadows). Illustrative.';
    const s = this.sunInfo; const when = `${L.date[0]}-${p(L.date[1])}-${p(L.date[2])} ${p(L.time[0])}:${p(L.time[1])} AEST`;
    return s.alt > 0.5 ? `Lighting: sun ${when} (alt ${s.alt.toFixed(1)}°, az ${s.az.toFixed(1)}°; NOAA, frozen convention). Illustrative shadows, not a shadow study.`
                       : `Lighting: ${when}: sun below the horizon (alt ${s.alt.toFixed(1)}°), shown as dusk light without shadows.`;
  }
  composer(key, w, h, pr) {
    const k = `${key}|${w}x${h}@${pr}|${this.quality}`; let c = this.composers.get(k);
    if (!c) {
      const Q = QUALITY[this.quality], R = this.app.renderer, W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: Q.samples, type: this.hdrType });
      c = new EffectComposer(R, rt); c.setPixelRatio(1); c.setSize(W, H); c.renderToScreen = false;
      c.addPass(new RenderPass(this.app.scene, this.app.camera));
      if (Q.ao) { const g = seeded(() => new GTAOPass(this.app.scene, this.app.camera, W, H));   // seeded noise: deterministic exports
        const ov = g.overrideVisibility.bind(g); g.overrideVisibility = () => { ov(); for (const b of this.backgrounds()) b.visible = false; };   // sky never occludes
        g.updateGtaoMaterial({ radius: 3.0, distanceExponent: 1.5, thickness: 3.0, scale: 1.0, samples: 16 }); g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); g.blendIntensity = 0.75; c.addPass(g); c.gtao = g; }
      c.addPass(new OutputPass()); c.W = W; c.H = H; this.composers.set(k, c);
      if (this.composers.size > 12) { const [k0, c0] = this.composers.entries().next().value; disposeComposer(c0); this.composers.delete(k0); }
    }
    return c;
  }
  /** Render one scenario from one camera into a rectangle. target: null (screen; rect in CSS px) or a WebGLRenderTarget (rect in target px). */
  renderPanel({ target = null, rect, par, scen, key = 'screen', pr = 1, clip = null }) {
    const app = this.app, R = app.renderer;
    app.applyVisibility(scen); app.setCameraMatrices(par, app.cam.W, app.cam.H);
    for (const b of this.backgrounds()) { b.position.setFromMatrixPosition(app.camera.matrixWorld); b.updateMatrixWorld(true); }   // sky centred on the eye
    R.shadowMap.needsUpdate = this.sun.castShadow && this.sun.visible;            // towers cast shadows: re-render per scenario
    const c = this.composer(key, rect.w, rect.h, pr); if (c.gtao) c.gtao.enabled = !this.interactive;
    c.render();
    this.blit(c.readBuffer.texture, target, rect, clip);
  }
  /** Scenario towers only, shaded under the current lighting, with ALPHA, at w x h; every other modelled surface (context,
   *  terrain, canopy if shown) writes depth only, so it hides the towers exactly as in the tested masks but adds no colour.
   *  Shadows are kept (context still casts onto the towers). Returns straight (un-premultiplied) RGBA bytes, rows top-down. */
  renderLayerRGBA(par, scen, w, h, { edges = false, storeys = false } = {}) {
    const app = this.app, R = app.renderer; const saved = []; const towerKeys = new Set(['E1_SK48', 'E1_SK52', 'E2', 'ARTW', 'POD']);
    app.applyVisibility(scen); app.setCameraMatrices(par, app.cam.W, app.cam.H);
    const depthOnly = this._depthOnly || (this._depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    for (const b of [...this.backgrounds(), app.markers, app.groups.BACKDROP]) { saved.push([b, 'visible', b.visible]); b.visible = false; }
    app.root.traverse(o => {
      const r = o.userData?.role;
      if (o.isLineSegments) { saved.push([o, 'visible', o.visible]); o.visible = o.visible && ((r === 'edge' && edges && towerKeys.has(o.userData.collection)) || (r === 'storeys' && storeys)); return; }
      if ((o.isMesh || o.isInstancedMesh) && !towerKeys.has(o.userData?.collection)) { saved.push([o, 'material', o.material], [o, 'renderOrder', o.renderOrder]); o.material = depthOnly; o.renderOrder = -10; }   // occluders first: they write depth only
    });
    R.shadowMap.needsUpdate = this.sun.castShadow && this.sun.visible;
    const Q = QUALITY[this.quality], rt = new THREE.WebGLRenderTarget(w, h, { samples: Q.samples || 4, type: this.hdrType });
    const c = new EffectComposer(R, rt); c.setPixelRatio(1); c.setSize(w, h); c.renderToScreen = false;
    c.addPass(new RenderPass(app.scene, app.camera, null, 0x000000, 0)); c.addPass(new OutputPass()); c.render();
    const out = new THREE.WebGLRenderTarget(w, h, { samples: 0 }); const q = this._copyA || (this._copyA = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: CopyShader.vertexShader,
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending })));
    q.material.uniforms.tDiffuse.value = c.readBuffer.texture; const prev = R.getRenderTarget(); out.scissorTest = false; R.setRenderTarget(out); R.setClearColor(0x000000, 0); R.clear(); q.render(R);
    const px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(out, 0, 0, w, h, px); R.setRenderTarget(prev); R.setClearColor(0xc9ced4, 1);
    disposeComposer(c); out.dispose();
    for (const [o, k, v] of saved.reverse()) o[k] = v;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((h - 1 - y) * w + x) * 4, j = (y * w + x) * 4, a = px[i + 3];
      if (a) { const k = 255 / a; img[j] = Math.min(255, px[i] * k); img[j + 1] = Math.min(255, px[i + 1] * k); img[j + 2] = Math.min(255, px[i + 2] * k); img[j + 3] = a; }
    }
    return img;
  }
  // rect: {x, yGL (from the bottom), w, h}; CSS px for the screen (the renderer applies the pixel ratio), target px for a render
  // target (set on the target itself, so the pixel ratio is NOT applied: this is the v1.0 high-DPI export/mask defect, fixed).
  blit(tex, target, rect, clip = null) {
    const R = this.app.renderer; this.copy.material.uniforms.tDiffuse.value = tex;
    const sx = clip ? rect.x + clip[0] * rect.w : rect.x, sw = clip ? (clip[1] - clip[0]) * rect.w : rect.w;
    if (target) { target.viewport.set(rect.x, rect.yGL, rect.w, rect.h); target.scissor.set(Math.round(sx), rect.yGL, Math.round(sw), rect.h); target.scissorTest = true; R.setRenderTarget(target); }
    else { R.setRenderTarget(null); R.setViewport(rect.x, rect.yGL, rect.w, rect.h); R.setScissor(sx, rect.yGL, sw, rect.h); R.setScissorTest(true); }
    this.copy.render(R);
    if (target) { target.scissorTest = false; target.viewport.set(0, 0, target.width, target.height); }
  }
}
