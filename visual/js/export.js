// Evidence-state export: a PNG rendered off-screen at the exact frame size, plus a JSON sidecar that records everything needed to
// reproduce it. Technical record only, not expert evidence; nothing is uploaded.
import * as THREE from '../vendor/three/three.module.min.js';
import * as K from './coords.js';
import * as CM from './camera_model.js';
import { maskCompare } from './compare.js';
import { sha256Hex, appFileHashes } from './hash.js';
import { QUALITY } from './render_fx.js';
import { SITE } from './sun.js';

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
  const ss = QUALITY[app.fx.quality].ssaa || 1;                                                    // supersampling factor (High: 2)
  const R = app.renderer, rt = new THREE.WebGLRenderTarget(OW * ss, OH * ss, { samples: 0 }); const prev = R.getRenderTarget();
  const A = app.activeScenario('historical'), B = app.activeScenario('approved'), cur = app.activeScenario(), par = app.renderPar();
  const panels = []; const fx = app.fx, wasInteractive = fx.interactive; fx.interactive = false;     // exports are always full quality
  R.setRenderTarget(rt); R.setClearColor(0xc9ced4, 1); R.clear();
  const draw = (rect, p, scen, clip = null, i = 0) => { const [x, y, w, h] = rect.map(v => v * ss); fx.renderPanel({ target: rt, rect: { x, yGL: OH * ss - y - h, w, h }, par: p, scen, key: `export${i}`, pr: 1, clip }); };
  if (st.view === 'side') { draw(rects[0], par, A, null, 0); draw(rects[1], par, B, null, 1); panels.push({ rect: rects[0], scenario: A }, { rect: rects[1], scenario: B }); }
  else if (st.view === 'swipe') { draw(rects[0], par, A, [0, st.swipe], 0); draw(rects[0], par, B, [st.swipe, 1], 1); panels.push({ rect: rects[0], scenario: A, clip: [0, st.swipe] }, { rect: rects[0], scenario: B, clip: [st.swipe, 1] }); }
  else if (st.view === 'framing') st.framing.forEach((fr, i) => { const p = app.par(); p[4] = fr.pitch; p[6] = CM.focalFromHfov(W, fr.hfov); draw(rects[i], p, cur, null, i); panels.push({ rect: rects[i], scenario: cur, hfov_deg: fr.hfov, pitch_deg: fr.pitch, par: p }); });
  else if (st.view === 'mask') { draw(rects[0], par, B); panels.push({ rect: rects[0], scenario: B, overlay: `mask ${B} vs ${A}` }); }
  else { draw(rects[0], par, cur); panels.push({ rect: rects[0], scenario: cur }); }
  const big = new Uint8Array(OW * ss * OH * ss * 4); R.readRenderTargetPixels(rt, 0, 0, OW * ss, OH * ss, big); R.setRenderTarget(prev); rt.dispose();
  const px = ss === 1 ? big : downsampleLinear(big, OW, OH, ss);
  fx.dropComposers('export'); fx.interactive = wasInteractive;
  const cv = document.createElement('canvas'); cv.width = OW; cv.height = OH; const ctx = cv.getContext('2d'); const img = ctx.createImageData(OW, OH);
  for (let y = 0; y < OH; y++) img.data.set(px.subarray((OH - 1 - y) * OW * 4, (OH - y) * OW * 4), y * OW * 4);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;                                    // opaque output
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
function lightingRecord(app) {
  const L = app.fx.lighting, s = app.fx.sunInfo, p = (n) => String(n).padStart(2, '0');
  const base = { status: 'ILLUSTRATIVE: display lighting only; it changes no geometry or camera and is not a shadow study.', mode: L.mode };
  if (L.mode !== 'sun') return { ...base, description: 'overcast / neutral sky light, no direct sun, no shadows' };
  return { ...base, date: `${L.date[0]}-${p(L.date[1])}-${p(L.date[2])}`, time_local: `${p(L.time[0])}:${p(L.time[1])}`, timezone: 'AEST (UTC+10, no daylight saving)',
           sun_altitude_deg: s.alt, sun_azimuth_deg: s.az, sun_above_horizon: s.alt > 0.5, azimuth_reference: 'clockwise from grid north (MGA56); grid convergence ~0.01 deg ignored',
           engine: 'NOAA geometric algorithm, no refraction; port of model/greville_model/solar.py (unit-tested to 1e-9 deg)', site: SITE };
}
function storeyRecord(app) {
  const L = app.S.levels; return { E2: { status: L.E2.status, source: L.E2.source, style: 'solid' }, E1: { status: L.E1.status, source: L.E1.source, style: 'dashed' } };
}
// box-filter an (ss*W) x (ss*H) sRGB RGBA buffer to W x H, averaging in linear light (exact, deterministic)
const S2L = new Float64Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const L2S = (v) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
export function downsampleLinear(src, W, H, ss) {
  const out = new Uint8Array(W * H * 4), BW = W * ss, n = ss * ss;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0; for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) { const i = ((y * ss + dy) * BW + x * ss + dx) * 4; r += S2L[src[i]]; g += S2L[src[i + 1]]; b += S2L[src[i + 2]]; }
    const o = (y * W + x) * 4; out[o] = L2S(r / n); out[o + 1] = L2S(g / n); out[o + 2] = L2S(b / n); out[o + 3] = 255;
  }
  return out;
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
    scenarios: shown.map(scen), context: { variant: st.context, canopy_layer: st.canopy, edges: st.edges, storey_lines: st.storeys ? storeyRecord(app) : false, colour_mode: st.colour,
                                           ground: st.ground === 'plain' ? 'plain' : { layer: st.ground, source: 'assets/basemap.json (DCDB parcels, 1 m contours, rail; (c) State of Queensland, CC BY 4.0)', sha256: app.manifest.assets['basemap.json']?.sha256, note: 'cartographic index, not survey or imagery' } },
    lighting: lightingRecord(app),
    assets: app.manifest.assets, sources: app.manifest.sources, asset_manifest_generator: app.manifest.generator_sha256, context_drawings: DRAWINGS.context,
    mask_metrics: out.mask ? { note: 'Frame-limited angular areas for THIS camera and frame only. Not an amenity measure, not comparable across frames without stating denominators.', historical: out.mask.A, approved: out.mask.B,
                               only_approved_deg2: out.mask.add_deg2, only_historical_deg2: out.mask.removed_deg2, tower_historical_deg2: out.mask.towerA_deg2, tower_approved_deg2: out.mask.towerB_deg2, frame_deg2: out.mask.frame_deg2,
                               top_elevation_historical_deg: out.mask.topA_deg, top_elevation_approved_deg: out.mask.topB_deg, mask_px: [out.mask.w, out.mask.h] } : null,
    image_match: app.match.record(),
    assumptions: [p.eye_basis, 'Massing is schematic: balcony volumes filled to plate/balcony lines; balustrades, screens, finishes and windows are not modelled.',
                  'E1 is a reconstruction of a received (not approved) 2020 envelope; no 2020 RL was fixed.', 'No vegetation except the optional LiDAR canopy layer; no trees invented.'],
    limitations: ['Model geometry, not survey. Presets other than W01 are hypothetical positions.', 'Framing (HFOV, pitch, shift) changes what an image shows without any change to the geometry.',
                  'A low-residual image match can still be underdetermined; see image_match.flags.'],
    renderer: { webgl: gl.getParameter(gl.VERSION), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), three: 'r160.1', quality: app.fx.quality, ...QUALITY[app.fx.quality],
                pipeline: 'MeshStandardMaterial (PBR, untextured neutral tones); Sky + PMREM image-based light; DirectionalLight at the sun vector with PCF soft shadow map; GTAO ambient occlusion (seeded noise) when quality=high; MSAA; ACES filmic tone mapping; sRGB output',
                depth: { near: app.camera.near, far: app.camera.far, logarithmic: false }, supersampling: QUALITY[app.fx.quality].ssaa || 1,
                aerial_perspective: app.scene.fog ? { model: 'exp(-beta d), beta = 3.912 / visibility (Koschmieder)', ...app.fx.haze, applies_to: 'display render only; never masks' } : 'off' },
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
