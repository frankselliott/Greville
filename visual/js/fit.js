// Camera fitting from 2D image points <-> 3D control points. A port of the archived camera-fit core (adr_core.fit / grade):
// same parameterisation [x, y, z, heading, pitch, roll, f, cx, cy], same residuals (behind-camera penalty 1e4), same optional priors
// (z and xy, weight 2/sd), same robust loss (soft_l1, f_scale 3 px), same multi-start on heading (0, -8, +8 deg), leave-one-out
// (n >= 8) and grade A-D. Solver: Levenberg-Marquardt on loss-transformed residuals (same minimiser as scipy least_squares soft_l1).
// Additions (not in the archive): explicit ambiguity flags and an alternative-solution search. Pure JS; no DOM.
import { project, focalFromHfov, hfovFromFocal } from './camera_model.js';

const SCALE = [1, 1, 0.3, 1, 1, 1, 50, 20, 20];

function solveLinear(A, b) {                       // Gaussian elimination with partial pivoting (small dense systems)
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]]; if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = c + 1; r < n; r++) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j]; x[r] = s / M[r][r]; }
  return x;
}
export function invert(A) {
  const n = A.length; const out = [];
  for (let k = 0; k < n; k++) { const e = new Array(n).fill(0); e[k] = 1; const c = solveLinear(A.map(r => [...r]), e); if (!c) return null; out.push(c); }
  return A.map((_, i) => out.map(c => c[i]));
}
// generic Levenberg-Marquardt: minimise 0.5*||res(q)||^2 with numeric Jacobian (central differences, step 1e-6*scale)
export function levmar(res, q0, scale, { maxIter = 300, tol = 1e-12 } = {}) {
  let q = q0.slice(), r = res(q), cost = 0.5 * r.reduce((a, v) => a + v * v, 0), lam = 1e-3; const n = q.length;
  const jac = (qq) => { const J = []; for (let k = 0; k < n; k++) { const h = 1e-6 * scale[k], a = qq.slice(), b = qq.slice(); a[k] += h; b[k] -= h; const ra = res(a), rb = res(b); J.push(ra.map((v, i) => (v - rb[i]) / (2 * h))); } return J; };
  let J = jac(q);
  for (let it = 0; it < maxIter; it++) {
    const JTJ = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J[i].reduce((a, v, m) => a + v * J[j][m], 0)));
    const g = Array.from({ length: n }, (_, i) => J[i].reduce((a, v, m) => a + v * r[m], 0));
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JTJ.map((row, i) => row.map((v, j) => v + (i === j ? lam * (JTJ[i][i] + 1e-12) : 0)));
      const d = solveLinear(A, g.map(v => -v)); if (!d) { lam *= 10; continue; }
      const qn = q.map((v, i) => v + d[i]), rn = res(qn), cn = 0.5 * rn.reduce((a, v) => a + v * v, 0);
      if (cn < cost) { const rel = (cost - cn) / Math.max(cost, 1e-300); q = qn; r = rn; cost = cn; lam = Math.max(lam / 3, 1e-12); improved = true; if (rel < tol) return { q, cost, r }; break; }
      lam *= 4;
    }
    if (!improved) break;
    J = jac(q);
  }
  return { q, cost, r };
}
const softL1 = (e, C) => { const z = (e / C) ** 2; const rho = 2 * (Math.sqrt(1 + z) - 1); return Math.sign(e) * C * Math.sqrt(rho); };

function rawResiduals(par, X, U) {
  const e = [];
  for (let i = 0; i < X.length; i++) { const [u, v, zf] = project(par, X[i]); if (zf > 0) e.push(u - U[i][0], v - U[i][1]); else e.push(1e4, 1e4); }
  return e;
}
/**
 * X: [[x,y,z],...] local frame; U: [[u,v],...] pixels; init: {x,y,z,heading,pitch,roll,hfov}; prior: {z:[mean,sd], xy:[x,y,sd]}
 * returns the archived fit() fields: par, se, resid_px, rms_px, max_px, loo_px, hfov_deg, n, fix_pp (+ cost, free)
 */
export function fitCamera(X, U, W, H, init, { prior = null, fixPP = true, headingStarts = [0, -8, 8], loo = true } = {}) {
  const f0 = focalFromHfov(W, init.hfov ?? 60);
  const p0 = [init.x, init.y, init.z, init.heading, init.pitch ?? 0, init.roll ?? 0, f0, W / 2, H / 2];
  const FREE = fixPP ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const full = (q, base = p0) => { const v = base.slice(); FREE.forEach((k, i) => { v[k] = q[i]; }); return v; };
  const scale = FREE.map(k => SCALE[k]);
  const mkRes = (Xs, Us) => (q) => {
    const par = full(q); const e = rawResiduals(par, Xs, Us).map(v => softL1(v, 3.0));
    if (prior?.z) e.push((par[2] - prior.z[0]) / prior.z[1] * 2.0);
    if (prior?.xy) { const [px, py, sd] = prior.xy; e.push((par[0] - px) / sd * 2.0, (par[1] - py) / sd * 2.0); }
    return e;
  };
  let best = null;
  for (const dh of headingStarts) {
    const q0 = FREE.map(k => p0[k]); q0[3] += dh;
    const s = levmar(mkRes(X, U), q0, scale);
    if (!best || s.cost < best.cost) best = s;
  }
  const P = full(best.q); const raw = rawResiduals(P, X, U); const r = [];
  for (let i = 0; i < X.length; i++) r.push(Math.hypot(raw[2 * i], raw[2 * i + 1]));
  // standard errors from the raw-residual Jacobian at the solution (as adr_core: pinv(J'J) * s2, dof = 2n - nfree)
  const se = new Array(9).fill(0); let cond = null;
  {
    const q = best.q, J = [];
    for (let k = 0; k < q.length; k++) { const h = 1e-6 * scale[k], a = q.slice(), b = q.slice(); a[k] += h; b[k] -= h; const ra = rawResiduals(full(a), X, U), rb = rawResiduals(full(b), X, U); J.push(ra.map((v, i) => (v - rb[i]) / (2 * h))); }
    const JTJ = J.map(a => J.map(b => a.reduce((s, v, m) => s + v * b[m], 0)));
    const dof = Math.max(1, 2 * X.length - FREE.length), s2 = r.reduce((a, v) => a + v * v, 0) / dof;
    const inv = invert(JTJ); if (inv) FREE.forEach((k, i) => { se[k] = Math.sqrt(Math.max(0, inv[i][i] * s2)); });
    const Ns = JTJ.map((row, i) => row.map((v, j) => v * scale[i] * scale[j]));
    cond = conditionNumber(Ns);
  }
  const looPx = [];
  if (loo && X.length >= 8) {
    for (let i = 0; i < X.length; i++) {
      const Xk = X.filter((_, k) => k !== i), Uk = U.filter((_, k) => k !== i);
      const s = levmar((q) => rawResiduals(full(q), Xk, Uk).map(v => softL1(v, 3.0)), best.q, scale);
      const [u, v] = project(full(s.q), X[i]); looPx.push(Math.hypot(u - U[i][0], v - U[i][1]));
    }
  }
  const rms = Math.sqrt(r.reduce((a, v) => a + v * v, 0) / r.length);
  return { par: P, names: ['x', 'y', 'z', 'heading', 'pitch', 'roll', 'f_px', 'cx', 'cy'], se, resid_px: r, rms_px: rms, max_px: Math.max(...r),
           loo_px: looPx, hfov_deg: hfovFromFocal(W, P[6]), W, H, n: X.length, fix_pp: fixPP, cost: best.cost, cond };
}
function conditionNumber(A) {                       // symmetric PSD: ratio of extreme eigenvalues by Jacobi rotation
  const n = A.length, M = A.map(r => r.slice());
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] ** 2; if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(M[p][q]) < 1e-300) continue;
      const th = (M[q][q] - M[p][p]) / (2 * M[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const a = M[k][p], b = M[k][q]; M[k][p] = c * a - s * b; M[k][q] = s * a + c * b; }
      for (let k = 0; k < n; k++) { const a = M[p][k], b = M[q][k]; M[p][k] = c * a - s * b; M[q][k] = s * a + c * b; }
    }
  }
  const ev = M.map((r, i) => Math.abs(r[i])); return Math.max(...ev) / Math.max(Math.min(...ev), 1e-300);
}
// archived grade: A <=1.5 px RMS & LOO <=3 px & >=10 pts; B <=3 & LOO <=6 & >=8; C <=6 px; else D (do not rely)
export function grade(F) {
  const loo = F.loo_px.length ? Math.max(...F.loo_px) : 99;
  if (F.rms_px <= 1.5 && loo <= 3 && F.n >= 10) return 'A';
  if (F.rms_px <= 3 && loo <= 6 && F.n >= 8) return 'B';
  if (F.rms_px <= 6) return 'C';
  return 'D';
}
// geometric ambiguity flags (additions; independent of residual size)
export function ambiguityFlags(X, U, controlsMeta, F, W, H, alternatives = []) {
  const flags = []; const n = X.length;
  if (n < 8) flags.push({ code: 'FEW_POINTS', severity: 'block', text: `Only ${n} control points (at least 8 independent points are needed). The camera is UNDERDETERMINED.` });
  if (n >= 3) {
    const c = [0, 1, 2].map(k => X.reduce((a, p) => a + p[k], 0) / n); const Cm = [0, 1, 2].map(i => [0, 1, 2].map(j => X.reduce((a, p) => a + (p[i] - c[i]) * (p[j] - c[j]), 0) / n));
    const ev = symEig3(Cm).sort((a, b) => b - a); const planar = Math.sqrt(Math.max(ev[2], 0)) / Math.sqrt(Math.max(ev[0], 1e-12));
    if (planar < 0.05) flags.push({ code: 'COPLANAR', severity: 'block', text: `Control points are nearly coplanar (thickness ratio ${planar.toFixed(3)}). A single plane cannot fix the camera: UNDERDETERMINED even if the residuals are small.` });
    const lin = Math.sqrt(Math.max(ev[1], 0)) / Math.sqrt(Math.max(ev[0], 1e-12));
    if (lin < 0.05) flags.push({ code: 'COLLINEAR', severity: 'block', text: 'Control points are nearly collinear. UNDERDETERMINED.' });
  }
  if (controlsMeta && controlsMeta.length && controlsMeta.every(m => m.cls === 'tower'))
    flags.push({ code: 'SUBJECT_ONLY', severity: 'warn', text: 'All controls lie on the A/B tower model, the geometry under test. Independent context controls are needed for a non-circular registration.' });
  if (n >= 2) {
    const us = U.map(p => p[0]), vs = U.map(p => p[1]);
    const sx = (Math.max(...us) - Math.min(...us)) / W, sy = (Math.max(...vs) - Math.min(...vs)) / H;
    if (sx < 0.3 || sy < 0.3) flags.push({ code: 'CLUSTERED', severity: 'warn', text: `Image points cover only ${(sx * 100).toFixed(0)}% x ${(sy * 100).toFixed(0)}% of the frame. Weak lens / principal-point constraint.` });
  }
  if (F && F.cond && F.cond > 1e10) flags.push({ code: 'ILL_CONDITIONED', severity: 'block', text: `Normal equations ill-conditioned (cond ${F.cond.toExponential(1)}). Parameters are not separately determined.` });
  const far = alternatives.filter(a => a.distinct);
  if (far.length) flags.push({ code: 'MULTIPLE_SOLUTIONS', severity: 'block', text: `${far.length} alternative camera solution(s) fit almost as well, but at a different station or orientation. AMBIGUOUS.` });
  return flags;
}
function symEig3(A) {                                // eigenvalues of a symmetric 3x3 (Jacobi)
  const M = A.map(r => r.slice());
  for (let s = 0; s < 50; s++) for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) {
    if (Math.abs(M[p][q]) < 1e-300) continue;
    const th = (M[q][q] - M[p][p]) / (2 * M[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
    for (let k = 0; k < 3; k++) { const a = M[k][p], b = M[k][q]; M[k][p] = c * a - sn * b; M[k][q] = sn * a + c * b; }
    for (let k = 0; k < 3; k++) { const a = M[p][k], b = M[q][k]; M[p][k] = c * a - sn * b; M[q][k] = sn * a + c * b; }
  }
  return [M[0][0], M[1][1], M[2][2]];
}
// alternative solutions: restart the fit from a ring of stations (+-dxy) and headings; keep local minima whose cost is within
// `costFactor` of the best and whose camera differs by > 1 m or > 2 deg ('distinct').
export function alternativeSolutions(X, U, W, H, F, { prior = null, fixPP = true, dxy = 8, costFactor = 1.5 } = {}) {
  const [x, y, z, h, p, r, f] = F.par; const hf = hfovFromFocal(W, f); const out = [];
  const starts = [];
  for (const [ox, oy] of [[dxy, 0], [-dxy, 0], [0, dxy], [0, -dxy], [dxy, dxy], [-dxy, -dxy]]) for (const dh of [0, 15, -15]) starts.push({ x: x + ox, y: y + oy, z, heading: h + dh, pitch: p, roll: r, hfov: hf * (1 + (Math.abs(ox) > 0 ? 0.15 : -0.15)) });
  for (const s of starts) {
    const G = fitCamera(X, U, W, H, s, { prior, fixPP, headingStarts: [0], loo: false });
    if (!isFinite(G.cost) || G.cost > costFactor * Math.max(F.cost, 1e-9) + 1e-6) continue;
    const dpos = Math.hypot(G.par[0] - x, G.par[1] - y, G.par[2] - z), dang = Math.max(Math.abs(angDiff(G.par[3], h)), Math.abs(G.par[4] - p), Math.abs(G.par[5] - r));
    const distinct = dpos > 1.0 || dang > 2.0;
    if (!out.some(o => Math.hypot(o.par[0] - G.par[0], o.par[1] - G.par[1], o.par[2] - G.par[2]) < 0.2 && Math.abs(angDiff(o.par[3], G.par[3])) < 0.2))
      out.push({ par: G.par, rms_px: G.rms_px, cost: G.cost, hfov_deg: G.hfov_deg, dpos, dang, distinct });
  }
  return out.sort((a, b) => a.cost - b.cost);
}
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
// synthetic test data: project the given controls through a known camera, add Gaussian noise (deterministic LCG)
export function synthesize(par, X, W, H, noisePx = 0.3, seed = 7) {
  let s = seed >>> 0; const rnd = () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd());
  const keep = [], U = [];
  for (const P of X) { const [u, v, zf] = project(par, P); if (zf > 0 && u >= 0 && u < W && v >= 0 && v < H) { keep.push(P); U.push([u + noisePx * gauss(), v + noisePx * gauss()]); } }
  return { X: keep, U };
}
