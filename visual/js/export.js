// Evidence-state export: a PNG rendered off-screen at the exact frame size, plus a JSON sidecar that records everything needed to
// reproduce it. Technical record only, not expert evidence; nothing is uploaded.
import * as THREE from '../vendor/three/three.module.min.js';
import * as K from './coords.js';
import * as CM from './camera_model.js';
import { maskCompare } from './compare.js';
import { sha256Hex, appFileHashes } from './hash.js';

const DRAWINGS = {   // drawing references as recorded in the archive source registers (SOURCE_REGISTER.md §2)
  E1_SK48: ['SK00.03 Rev A Building Envelope Plan (received, not approved; A005453331); RL 48.0 inferred'],
  E1_SK52: ['SK00.03 Rev A (received, not approved; A005453331); RL 52.0 sensitivity'],
  E1_SK48_POD: ['SK00.03 Rev A; plus approved podium DA-103 Rev 16 / DA-402 Rev 10 (hypothetical addition)'],
  E2: ['A006835434 approved Buildings A/B plans (VA2 plate massing; DA-108 for the A lift overrun)'],
  E2c: ['A006835434 approved plans; DA-106 Rev 18 / DA-107 Rev 15 (B west balcony line); DA-103 Rev 16, DA-402 Rev 10 (podiums), scaled'],
  context: ['Stage 5 approved townhouse plans A006720399 (TP series); Queensland Government LiDAR (buildings, DEM, canopy; CC BY 4.0); DCDB'],
};
function panelsFor(view, W, H) {
  if (view === 'side') return { OW: 2 * W, OH: H, rects: [[0, 0, W, H], [W, 0, W, H]] };
  if (view === 'framing') return { OW: 2 * W, OH: 2 * H, rects: [[0, 0, W, H], [W, 0, W, H], [0, H, W, H], [W, H, W, H]] };
  return { OW: W, OH: H, rects: [[0, 0, W, H]] };
}
export async function renderExport(app) {
  const st = app.state, c = app.cam, W = c.W, H = c.H; const { OW, OH, rects } = panelsFor(st.view, W, H);
  const R = app.renderer, rt = new THREE.WebGLRenderTarget(OW, OH, { samples: 4 }); const prev = R.getRenderTarget();
  const A = app.activeScenario('historical'), B = app.activeScenario('approved'), cur = app.activeScenario(), par = app.renderPar();
  const panels = [];
  R.setRenderTarget(rt); R.setScissorTest(true); R.setClearColor(0xeef1f4, 1);
  const draw = (rect, p, scen, clip = null) => {
    app.applyVisibility(scen); app.setCameraMatrices(p, W, H);
    const [x, y, w, h] = rect, gy = OH - y - h; R.setViewport(x, gy, w, h);
    R.setScissor(clip ? x + Math.round(clip[0] * w) : x, gy, clip ? Math.round((clip[1] - clip[0]) * w) : w, h); R.clear(); R.render(app.scene, app.camera);
  };
  if (st.view === 'side') { draw(rects[0], par, A); draw(rects[1], par, B); panels.push({ rect: rects[0], scenario: A }, { rect: rects[1], scenario: B }); }
  else if (st.view === 'swipe') { draw(rects[0], par, A, [0, st.swipe]); draw(rects[0], par, B, [st.swipe, 1]); panels.push({ rect: rects[0], scenario: A, clip: [0, st.swipe] }, { rect: rects[0], scenario: B, clip: [st.swipe, 1] }); }
  else if (st.view === 'framing') st.framing.forEach((fr, i) => { const p = app.par(); p[4] = fr.pitch; p[6] = CM.focalFromHfov(W, fr.hfov); draw(rects[i], p, cur); panels.push({ rect: rects[i], scenario: cur, hfov_deg: fr.hfov, pitch_deg: fr.pitch, par: p }); });
  else if (st.view === 'mask') { draw(rects[0], par, B); panels.push({ rect: rects[0], scenario: B, overlay: `mask ${B} vs ${A}` }); }
  else { draw(rects[0], par, cur); panels.push({ rect: rects[0], scenario: cur }); }
  const px = new Uint8Array(OW * OH * 4); R.readRenderTargetPixels(rt, 0, 0, OW, OH, px); R.setScissorTest(false); R.setRenderTarget(prev); rt.dispose();
  const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH; const ctx = cv.getContext('2d'); const img = ctx.createImageData(OW, OH);
  for (let y = 0; y < OH; y++) img.data.set(px.subarray((OH - 1 - y) * OW * 4, (OH - y) * OW * 4), y * OW * 4);
  ctx.putImageData(img, 0, 0);
  let mask = null;
  if (st.view === 'mask') { mask = maskCompare(app, par, A, B, W); ctx.drawImage(mask.canvas, 0, 0, W, H); }
  const annotations = [];
  if (panels.length > 1 || st.view === 'mask') {                      // multi-panel outputs carry minimal burned-in identifiers
    ctx.font = `${Math.max(12, Math.round(W / 90))}px sans-serif`;
    for (const p of panels) { const t = p.overlay || (p.hfov_deg ? `${p.scenario} HFOV ${p.hfov_deg} pitch ${p.pitch_deg}` : p.scenario); const x = p.rect[0] + (p.clip ? p.clip[0] * p.rect[2] : 0) + 8, y = p.rect[1] + 8; const tw = ctx.measureText(t).width; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y, tw + 10, Math.round(W / 60)); ctx.fillStyle = '#111'; ctx.fillText(t, x + 5, y + Math.round(W / 80)); annotations.push(t); }
  }
  app.render();
  const blob = await new Promise(res => cv.toBlob(res, 'image/png')); const buf = await blob.arrayBuffer();
  return { blob, buf, OW, OH, panels, mask, annotations, par };
}
export async function buildRecord(app, out) {
  const st = app.state, c = app.cam, p = app.preset(st.preset); const [E, N] = K.localToMga(c.x, c.y, c.z); const g = K.demAt(app.S.terrain, c.x, c.y);
  const m = CM.threeCameraMatrices(out.par, c.W, c.H, app.camera.near, app.camera.far);
  const gl = app.renderer.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const scen = (id) => { const s = app.scenarios[id]; return { id, label: s.label, classification: s.classification, note: s.note, members: s.members.map(k => ({ collection: k, ...app.manifest.collections[k] })), drawings: DRAWINGS[id] || [] }; };
  const shown = [...new Set(out.panels.map(q => q.scenario).concat(st.view === 'mask' ? [app.activeScenario('historical')] : []))];
  const nonphysical = st.mode !== 'station';
  const classification = [...new Set([p.classification, ...shown.map(id => app.scenarios[id].classification), ...(st.mode === 'match' ? ['image-match estimate'] : []), ...(nonphysical ? ['nonphysical diagnostic camera'] : [])])];
  const rec = {
    schema: 'greville-visual-export/1', created_utc: new Date().toISOString(),
    status: 'Technical record of a model view. Not expert evidence, not survey-verified, not a photomontage.',
    classification,
    app: { name: 'greville-visual', version: app.version.version, source_commit: app.version.source_commit, source_commit_note: app.version.note, page_url: location.href.split('#')[0], app_file_sha256: await appFileHashes(new URL('./', location.href)) },
    camera: { preset_id: p.id, receptor: p.label, preset_classification: p.classification, mode: st.mode, nonphysical,
              crs: 'EPSG:7856 (GDA2020 MGA zone 56); RL metres AHD', mga_E: +E.toFixed(3), mga_N: +N.toFixed(3), eye_RL: +c.z.toFixed(3), eye_above_model_ground_m: +(c.z - g).toFixed(3),
              moved_from_preset_m: +Math.hypot(c.x - app.origin.x, c.y - app.origin.y).toFixed(3), local: { x: c.x, y: c.y, z: c.z, frame: app.S.frame.local },
              heading_deg: c.heading, pitch_deg: st.mode === 'overview' ? out.par[4] : c.pitch, roll_deg: c.roll, hfov_deg: CM.hfovFromFocal(c.W, out.par[6]),
              vfov_deg_centre: 2 * Math.atan(c.H / 2 / out.par[6]) * 180 / Math.PI, focal_px: out.par[6], principal_point_px: { cx: out.par[7], cy: out.par[8] }, shift: CM.shiftFromPrincipal(c.W, c.H, out.par[8]),
              projection: 'rectilinear pinhole; heading clockwise from grid north; pitch up positive; roll as archived adr_core.axes; pixel v downwards',
              render_parameters: out.par, frame_px: { W: c.W, H: c.H }, three_matrices: { world_col_major: m.world, projection_col_major: m.proj, near: app.camera.near, far: app.camera.far },
              eye_basis: p.eye_basis, framing_basis: p.framing_basis },
    view: { mode: st.view, swipe: st.view === 'swipe' ? st.swipe : undefined, panels: out.panels.map(q => ({ ...q, par: q.par || undefined })), output_px: { W: out.OW, H: out.OH }, burned_in_annotations: out.annotations },
    scenarios: shown.map(scen), context: { variant: st.context, canopy_layer: st.canopy, edges: st.edges, colour_mode: st.colour, lighting: 'fixed neutral diagnostic lighting (hemisphere + directional); not a sun position' },
    assets: app.manifest.assets, sources: app.manifest.sources, asset_manifest_generator: app.manifest.generator_sha256, context_drawings: DRAWINGS.context,
    mask_metrics: out.mask ? { note: 'Frame-limited angular areas for THIS camera and frame only. Not an amenity measure, not comparable across frames without stating denominators.', historical: out.mask.A, approved: out.mask.B,
                               only_approved_deg2: out.mask.add_deg2, only_historical_deg2: out.mask.removed_deg2, tower_historical_deg2: out.mask.towerA_deg2, tower_approved_deg2: out.mask.towerB_deg2, frame_deg2: out.mask.frame_deg2,
                               top_elevation_historical_deg: out.mask.topA_deg, top_elevation_approved_deg: out.mask.topB_deg, mask_px: [out.mask.w, out.mask.h] } : null,
    image_match: app.match.record(),
    assumptions: [p.eye_basis, 'Massing is schematic: balcony volumes filled to plate/balcony lines; balustrades, screens, finishes and windows are not modelled.',
                  'E1 is a reconstruction of a received (not approved) 2020 envelope; no 2020 RL was fixed.', 'No vegetation except the optional LiDAR canopy layer; no trees invented.'],
    limitations: ['Model geometry, not survey. Presets other than W01 are hypothetical positions.', 'Framing (HFOV, pitch, shift) changes what an image shows without any change to the geometry.',
                  'A low-residual image match can still be underdetermined; see image_match.flags.'],
    renderer: { webgl: gl.getParameter(gl.VERSION), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), antialias_samples: 4, three: 'r160.1' },
    png: { bytes: out.buf.byteLength, sha256: await sha256Hex(out.buf) },
  };
  return rec;
}
export async function exportPair(app) {
  const out = await renderExport(app); const rec = await buildRecord(app, out);
  const stamp = rec.created_utc.replace(/[:.]/g, '').slice(0, 15); const base = `greville_visual_${rec.camera.preset_id}_${app.activeScenario()}_${rec.view.mode}_${stamp}`;
  rec.png.file = base + '.png';
  const json = JSON.stringify(rec, null, 1);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  dl(out.blob, base + '.png'); dl(new Blob([json], { type: 'application/json' }), base + '.json');
  app.lastExport = { record: rec, png_sha256: rec.png.sha256, json };
  app.flash(`Exported ${base}.png and .json (PNG SHA-256 ${rec.png.sha256.slice(0, 16)}…)`);
  return rec;
}
