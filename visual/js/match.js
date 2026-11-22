// Perspective matching against an external image, entirely in the browser: the file is read locally (FileReader / object URL),
// hashed with SubtleCrypto, displayed over the model, and never uploaded. Manual camera controls always work; a least-squares fit
// (js/fit.js, port of the archived fit core) runs when landmark pairs exist, with residuals, leave-one-out, grade and ambiguity flags.
import * as CM from './camera_model.js';
import * as FIT from './fit.js';
import { sha256Hex } from './hash.js';
const $ = (id) => document.getElementById(id);

export class MatchUI {
  constructor(app) {
    this.app = app; this.image = null; this.pairs = []; this.picking = false; this.step = 'image'; this.pending = null; this.fit = null; this.flags = []; this.alts = []; this.opacity = 0.5;
    $('imgFile').onchange = (e) => this.load(e.target.files[0]);
    $('imgOpacity').oninput = (e) => { this.opacity = +e.target.value; app.render(); };
    $('btnPick').onclick = () => { this.picking = !this.picking; this.step = 'image'; this.pending = null; this.ui(); app.render(); };
    $('btnFit').onclick = () => this.runFit();
    $('btnClearPairs').onclick = () => { this.pairs = []; this.fit = null; this.flags = []; this.alts = []; this.ui(); app.render(); };
    $('btnSynth').onclick = () => this.synthetic();
    $('btnUseImageFrame').onclick = () => this.useImageFrame();
    $('ctrlSearch').onchange = (e) => this.chooseControl(e.target.value);
    const dl = $('ctrlList'); for (const p of app.controlsLib) { const o = document.createElement('option'); o.value = p.id; dl.appendChild(o); }
    app.stage.addEventListener('pointerdown', (e) => { if (this.picking) { e.preventDefault(); this.click(e); } });
    this.ui();
  }
  async load(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return this.app.flash('Only PNG or JPEG images are accepted.');
    const buf = await file.arrayBuffer(); const sha = await sha256Hex(buf);
    const url = URL.createObjectURL(new Blob([buf], { type: file.type })); const img = new Image(); img.src = url; await img.decode();
    this.image = { name: file.name, type: file.type, bytes: buf.byteLength, sha256: sha, W: img.naturalWidth, H: img.naturalHeight, el: img, bytesBuf: buf, lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null };
    this.pairs = []; this.fit = null; this.flags = []; this.alts = []; this.useImageFrame(); this.app.montage?.onImage(this.image, buf); this.ui();
  }
  useImageFrame() {                                   // frame = image pixel size; principal point at centre until fitted or edited
    if (!this.image) return this.app.flash('Load an image first.');
    const c = this.app.cam, h = this.app.montage?.meta?.hfov_from_exif; this.app.cam = { ...c, W: this.image.W, H: this.image.H, cx: this.image.W / 2, cy: this.image.H / 2, ...(h ? { hfov: h } : {}) }; this.app.render();
  }
  onFrameChange() { if (this.image && $('keepImageFrame').checked) { const c = this.app.cam; this.app.cam = { ...c, W: this.image.W, H: this.image.H, cx: this.image.W / 2, cy: this.image.H / 2 }; } }
  toFrame(e, panel) {
    const r = this.app.stage.getBoundingClientRect(); const x = e.clientX - r.left - panel.x, y = e.clientY - r.top - panel.y;
    return [x / panel.w * this.app.cam.W, y / panel.h * this.app.cam.H];
  }
  click(e) {
    const panel = this.app.panelRects()[0]; const [u, v] = this.toFrame(e, panel);
    if (u < 0 || v < 0 || u > this.app.cam.W || v > this.app.cam.H) return;
    if (this.step === 'image') { this.pending = { u, v }; this.step = 'control'; this.ui(); this.app.render(); return; }
    // control step: nearest projected control within 14 CSS px of the click
    const par = this.app.par(); let best = null; const sx = panel.w / this.app.cam.W;
    for (const p of this.app.controlsLib) {
      const [pu, pv, zf] = CM.project(par, [p.x, p.y, p.z]); if (zf <= 0) continue;
      const d = Math.hypot((pu - u) * sx, (pv - v) * sx); if (d < 14 && (!best || d < best.d)) best = { d, p };
    }
    if (best) this.chooseControl(best.p.id); else this.app.flash('No control point within 14 px. Click nearer a dot, or type its ID in the box.');
  }
  chooseControl(id) {
    const p = this.app.controlsLib.find(q => q.id === id); if (!p || !this.pending) return;
    if (this.pairs.some(q => q.id === id)) return this.app.flash('That control point is already used.');
    this.pairs.push({ ...this.pending, id: p.id, X: [p.x, p.y, p.z], cls: p.cls, status: p.status, needs_context: p.needs_context });
    if (p.needs_context && this.app.state.context !== 'CTX_VA4C4') this.app.flash(`${p.id} belongs to the VA4 Cluster 4 context variant; switch the context layer to see it.`);
    this.pending = null; this.step = 'image'; $('ctrlSearch').value = ''; this.ui(); this.app.render();
  }
  runFit() {
    if (this.pairs.length < 4) return this.app.flash('At least 4 pairs are needed to attempt a fit (8+ for a determined camera).');
    const c = this.app.cam; const X = this.pairs.map(p => p.X), U = this.pairs.map(p => [p.u, p.v]);
    const prior = {}; if ($('priorZ').checked) prior.z = [c.z, +$('priorZsd').value || 0.5]; if ($('priorXY').checked) prior.xy = [c.x, c.y, +$('priorXYsd').value || 3];
    const fpx = this.app.montage?.meta?.f_px_from_exif; const fixF = !!(fpx && $('fixF').checked);
    const opts = { prior: Object.keys(prior).length ? prior : null, fixPP: $('fixPP').checked, fixF };
    const F = FIT.fitCamera(X, U, c.W, c.H, { x: c.x, y: c.y, z: c.z, heading: c.heading, pitch: c.pitch, roll: c.roll, hfov: c.hfov, f_px: fixF ? fpx : undefined }, opts);
    F.grade = FIT.grade(F); this.alts = this.pairs.length >= 6 ? FIT.alternativeSolutions(X, U, c.W, c.H, F, opts) : [];
    this.flags = FIT.ambiguityFlags(X, U, this.pairs, F, c.W, c.H, this.alts); this.fit = { ...F, options: opts, pair_ids: this.pairs.map(p => p.id) };
    this.ui(); this.app.render();
  }
  status() {
    if (!this.fit) return 'NO FIT';
    if (this.flags.some(f => f.severity === 'block')) return 'UNDERDETERMINED / AMBIGUOUS: do not rely on this camera';
    if (this.fit.grade === 'D') return 'POOR FIT (grade D): do not rely';
    return `FIT grade ${this.fit.grade}: model-camera ESTIMATE, not a verified registration`;
  }
  applyPar(par) {
    const a = this.app, c = a.cam; a.state.mode = 'match'; document.querySelector('input[name=mode][value=free]').checked = true;
    $('nonphysical').hidden = false; $('nonphysical').textContent = 'MATCH CAMERA — estimated from image landmarks / manual entry; not a preset station and not survey-verified';
    a.cam = { ...c, x: par[0], y: par[1], z: par[2], heading: (par[3] % 360 + 360) % 360, pitch: par[4], roll: par[5], hfov: CM.hfovFromFocal(c.W, par[6]), cx: par[7], cy: par[8] };
    a.render();
  }
  async synthetic() {                                  // implementation QA: known camera -> synthetic pixels -> fit -> recovery error
    const a = this.app, c = a.cam, truth = a.par(); const pts = a.controlsLib.map(p => [p.x, p.y, p.z]);
    const S = FIT.synthesize(truth, pts, c.W, c.H, 0.3, 11); const k = Math.max(1, Math.floor(S.X.length / 16)); const X = S.X.filter((_, i) => i % k === 0).slice(0, 16), U = S.U.filter((_, i) => i % k === 0).slice(0, 16);
    if (X.length < 8) return a.flash(`Synthetic test needs at least 8 visible controls in this frame (found ${X.length}). Turn the camera towards the buildings.`);
    const F = FIT.fitCamera(X, U, c.W, c.H, { x: c.x + 1.5, y: c.y - 1.2, z: c.z + 0.3, heading: c.heading + 3, pitch: c.pitch - 2, roll: 0, hfov: c.hfov * 1.08 });
    const dpos = Math.hypot(F.par[0] - truth[0], F.par[1] - truth[1], F.par[2] - truth[2]);
    $('synthOut').textContent = `Synthetic test (implementation QA only): n=${X.length}, recovered position error ${dpos.toFixed(3)} m, heading ${(F.par[3] - truth[3]).toFixed(3)}°, pitch ${(F.par[4] - truth[4]).toFixed(3)}°, HFOV ${(F.hfov_deg - c.hfov).toFixed(3)}°, RMS ${F.rms_px.toFixed(2)} px, grade ${FIT.grade(F)}.`;
    this.lastSynthetic = { n: X.length, dpos, dheading: F.par[3] - truth[3], dpitch: F.par[4] - truth[4], rms: F.rms_px, grade: FIT.grade(F) };
  }
  record() {                                          // for the export sidecar
    return { source_image: this.image ? { name: this.image.name, type: this.image.type, bytes: this.image.bytes, sha256: this.image.sha256, width: this.image.W, height: this.image.H, file_last_modified: this.image.lastModified, handling: 'read locally in the browser; not uploaded; not modified' } : null,
             pairs: this.pairs.map(p => ({ image_uv: [p.u, p.v], control_id: p.id, control_xyz_local: p.X, control_class: p.cls, control_status: p.status })),
             fit: this.fit ? { status: this.status(), grade: this.fit.grade, n: this.fit.n, rms_px: this.fit.rms_px, max_px: this.fit.max_px, loo_px: this.fit.loo_px, resid_px: this.fit.resid_px,
                               par: this.fit.par, names: this.fit.names, se: this.fit.se, hfov_deg: this.fit.hfov_deg, options: this.fit.options, condition: this.fit.cond } : null,
             flags: this.flags, alternatives: this.alts.map(x => ({ par: x.par, rms_px: x.rms_px, dpos_m: x.dpos, dang_deg: x.dang, distinct: x.distinct })) };
  }
  drawOverlay(panel, montaged = false) {
    const a = this.app, c = a.octx; if (a.state.view !== 'single') return;
    const sx = panel.w / a.cam.W, sy = panel.h / a.cam.H, P = (u, v) => [panel.x + u * sx, panel.y + v * sy];
    if (this.image && this.opacity > 0 && !montaged) { c.save(); c.globalAlpha = this.opacity; c.drawImage(this.image.el, panel.x, panel.y, panel.w, panel.h); c.restore(); }
    const par = a.par();
    if (this.picking && this.step === 'control') {
      c.fillStyle = 'rgba(208,59,59,0.85)';
      for (const p of a.controlsLib) { const [u, v, zf] = CM.project(par, [p.x, p.y, p.z]); if (zf > 0 && u >= 0 && v >= 0 && u <= a.cam.W && v <= a.cam.H) { const [x, y] = P(u, v); c.fillRect(x - 2, y - 2, 4, 4); } }
    }
    this.pairs.forEach((p, i) => {
      const [x, y] = P(p.u, p.v); c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.moveTo(x, y - 6); c.lineTo(x, y + 6); c.stroke();
      const [u2, v2, zf] = CM.project(par, p.X);
      if (zf > 0) { const [x2, y2] = P(u2, v2); c.strokeStyle = '#d03b3b'; c.beginPath(); c.arc(x2, y2, 4, 0, 2 * Math.PI); c.stroke(); c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); }
      c.fillStyle = '#111'; c.font = '11px system-ui'; c.fillText(String(i + 1), x + 7, y - 7);
    });
    if (this.pending) { const [x, y] = P(this.pending.u, this.pending.v); c.strokeStyle = '#eb6834'; c.lineWidth = 2; c.strokeRect(x - 7, y - 7, 14, 14); }
  }
  ui() {
    $('imgInfo').textContent = this.image ? `${this.image.name} · ${this.image.W}×${this.image.H} px · ${this.image.bytes} B · SHA-256 ${this.image.sha256}` : 'No image loaded. Images stay in this browser; they are never uploaded.';
    $('btnPick').textContent = this.picking ? (this.step === 'image' ? 'Picking: click a point on the IMAGE…' : 'Picking: click the matching CONTROL dot (or type its ID)…') : 'Add landmark pairs';
    $('btnPick').classList.toggle('on', this.picking);
    const rows = this.pairs.map((p, i) => `<tr><td>${i + 1}</td><td>${p.id}</td><td>${p.cls}</td><td>${p.u.toFixed(1)}, ${p.v.toFixed(1)}</td><td>${this.fit ? this.fit.resid_px[i].toFixed(2) : '—'}</td><td>${this.fit && this.fit.loo_px.length ? this.fit.loo_px[i].toFixed(2) : '—'}</td></tr>`).join('');
    $('pairTable').innerHTML = `<tr><th>#</th><th>control</th><th>class</th><th>image u, v</th><th>resid px</th><th>LOO px</th></tr>${rows}`;
    const F = this.fit;
    $('fitOut').innerHTML = !F ? `${this.pairs.length} pair(s). A fit needs 4 or more pairs; a determined camera needs 8 or more well-spread, non-coplanar points, including context beyond the towers.` :
      `<b>${this.status()}</b><br>n ${F.n} · RMS ${F.rms_px.toFixed(2)} px · max ${F.max_px.toFixed(2)} px · LOO max ${F.loo_px.length ? Math.max(...F.loo_px).toFixed(2) : 'n/a'} px · cond ${F.cond ? F.cond.toExponential(1) : '—'}<br>` +
      `E ${(F.par[0] + 504045).toFixed(2)} ±${F.se[0].toFixed(2)} · N ${(F.par[1] + 6966712).toFixed(2)} ±${F.se[1].toFixed(2)} · RL ${F.par[2].toFixed(2)} ±${F.se[2].toFixed(2)} · hdg ${F.par[3].toFixed(2)}° · pitch ${F.par[4].toFixed(2)}° · roll ${F.par[5].toFixed(2)}° · HFOV ${F.hfov_deg.toFixed(2)}°` +
      (this.flags.length ? '<ul>' + this.flags.map(f => `<li class="${f.severity}">${f.code}: ${f.text}</li>`).join('') + '</ul>' : '') +
      `<button id="btnApplyFit">Apply fitted camera</button>` +
      (this.alts.length ? '<br>Alternative solutions (cost ≤ 1.5× best): ' + this.alts.map((x, i) => `<button data-alt="${i}">#${i + 1} ${x.distinct ? 'DISTINCT' : 'same'} Δpos ${x.dpos.toFixed(2)} m RMS ${x.rms_px.toFixed(2)}</button>`).join(' ') : '');
    const ap = $('btnApplyFit'); if (ap) ap.onclick = () => this.applyPar(this.fit.par);
    document.querySelectorAll('[data-alt]').forEach(b => b.onclick = () => this.applyPar(this.alts[+b.dataset.alt].par));
  }
}
