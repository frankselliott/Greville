// Browser end-to-end tests (Playwright, Chromium). Run:  node --test visual/tests/e2e.test.cjs
// The repository is served under /Greville/ (GitHub Pages project path). Every request that leaves 127.0.0.1 is aborted and fails the run.
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { chromium, devices } = require('playwright');
const { start } = require('./serve.cjs');
const VIS = path.resolve(__dirname, '..');
const FIX = (n) => JSON.parse(fs.readFileSync(path.join(VIS, 'tests', 'fixtures', n), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let srv, base, browser; const external = [];

// Interaction and invariance tests run at quality=low (the camera model does not depend on render quality); tests about rendering
// itself (page load, export determinism, high-DPI) pass { full: true } or an explicit q= and use the full pipeline.
async function open(viewport = { width: 1400, height: 900 }, extra = {}, query = '', { full = false } = {}) {
  if (!full && !/[?&]q=/.test(query)) query += (query ? '&' : '?') + 'q=low';
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...extra });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== '127.0.0.1' && u.protocol !== 'blob:' && u.protocol !== 'data:') { external.push(u.href); return r.abort(); } return r.continue(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}visual/${query}`); await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 }); await settle(page);
  return { ctx, page, errors };
}
const tab = (page, name) => page.click(`[data-tab-btn="${name}"]`);            // v1.3 tabbed panel
const unfold = (page, sel) => page.evaluate((sel) => { document.querySelector(sel).open = true; }, sel);
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const camSnap = (page) => page.evaluate(() => { const a = window.__visual; return { cam: { ...a.cam }, world: [...a.camera.matrixWorld.elements], proj: [...a.camera.projectionMatrix.elements], canvas: [a.canvas.width, a.canvas.height], mode: a.state.mode }; });
function unrle(r, n) { const m = new Uint8Array(n); let v = r.first, k = 0; for (const run of r.runs) { if (v) m.fill(1, k, k + run); k += run; v = 1 - v; } return m; }

test.before(async () => { srv = await start(0); base = `http://127.0.0.1:${srv.address().port}/Greville/`; browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); srv?.close(); });

test('M2/G5.4 page loads under the /Greville/ sub-path with no errors and no external requests', async () => {
  const { ctx, page, errors } = await open(undefined, {}, '', { full: true });
  await page.waitForTimeout(1500);                                   // let the full-quality (ambient occlusion) frame run as well
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const info = await page.evaluate(() => ({ presets: window.__visual.S.presets.map(p => p.id), webgl: !!window.__visual.renderer.getContext() }));
  assert.deepEqual(info.presets, ['W01', 'NG55', 'NG57', 'NG59']); assert.ok(info.webgl);
  await ctx.close();
});

test('G2.1/G2.3 depth-tested WebGL tower silhouettes match the archived independent ray-caster (W01 archived camera; NG57 roofline frame)', async () => {
  const { ctx, page } = await open();
  for (const [cid, scen] of [['W01', 'E1_SK48'], ['W01', 'E2'], ['NG57', 'E1_SK48'], ['NG57', 'E2']]) {
    const F = FIX(`xrender_${cid}_${scen}.json`); const n = F.W * F.H; const ref = unrle(F.mask_rle, n);
    const mine = await page.evaluate(async ({ cam, scen, W, H }) => {
      const a = window.__visual; const { renderMaskPixels } = await import('./js/compare.js');
      a.state.canopy = true; a.state.context = 'CTX_VA2';
      const par = [cam.x, cam.y, cam.z, cam.heading, 0, 0, W / 2 / Math.tan(cam.hfov * Math.PI / 360), W / 2, H / 2 + cam.shift * W / 2];
      const saved = { W: a.cam.W, H: a.cam.H }; a.cam.W = W; a.cam.H = H; const m = renderMaskPixels(a, par, scen, W, H); a.cam.W = saved.W; a.cam.H = saved.H; a.state.canopy = false;
      return Array.from(m);
    }, { cam: F.camera, scen, W: F.W, H: F.H });
    let inter = 0, uni = 0, xor = 0; for (let i = 0; i < n; i++) { const a = ref[i], b = mine[i]; if (a && b) inter++; if (a || b) uni++; if (a !== b) xor++; }
    const iou = inter / uni;
    // allowed disagreement: anti-aliasing-free one-pixel boundary differences between a column ray-caster and a rasteriser
    assert.ok(iou >= 0.99, `${cid} ${scen}: IoU ${iou.toFixed(4)} (xor ${xor} px of ${F.tower_px})`);
    console.log(`  ${cid} ${scen}: IoU ${iou.toFixed(5)}, xor ${xor} px, ref tower ${F.tower_px} px`);
  }
  await ctx.close();
});

test('G2.3 presets load exact source coordinates, RL and archived W01 framing', async () => {
  const { ctx, page } = await open();
  const S = JSON.parse(fs.readFileSync(path.join(VIS, 'assets', 'scene.json'), 'utf8'));
  for (const p of S.presets) {
    await page.click(`#presets button[data-id="${p.id}"]`); await settle(page);
    const c = await page.evaluate(() => ({ ...window.__visual.cam }));
    assert.ok(Math.abs(c.x + 504045 - p.E) < 1e-6 && Math.abs(c.y + 6966712 - p.N) < 1e-6 && c.z === p.RL, p.id);
    assert.equal(c.heading, p.heading); assert.equal(c.hfov, p.hfov); assert.ok(Math.abs(c.cy - (p.H / 2 + p.shift * p.W / 2)) < 1e-9);
    const hud = await page.textContent('#hud'); assert.ok(hud.includes(`E ${p.E.toFixed(2)} N ${p.N.toFixed(2)} RL ${p.RL.toFixed(2)}`), hud);
  }
  await ctx.close();
});

test('G2.4 mouse, keyboard and reset controls (desktop)', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');            // W01's archived eye (2.22 m) sits at the station limit, so "raise eye" is tested at NG57
  const c0 = (await camSnap(page)).cam; const box = await page.locator('#stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 - 40, { steps: 4 }); await page.mouse.up(); await settle(page);
  const c1 = (await camSnap(page)).cam; assert.ok(c1.heading !== c0.heading && c1.pitch > c0.pitch, 'drag looks');
  await page.mouse.wheel(0, 300); await settle(page); const c2 = (await camSnap(page)).cam; assert.ok(c2.hfov > c1.hfov, 'wheel zooms out');
  await page.keyboard.press('r'); await settle(page); const c3 = (await camSnap(page)).cam; assert.ok(Math.abs(c3.z - c2.z - 0.05) < 1e-9, 'R raises eye');
  await page.keyboard.press('s'); await settle(page); const c4 = (await camSnap(page)).cam; assert.ok(Math.hypot(c4.x - c3.x, c4.y - c3.y) > 0.49, 'S moves back');
  await page.keyboard.press('Home'); await settle(page); const c5 = (await camSnap(page)).cam;
  assert.deepEqual({ x: c5.x, y: c5.y, z: c5.z, heading: c5.heading, pitch: c5.pitch, hfov: c5.hfov }, { x: c0.x, y: c0.y, z: c0.z, heading: c0.heading, pitch: c0.pitch, hfov: c0.hfov });
  await ctx.close();
});

test('G2.4 touch controls on a phone viewport (pad buttons, one-finger look, two-finger pinch)', async () => {
  const { ctx, page, errors } = await open(undefined, { ...devices['iPhone 13'] });
  assert.deepEqual(errors, []);
  const c0 = (await camSnap(page)).cam;
  await page.tap('#mvB'); await settle(page); const c1 = (await camSnap(page)).cam; assert.ok(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 0.49, 'pad moves');
  const look = await page.evaluate(() => { const el = document.getElementById('stage'), r = el.getBoundingClientRect(), h0 = window.__visual.cam.heading;
    const ev = (t, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 }));
    ev('pointerdown', 1, r.left + 100, r.top + 100); ev('pointermove', 1, r.left + 160, r.top + 100); ev('pointerup', 1, r.left + 160, r.top + 100);
    const h1 = window.__visual.cam.heading, f0 = window.__visual.cam.hfov;
    ev('pointerdown', 1, r.left + 100, r.top + 200); ev('pointerdown', 2, r.left + 200, r.top + 200); ev('pointermove', 2, r.left + 300, r.top + 200); ev('pointerup', 1, 0, 0); ev('pointerup', 2, 0, 0);
    return { dh: h1 - h0, dfov: window.__visual.cam.hfov - f0 }; });
  assert.ok(look.dh !== 0, 'one-finger drag looks'); assert.ok(look.dfov < 0, 'pinch out zooms in');
  await page.tap('#panelToggle'); assert.ok(await page.evaluate(() => document.body.classList.contains('panel-open')));
  await ctx.close();
});

test('G2.5 station mode refuses solids and the local radius; free/overview are labelled NONPHYSICAL', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  for (let i = 0; i < 12; i++) await page.keyboard.press('w');          // north towards Building B (12.6 m away), radius 3 m
  await settle(page); const c = (await camSnap(page)).cam;
  const moved = Math.hypot(c.x - (504144.5 - 504045), c.y - (6966674 - 6966712)); assert.ok(moved <= 3.0 + 1e-9, `moved ${moved}`);
  const flash = await page.textContent('#flash'); assert.ok(/limited|Blocked/.test(flash), flash);
  const inside = await page.evaluate(() => { const a = window.__visual; const K = a.cam; return a.visiblePrisms(a.activeScenario()).filter(q => K.z >= q.zb && K.z <= q.zt).some(q => { let ins = false; for (let i = 0, j = q.P.length - 1; i < q.P.length; j = i++) { const [xi, yi] = q.P[i], [xj, yj] = q.P[j]; if ((yi > K.y) !== (yj > K.y) && K.x < (xj - xi) * (K.y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }); });
  assert.equal(inside, false);
  // direct solid test: a point inside the nearest southern townhouse mass (C5-57) is refused in station mode, accepted in free mode
  const solid = await page.evaluate(() => { const a = window.__visual; a.selectPreset('NG57'); const q = a.info.CTX_BASE.prisms.find(p => p.id.startsWith('C5-57') && p.zb <= a.cam.z && p.zt >= a.cam.z);
    const cx = q.P.reduce((s, v) => s + v[0], 0) / q.P.length, cy = q.P.reduce((s, v) => s + v[1], 0) / q.P.length;
    const r1 = a.setCam({ ...a.cam, x: cx, y: cy }); const msg = document.getElementById('flash').textContent; const still = a.cam.x !== cx;
    a.setMode('free'); const r2 = a.setCam({ ...a.cam, x: cx, y: cy }); const moved = a.cam.x === cx; a.setMode('station'); return { id: q.id, r1, msg, still, r2, moved }; });
  assert.equal(solid.r1, false); assert.ok(solid.still); assert.match(solid.msg, /Blocked: would enter or touch modelled solid C5-57/); assert.equal(solid.r2, true); assert.ok(solid.moved);
  // a solid directly ahead blocks: from W01 walk east towards the laundry tiers / courtyard wall
  await page.click('#presets button[data-id="W01"]'); for (let i = 0; i < 8; i++) await page.keyboard.press('w'); await settle(page);
  assert.ok(/limited|Blocked/.test(await page.textContent('#flash')));
  await page.check('input[name=mode][value=free]'); await settle(page);
  assert.ok(await page.isVisible('#nonphysical')); assert.match(await page.textContent('#nonphysical'), /NONPHYSICAL/);
  await page.check('input[name=mode][value=overview]'); await settle(page); assert.match(await page.textContent('#nonphysical'), /NONPHYSICAL/);
  await ctx.close();
});

for (const vp of [{ name: 'desktop', viewport: { width: 1400, height: 900 } }, { name: 'mobile', dev: devices['Pixel 7'] }]) {
  test(`G3.1 scenario switching never changes the camera, projection, frame or canvas (${vp.name}; every preset; every scenario)`, async () => {
    const { ctx, page } = await open(vp.viewport, vp.dev ? { ...vp.dev } : {});
    const ids = ['W01', 'NG55', 'NG57', 'NG59'];
    for (const id of ids) {
      await page.evaluate((id) => window.__visual.selectPreset(id), id); await settle(page);
      await page.evaluate(() => window.__visual.setCam({ ...window.__visual.cam, pitch: 23.4, roll: 1.7, hfov: 81.3 })); await settle(page);
      const ref = await camSnap(page);
      for (const step of ['T', 'T', 'hist:E1_SK52', 'T', 'appr:E2c', 'T', 'hist:E1_SK48_POD', 'T', 'hist:E1_SK48', 'appr:E2', 'T']) {
        if (step === 'T') await page.keyboard.press('t');
        else { const [k, v] = step.split(':'); await page.selectOption(k === 'hist' ? '#histSel' : '#apprSel', v); }
        await settle(page); const s = await camSnap(page);
        assert.deepEqual(s.cam, ref.cam, `${id} ${step} cam`); assert.deepEqual(s.world, ref.world, `${id} ${step} matrixWorld`);
        assert.deepEqual(s.proj, ref.proj, `${id} ${step} projection`); assert.deepEqual(s.canvas, ref.canvas, `${id} ${step} canvas`);
      }
    }
    await ctx.close();
  });
}

test('G3.2 each scenario shows exactly its manifest collections; G3.3 side-by-side and swipe share one camera', async () => {
  const { ctx, page } = await open();
  const r = await page.evaluate(async () => {
    const a = window.__visual, out = {};
    for (const s of a.S.scenarios) { a.applyVisibility(s.id); out[s.id] = ['E1_SK48', 'E1_SK52', 'E2', 'ARTW', 'POD'].filter(k => a.groups[k].visible).sort(); }
    a.applyVisibility(a.activeScenario());
    const single = [...a.camera.projectionMatrix.elements]; const par1 = a.renderPar();
    a.state.view = 'side'; a._render(); const side = { scen: a.lastFrame.scenarios, par: a.lastFrame.par, proj: [...a.camera.projectionMatrix.elements] };
    a.state.view = 'swipe'; a._render(); const swipe = { scen: a.lastFrame.scenarios, par: a.lastFrame.par };
    a.state.view = 'single'; a._render();
    return { out, single, par1, side, swipe, members: Object.fromEntries(a.S.scenarios.map(s => [s.id, [...s.members].sort()])) };
  });
  for (const [k, v] of Object.entries(r.members)) assert.deepEqual(r.out[k], v, k);
  assert.deepEqual(r.side.scen, ['E1_SK48', 'E2c']); assert.deepEqual(r.side.par, r.par1); assert.deepEqual(r.side.proj, r.single); assert.deepEqual(r.swipe.par, r.par1);
  await ctx.close();
});

test('G3.4 mask overlay: frame-limited areas are internally consistent (added - removed = tower change)', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  const m = await page.evaluate(async () => { const a = window.__visual; a.setCam({ ...a.cam, pitch: 40, hfov: 100 }); const { maskCompare } = await import('./js/compare.js');
    const r = maskCompare(a, a.par(), 'E1_SK48', 'E2', 600); return { add: r.add_deg2, rem: r.removed_deg2, ta: r.towerA_deg2, tb: r.towerB_deg2, fr: r.frame_deg2, topA: r.topA_deg, topB: r.topB_deg }; });
  assert.ok(Math.abs((m.tb - m.ta) - (m.add - m.rem)) < 1e-6 * m.fr, JSON.stringify(m));
  assert.ok(m.add >= 0 && m.rem >= 0 && m.fr > 0);
  await ctx.close();
});

test('G4.1 image import is local: hashed in the browser, shown, never uploaded', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  const png = await page.screenshot({ clip: { x: 400, y: 100, width: 300, height: 200 } });           // any PNG bytes will do
  const before = external.length; const reqs = []; page.on('request', r => reqs.push(r.url()));
  await page.setInputFiles('#imgFile', { name: 'test_perspective.png', mimeType: 'image/png', buffer: png }); await page.waitForFunction(() => !!window.__visual.match.image);
  const info = await page.textContent('#imgInfo'); assert.ok(info.includes(sha(png)), info);
  const cam = (await camSnap(page)).cam; assert.equal(cam.W, 300 * 1); assert.equal(cam.H, 200 * 1);
  assert.equal(external.length, before); assert.ok(reqs.every(u => u.startsWith('http://127.0.0.1') || u.startsWith('blob:') || u.startsWith('data:')), reqs.join('\n'));
  await ctx.close();
});

test('G4.2/G4.3/G4.4 in-browser fit: synthetic recovery; few points flagged UNDERDETERMINED; fitted camera survives E1/E2 switching', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  await page.evaluate(() => { const a = window.__visual; a.setMode('free'); a.cam = { ...a.cam, y: a.cam.y - 30, z: a.cam.z + 4, pitch: 22, hfov: 80 }; a.render(); });
  await settle(page); await tab(page, 'photo'); await unfold(page, '#step2 details.more'); await page.click('#btnSynth');
  const syn = await page.evaluate(() => window.__visual.match.lastSynthetic); assert.ok(syn && syn.n >= 8 && syn.dpos < 0.10 && Math.abs(syn.dheading) < 0.1 && syn.rms < 0.6, JSON.stringify(syn));
  // five exact pairs -> fit looks tidy but must be flagged
  const st = await page.evaluate(() => { const a = window.__visual, M = a.match; const par = a.par();
    const vis = a.controlsLib.filter(p => { const [u, v, z] = window.__proj(par, [p.x, p.y, p.z]); return z > 0 && u > 0 && v > 0 && u < a.cam.W && v < a.cam.H; }).slice(0, 5);
    M.pairs = vis.map(p => { const [u, v] = window.__proj(par, [p.x, p.y, p.z]); return { u, v, id: p.id, X: [p.x, p.y, p.z], cls: p.cls }; }); M.runFit(); return { status: M.status(), html: document.getElementById('fitOut').innerHTML }; });
  assert.match(st.status, /UNDERDETERMINED|AMBIGUOUS/); assert.match(st.html, /FEW_POINTS/);
  await page.click('#btnApplyFit'); await settle(page); const ref = await camSnap(page); assert.equal(ref.mode, 'match');
  for (const step of ['t', 't', 't']) { await page.keyboard.press(step); await settle(page); const s = await camSnap(page); assert.deepEqual(s.world, ref.world); assert.deepEqual(s.proj, ref.proj); assert.deepEqual(s.cam, ref.cam); }
  await ctx.close();
});

test('G4.5 framing comparison: four panels, same station and geometry, different HFOV/pitch only', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  await page.check('input[name=view][value=framing]'); await settle(page);
  const r = await page.evaluate(() => { const a = window.__visual; return { scen: a.lastFrame.scenarios, fr: a.state.framing, cam: a.par().slice(0, 3) }; });
  assert.equal(r.scen.length, 1); assert.equal(r.fr.length, 4);
  await ctx.close();
});

test('G5.1/G5.2 export: PNG hash recorded in JSON; re-export of the same state is byte-identical; record carries required fields', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=W01', { full: true });
  const downloads = []; page.on('download', d => downloads.push(d));
  const grab = async () => { const n0 = downloads.length; await page.click('#btnExport'); await page.waitForFunction(() => !!window.__visual.lastExport);
    for (let i = 0; i < 100 && downloads.length < n0 + 2; i++) await page.waitForTimeout(100);
    const files = {}; for (const d of downloads.slice(n0, n0 + 2)) files[path.extname(d.suggestedFilename())] = fs.readFileSync(await d.path());
    await page.evaluate(() => { window.__visual.lastExport = null; }); return files; };
  const a = await grab(); const b = await grab();
  const rec = JSON.parse(a['.json'].toString()); assert.equal(rec.png.sha256, sha(a['.png'])); assert.equal(sha(a['.png']), sha(b['.png']), 'deterministic re-render');
  for (const k of ['camera', 'view', 'scenarios', 'assets', 'sources', 'app', 'classification', 'assumptions', 'limitations', 'png', 'image_match', 'renderer'])
    assert.ok(k in rec, k);
  assert.equal(rec.camera.preset_id, 'W01'); assert.equal(rec.camera.mga_E, 504057.91); assert.equal(rec.camera.eye_RL, 24.92); assert.equal(rec.camera.frame_px.W, 1800);
  assert.ok(rec.assets['scene.json'].sha256.length === 64 && Object.keys(rec.app.app_file_sha256).length >= 10);
  assert.ok(!/Court admissible|survey verified|Cedar supplied/i.test(JSON.stringify(rec)));
  // v1.1: the lighting block records the exact frozen-engine sun position for the stated date/time, and is labelled illustrative
  const { sunPosition } = await import(path.join(VIS, 'js', 'sun.js'));
  const L = rec.lighting; assert.equal(L.mode, 'sun'); assert.match(L.status, /ILLUSTRATIVE/);
  const [yy, mo, dd] = L.date.split('-').map(Number), [hh, mi] = L.time_local.split(':').map(Number), sp = sunPosition(yy, mo, dd, hh, mi);
  assert.equal(L.sun_altitude_deg, sp.alt); assert.equal(L.sun_azimuth_deg, sp.az);
  assert.ok(rec.renderer.quality && rec.renderer.depth && rec.context.storey_lines.E2.status === 'DIMENSIONED' && rec.context.storey_lines.E1.status === 'INFERRED');
  // PNG really is the frame size
  assert.equal(a['.png'].readUInt32BE(16), 1800); assert.equal(a['.png'].readUInt32BE(20), 1200);
  await ctx.close();
});

test('G5.3 existing site still works: frozen root viewer and /study/ load under /Greville/', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const r1 = await page.goto(`${base}`); assert.equal(r1.status(), 200); const body = await r1.body();
  assert.equal(sha(body), 'cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f');
  const r2 = await page.goto(`${base}study/`); assert.equal(r2.status(), 200); await page.waitForTimeout(1500);
  assert.deepEqual(errs, []); await ctx.close();
});

test('v1.1 menu bar: every menu opens; commands act through the panel controls; keyboard navigation; Escape closes', async () => {
  const { ctx, page, errors } = await open(undefined, {}, '?preset=NG57');
  const names = await page.$$eval('#menubar .mtop', bs => bs.map(b => b.textContent));
  assert.deepEqual(names, ['File', 'View', 'Camera', 'Scenario', 'Layers', 'Lighting', 'Help']);
  for (const n of names) { await page.click(`#menubar .mtop[data-menu="${n}"]`); assert.ok(await page.isVisible(`.menu[data-menu="${n}"]`), n); assert.ok((await page.$$(`.menu[data-menu="${n}"] [role^=menuitem]`)).length >= 2, n); await page.keyboard.press('Escape'); assert.ok(!(await page.isVisible(`.menu[data-menu="${n}"]`)), n + ' closes'); }
  const pick = async (menu, text) => { await page.click(`#menubar .mtop[data-menu="${menu}"]`); await page.click(`.menu[data-menu="${menu}"] [role^=menuitem]:has-text("${text}")`); await settle(page); };
  await pick('View', 'Side by side'); assert.equal(await page.evaluate(() => window.__visual.state.view), 'side'); assert.ok(await page.isChecked('input[name=view][value=side]'));
  await pick('Lighting', 'Winter solstice'); assert.deepEqual(await page.evaluate(() => window.__visual.fx.lighting.date), [2026, 6, 21]); assert.equal(await page.inputValue('#lDate'), '2026-06-21');
  await pick('Lighting', '08:00'); assert.deepEqual(await page.evaluate(() => window.__visual.fx.lighting.time), [8, 0]);
  await pick('Layers', 'Storey lines'); assert.equal(await page.evaluate(() => window.__visual.state.storeys), false); assert.equal(await page.isChecked('#storeys'), false);
  await page.click('#menubar .mtop[data-menu="Layers"]'); assert.equal(await page.getAttribute('.menu[data-menu="Layers"] [role=menuitemcheckbox]:has-text("Storey lines")', 'aria-checked'), 'false'); await page.keyboard.press('Escape');
  await pick('Scenario', 'E1_SK52'); assert.equal(await page.evaluate(() => window.__visual.activeScenario()), 'E1_SK52');
  await pick('Camera', 'W01'); assert.equal(await page.evaluate(() => window.__visual.state.preset), 'W01');
  await pick('Camera', 'Free'); assert.equal(await page.evaluate(() => window.__visual.state.mode), 'free'); assert.ok(await page.isVisible('#nonphysical'));
  // keyboard: focus a top-level item, ArrowDown enters the menu, ArrowRight moves to the next menu
  await page.focus('#menubar .mtop[data-menu="View"]'); await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.menu')?.dataset.menu), 'View');
  await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => document.activeElement.closest('.menu')?.dataset.menu), 'Camera');
  const c0 = (await camSnap(page)).cam; await page.keyboard.press('ArrowDown'); assert.deepEqual((await camSnap(page)).cam, c0, 'arrow keys inside a menu never move the camera');
  await page.keyboard.press('Escape'); assert.equal(await page.$$eval('.menu:not([hidden])', m => m.length), 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test('v1.1 help dialog (? key and Help menu), view shortcuts 1-5, L lighting toggle and Ctrl+S export shortcut', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  await page.keyboard.press('?'); assert.ok(await page.evaluate(() => document.getElementById('helpDlg').open));
  const c0 = (await camSnap(page)).cam; await page.keyboard.press('w'); assert.deepEqual((await camSnap(page)).cam, c0, 'keys do not reach the camera while help is open');
  await page.keyboard.press('Escape'); assert.ok(!(await page.evaluate(() => document.getElementById('helpDlg').open)));
  await page.click('#menubar .mtop[data-menu="Help"]'); await page.click('.menu[data-menu="Help"] [role=menuitem]:has-text("Help and keyboard")'); assert.ok(await page.evaluate(() => document.getElementById('helpDlg').open)); await page.keyboard.press('Escape');
  for (const [k, v] of [['2', 'side'], ['3', 'swipe'], ['5', 'framing'], ['1', 'single']]) { await page.keyboard.press(k); await settle(page); assert.equal(await page.evaluate(() => window.__visual.state.view), v, k); }
  await page.keyboard.press('l'); assert.equal(await page.evaluate(() => window.__visual.fx.lighting.mode), 'overcast'); await page.keyboard.press('l'); assert.equal(await page.evaluate(() => window.__visual.fx.lighting.mode), 'sun');
  await page.evaluate(() => { window.__visual.exportNow = () => { window.__ctrlS = (window.__ctrlS || 0) + 1; }; });
  const c1 = (await camSnap(page)).cam; await page.keyboard.press('Control+s'); assert.equal(await page.evaluate(() => window.__ctrlS), 1); assert.deepEqual((await camSnap(page)).cam, c1, 'Ctrl+S does not also move the camera');
  await ctx.close();
});

test('v1.1 shareable link: the URL reproduces camera, scenarios, view, layers, lighting and quality exactly', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG55');
  await page.evaluate(() => { const a = window.__visual; a.setCam({ ...a.cam, pitch: 12.5, hfov: 70.25, heading: 3.75 }); });
  await page.selectOption('#histSel', 'E1_SK52'); await page.click('#btnHist');
  await page.check('input[name=view][value=swipe]'); await page.evaluate(() => { const s = document.getElementById('swipe'); s.value = '0.3'; s.dispatchEvent(new Event('input')); });
  await tab(page, 'scene'); await page.selectOption('#groundSel', 'plain'); await page.uncheck('#storeys'); await page.check('#canopy');
  await page.fill('#lDate', '2026-06-21'); await page.dispatchEvent('#lDate', 'change');
  await page.evaluate(() => { const t = document.getElementById('lTime'); t.value = String(8 * 60 + 30); t.dispatchEvent(new Event('input')); });
  await page.selectOption('#qualitySel', 'low'); await settle(page); await page.waitForTimeout(600);
  const url = page.url(); const snap = async (p) => p.evaluate(() => { const a = window.__visual; return { preset: a.state.preset, view: a.state.view, swipe: a.state.swipe, side: a.state.side, hist: a.state.hist, appr: a.state.appr, ground: a.state.ground, storeys: a.state.storeys, canopy: a.state.canopy, light: a.fx.lighting, q: a.fx.quality, cam: a.cam }; });
  const want = await snap(page); assert.match(url, /preset=NG55/); assert.equal(await page.evaluate(() => window.__visual.ui.linkURL().split('?')[1]), url.split('?')[1]);
  const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForSelector('body[data-ready="1"]'); await settle(p2);
  const got = await snap(p2);
  for (const k of ['preset', 'view', 'swipe', 'side', 'hist', 'appr', 'ground', 'storeys', 'canopy', 'light', 'q']) assert.deepEqual(got[k], want[k], k);
  for (const k of ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'hfov', 'cy', 'W', 'H']) assert.ok(Math.abs(got.cam[k] - want.cam[k]) < 1e-3, `${k} ${got.cam[k]} vs ${want.cam[k]}`);
  await ctx.close();
});

test('v1.1 storey lines: E2 drawn at every dimensioned RL inside the tower extents (solid); E1 inferred levels dashed', async () => {
  const { ctx, page } = await open();
  const r = await page.evaluate(() => { const a = window.__visual, out = {};
    for (const k of ['E1_SK48', 'E2']) { const s = a.groups[k].children.find(c => c.userData.role === 'storeys'); const pos = s.geometry.attributes.position; const zs = new Set(); for (let i = 0; i < pos.count; i++) zs.add(+pos.getY(i).toFixed(3)); out[k] = { dashed: !!s.material.isLineDashedMaterial, status: s.userData.status, zs: [...zs].sort((p, q) => p - q) }; }
    return { out, L: a.S.levels }; });
  assert.equal(r.out.E2.dashed, false); assert.equal(r.out.E2.status, 'DIMENSIONED'); assert.deepEqual(r.out.E2.zs, [...new Set([...r.L.E2.A, ...r.L.E2.B])].sort((p, q) => p - q));
  assert.equal(r.out.E1_SK48.dashed, true); assert.equal(r.out.E1_SK48.status, 'INFERRED'); assert.deepEqual(r.out.E1_SK48.zs, r.L.E1.A);
  await ctx.close();
});

test('v1.1 high-DPI regression (deviceScaleFactor 2): masks match the ray-caster and exports are identical to 1x', async () => {
  const F = FIX('xrender_W01_E2.json'); const n = F.W * F.H; const ref = unrle(F.mask_rle, n);
  const grab = async (dpr) => {
    const { ctx, page } = await open({ width: 1200, height: 800 }, { deviceScaleFactor: dpr }, '?preset=W01&q=medium');
    const m = await page.evaluate(async ({ cam, W, H }) => { const a = window.__visual; const { renderMaskPixels } = await import('./js/compare.js'); a.state.canopy = true;
      const par = [cam.x, cam.y, cam.z, cam.heading, 0, 0, W / 2 / Math.tan(cam.hfov * Math.PI / 360), W / 2, H / 2 + cam.shift * W / 2];
      const s = { W: a.cam.W, H: a.cam.H }; a.cam.W = W; a.cam.H = H; const mm = renderMaskPixels(a, par, 'E2', W, H); a.cam.W = s.W; a.cam.H = s.H; a.state.canopy = false; return { m: Array.from(mm), dpr: window.devicePixelRatio }; }, { cam: F.camera, W: F.W, H: F.H });
    const downloads = []; page.on('download', d => downloads.push(d)); await page.click('#btnExport'); await page.waitForFunction(() => !!window.__visual.lastExport, null, { timeout: 120000 });
    for (let i = 0; i < 100 && downloads.length < 2; i++) await page.waitForTimeout(100);
    const png = fs.readFileSync(await downloads.find(d => d.suggestedFilename().endsWith('.png')).path()); await ctx.close(); return { ...m, png };
  };
  const one = await grab(1), two = await grab(2); assert.equal(two.dpr, 2);
  let inter = 0, uni = 0; for (let i = 0; i < n; i++) { if (ref[i] && two.m[i]) inter++; if (ref[i] || two.m[i]) uni++; }
  assert.ok(inter / uni >= 0.99, `DPR 2 mask IoU ${inter / uni}`); assert.deepEqual(two.m, one.m, 'mask identical at 1x and 2x');
  assert.equal(two.png.readUInt32BE(16), 1800); assert.equal(two.png.readUInt32BE(20), 1200); assert.equal(sha(two.png), sha(one.png), 'export identical at 1x and 2x');
});

test('v1.2 photomontage: occlusion equals the tested masks; foreground mask keeps the photo; package complete and hashes verify', async () => {
  const { ctx, page, errors } = await open(undefined, {}, '?preset=W01&q=medium', { full: true });
  // a synthetic "existing photograph": same camera, modelled context only (no towers), full pipeline
  const png = await page.evaluate(async () => { const a = window.__visual; const THREE = await import('three'); const W = a.cam.W, H = a.cam.H;
    const rt = new THREE.WebGLRenderTarget(W, H); a.fx.interactive = false; a.renderer.setRenderTarget(rt); a.renderer.clear();
    a.fx.renderPanel({ target: rt, rect: { x: 0, yGL: 0, w: W, h: H }, par: a.par(), scen: '__none__', key: 'synth', pr: 1 }); a.fx.dropComposers('synth');
    const px = new Uint8Array(W * H * 4); a.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); a.renderer.setRenderTarget(null); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255; g.putImageData(img, 0, 0);
    return Array.from(new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer())); });
  const buf = Buffer.from(png);
  await page.setInputFiles('#imgFile', { name: 'synthetic_existing.png', mimeType: 'image/png', buffer: buf }); await page.waitForFunction(() => !!window.__visual.match.image);
  const r = await page.evaluate(async () => {
    const a = window.__visual; a.cam = { ...a.cam, cy: a.cam.H / 2 + 0.2081 * a.cam.W / 2 };          // the exact camera that made the synthetic photo
    const { renderMaskPixels } = await import('./js/compare.js'); const w = 900, h = 600, par = a.par();
    const L = a.fx.renderLayerRGBA(par, 'E2', w, h), m = renderMaskPixels(a, par, 'E2', w, h); let i1 = 0, u1 = 0;
    for (let i = 0; i < w * h; i++) { const p = L[i * 4 + 3] > 127 ? 1 : 0; if (p && m[i]) i1++; if (p || m[i]) u1++; }
    // foreground mask over a block that overlaps the towers: those pixels must keep the photograph
    a.montage.resetMask(); a.montage.paintPolygon([[600, 200], [900, 200], [900, 500], [600, 500]]);
    const comp = a.montage.compose(w, h, 'E2').canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const ph = document.createElement('canvas'); ph.width = w; ph.height = h; const pg = ph.getContext('2d'); pg.drawImage(a.match.image.el, 0, 0, w, h); const pd = pg.getImageData(0, 0, w, h).data;
    let kept = 0, inMask = 0, changedOutside = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, inside = x >= 301 && x < 449 && y >= 101 && y < 249; const same = Math.abs(comp[i * 4] - pd[i * 4]) <= 1 && Math.abs(comp[i * 4 + 2] - pd[i * 4 + 2]) <= 1;
      if (inside && m[i]) { inMask++; if (same) kept++; } if (!inside && m[i] && !same) changedOutside++; }
    return { iou: i1 / u1, inMask, kept, changedOutside };
  });
  assert.ok(r.iou >= 0.99, `montage layer vs mask IoU ${r.iou}`); assert.ok(r.inMask > 1000 && r.kept === r.inMask, JSON.stringify(r)); assert.ok(r.changedOutside > 1000, JSON.stringify(r));
  const dl = page.waitForEvent('download', { timeout: 240000 }); await tab(page, 'photo'); await page.click('#btnMontageExport'); const d = await dl; const zip = fs.readFileSync(await d.path());
  // read the stored ZIP and verify SHA256SUMS
  const entries = {}; let p = 0; while (zip.readUInt32LE(p) === 0x04034b50) { const n = zip.readUInt16LE(p + 26), sz = zip.readUInt32LE(p + 18); const name = zip.slice(p + 30, p + 30 + n).toString(); entries[name] = zip.slice(p + 30 + n, p + 30 + n + sz); p += 30 + n + sz; }
  for (const k of ['1_existing_synthetic_existing.png', '2_wireline_E1_SK48_E2c.png', '3_montage_E1_SK48.png', '4_montage_E2c.png', '6_camera_plan.png', '7_foreground_mask.png', 'record.json', 'SHA256SUMS']) assert.ok(entries[k], k);
  assert.equal(sha(entries['1_existing_synthetic_existing.png']), sha(buf), 'the photograph is included unaltered');
  for (const line of entries['SHA256SUMS'].toString().trim().split('\n')) { const [h, n] = line.split(/\s+/); assert.equal(sha(entries[n]), h, n); }
  const rec = JSON.parse(entries['record.json']); assert.equal(rec.camera.surveyed, false); assert.match(rec.status, /NOT survey-verified/); assert.equal(rec.ppl15_checklist.length, 10);
  assert.equal(rec.photograph.sha256, sha(buf)); assert.ok(rec.occlusion.foreground_mask.pixels > 0);
  assert.deepEqual(errors, []); await ctx.close();
});

test('v1.2 photo metadata in the browser: EXIF lens sets the field of view; GPS becomes the station prior; capture time sets the sun', async () => {
  const { ctx, page } = await open(undefined, {}, '?preset=NG57');
  const X = FIX('exif_expected.json'); await page.setInputFiles('#imgFile', path.join(VIS, 'tests', 'fixtures', 'exif_sample_be.jpg')); await page.waitForFunction(() => !!window.__visual.montage.meta);
  const info = await page.textContent('#exifInfo'); assert.match(info, /SyntheticCam/); assert.match(info, /26 mm equiv/); assert.match(info, /GPS → MGA E 503978/);
  const m = await page.evaluate(async () => { const a = window.__visual, CM = await import('./js/camera_model.js'), P = await import('./js/photo_meta.js');
    return { hfov: a.cam.hfov, want: CM.hfovFromFocal(300, P.focalPxFrom35(26, 300, 200)), fixF: document.getElementById('fixF').checked, W: a.cam.W }; });
  assert.ok(Math.abs(m.hfov - m.want) < 1e-9 && m.fixF && m.W === 300, JSON.stringify(m));
  await tab(page, 'photo'); await unfold(page, '#step2 details.more'); await page.click('#btnGpsPrior'); await settle(page);
  const c = await page.evaluate(() => ({ x: window.__visual.cam.x, y: window.__visual.cam.y, prior: document.getElementById('priorXY').checked, mode: window.__visual.state.mode }));
  assert.ok(Math.abs(c.x - (X.E - 504045)) < 1e-6 && Math.abs(c.y - (X.N - 6966712)) < 1e-6 && c.prior && c.mode === 'free', JSON.stringify(c));
  await page.click('#btnPhotoTime'); await settle(page);
  assert.deepEqual(await page.evaluate(() => [window.__visual.fx.lighting.date, window.__visual.fx.lighting.time, window.__visual.fx.lighting.mode]), [[2026, 6, 21], [8, 30], 'sun']);
  await ctx.close();
});

test('v1.3 UX: tabs, photo steps unlock in order, on-stage scenario bar, header Save/Share, drag-and-drop photo, Esc stops picking', async () => {
  const { ctx, page, errors } = await open();
  assert.equal(await page.evaluate(() => window.__visual.state.preset), 'W01', 'default viewpoint shows both towers');
  for (const t of ['scene', 'photo', 'about', 'compare']) { await tab(page, t); assert.ok(await page.isVisible(`#tab-${t}`), t); assert.equal(await page.getAttribute(`[data-tab-btn="${t}"]`, 'aria-selected'), 'true'); }
  await page.focus('[data-tab-btn="compare"]'); await page.keyboard.press('ArrowRight'); assert.ok(await page.isVisible('#tab-scene'), 'arrow keys move between tabs');
  await tab(page, 'photo');
  const st0 = await page.evaluate(() => ['step1', 'step2', 'step3', 'step4'].map(id => document.getElementById(id).className));
  assert.match(st0[0], /current/); assert.match(st0[2], /locked/); assert.match(st0[3], /locked/); assert.ok(await page.isDisabled('#btnMontageExport'));
  // drop a photo on the view (DataTransfer with a File)
  const png = await page.screenshot({ clip: { x: 500, y: 200, width: 300, height: 200 } });
  await page.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([bin], 'dropped.png', { type: 'image/png' }));
    const st = document.getElementById('stage'); st.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true })); st.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); }, png.toString('base64'));
  await page.waitForFunction(() => !!window.__visual.match.image); await settle(page);
  assert.equal(await page.evaluate(() => window.__visual.match.image.name), 'dropped.png'); assert.ok(await page.isHidden('#dropHint'));
  const st1 = await page.evaluate(() => ['step1', 'step2', 'step4'].map(id => document.getElementById(id).className));
  assert.match(st1[0], /done/); assert.match(st1[1], /current/); assert.ok(!(await page.isDisabled('#btnMontageExport')));
  // picking shows a banner; Esc stops it and keeps the camera
  await page.click('#btnPick'); assert.ok(await page.isVisible('#pickBanner')); const c0 = (await camSnap(page)).cam;
  await page.keyboard.press('Escape'); assert.ok(await page.isHidden('#pickBanner')); assert.deepEqual((await camSnap(page)).cam, c0);
  // the on-stage bar switches scenario without moving the camera
  await page.click('#cbHist'); await settle(page); assert.equal(await page.evaluate(() => window.__visual.state.side), 'historical');
  assert.deepEqual((await camSnap(page)).cam, c0); assert.equal(await page.getAttribute('#cbHist', 'aria-pressed'), 'true');
  await page.click('#quickToggle'); assert.equal(await page.evaluate(() => window.__visual.state.side), 'approved');
  assert.ok(await page.isVisible('#btnExport') && await page.isVisible('#btnCopyLink'), 'Save and Share are always in the header');
  // the minimap folds from its own button
  await page.click('#mapToggle'); assert.ok(await page.isHidden('#minimap')); await page.click('#mapToggle'); assert.ok(await page.isVisible('#minimap'));
  // status bar keeps the exact coordinates readable
  assert.match(await page.textContent('#hud'), /W01 · station.*E 504057\.91 N 6966719\.97 RL 24\.92/);
  assert.deepEqual(errors, []); await ctx.close();
});

test('v1.4 default approved form is E2c; its silhouette contains E2 at every viewpoint (it only adds approved geometry)', async () => {
  const { ctx, page } = await open();
  const r = await page.evaluate(async () => { const a = window.__visual; const { renderMaskPixels } = await import('./js/compare.js'); const out = { def: a.state.appr, label: a.scenarios.E2c.label, cls: a.scenarios.E2c.classification, views: {} };
    for (const id of ['W01', 'NG55', 'NG57', 'NG59']) { a.selectPreset(id); const par = a.par(), w = 600, h = 400; const m2 = renderMaskPixels(a, par, 'E2', w, h), mc = renderMaskPixels(a, par, 'E2c', w, h);
      let lost = 0, gained = 0, n2 = 0; for (let i = 0; i < w * h; i++) { if (m2[i]) n2++; if (m2[i] && !mc[i]) lost++; if (mc[i] && !m2[i]) gained++; } out.views[id] = { n2, lost, gained }; }
    a.selectPreset('W01'); return out; });
  assert.equal(r.def, 'E2c'); assert.match(r.label, /default/); assert.equal(r.cls, 'scaled');
  for (const [id, v] of Object.entries(r.views)) assert.ok(v.lost <= Math.max(2, v.n2 * 1e-4), `${id}: ${JSON.stringify(v)}`);   // anti-aliasing-free rasters: allow a couple of boundary pixels
  console.log('  E2 -> E2c pixels gained per view (600x400):', JSON.stringify(Object.fromEntries(Object.entries(r.views).map(([k, v]) => [k, v.gained]))));
  await ctx.close();
});

test('v1.5 rendering polish: aerial haze is Beer-Lambert at the stated visibility and never touches masks; High exports are 2x supersampled, deterministic and frame-sized', async () => {
  const { ctx, page, errors } = await open(undefined, {}, '?preset=W01', { full: true });
  const r = await page.evaluate(async () => {
    const a = window.__visual, THREE = await import('three'); const { renderMaskPixels } = await import('./js/compare.js');
    const out = { chunk: THREE.ShaderChunk.fog_fragment.includes('1.0 - exp( - fogDensity * vFogDepth )'), quality: a.fx.quality };
    out.sun = { type: a.scene.fog?.isFogExp2 ? 'FogExp2' : null, d: a.scene.fog?.density, vis: a.fx.haze.visibility_m };
    a.setLighting({ mode: 'overcast' }); out.over = { d: a.scene.fog.density, vis: a.fx.haze.visibility_m }; a.setLighting({ mode: 'sun' });
    out.maskMats = [a.M.black.fog, a.M.white.fog];
    const par = a.par(), w = 480, h = 320, masks = {};
    for (const on of [true, false]) { a.fx.setHaze(on); masks[on] = ['E1_SK48', 'E2c'].map(s => Array.from(renderMaskPixels(a, par, s, w, h)).join('')); }
    out.masksEqual = masks[true][0] === masks[false][0] && masks[true][1] === masks[false][1] && masks[true][1].includes('1');
    a.fx.setHaze(true); a.render(); const q = a.ui.stateToQuery().toString(); a.fx.setHaze(false); const q0 = a.ui.stateToQuery().toString(); a.fx.setHaze(true);
    out.query = [/haze=/.test(q), /haze=0/.test(q0)];
    out.canopyColoured = !!a.groups.CANOPY.instanceColor;
    return out; });
  assert.ok(r.chunk, 'fog chunk patched to exp(-beta d)'); assert.equal(r.quality, 'high');
  assert.equal(r.sun.type, 'FogExp2'); assert.ok(Math.abs(r.sun.d - 3.912 / 15000) < 1e-12 && r.sun.vis === 15000);
  assert.ok(Math.abs(r.over.d - 3.912 / 8000) < 1e-12 && r.over.vis === 8000);
  assert.deepEqual(r.maskMats, [false, false]); assert.ok(r.masksEqual, 'masks identical with haze on and off'); assert.deepEqual(r.query, [false, true]); assert.ok(r.canopyColoured);
  const downloads = []; page.on('download', d => downloads.push(d));
  const grab = async () => { const n0 = downloads.length; await page.click('#btnExport'); await page.waitForFunction(() => !!window.__visual.lastExport, null, { timeout: 180000 });
    for (let i = 0; i < 100 && downloads.length < n0 + 2; i++) await page.waitForTimeout(100);
    const files = {}; for (const d of downloads.slice(n0, n0 + 2)) files[path.extname(d.suggestedFilename())] = fs.readFileSync(await d.path());
    await page.evaluate(() => { window.__visual.lastExport = null; }); return files; };
  const a = await grab(), b = await grab(); const rec = JSON.parse(a['.json'].toString());
  assert.equal(sha(a['.png']), sha(b['.png']), 'supersampled export is byte-reproducible');
  assert.equal(a['.png'].readUInt32BE(16), 1800); assert.equal(a['.png'].readUInt32BE(20), 1200);
  assert.equal(rec.renderer.supersampling, 2); assert.equal(rec.renderer.aerial_perspective.visibility_m, 15000); assert.match(rec.renderer.aerial_perspective.applies_to, /never masks/);
  assert.deepEqual(errors, []); await ctx.close();
});
