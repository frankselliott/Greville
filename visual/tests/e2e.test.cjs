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

async function open(viewport = { width: 1400, height: 900 }, extra = {}, query = '') {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...extra });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== '127.0.0.1' && u.protocol !== 'blob:' && u.protocol !== 'data:') { external.push(u.href); return r.abort(); } return r.continue(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}visual/${query}`); await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 }); await settle(page);
  return { ctx, page, errors };
}
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const camSnap = (page) => page.evaluate(() => { const a = window.__visual; return { cam: { ...a.cam }, world: [...a.camera.matrixWorld.elements], proj: [...a.camera.projectionMatrix.elements], canvas: [a.canvas.width, a.canvas.height], mode: a.state.mode }; });
function unrle(r, n) { const m = new Uint8Array(n); let v = r.first, k = 0; for (const run of r.runs) { if (v) m.fill(1, k, k + run); k += run; v = 1 - v; } return m; }

test.before(async () => { srv = await start(0); base = `http://127.0.0.1:${srv.address().port}/Greville/`; browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); srv?.close(); });

test('M2/G5.4 page loads under the /Greville/ sub-path with no errors and no external requests', async () => {
  const { ctx, page, errors } = await open();
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
  const { ctx, page } = await open();
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
  assert.deepEqual(r.side.scen, ['E1_SK48', 'E2']); assert.deepEqual(r.side.par, r.par1); assert.deepEqual(r.side.proj, r.single); assert.deepEqual(r.swipe.par, r.par1);
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
  await settle(page); await page.click('#btnSynth');
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
  const { ctx, page } = await open(undefined, {}, '?preset=W01');
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
