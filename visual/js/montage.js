// Photomontage, entirely in the browser: the user's own photograph (read locally, never uploaded) is the background; the camera
// comes from the landmark fit (match.js) with the lens from EXIF where recorded; the scenario towers are rendered under the sun
// for the photo's capture time and composited only where the model says they are visible (depth-tested against every modelled
// surface), less any foreground the user paints (trees, poles, fences the model does not contain).
// Outputs follow the elements that photomontage practice asks for (NSW LEC Policy PPL 15, used as the reference in the absence of
// a Queensland direction): the unaltered photo, a wireline, the montages, a camera plan, and a record of camera, lens, time,
// alignment residuals and data sources. It is a camera-matched montage: it is NOT survey-verified unless the camera station and
// reference points are independently surveyed, and the record says so.
import * as CM from './camera_model.js';
import * as K from './coords.js';
import { renderMaskPixels } from './compare.js';
import { parseExif, photoSummary, captureTimeAEST, focalPxFrom35, latLonToMGA } from './photo_meta.js';
import { sha256Hex, appFileHashes } from './hash.js';
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, '0');

export const LAYERS = {
  E2: 'Approved (E2) massing',
  E1: 'Historical (E1) massing',
  diff: 'As-built check: E1 outline + E2-only tint',
  wire: 'Wireline: E1 and E2 outlines',
};

export class Montage {
  constructor(app) {
    this.app = app; this.on = false; this.layer = 'E2'; this.exposure = 1; this.painting = false; this.brush = 24; this.meta = null; this.mask = null; this.maskDirty = false;
    const on = $('montageOn'); on.onchange = () => { this.on = on.checked; if (this.on && !this.app.match.image) { this.on = on.checked = false; return this.app.flash('Load a photograph first (Photo match and montage).'); } this.app.render(); };
    $('montageLayer').onchange = (e) => { this.layer = e.target.value; this.app.render(); };
    $('montageExposure').oninput = (e) => { this.exposure = +e.target.value; $('montageExpOut').textContent = this.exposure.toFixed(2); this.app.render(); };
    $('btnPaint').onclick = () => this.setPainting(!this.painting);
    $('brushSize').oninput = (e) => { this.brush = +e.target.value; };
    $('btnClearMask').onclick = () => { this.resetMask(); this.app.render(); };
    $('btnPhotoTime').onclick = () => this.usePhotoTime();
    $('btnGpsPrior').onclick = () => this.useGpsPrior();
    $('btnMontageExport').onclick = () => this.exportPackage().catch(e => this.app.flash('Montage export failed: ' + e.message));
    const st = app.stage; let down = false;
    const paint = (e) => { if (!this.painting || !down) return; e.preventDefault(); this.paintAt(e, e.shiftKey); };
    st.addEventListener('pointerdown', (e) => { if (!this.painting) return; down = true; try { st.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ } paint(e); });
    st.addEventListener('pointermove', paint); st.addEventListener('pointerup', () => { if (down) { down = false; this.app.render(); } });
    this.ui();
  }
  // ---------------------------------------------------------------- photo metadata
  onImage(img, buf) {                                 // called by MatchUI after a photo is loaded
    const ex = img.type === 'image/jpeg' ? parseExif(buf) : {}; const s = photoSummary(ex);
    const fpx = s.focal_35mm_equiv ? focalPxFrom35(s.focal_35mm_equiv, img.W, img.H) : null;
    const mga = s.gps ? latLonToMGA(s.gps.lat, s.gps.lon) : null; const t = captureTimeAEST(s);
    this.meta = { summary: s, f_px_from_exif: fpx, hfov_from_exif: fpx ? CM.hfovFromFocal(img.W, fpx) : null, gps_mga: mga, capture_aest: t };
    if (fpx) { const c = this.app.cam; this.app.cam = { ...c, hfov: this.meta.hfov_from_exif }; $('fixF').checked = true; $('fixF').disabled = false; }
    else { $('fixF').checked = false; $('fixF').disabled = true; }
    this.resetMask(); this.ui(); this.app.render();
  }
  usePhotoTime() {
    const t = this.meta?.capture_aest; if (!t) return this.app.flash('The photo records no capture time (EXIF DateTimeOriginal).');
    $('lDate').value = `${t.date[0]}-${pad2(t.date[1])}-${pad2(t.date[2])}`; $('lDate').dispatchEvent(new Event('change'));
    $('lTime').value = String(t.time[0] * 60 + t.time[1]); $('lTime').dispatchEvent(new Event('input'));
    document.querySelector('input[name=light][value=sun]').checked = true; document.querySelector('input[name=light][value=sun]').dispatchEvent(new Event('change'));
    this.app.flash(`Sun set to the photo's time, ${t.date.join('-')} ${pad2(t.time[0])}:${pad2(t.time[1])} AEST${t.assumed_offset ? ' (no time zone recorded: AEST assumed)' : ''}. If the sky was overcast, choose Overcast lighting.`);
  }
  useGpsPrior() {
    const m = this.meta?.gps_mga; if (!m) return this.app.flash('The photo has no GPS position.');
    const sd = Math.max(5, this.meta.summary.gps.h_error_m || 0); const c = this.app.cam; const x = m.E - K.E0, y = m.N - K.N0;
    document.querySelector('input[name=mode][value=free]').checked = true; this.app.setMode('free');
    this.app.setCam({ ...c, x, y, z: K.demAt(this.app.S.terrain, x, y) + 1.6 });
    $('priorXY').checked = true; $('priorXYsd').value = String(sd);
    this.app.flash(`Camera moved to the photo's GPS position (MGA E ${m.E.toFixed(1)} N ${m.N.toFixed(1)}), eye 1.6 m above model ground; station prior ±${sd} m. Phone GPS is typically several metres out: the fit, not the GPS, sets the camera.`);
  }
  // ---------------------------------------------------------------- foreground mask (unmodelled objects in front of the towers)
  resetMask() { const im = this.app.match?.image; if (!im) { this.mask = null; return; } const c = document.createElement('canvas'); c.width = im.W; c.height = im.H; this.mask = c; this.maskDirty = false; }
  setPainting(v) { this.painting = v; if (v && !this.on) { $('montageOn').checked = true; this.on = true; } $('btnPaint').classList.toggle('on', v); $('btnPaint').textContent = v ? 'Painting foreground… (Shift = erase; click to stop)' : 'Paint foreground mask'; this.app.render(); }
  paintAt(e, erase) {
    if (!this.mask) return; const panel = this.app.panelRects()[0], r = this.app.stage.getBoundingClientRect(), W = this.mask.width, H = this.mask.height;
    const u = (e.clientX - r.left - panel.x) / panel.w * W, v = (e.clientY - r.top - panel.y) / panel.h * H, rad = this.brush / panel.w * W;
    const g = this.mask.getContext('2d'); g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; g.fillStyle = '#fff'; g.beginPath(); g.arc(u, v, rad, 0, 2 * Math.PI); g.fill();
    this.maskDirty = true; this.app.render();
  }
  paintPolygon(pts, erase = false) {                  // programmatic paint (tests, or exact edges): pts in photo pixels
    if (!this.mask) return; const g = this.mask.getContext('2d'); g.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; g.fillStyle = '#fff';
    g.beginPath(); pts.forEach(([u, v], i) => i ? g.lineTo(u, v) : g.moveTo(u, v)); g.closePath(); g.fill(); this.maskDirty = true;
  }
  maskAt(w, h) { if (!this.mask) return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(this.mask, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; const m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0; return m; }
  // ---------------------------------------------------------------- composition
  scenarios() { return { A: this.app.activeScenario('historical'), B: this.app.activeScenario('approved') }; }
  /** Composite at w x h into a new canvas. layer: 'E1' | 'E2' | 'diff' | 'wire'. */
  compose(w, h, layer = this.layer) {
    const a = this.app, im = a.match.image, par = a.par(), { A, B } = this.scenarios(); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    g.drawImage(im.el, 0, 0, w, h); const fg = this.maskAt(w, h); const lw = Math.max(2, w / 600);
    const outline = (m, rgb, alphaHidden = 0.35) => {
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x; if (!m[i] || (m[i - 1] && m[i + 1] && m[i - w] && m[i + w])) continue;
        const al = fg && fg[i] ? alphaHidden : 1; for (let dy = -Math.floor(lw / 2); dy <= Math.floor(lw / 2); dy++) for (let dx = -Math.floor(lw / 2); dx <= Math.floor(lw / 2); dx++) {
          const j = ((y + dy) * w + x + dx) * 4; if (j < 0 || j >= d.length) continue; d[j] = d[j] * (1 - al) + rgb[0] * al; d[j + 1] = d[j + 1] * (1 - al) + rgb[1] * al; d[j + 2] = d[j + 2] * (1 - al) + rgb[2] * al; }
      }
      g.putImageData(img, 0, 0);
    };
    const info = { layer, scenarios: [], foreground_mask_px: fg ? fg.reduce((s, v) => s + v, 0) : 0 };
    if (layer === 'E1' || layer === 'E2') {
      const scen = layer === 'E1' ? A : B; info.scenarios = [scen];
      const L = a.fx.renderLayerRGBA(par, scen, w, h); const img = g.getImageData(0, 0, w, h), d = img.data; const ex = this.exposure;
      for (let i = 0; i < w * h; i++) { let al = L[i * 4 + 3] / 255; if (!al) continue; if (fg && fg[i]) al = 0; const j = i * 4; for (let k = 0; k < 3; k++) d[j + k] = d[j + k] * (1 - al) + Math.min(255, L[j + k] * ex) * al; }
      g.putImageData(img, 0, 0);
    } else {
      const mA = renderMaskPixels(a, par, A, w, h), mB = renderMaskPixels(a, par, B, w, h); info.scenarios = [A, B];
      if (layer === 'diff') {                          // tint where only the approved form is (outside the historical envelope)
        const img = g.getImageData(0, 0, w, h), d = img.data;
        for (let i = 0; i < w * h; i++) if (mB[i] && !mA[i] && !(fg && fg[i])) { const j = i * 4; d[j] = d[j] * 0.6 + 235 * 0.4; d[j + 1] = d[j + 1] * 0.6 + 104 * 0.4; d[j + 2] = d[j + 2] * 0.6 + 52 * 0.4; }
        g.putImageData(img, 0, 0); outline(mA, [27, 175, 122]);
      } else { outline(mB, [235, 104, 52]); outline(mA, [27, 175, 122]); }
      info.mask_px = { [A]: mA.reduce((s, v) => s + v, 0), [B]: mB.reduce((s, v) => s + v, 0) };
    }
    return { canvas: cv, info };
  }
  drawScreen(panel) {                                 // replaces the 3D panel with the montage (single view only)
    const a = this.app; if (!this.on || !a.match.image || a.state.view !== 'single') return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(panel.w * dpr)), h = Math.max(1, Math.round(panel.h * dpr));
    const { canvas } = this.compose(w, h); a.octx.drawImage(canvas, panel.x, panel.y, panel.w, panel.h);
    if (this.painting && this.mask) { a.octx.save(); a.octx.globalAlpha = 0.35; a.octx.drawImage(this.tint(), panel.x, panel.y, panel.w, panel.h); a.octx.restore(); }
    a.label(panel, `PHOTOMONTAGE — ${LAYERS[this.layer]} · camera from landmark fit (not survey-verified) · massing untextured`, 26);
    return true;
  }
  tint() { const c = document.createElement('canvas'); c.width = this.mask.width; c.height = this.mask.height; const g = c.getContext('2d'); g.drawImage(this.mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#2a78d6'; g.fillRect(0, 0, c.width, c.height); return c; }
  // ---------------------------------------------------------------- camera plan
  planCanvas(S = 1400) {
    const a = this.app, par = a.par(), cv = document.createElement('canvas'); cv.width = S; cv.height = S + 160; const c = cv.getContext('2d');
    const cx = par[0], cy = par[1]; const tw = [...a.info.E2.prisms, ...a.info.E1_SK48.prisms]; const xs = [cx, ...tw.flatMap(q => q.P.map(p => p[0]))], ys = [cy, ...tw.flatMap(q => q.P.map(p => p[1]))];
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 40;
    const X = (x) => (x - mx + half) / (2 * half) * S, Y = (y) => (my + half - y) / (2 * half) * S;
    const poly = (P) => { c.beginPath(); P.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.closePath(); };
    c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, S, S + 160); c.save(); c.beginPath(); c.rect(0, 0, S, S); c.clip();
    for (const p of a.basemap.parcels) for (const r of p.rings) { poly(r); c.fillStyle = /^Road/.test(p.type) ? '#d2d2cd' : '#faf9f5'; c.fill(); c.strokeStyle = 'rgba(70,70,64,.45)'; c.lineWidth = 1; c.stroke(); }
    for (const p of a.basemap.parcels.filter(p => p.lotplan === a.basemap.site_lotplan)) for (const r of p.rings) { poly(r); c.strokeStyle = '#b4501f'; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = 'rgba(150,145,135,.8)'; for (const q of [...a.info.CTX_BASE.prisms, ...(a.state.context === 'CTX_VA2' ? a.info.CTX_C4_LIDAR.prisms : a.info.CTX_VA4C4_ADD.prisms)]) { poly(q.P); c.fill(); }
    const { A, B } = this.scenarios();
    for (const m of a.scenarios[B].members) for (const q of a.info[m].prisms) { poly(q.P); c.fillStyle = 'rgba(235,104,52,.45)'; c.fill(); c.strokeStyle = '#a8441c'; c.lineWidth = 1.5; c.stroke(); }
    c.setLineDash([8, 5]); for (const m of a.scenarios[A].members) for (const q of a.info[m].prisms) { poly(q.P); c.strokeStyle = '#0d6f4c'; c.lineWidth = 2; c.stroke(); } c.setLineDash([]);
    const hf = CM.hfovFromFocal(a.cam.W, par[6]) / 2, h = par[3], L = S * 0.35, R = Math.PI / 180;
    c.fillStyle = 'rgba(42,120,214,.18)'; c.strokeStyle = '#2a78d6'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(cx), Y(cy));
    for (let t = -hf; t <= hf + 1e-9; t += hf / 20) c.lineTo(X(cx) + L * Math.sin((h + t) * R), Y(cy) - L * Math.cos((h + t) * R)); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(X(cx), Y(cy)); c.lineTo(X(cx) + L * Math.sin(h * R), Y(cy) - L * Math.cos(h * R)); c.setLineDash([10, 6]); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#123f7a'; c.beginPath(); c.arc(X(cx), Y(cy), 7, 0, 7); c.fill();
    const m25 = 25 / (2 * half) * S; c.strokeStyle = '#222'; c.lineWidth = 4; c.beginPath(); c.moveTo(30, S - 30); c.lineTo(30 + 2 * m25, S - 30); c.stroke(); c.fillStyle = '#222'; c.font = '20px sans-serif'; c.fillText('50 m', 40 + 2 * m25, S - 24);
    c.font = 'bold 26px sans-serif'; c.fillText('N', S - 46, 44); c.beginPath(); c.moveTo(S - 37, 52); c.lineTo(S - 48, 84); c.lineTo(S - 37, 76); c.lineTo(S - 26, 84); c.closePath(); c.fill();
    c.restore(); c.fillStyle = '#ffffff'; c.fillRect(0, S, S, 160); c.strokeStyle = '#222'; c.lineWidth = 2; c.strokeRect(1, 1, S - 2, S - 2);
    const [E, N] = K.localToMga(par[0], par[1], par[2]); const fit = a.match.fit;
    c.fillStyle = '#111'; c.font = '22px sans-serif';
    const lines = [`Camera plan (grid north up; MGA zone 56, GDA2020). Camera: E ${E.toFixed(2)}  N ${N.toFixed(2)}  eye RL ${par[2].toFixed(2)} m AHD`,
      `Heading ${par[3].toFixed(2)}° (grid), pitch ${par[4].toFixed(2)}°, roll ${par[5].toFixed(2)}°, HFOV ${CM.hfovFromFocal(a.cam.W, par[6]).toFixed(2)}° (dashed line: optical axis)`,
      `Camera source: ${fit ? `landmark fit, ${fit.n} points, RMS ${fit.rms_px.toFixed(2)} px, grade ${fit.grade}, ±${fit.se[0].toFixed(2)} m E / ±${fit.se[1].toFixed(2)} m N / ±${fit.se[2].toFixed(2)} m RL (1 s.e.)` : 'manual; no landmark fit'} — NOT surveyed`,
      `Orange: ${B} footprint. Green dashed: ${A} footprint. Grey: modelled context. Cadastre: DCDB (c) State of Queensland, CC BY 4.0.`];
    lines.forEach((t, i) => c.fillText(t, 24, S + 34 + i * 32));
    return cv;
  }
  // ---------------------------------------------------------------- package (one ZIP, nothing uploaded)
  async exportPackage() {
    const a = this.app, im = a.match.image; if (!im) return a.flash('Load a photograph first.');
    a.flash('Rendering the montage package at the photo\'s full resolution…', 60000); await new Promise(r => setTimeout(r, 30));
    const W = im.W, H = im.H, { A, B } = this.scenarios(); const files = []; const png = async (cv) => new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer());
    const base = (im.name.replace(/\.[^.]+$/, '') || 'photo').replace(/[^A-Za-z0-9_-]+/g, '_');
    files.push([`1_existing_${im.name}`, new Uint8Array(im.bytesBuf)]);
    const wire = this.compose(W, H, 'wire'); files.push([`2_wireline_${A}_${B}.png`, await png(wire.canvas)]);
    const m1 = this.compose(W, H, 'E1'); files.push([`3_montage_${A}.png`, await png(m1.canvas)]);
    const m2 = this.compose(W, H, 'E2'); files.push([`4_montage_${B}.png`, await png(m2.canvas)]);
    const df = this.compose(W, H, 'diff'); files.push([`5_as_built_check_${A}_outline_${B}_only_tint.png`, await png(df.canvas)]);
    files.push(['6_camera_plan.png', await png(this.planCanvas())]);
    if (this.maskDirty) files.push(['7_foreground_mask.png', await png(this.mask)]);
    const hashes = {}; for (const [n, b] of files) hashes[n] = await sha256Hex(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const rec = await this.record(hashes, { wire: wire.info, m1: m1.info, m2: m2.info, diff: df.info });
    const json = new TextEncoder().encode(JSON.stringify(rec, null, 1)); files.push(['record.json', json]);
    files.push(['SHA256SUMS', new TextEncoder().encode(Object.entries({ ...hashes, 'record.json': await sha256Hex(json.buffer) }).map(([n, h]) => `${h}  ${n}`).join('\n') + '\n')]);
    const zip = zipStore(files); const name = `greville_montage_${base}_${rec.created_utc.replace(/[:.]/g, '').slice(0, 15)}.zip`;
    const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); el.download = name; document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
    a.lastMontage = { name, record: rec, hashes, files: files.map(f => f[0]) }; a.flash(`Saved ${name} (${files.length} files). Nothing was uploaded.`); a.render(); return a.lastMontage;
  }
  async record(hashes, info) {
    const a = this.app, im = a.match.image, par = a.par(), [E, N] = K.localToMga(par[0], par[1], par[2]), fit = a.match.fit, m = this.meta || {}, s = m.summary || {}, L = a.fx.lighting, sun = a.fx.sunInfo;
    const surveyed = false; const fitOK = fit && !a.match.flags.some(f => f.severity === 'block') && fit.grade !== 'D';
    const yes = (v) => v ? 'provided' : 'MISSING';
    return {
      schema: 'greville-visual-montage/1', created_utc: new Date().toISOString(),
      status: 'Camera-matched photomontage prepared with an investigative tool. NOT survey-verified, NOT certified, NOT expert evidence. Massing is untextured.',
      classification: [surveyed ? 'survey-verified' : 'camera-matched (not surveyed)', fitOK ? 'fit acceptable' : 'fit NOT acceptable or absent'],
      photograph: { file: im.name, bytes: im.bytes, sha256: im.sha256, width: im.W, height: im.H, handling: 'read locally in the browser; included unaltered as 1_existing_*; never uploaded', exif: s, exif_note: 'Values as recorded in the file; absent fields are null and were not estimated.' },
      lens: { source: m.f_px_from_exif ? 'EXIF 35 mm-equivalent focal length (CIPA diagonal definition)' : fit ? 'estimated by the landmark fit (no usable EXIF focal length)' : 'manual / preset value (no EXIF focal length and no fit)', f35_equiv_mm: s.focal_35mm_equiv ?? null,
              f_px_exif: m.f_px_from_exif, f_px_used: par[6], hfov_deg: CM.hfovFromFocal(a.cam.W, par[6]), held_fixed_in_fit: !!fit?.fix_f, principal_point_px: [par[7], par[8]], distortion: 'none modelled; the phone/camera pipeline is assumed to have corrected lens distortion' },
      camera: { crs: 'EPSG:7856 (GDA2020 MGA zone 56); RL m AHD', E: +E.toFixed(3), N: +N.toFixed(3), RL: +par[2].toFixed(3), heading_deg: par[3], pitch_deg: par[4], roll_deg: par[5],
                source: fit ? 'landmark fit (see alignment)' : 'manual entry', surveyed, gps_from_exif: m.gps_mga ? { E: m.gps_mga.E, N: m.gps_mga.N, h_error_m: s.gps?.h_error_m ?? null, offset_from_camera_m: Math.hypot(m.gps_mga.E - E, m.gps_mga.N - N) } : null,
                matrices: CM.threeCameraMatrices(par, a.cam.W, a.cam.H, a.camera.near, a.camera.far), render_parameters: par },
      alignment: a.match.record(),
      time_and_lighting: { capture_time_aest: m.capture_aest, lighting_used: { mode: L.mode, date: L.date, time: L.time, sun_alt_deg: sun?.alt ?? null, sun_az_deg: sun?.az ?? null, engine: 'NOAA, frozen convention (js/sun.js)' },
                           note: 'Massing is lit for the stated time; exposure scale ' + this.exposure + '. Lighting is illustrative; it does not change the outline.' },
      scenarios: Object.fromEntries([...new Set([a.activeScenario('historical'), a.activeScenario('approved')])].map(id => [id, { label: a.scenarios[id].label, classification: a.scenarios[id].classification, members: a.scenarios[id].members }])),
      occlusion: { modelled: 'Towers are hidden behind every modelled surface by depth test (same method as the tested masks, IoU >= 0.99 against the independent ray-caster).',
                   foreground_mask: this.maskDirty ? { file: '7_foreground_mask.png', pixels: info.m2.foreground_mask_px, method: 'painted by hand over unmodelled foreground objects; reviewable' } : null },
      outputs: hashes, render_info: info,
      ppl15_checklist: [
        { item: 'Existing (unaltered) photograph from the same viewpoint', status: 'provided', file: `1_existing_${im.name}` },
        { item: 'Camera type, lens, focal length or field of view, sensor', status: s.make ? 'provided (EXIF)' : 'MISSING (no EXIF)', value: { make: s.make, model: s.model, lens: s.lens, focal_mm: s.focal_mm, f35: s.focal_35mm_equiv } },
        { item: 'Camera location, alignment, direction and RL', status: fit ? `estimated by landmark fit (grade ${fit.grade}); NOT surveyed` : 'manual estimate; NOT surveyed', value: { E, N, RL: par[2], heading: par[3] } },
        { item: '2D plan showing camera location and view', status: 'provided', file: '6_camera_plan.png' },
        { item: 'Topographical / model data sources', status: 'provided', value: a.manifest.sources },
        { item: 'Date and time of the photograph; lighting', status: yes(s.datetime_original), value: m.capture_aest },
        { item: 'Wireline / alignment overlay', status: 'provided', file: `2_wireline_${a.activeScenario('historical')}_${a.activeScenario('approved')}.png` },
        { item: 'Reference points and residuals', status: fit ? `provided (${fit.n} points, RMS ${fit.rms_px.toFixed(2)} px)` : 'MISSING' },
        { item: 'Survey of camera station and reference points', status: 'NOT DONE — required for a survey-verified photomontage' },
        { item: 'Statement of preparer / certification', status: 'NOT GIVEN — tool output only' },
      ],
      ppl15_checklist_note: 'Items drawn from NSW Land and Environment Court Policy PPL 15 (Use of Photomontages and Visualisation Tools) as publicly summarised; the Queensland P&E Court has no equivalent direction. Confirm against the current policy text before relying on it.',
      app: { version: a.version.version, source_commit: a.version.source_commit, app_file_sha256: await appFileHashes(new URL('./', location.href)) },
      assets: a.manifest.assets, renderer: { quality: a.fx.quality, near: a.camera.near, far: a.camera.far },
    };
  }
  ui() {
    const m = this.meta, s = m?.summary; const el = $('exifInfo'); if (!el) return;
    if (!m) { el.textContent = 'No photo metadata yet.'; return; }
    const parts = [s.make || s.model ? `${s.make || ''} ${s.model || ''}`.trim() : 'camera: not recorded',
      s.datetime_original ? `taken ${s.datetime_original}${s.offset_time_original ? ' ' + s.offset_time_original : ' (no time zone)'}` : 'time: not recorded',
      s.focal_35mm_equiv ? `${s.focal_35mm_equiv} mm equiv. → HFOV ${m.hfov_from_exif.toFixed(2)}°` : 'focal length: not recorded (fit estimates it)',
      m.gps_mga ? `GPS → MGA E ${m.gps_mga.E.toFixed(1)} N ${m.gps_mga.N.toFixed(1)}${s.gps.h_error_m ? ` ±${s.gps.h_error_m} m` : ''}` : 'GPS: not recorded',
      s.digital_zoom && s.digital_zoom > 1.01 ? `DIGITAL ZOOM ${s.digital_zoom}× (cropped)` : null].filter(Boolean);
    el.textContent = parts.join(' · ');
  }
}
// ---- minimal ZIP writer (stored, no compression) -------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + data.length;
  }
  const cs = central.reduce((s, b) => s + b.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((s, b) => s + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; } return out;
}
