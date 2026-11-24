// Application chrome: menu bar (File, View, Camera, Scenario, Layers, Lighting, Help), help dialog, shortcuts, minimap, compass and
// elevation-angle guides, and shareable URL state. Every menu command goes through the same side-panel control (or App method) a
// mouse user would use, so there is one code path per action. Guides are computed from the exact camera model (camera_model.js).
import * as CM from './camera_model.js';
import * as K from './coords.js';
import { QUALITY } from './render_fx.js';
const $ = (id) => document.getElementById(id);
const RAD = Math.PI / 180;

function setCtl(id, value) {                       // drive a side-panel control exactly as a user would
  const el = $(id); if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
  el.dispatchEvent(new Event(el.type === 'range' ? 'input' : 'change', { bubbles: true }));
}
function setRadio(name, value) { const el = document.querySelector(`input[name=${name}][value="${value}"]`); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
const radioVal = (name) => document.querySelector(`input[name=${name}]:checked`)?.value;

export class UI {
  constructor(app) {
    this.app = app; this.open = null; this.buildMenus(); this.bindKeys(); this.bindHelp(); this.bindPanelMemory(); this.minimapInit(); this.bindTabs(); this.bindDrop();
    $('mapToggle').onclick = () => setCtl('minimapChk', !app.state.minimap);
  }
  // ------------------------------------------------------------------ menus
  menus() {
    const a = this.app, S = a.S, st = a.state;
    const views = [['single', 'Single', '1'], ['side', 'Side by side (E1 | E2)', '2'], ['swipe', 'Swipe', '3'], ['mask', 'Mask overlay (only-E1 / only-E2)', '4'], ['framing', 'Framing comparison (lens / pitch)', '5']];
    const dates = [['2026-06-21', 'Winter solstice, 21 Jun'], ['2026-03-21', 'Equinox, 21 Mar'], ['2026-09-23', 'Equinox, 23 Sep'], ['2026-12-22', 'Summer solstice, 22 Dec']];
    const times = ['07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '15:00', '16:00'];
    return [
      ['File', [
        { label: 'Save PNG + JSON record', sc: 'Ctrl+S', run: () => a.exportNow() },
        { label: 'Load photograph (local only)…', run: () => { this.setTab('photo'); $('imgFile').click(); } },
        { label: 'Save photomontage package (.zip)', run: () => { this.setTab('photo'); $('btnMontageExport').click(); } },
        { label: 'Copy link to this view', run: () => this.copyLink() },
        'sep',
        { label: 'Source register', run: () => window.open('SOURCE_REGISTER.md', '_blank', 'noopener') },
        { label: 'QA record', run: () => window.open('QA.md', '_blank', 'noopener') },
      ]],
      ['View', [
        ...views.map(([v, l, k]) => ({ label: l, sc: k, type: 'radio', get: () => st.view === v, run: () => setRadio('view', v) })),
        'sep',
        { label: 'Side panel', type: 'check', get: () => !document.body.classList.contains('panel-hidden'), run: () => { document.body.classList.toggle('panel-hidden'); a.render(); } },
        { label: 'Minimap', sc: 'M', type: 'check', get: () => st.minimap, run: () => setCtl('minimapChk', !st.minimap) },
        { label: 'Compass and elevation guides', sc: 'G', type: 'check', get: () => st.guides, run: () => setCtl('guides', !st.guides) },
        { label: 'Photomontage (needs a photo)', type: 'check', get: () => !!a.montage?.on, run: () => { this.setTab('photo'); setCtl('montageOn', !a.montage?.on); } },
        'sep',
        { head: 'Quality' },
        ...Object.entries(QUALITY).map(([k, q]) => ({ label: q.label, type: 'radio', get: () => a.fx.quality === k, run: () => setCtl('qualitySel', k) })),
      ]],
      ['Camera', [
        { head: 'Viewpoints' },
        ...S.presets.map(p => ({ label: `${p.id} — ${(p.label.split('—')[1] || '').trim()}`, tag: p.classification, type: 'radio', get: () => st.preset === p.id, run: () => a.selectPreset(p.id) })),
        'sep',
        { label: 'Station (limits on)', type: 'radio', get: () => st.mode === 'station', run: () => setRadio('mode', 'station') },
        { label: 'Free — NONPHYSICAL', type: 'radio', get: () => st.mode === 'free', run: () => setRadio('mode', 'free') },
        { label: 'Overview — NONPHYSICAL', type: 'radio', get: () => st.mode === 'overview', run: () => setRadio('mode', 'overview') },
        'sep',
        { label: 'Reset to preset', sc: 'Home', run: () => a.reset() },
        { label: 'Level the camera (pitch 0°, roll 0°)', run: () => a.setCam({ ...a.cam, pitch: 0, roll: 0 }) },
      ]],
      ['Scenario', [
        { label: 'Toggle E1 / E2', sc: 'T', run: () => a.toggleScenario() },
        'sep', { head: 'Historical (E1)' },
        ...S.scenarios.filter(s => s.side === 'historical').map(s => ({ label: s.id, tag: s.classification, type: 'radio', get: () => st.hist === s.id, run: () => { setCtl('histSel', s.id); a.setSide('historical'); } })),
        'sep', { head: 'Approved (E2)' },
        ...S.scenarios.filter(s => s.side === 'approved').map(s => ({ label: s.id, tag: s.classification, type: 'radio', get: () => st.appr === s.id, run: () => { setCtl('apprSel', s.id); a.setSide('approved'); } })),
      ]],
      ['Layers', [
        { label: 'VA2 context (LiDAR envelopes)', type: 'radio', get: () => st.context === 'CTX_VA2', run: () => setCtl('ctxSel', 'CTX_VA2') },
        { label: 'VA4 Cluster 4 plan-derived masses', type: 'radio', get: () => st.context === 'CTX_VA4C4', run: () => setCtl('ctxSel', 'CTX_VA4C4') },
        'sep',
        { label: 'LiDAR canopy heightfield', type: 'check', get: () => st.canopy, run: () => setCtl('canopy', !st.canopy) },
        { label: 'Edges', type: 'check', get: () => st.edges, run: () => setCtl('edges', !st.edges) },
        { label: 'Storey lines', type: 'check', get: () => st.storeys, run: () => setCtl('storeys', !st.storeys) },
        { label: '8-storey line (red, on the approved form)', type: 'check', get: () => st.line8, run: () => setCtl('line8', !st.line8) },
        'sep', { head: 'Ground' },
        { label: 'Cadastre + 1 m contours', type: 'radio', get: () => st.ground === 'cadastre', run: () => setCtl('groundSel', 'cadastre') },
        { label: 'Cadastre only', type: 'radio', get: () => st.ground === 'cadastre-plain', run: () => setCtl('groundSel', 'cadastre-plain') },
        { label: 'Plain', type: 'radio', get: () => st.ground === 'plain', run: () => setCtl('groundSel', 'plain') },
        'sep', { head: 'Tower colour' },
        { label: 'Neutral (same for E1 and E2)', type: 'radio', get: () => st.colour === 'neutral', run: () => setCtl('colourMode', 'neutral') },
        { label: 'By scenario', type: 'radio', get: () => st.colour === 'scenario', run: () => setCtl('colourMode', 'scenario') },
        { label: 'Light (presentation)', type: 'radio', get: () => st.colour === 'light', run: () => setCtl('colourMode', 'light') },
      ]],
      ['Lighting', [
        { label: 'Sun at date and time', sc: 'L', type: 'radio', get: () => a.fx.lighting.mode === 'sun', run: () => setRadio('light', 'sun') },
        { label: 'Overcast / neutral', type: 'radio', get: () => a.fx.lighting.mode !== 'sun', run: () => setRadio('light', 'overcast') },
        'sep',
        { label: 'Aerial haze (15 km clear / 8 km overcast visibility)', type: 'check', get: () => a.fx.hazeOn !== false, run: () => { a.fx.setHaze(a.fx.hazeOn === false); a.render(); this.writeURL?.(); } },
        'sep', { head: 'Date' },
        ...dates.map(([d, l]) => ({ label: l, type: 'radio', get: () => $('lDate').value === d, run: () => { setCtl('lDate', d); if (a.fx.lighting.mode !== 'sun') setRadio('light', 'sun'); } })),
        'sep', { head: 'Time (AEST)' },
        ...times.map(t => ({ label: t, type: 'radio', get: () => $('lTimeOut').textContent === t, run: () => { const [h, m] = t.split(':').map(Number); setCtl('lTime', h * 60 + m); if (a.fx.lighting.mode !== 'sun') setRadio('light', 'sun'); } })),
      ]],
      ['Help', [
        { label: 'Help and keyboard shortcuts', sc: '?', run: () => this.help() },
        { label: 'About the model and its limits', run: () => this.help() },
        { label: 'Build plan', run: () => window.open('BUILD_PLAN.md', '_blank', 'noopener') },
      ]],
    ];
  }
  buildMenus() {
    const bar = $('menubar'); bar.innerHTML = '';
    for (const [name, items] of this.menus()) {
      const wrap = document.createElement('div'); wrap.className = 'mwrap';
      const top = document.createElement('button'); top.className = 'mtop'; top.textContent = name; top.setAttribute('role', 'menuitem'); top.setAttribute('aria-haspopup', 'true'); top.setAttribute('aria-expanded', 'false'); top.dataset.menu = name;
      const menu = document.createElement('div'); menu.className = 'menu'; menu.setAttribute('role', 'menu'); menu.hidden = true; menu.dataset.menu = name;
      top.onclick = (e) => { e.stopPropagation(); this.open === name ? this.close() : this.show(name); };
      top.onmouseenter = () => { if (this.open && this.open !== name) this.show(name); };
      top.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.show(name, true); } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.step(name, e.key === 'ArrowRight' ? 1 : -1, false); } };
      wrap.append(top, menu); bar.appendChild(wrap); wrap._items = items; wrap._menu = menu; wrap._top = top;
    }
    document.addEventListener('pointerdown', (e) => { if (this.open && !e.target.closest('#menubar')) this.close(); });
  }
  wraps() { return [...$('menubar').children]; }
  show(name, focusFirst = false) {
    this.close(false);
    const w = this.wraps().find(x => x._top.dataset.menu === name); const m = w._menu; m.innerHTML = '';
    for (const it of w._items) {
      if (it === 'sep') { const s = document.createElement('div'); s.className = 'sep'; s.setAttribute('role', 'separator'); m.appendChild(s); continue; }
      if (it.head) { const h = document.createElement('div'); h.className = 'mhead'; h.textContent = it.head; m.appendChild(h); continue; }
      const b = document.createElement('button'); b.setAttribute('role', it.type === 'check' ? 'menuitemcheckbox' : it.type === 'radio' ? 'menuitemradio' : 'menuitem');
      if (it.type) b.setAttribute('aria-checked', String(!!it.get()));
      b.innerHTML = `<span>${it.label}</span>${it.tag ? `<span class="tag ${it.tag}">${it.tag}</span>` : ''}${it.sc ? `<span class="sc">${it.sc}</span>` : ''}`;
      b.onclick = (e) => { e.stopPropagation(); this.close(); it.run(); };
      b.onkeydown = (e) => this.menuKey(e, name);
      m.appendChild(b);
    }
    m.hidden = false; w._top.setAttribute('aria-expanded', 'true'); this.open = name;
    if (focusFirst) m.querySelector('button')?.focus();
  }
  close(refocus = false) {
    for (const w of this.wraps()) { w._menu.hidden = true; w._top.setAttribute('aria-expanded', 'false'); if (refocus && w._top.dataset.menu === this.open) w._top.focus(); }
    this.open = null;
  }
  step(name, d, openIt = true) { const ws = this.wraps(), i = ws.findIndex(w => w._top.dataset.menu === name), n = ws[(i + d + ws.length) % ws.length]; if (openIt) this.show(n._top.dataset.menu, true); else n._top.focus(); }
  menuKey(e, name) {
    const items = [...e.currentTarget.parentElement.querySelectorAll('button')], i = items.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.step(name, e.key === 'ArrowRight' ? 1 : -1); }
    else if (e.key === 'Tab') this.close();
    e.stopPropagation();
  }
  keysBlocked() { return !!this.open || $('helpDlg').open; }
  // ------------------------------------------------------------------ help & shortcuts
  bindHelp() { $('btnHelp').onclick = () => this.help(); }
  help() { const d = $('helpDlg'); if (!d.open) d.showModal(); }
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) && !(e.ctrlKey || e.metaKey)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.close(); this.app.exportNow(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || this.keysBlocked()) { if (e.key === 'Escape' && this.open) this.close(true); return; }
      if (e.key === 'Escape') { const m = this.app.match, mo = this.app.montage; if (m?.picking) { m.picking = false; m.pending = null; m.step = 'image'; m.ui(); this.app.render(); } if (mo?.painting) mo.setPainting(false); return; }
      const views = { 1: 'single', 2: 'side', 3: 'swipe', 4: 'mask', 5: 'framing' };
      if (e.key === '?') { e.preventDefault(); this.help(); }
      else if (views[e.key]) { e.preventDefault(); setRadio('view', views[e.key]); }
      else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setRadio('light', this.app.fx.lighting.mode === 'sun' ? 'overcast' : 'sun'); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setCtl('minimapChk', !this.app.state.minimap); }
      else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); setCtl('guides', !this.app.state.guides); }
    });
  }
  bindPanelMemory() {                               // remember collapsed panel sections (per browser; convenience only)
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('greville-visual-sections') || '{}'); } catch (_) { saved = {}; }
    document.querySelectorAll('aside details[data-sec]').forEach(d => {
      if (d.dataset.sec in saved) d.open = !!saved[d.dataset.sec];
      d.addEventListener('toggle', () => { saved[d.dataset.sec] = d.open; try { localStorage.setItem('greville-visual-sections', JSON.stringify(saved)); } catch (_) { /* storage unavailable */ } });
    });
  }
  // ------------------------------------------------------------------ tabs, drag & drop, photo steps
  bindTabs() { document.querySelectorAll('[data-tab-btn]').forEach(b => { b.onclick = () => this.setTab(b.dataset.tabBtn); b.onkeydown = (e) => {
    const all = [...document.querySelectorAll('[data-tab-btn]')], i = all.indexOf(b); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length]; this.setTab(n.dataset.tabBtn); n.focus(); } }; }); }
  setTab(name) {
    document.querySelectorAll('[data-tab-btn]').forEach(b => { const on = b.dataset.tabBtn === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[data-tab]').forEach(s => { s.hidden = s.dataset.tab !== name; }); this.tab = name;
    if (matchMedia('(max-width: 820px)').matches) document.body.classList.add('panel-open'); else if (document.body.classList.contains('panel-hidden')) { document.body.classList.remove('panel-hidden'); this.app.render(); }
  }
  bindDrop() {
    const st = this.app.stage, hint = $('dropHint'); let depth = 0;
    const isFile = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    st.addEventListener('dragenter', (e) => { if (!isFile(e)) return; e.preventDefault(); depth++; hint.hidden = false; });
    st.addEventListener('dragover', (e) => { if (isFile(e)) e.preventDefault(); });
    st.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
    st.addEventListener('drop', (e) => { if (!isFile(e)) return; e.preventDefault(); depth = 0; hint.hidden = true; const f = e.dataTransfer.files[0]; if (!f) return;
      this.setTab('photo'); this.app.match.load(f); });
  }
  updateSteps() {
    const a = this.app, m = a.match, mo = a.montage; if (!m || !mo) return; const img = !!m.image, F = m.fit, blocked = m.flags?.some(f => f.severity === 'block');
    const fitOK = !!F && !blocked && F.grade !== 'D', n = m.pairs.length;
    const set = (i, cls, txt) => { const el = $('step' + i); el.classList.remove('done', 'current', 'locked'); if (cls) el.classList.add(cls); $('s' + i + 'state').textContent = txt; };
    set(1, img ? 'done' : 'current', img ? `${m.image.W}×${m.image.H}` : 'start here');
    set(2, fitOK ? 'done' : img ? 'current' : '', F ? (fitOK ? `grade ${F.grade} · RMS ${F.rms_px.toFixed(1)} px` : 'fit not reliable yet') : img ? `${n} pair${n === 1 ? '' : 's'} · need 8+` : 'after step 1');
    set(3, !img ? 'locked' : mo.on ? 'done' : fitOK ? 'current' : '', !img ? 'needs a photo' : mo.on ? 'showing' : fitOK ? 'ready' : 'after step 2');
    set(4, !img ? 'locked' : mo.on ? 'current' : '', !img ? 'needs a photo' : 'camera-matched');
    $('btnFit').disabled = n < 4; $('btnFit').title = n < 4 ? 'Needs at least 4 pairs (8+ for a determined camera)' : '';
    for (const id of ['montageOn', 'montageLayer', 'btnPhotoTime', 'montageExposure', 'btnPaint', 'brushSize', 'btnClearMask', 'btnMontageExport', 'btnUseImageFrame', 'imgOpacity']) $(id).disabled = !img;
    $('btnGpsPrior').disabled = !mo.meta?.gps_mga; $('btnPhotoTime').disabled = !img || !mo.meta?.capture_aest;
    const badge = $('photoBadge'); badge.hidden = !img;
  }
  // ------------------------------------------------------------------ URL state
  stateToQuery() {
    const a = this.app, st = a.state, c = a.cam, p = a.preset(st.preset), q = new URLSearchParams(); const L = a.fx.lighting;
    q.set('preset', st.preset); if (st.view !== 'single') q.set('view', st.view); if (st.view === 'swipe') q.set('swipe', st.swipe.toFixed(2));
    if (st.side !== 'approved') q.set('side', st.side); if (st.hist !== a.S.default_scenarios.historical) q.set('hist', st.hist); if (st.appr !== a.S.default_scenarios.approved) q.set('appr', st.appr);
    if (st.mode === 'free' || st.mode === 'overview') q.set('mode', st.mode);
    const [E, N] = K.localToMga(c.x, c.y, c.z), shift = CM.shiftFromPrincipal(c.W, c.H, c.cy);
    const differs = Math.abs(E - p.E) > 1e-4 || Math.abs(N - p.N) > 1e-4 || Math.abs(c.z - p.RL) > 1e-4 || c.heading !== p.heading || c.pitch !== p.pitch || c.roll !== p.roll || c.hfov !== p.hfov || Math.abs(shift - p.shift) > 1e-9;
    if (differs && st.mode !== 'match') q.set('cam', [E.toFixed(3), N.toFixed(3), c.z.toFixed(3), +c.heading.toFixed(4), +c.pitch.toFixed(4), +c.roll.toFixed(4), +c.hfov.toFixed(4), +shift.toFixed(6)].join(','));
    if (st.mode === 'overview') { const o = st.orbit; q.set('orbit', [o.tx, o.ty, o.tz, o.dist, o.heading, o.pitch].map(v => +v.toFixed(2)).join(',')); }
    if (st.context !== 'CTX_VA2') q.set('ctx', st.context); if (st.canopy) q.set('canopy', '1'); if (!st.edges) q.set('edges', '0'); if (!st.storeys) q.set('storeys', '0'); if (!st.line8) q.set('line8', '0');
    if (st.ground !== 'cadastre') q.set('ground', st.ground); if (st.colour !== 'neutral') q.set('colour', st.colour);
    if (L.mode !== 'sun') q.set('light', L.mode);
    q.set('date', `${L.date[0]}-${String(L.date[1]).padStart(2, '0')}-${String(L.date[2]).padStart(2, '0')}`); q.set('time', `${String(L.time[0]).padStart(2, '0')}${String(L.time[1]).padStart(2, '0')}`);
    if (a.fx.quality !== a.defaultQuality) q.set('q', a.fx.quality);
    if (a.fx.hazeOn === false) q.set('haze', '0');
    return q;
  }
  writeURL() { clearTimeout(this._ut); this._ut = setTimeout(() => { try { history.replaceState(null, '', `${location.pathname}?${this.stateToQuery()}`); } catch (_) { /* sandboxed */ } }, 250); }
  linkURL() { return `${location.origin}${location.pathname}?${this.stateToQuery()}`; }
  copyLink() {
    const url = this.linkURL(); this.app.lastLink = url;
    const ok = () => this.app.flash('Link copied: it reopens this exact camera, scenario, layers and lighting.');
    try { navigator.clipboard.writeText(url).then(ok, () => window.prompt('Copy this link:', url)); } catch (_) { window.prompt('Copy this link:', url); }
  }
  applyQuery(q) {                                   // called once at start-up, after the preset is selected
    const a = this.app, st = a.state, num = (s) => s.split(',').map(Number);
    if (q.get('ctx')) setCtl('ctxSel', q.get('ctx')); if (q.get('canopy') === '1') setCtl('canopy', true); if (q.get('edges') === '0') setCtl('edges', false); if (q.get('storeys') === '0') setCtl('storeys', false); if (q.get('line8') === '0') setCtl('line8', false);
    if (q.get('ground')) setCtl('groundSel', q.get('ground')); if (q.get('colour')) setCtl('colourMode', q.get('colour'));
    if (q.get('hist') && a.scenarios[q.get('hist')]) setCtl('histSel', q.get('hist')); if (q.get('appr') && a.scenarios[q.get('appr')]) setCtl('apprSel', q.get('appr'));
    if (q.get('side') === 'historical') a.setSide('historical');
    if (q.get('date') && /^\d{4}-\d\d-\d\d$/.test(q.get('date'))) setCtl('lDate', q.get('date'));
    if (q.get('time') && /^\d{4}$/.test(q.get('time'))) setCtl('lTime', +q.get('time').slice(0, 2) * 60 + +q.get('time').slice(2));
    if (q.get('light') === 'overcast') setRadio('light', 'overcast');
    if (q.get('haze') === '0') a.fx.setHaze(false);
    if (q.get('q') && QUALITY[q.get('q')]) setCtl('qualitySel', q.get('q'));
    if (q.get('mode') === 'free' || q.get('mode') === 'overview') setRadio('mode', q.get('mode'));
    if (q.get('cam')) { const [E, N, RL, h, p, r, hfov, shift] = num(q.get('cam')); if ([E, N, RL, h, p, r, hfov, shift].every(Number.isFinite)) {
      const c = { ...a.cam, x: E - K.E0, y: N - K.N0, z: RL, heading: h, pitch: p, roll: r, hfov, cy: a.cam.H / 2 + shift * a.cam.W / 2 }; if (!a.setCam(c)) a.flash('The linked camera is outside station limits; showing the preset instead.'); } }
    if (q.get('orbit')) { const v = num(q.get('orbit')); if (v.length === 6 && v.every(Number.isFinite)) { const [tx, ty, tz, dist, heading, pitch] = v; st.orbit = { tx, ty, tz, dist, heading, pitch }; } }
    if (q.get('view') && document.querySelector(`input[name=view][value="${q.get('view')}"]`)) { if (q.get('swipe')) setCtl('swipe', +q.get('swipe')); setRadio('view', q.get('view')); }
  }
  // ------------------------------------------------------------------ guides (compass ribbon + elevation ruler)
  drawGuides(ctx, panel, par) {
    const a = this.app, W = a.cam.W, H = a.cam.H, sx = panel.w / W, sy = panel.h / H, P = [par[0], par[1], par[2]];
    const proj = (az, el) => { const d = [Math.cos(el * RAD) * Math.sin(az * RAD), Math.cos(el * RAD) * Math.cos(az * RAD), Math.sin(el * RAD)]; const [u, v, zf] = CM.project(par, [P[0] + d[0] * 1000, P[1] + d[1] * 1000, P[2] + d[2] * 1000]); return zf > 1e-6 ? [panel.x + u * sx, panel.y + v * sy] : null; };
    const inside = (q) => q && q[0] >= panel.x && q[0] <= panel.x + panel.w && q[1] >= panel.y - 1 && q[1] <= panel.y + panel.h + 1;
    ctx.save(); ctx.beginPath(); ctx.rect(panel.x, panel.y, panel.w, panel.h); ctx.clip();
    // horizontal (0 deg elevation) through the visible bearings, dashed
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(20,20,20,.45)'; ctx.lineWidth = 1; ctx.beginPath(); let pen = false;
    for (let az = 0; az <= 360; az += 0.5) { const q = proj(az, 0); if (q && Math.abs(q[0] - panel.x - panel.w / 2) < panel.w * 3) { pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; } else pen = false; }
    ctx.stroke(); ctx.setLineDash([]);
    // compass ribbon: bearing of points on the horizontal, shown at the panel top
    const band = 22; ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.fillRect(panel.x, panel.y, panel.w, band);
    ctx.fillStyle = '#222'; ctx.strokeStyle = '#333'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    const card = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let az = 0; az < 360; az += 1) {
      const q = proj(az, 0); if (!q || q[0] < panel.x || q[0] > panel.x + panel.w) continue;
      const len = az % 10 === 0 ? 7 : az % 5 === 0 ? 4 : 2; if (len === 2 && sx * W / (a.cam.hfov || 60) < 5) continue;
      ctx.beginPath(); ctx.moveTo(q[0], panel.y + band); ctx.lineTo(q[0], panel.y + band - len); ctx.stroke();
      if (az % 10 === 0) { ctx.font = card[az] ? 'bold 11px system-ui, sans-serif' : '10px system-ui, sans-serif'; ctx.fillText(card[az] ? `${card[az]}` : `${az}°`, q[0], panel.y + 11); }
    }
    ctx.textAlign = 'left'; ctx.font = '9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(panel.x, panel.y + band, 64, 12); ctx.fillStyle = '#444'; ctx.fillText('grid bearing', panel.x + 4, panel.y + band + 9);
    // elevation ruler along the line of constant bearing through the left edge of the frame centre row
    const az0 = CM.azEl(CM.pixelRay(par, 0.95 * W, par[8]))[0];
    ctx.strokeStyle = 'rgba(20,20,20,.75)'; ctx.fillStyle = '#111'; ctx.lineWidth = 1; ctx.beginPath(); pen = false;
    for (let el = -30; el <= 89.5; el += 0.5) { const q = proj(az0, el); if (inside(q)) { pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); pen = true; } else pen = false; }
    ctx.stroke();
    let lastY = Infinity;
    for (let el = -30; el <= 85; el += 5) {
      const q = proj(az0, el); if (!inside(q)) continue; const major = el % 10 === 0;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] - (major ? 9 : 5), q[1]); ctx.stroke();
      if (major && Math.abs(q[1] - lastY) > 13) { const t = `${el}°`; const w = ctx.measureText(t).width; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(q[0] - 15 - w, q[1] - 7, w + 4, 13); ctx.fillStyle = '#111'; ctx.fillText(t, q[0] - 13 - w, q[1] + 4); lastY = q[1]; }
    }
    const qBot = [...Array(120).keys()].map(i => proj(az0, -30 + i)).find(inside);           // ruler title at its lowest visible point
    if (qBot) { const t = `elevation @ bearing ${az0.toFixed(0)}°`; ctx.font = '10px system-ui, sans-serif'; const w = ctx.measureText(t).width, y = Math.min(panel.y + panel.h - 6, qBot[1]); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(qBot[0] - 15 - w, y - 10, w + 4, 13); ctx.fillStyle = '#333'; ctx.fillText(t, qBot[0] - 13 - w, y); }
    ctx.restore();
  }
  // ------------------------------------------------------------------ minimap
  minimapInit() {
    const a = this.app, cv = $('minimap'); this.mm = { cv };
    // extent: all presets and tower footprints, with a margin
    const pts = a.S.presets.map(p => K.mgaToLocal(p.E, p.N, p.RL)); for (const k of ['E1_SK48', 'E2', 'ARTW', 'POD']) for (const q of a.S.collections[k].prisms) pts.push(...q.P);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 45; this.mm.ext = { cx, cy, half };
    cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.minimapClick(e); });
    cv.addEventListener('wheel', (e) => { e.stopPropagation(); e.preventDefault(); this.mm.ext.half = Math.max(30, Math.min(400, this.mm.ext.half * Math.exp(e.deltaY * 0.001))); this.mm.base = null; this.drawMinimap(); }, { passive: false });
  }
  mmXY(x, y, S) { const e = this.mm.ext; return [(x - e.cx + e.half) / (2 * e.half) * S, (e.cy + e.half - y) / (2 * e.half) * S]; }
  mmInv(px, py, S) { const e = this.mm.ext; return [e.cx - e.half + px / S * 2 * e.half, e.cy + e.half - py / S * 2 * e.half]; }
  minimapBase(S, dpr) {
    const a = this.app, cv = document.createElement('canvas'); cv.width = cv.height = Math.round(S * dpr); const c = cv.getContext('2d'); c.scale(dpr, dpr);
    c.fillStyle = '#e9e7df'; c.fillRect(0, 0, S, S);
    const poly = (P) => { c.beginPath(); P.forEach(([x, y], i) => { const [u, v] = this.mmXY(x, y, S); i ? c.lineTo(u, v) : c.moveTo(u, v); }); c.closePath(); };
    if (a.basemap) {
      for (const p of a.basemap.parcels) for (const r of p.rings) { poly(r); c.fillStyle = /^Road/.test(p.type) ? '#c3c3be' : '#f2f0e8'; c.fill(); c.strokeStyle = 'rgba(80,80,70,.35)'; c.lineWidth = 0.5; c.stroke(); }
      for (const l of a.basemap.rail) { c.beginPath(); l.forEach(([x, y], i) => { const [u, v] = this.mmXY(x, y, S); i ? c.lineTo(u, v) : c.moveTo(u, v); }); c.strokeStyle = '#6b655e'; c.lineWidth = 1.5; c.setLineDash([4, 2]); c.stroke(); c.setLineDash([]); }
      for (const p of a.basemap.parcels.filter(p => p.lotplan === a.basemap.site_lotplan)) for (const r of p.rings) { poly(r); c.strokeStyle = '#b4501f'; c.lineWidth = 1.5; c.stroke(); }
    }
    return cv;
  }
  drawMinimap() {
    const a = this.app, cv = this.mm.cv, st = a.state; cv.hidden = !st.minimap; $('mapToggle').setAttribute('aria-expanded', String(!!st.minimap)); if (!st.minimap || !a.cam) return;
    const S = cv.clientWidth || 220, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(S * dpr)) { cv.width = cv.height = Math.round(S * dpr); this.mm.base = null; }
    if (!this.mm.base || this.mm.baseS !== S) { this.mm.base = this.minimapBase(S, dpr); this.mm.baseS = S; }
    const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.mm.base, 0, 0); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const poly = (P) => { c.beginPath(); P.forEach(([x, y], i) => { const [u, v] = this.mmXY(x, y, S); i ? c.lineTo(u, v) : c.moveTo(u, v); }); c.closePath(); };
    const ctxSet = [...a.info.CTX_BASE.prisms, ...(st.context === 'CTX_VA2' ? a.info.CTX_C4_LIDAR.prisms : a.info.CTX_VA4C4_ADD.prisms)];
    c.fillStyle = 'rgba(150,145,135,.75)'; for (const q of ctxSet) { poly(q.P); c.fill(); }
    const scen = a.scenarios[a.activeScenario()]; const e1 = scen.side === 'historical';
    c.fillStyle = e1 ? 'rgba(27,175,122,.55)' : 'rgba(235,104,52,.55)'; c.strokeStyle = e1 ? '#0d6f4c' : '#a8441c'; c.lineWidth = 1;
    for (const m of scen.members) for (const q of a.info[m].prisms) { poly(q.P); c.fill(); c.stroke(); }
    c.font = '10px system-ui, sans-serif'; c.textAlign = 'left';
    for (const p of a.S.presets) {                    // dots for every viewpoint; a label for the current one and W01 only (NG55-59 sit 2 m apart)
      const [x, y] = K.mgaToLocal(p.E, p.N, p.RL); const [u, v] = this.mmXY(x, y, S); c.fillStyle = p.classification === 'hypothetical' ? '#d03b3b' : '#2a78d6'; c.beginPath(); c.arc(u, v, 3, 0, 7); c.fill();
      if (p.id === st.preset || p.id === 'W01') { const t = p.id; const w = c.measureText(t).width; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(u + 4, v - 13, w + 4, 12); c.fillStyle = '#222'; c.fillText(t, u + 6, v - 4); }
    }
    // camera wedge (horizontal field of view) or overview target
    const par = a.renderPar(); const [u0, v0] = this.mmXY(par[0], par[1], S); const hf = CM.hfovFromFocal(a.cam.W, par[6]) / 2, h = par[3], L = 70 / (2 * this.mm.ext.half) * S;
    c.fillStyle = 'rgba(42,120,214,.22)'; c.strokeStyle = '#2a78d6'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(u0, v0);
    for (let t = -hf; t <= hf + 1e-9; t += hf / 10) c.lineTo(u0 + L * Math.sin((h + t) * RAD), v0 - L * Math.cos((h + t) * RAD));
    c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#123f7a'; c.beginPath(); c.arc(u0, v0, 3.5, 0, 7); c.fill();
    if (st.mode === 'overview') { const [tu, tv] = this.mmXY(st.orbit.tx, st.orbit.ty, S); c.strokeStyle = '#d03b3b'; c.beginPath(); c.moveTo(tu - 5, tv); c.lineTo(tu + 5, tv); c.moveTo(tu, tv - 5); c.lineTo(tu, tv + 5); c.stroke(); }
    // north arrow and scale bar
    c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(S - 26, 4, 22, 28); c.fillStyle = '#222'; c.textAlign = 'center'; c.font = 'bold 10px system-ui'; c.fillText('N', S - 15, 15); c.beginPath(); c.moveTo(S - 15, 18); c.lineTo(S - 19, 29); c.lineTo(S - 15, 26); c.lineTo(S - 11, 29); c.closePath(); c.fill();
    const m50 = 50 / (2 * this.mm.ext.half) * S; c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(4, S - 18, m50 + 32, 14); c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.moveTo(8, S - 8); c.lineTo(8 + m50, S - 8); c.stroke(); c.fillStyle = '#222'; c.font = '9px system-ui'; c.textAlign = 'left'; c.fillText('50 m', 11 + m50, S - 7);
  }
  minimapClick(e) {
    const a = this.app, r = this.mm.cv.getBoundingClientRect(), S = r.width; const [x, y] = this.mmInv(e.clientX - r.left, e.clientY - r.top, S);
    if (a.state.mode === 'overview') { a.state.orbit.tx = x; a.state.orbit.ty = y; a.render(); }
    else if (a.state.mode === 'free') { const g0 = K.demAt(a.S.terrain, a.cam.x, a.cam.y), g1 = K.demAt(a.S.terrain, x, y); a.setCam({ ...a.cam, x, y, z: a.cam.z - g0 + g1 }); }
    else a.flash('Station mode keeps the camera at its viewpoint. Switch to Free or Overview (Camera menu) to move by map, or pick a viewpoint.');
  }
}
