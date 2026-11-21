// Build Three.js objects from assets/scene.json. Geometry values are used as stored (source-local frame), mapped to Three.js by
// (x, y, z) -> (x, z, -y). Schematic massing only: no textures, finishes, windows or invented vegetation.
import * as THREE from '../vendor/three/three.module.min.js';

export const COLOURS = {
  ctx: 0xbdb9b0, th: 0xd9d2c3, tower: 0xa2aab3, terrain: 0xc9cfbf, canopy: 0x8ea37c, edge: 0x2b2b2b,
  E1: 0x1baf7a, E2: 0xeb6834, add: 0xeb6834, removed: 0x2a78d6,      // validated categorical slots (aqua / orange / blue)
};
const TOWER_CLS = new Set(['A', 'B', 'Aroof', 'Broof']);

function prismGeometry(prisms) {
  const pos = [];
  const push = (x, y, z) => pos.push(x, z, -y);
  for (const p of prisms) {
    const P = p.P, n = P.length, zb = p.zb, zt = p.zt;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
      push(x0, y0, zb); push(x1, y1, zb); push(x1, y1, zt);
      push(x0, y0, zb); push(x1, y1, zt); push(x0, y0, zt);
    }
    const contour = P.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of tris) { for (const k of [a, b, c]) push(P[k][0], P[k][1], zt); for (const k of [a, c, b]) push(P[k][0], P[k][1], zb); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function edgeGeometry(prisms) {                     // exact prism edges (verticals at vertices + top/bottom rings), no derived creases
  const pos = []; const push = (x, y, z) => pos.push(x, z, -y);
  for (const p of prisms) {
    const P = p.P, n = P.length;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
      push(x0, y0, p.zt); push(x1, y1, p.zt); push(x0, y0, p.zb); push(x1, y1, p.zb); push(x0, y0, p.zb); push(x0, y0, p.zt);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
export function makeMaterials() {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  return {
    ctx: lam(COLOURS.ctx), th: lam(COLOURS.th), tower: lam(COLOURS.tower), towerE1: lam(COLOURS.E1), towerE2: lam(COLOURS.E2),
    terrain: lam(COLOURS.terrain), canopy: lam(COLOURS.canopy),
    edge: new THREE.LineBasicMaterial({ color: COLOURS.edge, transparent: true, opacity: 0.55 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }), white: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  };
}
// one group per collection; the context collection is split so the 7 Cluster 4 LiDAR quads can be swapped for the VA4 masses
export function buildScene(S, M) {
  const root = new THREE.Group(); const groups = {}; const info = {};
  const add = (key, prisms, role) => {
    const g = new THREE.Group(); g.name = key;
    const byMat = role === 'context' ? [['th', prisms.filter(p => p.cls === 'th')], ['ctx', prisms.filter(p => p.cls !== 'th')]] : [['tower', prisms]];
    for (const [m, list] of byMat) { if (!list.length) continue; const mesh = new THREE.Mesh(prismGeometry(list), M[m]); mesh.userData = { role, matKey: m, collection: key }; g.add(mesh); }
    const e = new THREE.LineSegments(edgeGeometry(prisms), M.edge); e.userData = { role: 'edge', collection: key }; g.add(e);
    groups[key] = g; info[key] = { prisms, role }; root.add(g);
  };
  const ctx = S.collections.CTX_VA2.prisms, rep = new Set(S.collections.CTX_VA4C4_ADD.replaces);
  add('CTX_BASE', ctx.filter(p => !rep.has(p.id)), 'context');
  add('CTX_C4_LIDAR', ctx.filter(p => rep.has(p.id)), 'context');
  add('CTX_VA4C4_ADD', S.collections.CTX_VA4C4_ADD.prisms, 'context');
  for (const k of ['E1_SK48', 'E1_SK52', 'E2', 'ARTW', 'POD']) add(k, S.collections[k].prisms, 'scenario');
  // terrain
  const T = S.terrain, pos = [], idx = [];
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const x = T.x0 + i * T.step, y = T.y0 + j * T.step; pos.push(x, T.z[j * T.nx + i], -y); }
  for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) { const a = j * T.nx + i, b = a + 1, c = a + T.nx, d = c + 1; idx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, M.terrain); terrain.userData = { role: 'terrain' }; terrain.name = 'TERRAIN'; root.add(terrain); groups.TERRAIN = terrain;
  // LiDAR canopy cells [x, y, top, ground] as 0.5 m columns (off by default)
  const cells = S.canopy.cells, c = S.canopy.cell; const box = new THREE.BoxGeometry(c, 1, c); const inst = new THREE.InstancedMesh(box, M.canopy, cells.length); const m4 = new THREE.Matrix4();
  cells.forEach(([x, y, top, g], k) => { const h = Math.max(0.05, top - g); m4.makeScale(1, h, 1).setPosition(x, g + h / 2, -y); inst.setMatrixAt(k, m4); });
  inst.userData = { role: 'canopy' }; inst.name = 'CANOPY'; inst.visible = false; root.add(inst); groups.CANOPY = inst;
  return { root, groups, info };
}
export function isTowerCls(cls) { return TOWER_CLS.has(cls); }
