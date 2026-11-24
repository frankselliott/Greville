// Proposed-only / historical-only masks from depth-tested renders. Both scenarios are rendered from the SAME camera matrices into
// off-screen targets with every non-tower surface black and the scenario's tower solids white (so context, terrain and the other
// scenario's absence are all respected by the depth test). Areas are summed with the exact pinhole pixel solid angle.
import * as THREE from '../vendor/three/three.module.min.js';
import { SCEN_KEYS } from './scene_build.js';
import * as CM from './camera_model.js';
const SQD = (180 / Math.PI) ** 2;
export function renderMaskPixels(app, par, scen, w, h) {
  const R = app.renderer, rt = new THREE.WebGLRenderTarget(w, h, { samples: 0 });
  const saved = []; const towerKeys = new Set(SCEN_KEYS);
  app.applyVisibility(scen); const mv = app.markers.visible; app.markers.visible = false;
  const bgs = app.fx?.backgrounds() || [], bgV = bgs.map(b => b.visible); bgs.forEach(b => { b.visible = false; });   // sky and backdrop never count
  saved.push([app.groups.BACKDROP, 'visible', app.groups.BACKDROP.visible]); app.groups.BACKDROP.visible = false;
  app.root.traverse(o => {
    if (o.isLineSegments) { saved.push([o, 'visible', o.visible]); o.visible = false; return; }
    if (o.isMesh || o.isInstancedMesh) { saved.push([o, 'material', o.material]); const coll = o.userData?.collection; o.material = coll && towerKeys.has(coll) ? app.M.white : app.M.black; }
  });
  app.setCameraMatrices(par, app.cam.W, app.cam.H);
  const prevRT = R.getRenderTarget(), prevClear = R.getClearColor(new THREE.Color()).getHex(), sc = R.getScissorTest();
  // the target's own viewport (0, 0, w, h) is used as is: renderer.setViewport() would multiply it by the device pixel ratio
  rt.viewport.set(0, 0, w, h); rt.scissorTest = false;
  R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(); R.render(app.scene, app.camera);
  const px = new Uint8Array(w * h * 4); R.readRenderTargetPixels(rt, 0, 0, w, h, px);
  R.setRenderTarget(prevRT); R.setClearColor(prevClear, 1); R.setScissorTest(sc);
  for (const [o, k, v] of saved) o[k] = v; app.markers.visible = mv; bgs.forEach((b, i) => { b.visible = bgV[i]; }); rt.dispose();
  const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[(h - 1 - y) * w + x] = px[(y * w + x) * 4] > 127 ? 1 : 0;   // flip to image rows
  return m;
}
export function maskCompare(app, par, A, B, w) {
  const W = app.cam.W, H = app.cam.H, h = Math.max(1, Math.round(w * H / W)), s = w / W;
  const ps = par.slice(); ps[6] *= s; ps[7] *= s; ps[8] *= h / H;                       // intrinsics at mask resolution
  const mA = renderMaskPixels(app, par, A, w, h), mB = renderMaskPixels(app, par, B, w, h);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
  let add = 0, rem = 0, ta = 0, tb = 0, fr = 0, topA = -90, topB = -90;
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const i = v * w + u, sa = CM.pixelSolidAngle(ps, u + 0.5, v + 0.5) * SQD; fr += sa; const a = mA[i], b = mB[i];
    if (a || b) { const el = CM.azEl(CM.pixelRay(ps, u + 0.5, v + 0.5))[1]; if (a) { ta += sa; topA = Math.max(topA, el); } if (b) { tb += sa; topB = Math.max(topB, el); } }
    if (b && !a) { add += sa; img.data.set([235, 104, 52, 150], i * 4); } else if (a && !b) { rem += sa; img.data.set([42, 120, 214, 150], i * 4); }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, A, B, w, h, add_deg2: add, removed_deg2: rem, towerA_deg2: ta, towerB_deg2: tb, frame_deg2: fr, topA_deg: ta ? topA : null, topB_deg: tb ? topB : null };
}
