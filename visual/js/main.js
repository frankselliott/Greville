// Greville /visual — application. Investigative technical viewer; not expert evidence.
import * as THREE from '../vendor/three/three.module.min.js';
import * as K from './coords.js';
import * as CM from './camera_model.js';
import { buildScene, makeMaterials, COLOURS, SCEN_KEYS } from './scene_build.js';
import { attachControls } from './controls.js';
import { maskCompare } from './compare.js';
import { MatchUI } from './match.js';
import { exportPair } from './export.js';
import { FX, QUALITY } from './render_fx.js';
import { basemapTexture } from './basemap.js';
import { UI } from './ui.js';
import { Montage } from './montage.js';

const $ = (id) => document.getElementById(id);
const RAD = Math.PI / 180;
const fmt = (v, d = 2) => (v === null || v === undefined || !isFinite(v)) ? '—' : Number(v).toFixed(d);
const pad2 = (n) => String(n).padStart(2, '0');
export const NEAR = 0.2, FAR = 3000;              // standard (not logarithmic) depth: required by ambient occlusion

class App {
  async init() {
    const [S, CT, MF, VER, BM] = await Promise.all(['assets/scene.json', 'assets/controls.json', 'assets/manifest.json', 'version.json', 'assets/basemap.json']
      .map(p => fetch(p, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); })));
    this.S = S; this.controlsLib = CT.points; this.manifest = MF; this.version = VER; this.basemap = BM;
    this.scenarios = Object.fromEntries(S.scenarios.map(s => [s.id, s]));
    this.stage = $('stage'); this.canvas = $('gl'); this.overlay = $('overlay'); this.octx = this.overlay.getContext('2d');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.M = makeMaterials(); const built = buildScene(S, this.M); this.root = built.root; this.groups = built.groups; this.info = built.info;
    this.scene = new THREE.Scene(); this.scene.add(this.root);
    this.camera = new THREE.PerspectiveCamera(); this.camera.matrixAutoUpdate = false; this.camera.near = NEAR; this.camera.far = FAR;
    this.markers = this.makeMarkers(); this.scene.add(this.markers);
    const mobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches; this.defaultQuality = mobile ? 'medium' : 'high';
    this.fx = new FX(this); this.fx.setQuality(this.defaultQuality);
    const ext = this.groups.TERRAIN.userData.extent, maxTex = Math.min(this.renderer.capabilities.maxTextureSize, mobile ? 2048 : 4096);
    this.groundTex = { cadastre: basemapTexture(this.renderer, BM, ext, { maxPx: maxTex, contours: true }), 'cadastre-plain': basemapTexture(this.renderer, BM, ext, { maxPx: maxTex, contours: false }) };
    this.state = { mode: 'station', preset: null, side: 'approved', hist: S.default_scenarios.historical, appr: S.default_scenarios.approved,
                   context: 'CTX_VA2', canopy: false, edges: true, storeys: true, ground: 'cadastre', colour: 'neutral', view: 'single', swipe: 0.5, guides: true, minimap: !mobile,
                   framing: [{ hfov: 55, pitch: 10 }, { hfov: 90, pitch: 38 }, { hfov: 55, pitch: 62 }, { hfov: 110, pitch: 25 }],
                   orbit: { tx: 95, ty: -15, tz: 35, dist: 260, heading: 20, pitch: -35 } };
    this.cam = null; this.applyGround();
    this.buildUI(); this.match = new MatchUI(this); this.montage = new Montage(this); this.ui = new UI(this); attachControls(this.stage, this);
    new ResizeObserver(() => this.render()).observe(this.stage);
    const q = new URLSearchParams(location.search);
    this.selectPreset(q.get('preset') || 'W01'); this.ui.applyQuery(q); this.updateLightingUI();
    window.__visual = this; window.__proj = CM.project;   // test hooks (inspection by the e2e suite)
    this._render(); $('loading').hidden = true; document.body.dataset.ready = '1';
  }
  // ---------------------------------------------------------------- scenarios & layers
  activeScenario(side = this.state.side) { return side === 'historical' ? this.state.hist : this.state.appr; }
  applyVisibility(scenarioId) {
    const sc = this.scenarios[scenarioId]; const members = new Set(sc ? sc.members : []);
    for (const k of SCEN_KEYS) this.groups[k].visible = members.has(k);
    this.groups.CTX_BASE.visible = true;
    this.groups.CTX_C4_LIDAR.visible = this.state.context === 'CTX_VA2';
    this.groups.CTX_VA4C4_ADD.visible = this.state.context === 'CTX_VA4C4';
    this.groups.CANOPY.visible = this.state.canopy;
    this.root.traverse(o => { const r = o.userData?.role; if (r === 'edge') o.visible = this.state.edges; else if (r === 'storeys') o.visible = this.state.storeys; });
    const towerMat = this.state.colour === 'scenario' ? (sc?.side === 'historical' ? this.M.towerE1 : this.M.towerE2) : this.M.tower;
    for (const k of SCEN_KEYS) this.groups[k].children.forEach(c => { if (c.isMesh) c.material = towerMat; });
  }
  applyGround() { const t = this.groundTex[this.state.ground] || null; if (this.M.terrain.map !== t) { this.M.terrain.map = t; this.M.terrain.color.set(t ? 0xffffff : COLOURS.terrain); this.M.terrain.needsUpdate = true; } }
  visiblePrisms(scenarioId) {                       // solids for collision tests in the current context/scenario
    const sc = this.scenarios[scenarioId]; const out = [...this.info.CTX_BASE.prisms];
    out.push(...(this.state.context === 'CTX_VA2' ? this.info.CTX_C4_LIDAR.prisms : this.info.CTX_VA4C4_ADD.prisms));
    for (const m of sc.members) out.push(...this.info[m].prisms); return out;
  }
  setSide(side) { this.state.side = side; this.updateScenarioUI(); this.render(); }
  toggleScenario() { this.setSide(this.state.side === 'approved' ? 'historical' : 'approved'); }
  // ---------------------------------------------------------------- lighting
  setLighting(patch) { Object.assign(this.fx.lighting, patch); this.fx.applyLighting(); this.updateLightingUI(); this.render(); }
  updateLightingUI() {
    const L = this.fx.lighting; const t = `${pad2(L.time[0])}:${pad2(L.time[1])}`; $('lTimeOut').textContent = t;
    $('sunOut').textContent = this.fx.describe() + (L.mode === 'sun' ? ' Sun azimuth is clockwise from grid north (MGA56).' : '');
    $('lDate').disabled = $('lTime').disabled = L.mode !== 'sun';
  }
  // ---------------------------------------------------------------- camera
  preset(id) { return this.S.presets.find(p => p.id === id); }
  selectPreset(id) {
    const p = this.preset(id) || this.S.presets[0]; this.state.preset = p.id; this.state.mode = 'station';
    const r = document.querySelector('input[name=mode][value=station]'); if (r) r.checked = true; if ($('nonphysical')) $('nonphysical').hidden = true;
    const [x, y, z] = K.mgaToLocal(p.E, p.N, p.RL);
    this.cam = { x, y, z, heading: p.heading, pitch: p.pitch, roll: p.roll, hfov: p.hfov, W: p.W, H: p.H, cx: p.W / 2, cy: p.H / 2 + p.shift * p.W / 2 };
    this.origin = { x, y, z, dem: K.demAt(this.S.terrain, x, y) };
    this.match?.onFrameChange?.(); this.updatePresetUI(); this.render();
  }
  reset() { if (this.state.mode === 'overview') this.state.orbit = { tx: 95, ty: -15, tz: 35, dist: 260, heading: 20, pitch: -35 }; this.selectPreset(this.state.preset); }
  par() { return CM.parFromState(this.cam); }
  // candidate camera -> accepted (station mode enforces radius, solids, eye-height band) or rejected with a reason
  setCam(next, reason = '') {
    const posChanged = !this.cam || next.x !== this.cam.x || next.y !== this.cam.y || next.z !== this.cam.z;
    if (this.state.mode === 'station' && posChanged) {
      const p = this.preset(this.state.preset); const dxy = Math.hypot(next.x - this.origin.x, next.y - this.origin.y);
      for (const q of this.visiblePrisms(this.activeScenario())) {
        if (next.z >= q.zb - 0.01 && next.z <= q.zt + 0.01 && (K.pointInPolygon(q.P, next.x, next.y) || K.distToPolygonEdge(q.P, next.x, next.y) < 0.25))
          return this.flash(`Blocked: would enter or touch modelled solid ${q.id}. Use Free (nonphysical) mode to go there.`);
      }
      if (dxy > p.radius + 1e-9) return this.flash(`Station mode: movement limited to ${p.radius} m from ${p.id} (viewer limit, not a verified boundary).`);
      const g = K.demAt(this.S.terrain, next.x, next.y); const h = next.z - g;
      const base = this.origin.z - this.origin.dem;
      if (h < Math.min(0.3, base) - 1e-9 || h > Math.max(2.2, base) + 1e-9) return this.flash(`Station mode: eye height ${h.toFixed(2)} m above the model ground is outside 0.30–2.20 m.`);
    }
    this.cam = next; this.updateCameraUI(); this.render(); return true;
  }
  move(fwd, right) {
    if (this.state.mode === 'overview') { const o = this.state.orbit, h = o.heading * RAD; o.tx += fwd * 4 * Math.sin(h) + right * 4 * Math.cos(h); o.ty += fwd * 4 * Math.cos(h) - right * 4 * Math.sin(h); this.render(); return; }
    const h = this.cam.heading * RAD; const nx = this.cam.x + fwd * Math.sin(h) + right * Math.cos(h), ny = this.cam.y + fwd * Math.cos(h) - right * Math.sin(h);
    const dz = this.state.mode === 'station' ? K.demAt(this.S.terrain, nx, ny) - K.demAt(this.S.terrain, this.cam.x, this.cam.y) : 0;   // keep eye height over the model ground
    this.setCam({ ...this.cam, x: nx, y: ny, z: this.cam.z + dz });
  }
  eye(dz) { if (this.state.mode === 'overview') return; this.setCam({ ...this.cam, z: this.cam.z + dz }); }
  look(dh, dp) {
    if (this.state.mode === 'overview') { const o = this.state.orbit; o.heading = (o.heading + dh + 360) % 360; o.pitch = Math.max(-89, Math.min(-5, o.pitch + dp)); this.render(); return; }
    this.setCam({ ...this.cam, heading: (this.cam.heading + dh + 360) % 360, pitch: Math.max(-89, Math.min(89, this.cam.pitch + dp)) });
  }
  lookDrag(dx, dy) { const r = this.panelRects()[0]; const k = (this.state.mode === 'overview' ? 0.3 : this.cam.hfov / Math.max(200, r.cssW)); this.look(dx * k, -dy * k); }
  zoom(f) {
    if (this.state.mode === 'overview') { this.state.orbit.dist = Math.max(20, Math.min(1500, this.state.orbit.dist * f)); this.render(); return; }
    this.setCam({ ...this.cam, hfov: Math.max(5, Math.min(140, this.cam.hfov * f)) });
  }
  setMode(m) {
    this.state.mode = m;
    if (m === 'station') { const p = this.preset(this.state.preset); if (Math.hypot(this.cam.x - this.origin.x, this.cam.y - this.origin.y) > p.radius) this.selectPreset(p.id); }
    $('nonphysical').hidden = m === 'station'; $('nonphysical').textContent = m === 'overview' ? 'NONPHYSICAL DIAGNOSTIC — overview orbit camera; not a resident view' : 'NONPHYSICAL DIAGNOSTIC — free camera: no collision or eye-height limits; not a verified resident view';
    this.updateCameraUI(); this.render();
  }
  overviewPar() {
    const o = this.state.orbit, { fwd } = CM.axes(o.heading, o.pitch, 0);
    return [o.tx - fwd[0] * o.dist, o.ty - fwd[1] * o.dist, o.tz - fwd[2] * o.dist, o.heading, o.pitch, 0, CM.focalFromHfov(this.cam.W, 50), this.cam.W / 2, this.cam.H / 2];
  }
  renderPar() { return this.state.mode === 'overview' ? this.overviewPar() : this.par(); }
  keysBlocked() { return this.ui?.keysBlocked() || false; }
  exportNow() { if (this._exporting) return; this._exporting = true; this.flash('Rendering export at full quality…', 60000); exportPair(this).catch(e => this.flash('Export failed: ' + e.message)).finally(() => { this._exporting = false; }); }
  // ---------------------------------------------------------------- layout & rendering
  panelRects() {                                     // panels in CSS px, letterboxed to the frame aspect
    const r = this.stage.getBoundingClientRect(); const W = this.cam.W, H = this.cam.H, a = W / H; const v = this.state.view;
    const grid = v === 'side' ? (r.width >= r.height ? [2, 1] : [1, 2]) : v === 'framing' ? [2, 2] : [1, 1];
    const cw = r.width / grid[0], ch = r.height / grid[1]; let pw = cw, ph = cw / a; if (ph > ch) { ph = ch; pw = ch * a; }
    const out = [];
    for (let j = 0; j < grid[1]; j++) for (let i = 0; i < grid[0]; i++) out.push({ x: Math.round(i * cw + (cw - pw) / 2), y: Math.round(j * ch + (ch - ph) / 2), w: Math.round(pw), h: Math.round(ph), cssW: pw });
    return out;
  }
  setCameraMatrices(par, W, H) {
    const m = CM.threeCameraMatrices(par, W, H, this.camera.near, this.camera.far);
    this.camera.matrix.fromArray(m.world); this.camera.updateMatrixWorld(true);
    this.camera.projectionMatrix.fromArray(m.proj); this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
  // Interactive frames skip ambient occlusion; the full-quality frame follows once input has been idle for 250 ms.
  render() {
    if (!this.cam) return; cancelAnimationFrame(this._raf); clearTimeout(this._idle);
    this._raf = requestAnimationFrame(() => {
      const ao = QUALITY[this.fx.quality].ao; this.fx.interactive = ao; this._render();
      if (ao) this._idle = setTimeout(() => { this.fx.interactive = false; this._render(); }, 250);
    });
  }
  _render() {
    const r = this.stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(r.width, r.height, false);
    this.canvas.style.width = this.overlay.style.width = r.width + 'px'; this.canvas.style.height = this.overlay.style.height = r.height + 'px';
    this.overlay.width = Math.round(r.width * dpr); this.overlay.height = Math.round(r.height * dpr); this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.octx.clearRect(0, 0, r.width, r.height);
    const R = this.renderer; R.setRenderTarget(null); R.setScissorTest(false); R.setViewport(0, 0, r.width, r.height); R.setClearColor(0xc9ced4, 1); R.clear();
    const panels = this.panelRects(); const v = this.state.view; this.markers.visible = this.state.mode !== 'station';
    const draw = (rect, par, scen, key, clip = null) => this.fx.renderPanel({ rect: { x: rect.x, yGL: r.height - rect.y - rect.h, w: rect.w, h: rect.h }, par, scen, key, pr: dpr, clip });
    const A = this.activeScenario('historical'), B = this.activeScenario('approved'), cur = this.activeScenario(), par = this.renderPar();
    this.lastFrame = { view: v, scenarios: [], par };
    const guides = (p, pp) => { if (this.state.guides && this.state.mode !== 'overview') this.ui.drawGuides(this.octx, p, pp); };
    if (v === 'side') { draw(panels[0], par, A, 'p0'); draw(panels[1], par, B, 'p1'); guides(panels[0], par); guides(panels[1], par); this.label(panels[0], this.scenarios[A].label, 26); this.label(panels[1], this.scenarios[B].label, 26); this.lastFrame.scenarios = [A, B]; }
    else if (v === 'swipe') {
      draw(panels[0], par, A, 'p0', [0, this.state.swipe]); draw(panels[0], par, B, 'p1', [this.state.swipe, 1]); guides(panels[0], par);
      const p = panels[0], x = p.x + this.state.swipe * p.w; const c = this.octx; c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, p.y); c.lineTo(x, p.y + p.h); c.stroke();
      this.label(p, '◀ ' + this.scenarios[A].label, 26); this.label({ ...p, x: x + 4 }, this.scenarios[B].label + ' ▶', 26); this.lastFrame.scenarios = [A, B];
    } else if (v === 'framing') {
      this.state.framing.forEach((fr, i) => { const pp = this.par(); pp[4] = fr.pitch; pp[6] = CM.focalFromHfov(this.cam.W, fr.hfov); draw(panels[i], pp, cur, 'p' + i); guides(panels[i], pp); this.label(panels[i], `HFOV ${fr.hfov}°, pitch ${fr.pitch}° — same station, same geometry`, 26); });
      this.lastFrame.scenarios = [cur];
    } else if (v === 'mask') {
      draw(panels[0], par, B, 'p0'); this.lastFrame.scenarios = [A, B];
      const res = maskCompare(this, par, A, B, Math.min(900, Math.round(panels[0].w)));
      this.octx.drawImage(res.canvas, panels[0].x, panels[0].y, panels[0].w, panels[0].h); this.lastMask = res; guides(panels[0], par);
      this.label(panels[0], `Mask: orange = only in ${B}; blue = only in ${A} (frame-limited)`, 26);
    } else { draw(panels[0], par, cur, 'p0'); guides(panels[0], par); this.lastFrame.scenarios = [cur]; }   // single view: the on-stage scenario bar names it
    R.setScissorTest(false);
    { const py = Math.round(panels[0].y), rib = this.state.guides && this.state.mode !== 'overview' ? 30 : 0;   // in the letterbox band if there is room, else just below the compass ribbon
      $('compareBar').style.top = (py >= 50 ? Math.max(6, py - 46) : py + rib + 8) + 'px'; }
    const montaged = v === 'single' && !!this.montage?.drawScreen(panels[0]);
    this.match?.drawOverlay?.(panels[0], montaged);
    this.ui?.drawMinimap(); this.ui?.writeURL(); this.ui?.updateSteps();
    this.updateCameraUI();
  }
  label(p, text, dy = 0) { const c = this.octx; c.font = '12px system-ui, sans-serif'; const w = c.measureText(text).width + 10; c.fillStyle = 'rgba(255,255,255,0.88)'; c.fillRect(p.x + 6, p.y + 6 + dy, w, 20); c.fillStyle = '#111'; c.fillText(text, p.x + 11, p.y + 20 + dy); }
  makeMarkers() {
    const g = new THREE.Group(); g.name = 'MARKERS';
    for (const p of this.S.presets) {
      const [x, y, z] = K.mgaToLocal(p.E, p.N, p.RL); const g0 = K.demAt(this.S.terrain, x, y);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, z - g0 + 0.01, 12), new THREE.MeshBasicMaterial({ color: p.classification === 'hypothetical' ? 0xd03b3b : 0x2a78d6 }));
      m.position.set(x, (z + g0) / 2, -y); g.add(m);
    }
    g.visible = false; return g;
  }
  flash(msg, ms = 3500) { const el = $('flash'); el.textContent = msg; el.hidden = false; clearTimeout(this._ft); this._ft = setTimeout(() => { el.hidden = true; }, ms); return false; }
  pickActive() { return this.match?.picking || this.montage?.painting; }
  // ---------------------------------------------------------------- UI
  buildUI() {
    const list = $('presets');
    for (const p of this.S.presets) {
      const b = document.createElement('button'); b.className = 'preset'; b.dataset.id = p.id;
      b.innerHTML = `<span class="pid">${p.id}</span><span class="tag ${p.classification}">${p.classification}</span><span class="plabel">${p.label.split('—')[1] || ''}</span>`;
      b.onclick = () => this.selectPreset(p.id); list.appendChild(b);
    }
    const fill = (sel, side) => { for (const s of this.S.scenarios.filter(s => s.side === side)) { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.id} — ${s.classification}`; sel.appendChild(o); } };
    fill($('histSel'), 'historical'); fill($('apprSel'), 'approved');
    $('histSel').value = this.state.hist; $('apprSel').value = this.state.appr;
    $('histSel').onchange = (e) => { this.state.hist = e.target.value; this.updateScenarioUI(); this.render(); };
    $('apprSel').onchange = (e) => { this.state.appr = e.target.value; this.updateScenarioUI(); this.render(); };
    $('quickToggle').onclick = () => this.toggleScenario();
    $('btnHist').onclick = $('cbHist').onclick = () => this.setSide('historical'); $('btnAppr').onclick = $('cbAppr').onclick = () => this.setSide('approved');
    document.querySelectorAll('input[name=view]').forEach(r => r.onchange = () => { this.state.view = r.value; $('swipeRow').hidden = r.value !== 'swipe'; $('framingRow').hidden = r.value !== 'framing'; $('maskOut').hidden = r.value !== 'mask'; this.render(); });
    $('swipe').oninput = (e) => { this.state.swipe = +e.target.value; this.render(); };
    document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => this.setMode(r.value));
    $('ctxSel').onchange = (e) => { this.state.context = e.target.value; this.render(); };
    $('canopy').onchange = (e) => { this.state.canopy = e.target.checked; this.render(); };
    $('edges').onchange = (e) => { this.state.edges = e.target.checked; this.render(); };
    $('storeys').onchange = (e) => { this.state.storeys = e.target.checked; this.render(); };
    $('groundSel').onchange = (e) => { this.state.ground = e.target.value; this.applyGround(); this.render(); };
    $('colourMode').onchange = (e) => { this.state.colour = e.target.value; this.render(); };
    $('guides').onchange = (e) => { this.state.guides = e.target.checked; this.render(); };
    $('minimapChk').checked = this.state.minimap; $('minimap').hidden = !this.state.minimap; $('mapToggle').setAttribute('aria-expanded', String(this.state.minimap));
    $('minimapChk').onchange = (e) => { this.state.minimap = e.target.checked; $('minimap').hidden = !this.state.minimap; $('mapToggle').setAttribute('aria-expanded', String(this.state.minimap)); this.render(); };
    // lighting
    document.querySelectorAll('input[name=light]').forEach(r => r.onchange = () => this.setLighting({ mode: r.value }));
    $('lDate').onchange = (e) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(e.target.value); if (m) this.setLighting({ date: [+m[1], +m[2], +m[3]] }); };
    $('lTime').oninput = (e) => { const t = +e.target.value; this.setLighting({ time: [Math.floor(t / 60), t % 60] }); };
    document.querySelectorAll('.chips button[data-date]').forEach(b => b.onclick = () => { $('lDate').value = b.dataset.date; $('lDate').dispatchEvent(new Event('change')); if (this.fx.lighting.mode !== 'sun') { document.querySelector('input[name=light][value=sun]').checked = true; this.setLighting({ mode: 'sun' }); } });
    $('qualitySel').value = this.defaultQuality;
    $('qualitySel').onchange = (e) => { this.fx.setQuality(e.target.value); this.render(); };
    $('btnReset').onclick = () => this.reset();
    $('btnCopyLink').onclick = () => this.ui.copyLink();
    $('btnExport').onclick = () => this.exportNow();
    $('btnHelp2').onclick = () => this.ui.help();
    $('panelToggle').onclick = () => document.body.classList.toggle('panel-open');
    $('sheetClose').onclick = () => document.body.classList.remove('panel-open');
    for (const [id, f] of [['mvF', () => this.move(0.5, 0)], ['mvB', () => this.move(-0.5, 0)], ['mvL', () => this.move(0, -0.5)], ['mvR', () => this.move(0, 0.5)], ['mvU', () => this.eye(0.05)], ['mvD', () => this.eye(-0.05)]]) $(id).onclick = f;
    // numeric camera fields
    const fields = [['fE', 'E'], ['fN', 'N'], ['fRL', 'RL'], ['fHead', 'heading'], ['fPitch', 'pitch'], ['fRoll', 'roll'], ['fHfov', 'hfov'], ['fShift', 'shift']];
    for (const [id, key] of fields) $(id).onchange = (e) => {
      const v = parseFloat(e.target.value); if (!isFinite(v)) return this.updateCameraUI(); const c = { ...this.cam };
      if (key === 'E') c.x = v - K.E0; else if (key === 'N') c.y = v - K.N0; else if (key === 'RL') c.z = v; else if (key === 'shift') c.cy = c.H / 2 + v * c.W / 2;
      else if (key === 'heading') c.heading = ((v % 360) + 360) % 360; else if (key === 'pitch') c.pitch = Math.max(-89, Math.min(89, v)); else c[key] = v;
      if (key === 'hfov') c.hfov = Math.max(5, Math.min(140, v));
      if (!this.setCam(c)) this.updateCameraUI();
    };
    // framing table
    const ft = $('framingRow');
    this.state.framing.forEach((fr, i) => { const d = document.createElement('div'); d.className = 'frow'; d.innerHTML = `Panel ${i + 1}: HFOV <input type="number" step="1" value="${fr.hfov}" data-k="hfov" data-i="${i}"> pitch <input type="number" step="1" value="${fr.pitch}" data-k="pitch" data-i="${i}">`; ft.appendChild(d); });
    ft.querySelectorAll('input').forEach(inp => inp.onchange = () => { this.state.framing[+inp.dataset.i][inp.dataset.k] = +inp.value; this.render(); });
    $('srcStatus').textContent = `scene ${this.manifest.assets['scene.json'].sha256.slice(0, 12)}… · controls ${this.manifest.assets['controls.json'].sha256.slice(0, 12)}… · basemap ${this.manifest.assets['basemap.json'].sha256.slice(0, 12)}… · v${this.version.version}`;
    this.updateScenarioUI();
  }
  updateScenarioUI() {
    const h = this.scenarios[this.state.hist], a = this.scenarios[this.state.appr];
    $('btnHist').textContent = `E1 · ${h.id}`; $('btnAppr').textContent = `E2 · ${a.id}`; $('cbHistId').textContent = h.id; $('cbApprId').textContent = a.id;
    const hs = this.state.side === 'historical'; for (const [id, on] of [['btnHist', hs], ['btnAppr', !hs], ['cbHist', hs], ['cbAppr', !hs]]) { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); }
    const cur = this.scenarios[this.activeScenario()]; $('scenNote').innerHTML = `<b>${cur.label}</b> <span class="tag ${cur.classification}">${cur.classification}</span><br>${cur.note}`;
  }
  updatePresetUI() {
    const p = this.preset(this.state.preset);
    document.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b.dataset.id === p.id));
    $('presetNote').innerHTML = `<b>${p.label}</b> <span class="tag ${p.classification}">${p.classification}</span><br>MGA56 E ${p.E.toFixed(2)} N ${p.N.toFixed(2)}, eye RL ${p.RL.toFixed(2)} (model ground ${p.dem_RL.toFixed(2)})<br>Eye: ${p.eye_basis}<br>Framing: ${p.framing_basis}<br>${p.note}`;
  }
  updateCameraUI() {
    if (!this.cam) return; const c = this.cam; const [E, N] = K.localToMga(c.x, c.y, c.z); const g = K.demAt(this.S.terrain, c.x, c.y);
    const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    set('fE', E.toFixed(2)); set('fN', N.toFixed(2)); set('fRL', c.z.toFixed(2)); set('fHead', c.heading.toFixed(2)); set('fPitch', c.pitch.toFixed(2)); set('fRoll', c.roll.toFixed(2));
    set('fHfov', c.hfov.toFixed(2)); set('fShift', CM.shiftFromPrincipal(c.W, c.H, c.cy).toFixed(4));
    const moved = Math.hypot(c.x - this.origin.x, c.y - this.origin.y); const s = this.fx?.sunInfo, L = this.fx?.lighting;
    const light = !L ? '' : L.mode !== 'sun' ? ' · overcast' : ` · sun ${pad2(L.time[0])}:${pad2(L.time[1])} alt ${s.alt.toFixed(1)}° az ${s.az.toFixed(1)}°`;
    const mode = { station: 'station', free: 'free', overview: 'overview', match: 'photo match' }[this.state.mode] || this.state.mode, np = this.state.mode !== 'station';
    const seg = (t, cls = '', tip = '') => `<span class="h ${cls}"${tip ? ` title="${tip}"` : ''}>${t}</span>`;
    $('hud').innerHTML = seg(`${this.state.preset} · ${mode}${np ? ' <span class="np">[NONPHYSICAL]</span>' : ''}`) +
      seg(`E ${E.toFixed(2)} N ${N.toFixed(2)} RL ${c.z.toFixed(2)} <small>(+${(c.z - g).toFixed(2)} m)</small>`, 'num', 'Camera, MGA56 / AHD; eye height above model ground') +
      seg(`hdg ${c.heading.toFixed(1)}° pitch ${c.pitch.toFixed(1)}° roll ${c.roll.toFixed(1)}° · HFOV ${c.hfov.toFixed(1)}°`, 'num', 'Heading clockwise from grid north') +
      seg(`frame ${c.W}×${c.H} · moved ${moved.toFixed(2)} m`, 'num') + seg(this.activeScenario()) + (light ? seg(light.replace(/^ · /, '')) : '');
    if (this.state.view === 'mask' && this.lastMask) { const m = this.lastMask; $('maskOut').textContent = `Frame-limited angular areas (this camera and frame only; not an amenity measure): only-${m.B} ${fmt(m.add_deg2, 1)} deg², only-${m.A} ${fmt(m.removed_deg2, 1)} deg², towers ${m.A} ${fmt(m.towerA_deg2, 1)} / ${m.B} ${fmt(m.towerB_deg2, 1)} deg², frame ${fmt(m.frame_deg2, 1)} deg²; top elevation ${fmt(m.topA_deg, 2)}° → ${fmt(m.topB_deg, 2)}° (within frame).`; }
  }
}
const app = new App();
app.init().catch(e => { $('loading').textContent = 'Failed to load: ' + e.message; console.error(e); });
