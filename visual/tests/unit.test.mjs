// Node unit tests for the pure modules and assets.  Run:  node --test visual/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as K from '../js/coords.js';
import * as CM from '../js/camera_model.js';
import * as FIT from '../js/fit.js';

const VIS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (p) => JSON.parse(readFileSync(path.join(VIS, p), 'utf8'));
const scene = J('assets/scene.json'), controls = J('assets/controls.json').points, manifest = J('assets/manifest.json');
const ref = J('tests/fixtures/fit_reference.json');
const z0 = (a) => a.map(v => v + 0);   // normalise -0 to 0
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

test('G1.3 MGA <-> local round trip is exact and the Three.js axis map is a proper rotation', () => {
  for (const [E, N, RL] of [[504057.91, 6966719.97, 24.92], [504144.5, 6966674.0, 23.97], [504000.123, 6966800.456, 12.3]]) {
    const l = K.mgaToLocal(E, N, RL), b = K.localToMga(...l);
    assert.ok(Math.abs(b[0] - E) < 1e-9 && Math.abs(b[1] - N) < 1e-9 && b[2] === RL);
    assert.deepEqual(z0(K.threeToLocal(...K.localToThree(...l))), z0(l));
  }
  assert.equal(det3(K.LOCAL_TO_THREE), 1);
  assert.deepEqual(z0(K.localToThree(0, 1, 0)), [0, 0, -1]);   // north -> -Z
  assert.deepEqual(z0(K.localToThree(0, 0, 1)), [0, 1, 0]);    // up -> +Y
  assert.deepEqual(z0(K.localToThree(1, 0, 0)), [1, 0, 0]);    // east -> +X
});

test('G2.2 JS projection equals the archived Python projection (adr_core.project) to 1e-6 px', () => {
  for (const c of ref.cases) for (const pc of c.proj_check) {
    const [u, v] = CM.project(c.true_par, pc.X);
    assert.ok(Math.abs(u - pc.uv[0]) < 1e-6 && Math.abs(v - pc.uv[1]) < 1e-6, `${c.name}: ${u},${v} vs ${pc.uv}`);
  }
});

test('G2.2 Three.js world/projection matrices reproduce project() exactly (incl. roll, pitch and off-centre principal point)', () => {
  const W = 1800, H = 1200;
  for (const par of [[99.5, -38, 23.97, 15, 28, 0.6, 1072.6, 900, 600], [12.907, 7.971, 24.92, 87, 0, 0, 1200.1, 900, 787.3], [50, -10, 30, 301.3, -12, -7.5, 640, 870, 610]]) {
    const m = CM.threeCameraMatrices(par, W, H);
    for (const X of [[100, 0, 50], [80, -10, 40], [110, 5, 62.9], [10, 40, 30], [20, 8, 26]]) {
      const [u0, v0, zf] = CM.project(par, X); if (zf <= 0) continue;
      const [u1, v1] = CM.projectViaMatrices(m, W, H, X);
      assert.ok(Math.abs(u0 - u1) < 1e-6 && Math.abs(v0 - v1) < 1e-6, `${par} ${X}: ${u0},${v0} vs ${u1},${v1}`);
    }
  }
});

test('archived vertical shift convention: cy = H/2 + shift*W/2 (v2_render persp_dirs)', () => {
  const W = 1800, H = 1200, hfov = 73.7, shift = 0.2081, tw = Math.tan(hfov * Math.PI / 360);
  const par = CM.parFromState({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, hfov, W, H, shift });
  for (const row of [0, 300, 600, 1199]) {          // v2_render: tanE at column centre = ((H/2 - row - 0.5)/(W/2))*tw + shift*tw
    const tanE_v2 = ((H / 2 - row - 0.5) / (W / 2)) * tw + shift * tw;
    const d = CM.pixelRay(par, W / 2, row + 0.5); const tanE = d[2] / Math.hypot(d[0], d[1]);
    assert.ok(Math.abs(tanE - tanE_v2) < 1e-12, `${row}: ${tanE} vs ${tanE_v2}`);
  }
});

test('G3.4 pixel solid angles sum to the analytic solid angle of the frame', () => {
  const W = 360, H = 240, hfov = 80; const par = CM.parFromState({ x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, hfov, W, H });
  let s = 0; for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) s += CM.pixelSolidAngle(par, u + 0.5, v + 0.5);
  const a = Math.atan(Math.tan(hfov * Math.PI / 360)), b = Math.atan(Math.tan(hfov * Math.PI / 360) * H / W);
  const omega = 4 * Math.asin(Math.sin(a) * Math.sin(b));
  assert.ok(Math.abs(s - omega) / omega < 2e-4, `${s} vs ${omega}`);
});

test('G4.2 JS fit recovers the known synthetic camera and agrees with the archived Python fit', () => {
  for (const c of ref.cases) {
    const F = FIT.fitCamera(c.X, c.U, c.W, c.H, c.init, { fixPP: c.fix_pp });
    const dTrue = Math.hypot(F.par[0] - c.true_par[0], F.par[1] - c.true_par[1], F.par[2] - c.true_par[2]);
    const dPy = Math.hypot(F.par[0] - c.py_fit.par[0], F.par[1] - c.py_fit.par[1], F.par[2] - c.py_fit.par[2]);
    assert.ok(dTrue < 0.10, `${c.name} position error ${dTrue}`);
    for (const k of [3, 4, 5]) assert.ok(Math.abs(F.par[k] - c.true_par[k]) < 0.1, `${c.name} angle ${k}: ${F.par[k]} vs ${c.true_par[k]}`);
    assert.ok(F.rms_px < 0.5, `${c.name} rms ${F.rms_px}`);
    assert.ok(dPy < 0.02, `${c.name} JS vs Python position ${dPy}`);
    for (const k of [3, 4, 5]) assert.ok(Math.abs(F.par[k] - c.py_fit.par[k]) < 0.02, `${c.name} JS vs Python angle ${k}`);
    assert.ok(Math.abs(F.rms_px - c.py_fit.rms_px) < 0.02, `${c.name} rms JS ${F.rms_px} vs Py ${c.py_fit.rms_px}`);
    assert.equal(FIT.grade(F), c.py_fit.grade);
    const flags = FIT.ambiguityFlags(c.X, c.U, c.ids.map(id => controls.find(p => p.id === id)), F, c.W, c.H, []);
    assert.ok(!flags.some(f => f.severity === 'block'), `${c.name} unexpectedly blocked: ${flags.map(f => f.code)}`);
  }
});

test('G4.3 underdetermined and ambiguous control sets are flagged even with tiny residuals', () => {
  const c = ref.cases[0];
  // (a) fewer than 8 points
  const F5 = FIT.fitCamera(c.X.slice(0, 5), c.U.slice(0, 5), c.W, c.H, c.init, { loo: false });
  assert.ok(FIT.ambiguityFlags(c.X.slice(0, 5), c.U.slice(0, 5), null, F5, c.W, c.H).some(f => f.code === 'FEW_POINTS'));
  // (b) one plane only: tower points on a single vertical facade (synthetic, exact projection -> near-zero residual)
  const W = c.W, H = c.H, par = c.true_par; const facade = [];
  for (const z of [30, 38, 46, 54, 62]) for (const t of [0, 0.25, 0.5, 0.75, 1]) facade.push([85 + t * 35, -28.8 + t * 5.5, z]);
  const S = FIT.synthesize(par, facade, W, H, 0.0);
  const Fp = FIT.fitCamera(S.X, S.U, W, H, c.init, { loo: false });
  const fl = FIT.ambiguityFlags(S.X, S.U, S.X.map(() => ({ cls: 'tower' })), Fp, W, H);
  assert.ok(fl.some(f => f.code === 'COPLANAR'), `flags ${fl.map(f => f.code)}`);
  assert.ok(fl.some(f => f.code === 'SUBJECT_ONLY'));
});

test('G1.6 manifest asset hashes equal the files on disk', () => {
  for (const [name, a] of Object.entries(manifest.assets)) {
    const h = createHash('sha256').update(readFileSync(path.join(VIS, 'assets', name))).digest('hex');
    assert.equal(h, a.sha256, name);
  }
  assert.ok(manifest.checks.every(c => c.ok), 'build-time checks recorded as passing');
});

test('G1.2 scenario identity: members exist, one comparator family per scenario, no excluded collections present', () => {
  const C = scene.collections;
  for (const s of scene.scenarios) {
    for (const m of s.members) assert.ok(C[m], `${s.id} member ${m}`);
    const fams = new Set(s.members.map(m => C[m].family).filter(Boolean)); assert.ok(fams.size <= 1, `${s.id} mixes ${[...fams]}`);
  }
  for (const banned of ['E1_REC48', 'E1_REC52', 'E1_CUT48', 'SENS_trees12_opaque', 'SENS_C5_verge_trees']) assert.ok(!C[banned], banned);
  const ids = Object.values(C).flatMap(c => c.prisms.map(p => p.id)); assert.equal(ids.length, new Set(ids).size);
});

test('G1.4/G1.5 presets: hypothetical eye RL = DEM + 1.6 m; envelope angles reproduce the archive', () => {
  for (const p of scene.presets) {
    const [x, y] = K.mgaToLocal(p.E, p.N, p.RL); const g = K.demAt(scene.terrain, x, y);
    if (p.classification === 'hypothetical') assert.ok(Math.abs(g + 1.6 - p.RL) <= 0.02, `${p.id}: ${g + 1.6} vs ${p.RL}`);
    if (p.id === 'W01') { assert.equal(p.RL, 24.92); assert.equal(p.heading, 87); assert.equal(p.hfov, 73.7); assert.equal(p.shift, 0.2081); }
  }
  const want = { NG55: [66.3, 71.5], NG57: [67.3, 72.1], NG59: [67.1, 71.9] };
  const Bsk = scene.collections.E1_SK48.prisms.find(q => q.id.endsWith('-B')).P, Bp = scene.collections.E2.prisms.find(q => q.id === 'E2-building_B_plate').P;
  for (const p of scene.presets.filter(q => want[q.id])) {
    const [x, y] = K.mgaToLocal(p.E, p.N, p.RL);
    const a1 = Math.atan2(48 - p.RL, K.distToPolygonEdge(Bsk, x, y)) * 180 / Math.PI, a2 = Math.atan2(62.9 - p.RL, K.distToPolygonEdge(Bp, x, y)) * 180 / Math.PI;
    assert.ok(Math.abs(a1 - want[p.id][0]) <= 0.2 && Math.abs(a2 - want[p.id][1]) <= 0.2, `${p.id} ${a1} ${a2}`);
  }
});

test('G5.4 static check: no absolute-root or external URLs in served app files (works under any sub-path, no network)', () => {
  const files = ['index.html', 'css/visual.css', 'js/main.js', 'js/coords.js', 'js/camera_model.js', 'js/fit.js', 'js/scene_build.js', 'js/controls.js', 'js/compare.js', 'js/match.js', 'js/export.js', 'js/hash.js'];
  for (const f of files) {
    const s = readFileSync(path.join(VIS, f), 'utf8');
    assert.ok(!/(src|href)\s*=\s*["']\//.test(s), `${f}: absolute-root src/href`);
    assert.ok(!/(fetch|import)\s*\(\s*["']\//.test(s), `${f}: absolute-root fetch/import`);
    assert.ok(!/(src|href)\s*=\s*["']https?:/.test(s) && !/(fetch|import)\s*\(\s*["']https?:/.test(s) && !/from\s+["']https?:/.test(s), `${f}: external URL`);
  }
});
