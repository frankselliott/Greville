// Coordinate frames (see SOURCE_REGISTER.md §1). Pure functions; no DOM, no Three.js.
//   MGA (EPSG:7856 E, N) + RL (AHD)  <->  source-local (x = E - E0, y = N - N0, z = RL)  ->  Three.js (X = x, Y = z, Z = -y)
export const E0 = 504045.0;
export const N0 = 6966712.0;
export const SITE_GRID_DEG = 8.864;

export function mgaToLocal(E, N, RL) { return [E - E0, N - N0, RL]; }
export function localToMga(x, y, z) { return [x + E0, y + N0, z]; }
// local (east, north, up) vector/point -> Three.js world
export function localToThree(x, y, z) { return [x, z, -y]; }
export function threeToLocal(X, Y, Z) { return [X, -Z, Y]; }
// the same map as a 3x3 matrix (rows = three axes, columns = local axes); determinant must be +1
export const LOCAL_TO_THREE = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];

// bilinear DEM sample on the archived 2 m grid (row j <-> y = y0 + j*step, column i <-> x = x0 + i*step)
export function demAt(T, x, y) {
  const fx = (x - T.x0) / T.step, fy = (y - T.y0) / T.step;
  const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(T.ny - 2, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j)), z = T.z, n = T.nx;
  return z[j * n + i] * (1 - tx) * (1 - ty) + z[j * n + i + 1] * tx * (1 - ty) + z[(j + 1) * n + i] * (1 - tx) * ty + z[(j + 1) * n + i + 1] * tx * ty;
}

export function pointInPolygon(P, x, y) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi) inside = !inside;
  }
  return inside;
}
export function distToPolygonEdge(P, x, y) {
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i], ex = bx - ax, ey = by - ay, L = ex * ex + ey * ey;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + t * ex), y - (ay + t * ey)));
  }
  return best;
}
