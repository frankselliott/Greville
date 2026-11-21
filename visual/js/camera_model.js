// Camera model: the conventions of the archived renderer (v2_render.py: heading, HFOV, vertical lens shift) and camera-fit core
// (adr_core.py: axes/project with heading, pitch, roll, focal length f and principal point cx, cy), ported unchanged.
// Pure functions in the source-local frame (x east, y north, z up). No DOM, no Three.js.
//   heading: degrees clockwise from +y (grid north); pitch: degrees up; roll: degrees, right-hand about the view direction as in adr_core.
//   Pixel (u, v): u to the right, v DOWN; u = cx + f*(W.right)/zf, v = cy - f*(W.up)/zf.
//   Archived "shift" (vertical principal-point offset in units of image half-width): cy = H/2 + shift*W/2.
const R = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function axes(h, p, r) {                       // verbatim port of adr_core.axes
  h *= R; p *= R; r *= R;
  const fwd = [Math.sin(h) * Math.cos(p), Math.cos(h) * Math.cos(p), Math.sin(p)];
  const right0 = [Math.cos(h), -Math.sin(h), 0];
  const up0 = cross(right0, fwd);
  const right = [0, 1, 2].map(i => right0[i] * Math.cos(r) + up0[i] * Math.sin(r));
  const up = cross(right, fwd);
  return { fwd, right, up };
}
export const focalFromHfov = (W, hfov) => W / 2 / Math.tan(hfov * R / 2);
export const hfovFromFocal = (W, f) => 2 * Math.atan(W / 2 / f) / R;
export const principalFromShift = (W, H, shift) => ({ cx: W / 2, cy: H / 2 + shift * W / 2 });
export const shiftFromPrincipal = (W, H, cy) => (cy - H / 2) / (W / 2);

// state -> intrinsic/extrinsic parameter vector in adr_core order [x, y, z, heading, pitch, roll, f, cx, cy]
export function parFromState(s) {
  const f = focalFromHfov(s.W, s.hfov);
  const cx = s.cx ?? s.W / 2, cy = s.cy ?? (s.H / 2 + (s.shift || 0) * s.W / 2);
  return [s.x, s.y, s.z, s.heading, s.pitch || 0, s.roll || 0, f, cx, cy];
}
export function project(par, X) {                    // verbatim port of adr_core.project (one point); returns [u, v, zf]
  const [x, y, z, h, p, r, f, cx, cy] = par; const { fwd, right, up } = axes(h, p, r);
  const W = [X[0] - x, X[1] - y, X[2] - z]; const zf = dot(W, fwd);
  return [cx + f * dot(W, right) / zf, cy - f * dot(W, up) / zf, zf];
}
export function pixelRay(par, u, v) {                // unit direction (local frame) through pixel centre (u, v)
  const [, , , h, p, r, f, cx, cy] = par; const { fwd, right, up } = axes(h, p, r);
  const a = (u - cx) / f, b = -(v - cy) / f; const d = [0, 1, 2].map(i => fwd[i] + a * right[i] + b * up[i]);
  const n = Math.hypot(...d); return d.map(c => c / n);
}
// exact solid angle (sr) of one pixel of a pinhole camera (as v2_render persp_dirs 'sa'): (1/f^2) / (1 + a^2 + b^2)^1.5
export function pixelSolidAngle(par, u, v) {
  const f = par[6], a = (u - par[7]) / f, b = (v - par[8]) / f; return 1 / (f * f) / Math.pow(1 + a * a + b * b, 1.5);
}
export function azEl(d) { return [((Math.atan2(d[0], d[1]) / R) + 360) % 360, Math.asin(Math.max(-1, Math.min(1, d[2]))) / R]; }

// Three.js matrices (column-major Float64 arrays of 16). Camera basis in Three.js world: X_cam = right, Y_cam = up, Z_cam = -fwd,
// with local->three mapping (x, y, z) -> (x, z, -y).
const L2T = v => [v[0], v[2], -v[1]];
export function threeCameraMatrices(par, W, H, near = 0.1, far = 4000) {
  const [x, y, z, h, p, r, f, cx, cy] = par; const { fwd, right, up } = axes(h, p, r);
  const Rt = L2T(right), Ut = L2T(up), Bt = L2T(fwd).map(c => -c), Pt = L2T([x, y, z]);
  const world = [Rt[0], Rt[1], Rt[2], 0, Ut[0], Ut[1], Ut[2], 0, Bt[0], Bt[1], Bt[2], 0, Pt[0], Pt[1], Pt[2], 1];
  const A = 2 * f / W, B = 1 - 2 * cx / W, C = 2 * f / H, D = 2 * cy / H - 1, E = -(far + near) / (far - near), F = -2 * far * near / (far - near);
  // row-major [[A,0,B,0],[0,C,D,0],[0,0,E,F],[0,0,-1,0]] -> column-major
  const proj = [A, 0, 0, 0, 0, C, 0, 0, B, D, E, -1, 0, 0, F, 0];
  return { world, proj };
}
// pixel of a local point through the Three.js matrices (used by tests to prove equivalence with project())
export function projectViaMatrices(m, W, H, X) {
  const Pt = L2T(X); const w = m.world;
  const rel = [Pt[0] - w[12], Pt[1] - w[13], Pt[2] - w[14]];
  const c = [rel[0] * w[0] + rel[1] * w[1] + rel[2] * w[2], rel[0] * w[4] + rel[1] * w[5] + rel[2] * w[6], rel[0] * w[8] + rel[1] * w[9] + rel[2] * w[10]];
  const P = m.proj; const cl = [P[0] * c[0] + P[4] * c[1] + P[8] * c[2], P[1] * c[0] + P[5] * c[1] + P[9] * c[2], 0, -c[2]];
  const nx = cl[0] / cl[3], ny = cl[1] / cl[3]; return [(nx + 1) / 2 * W, (1 - ny) / 2 * H];
}
