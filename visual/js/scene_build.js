// Build Three.js objects from assets/scene.json. Geometry values are used as stored (source-local frame), mapped to Three.js by
// (x, y, z) -> (x, z, -y), a proper rotation, so polygon winding is preserved. Schematic massing only: no textures, finishes,
// windows or invented vegetation. Storey lines are drawn only at floor RLs recorded in scene.json 'levels' (E2 dimensioned on the
// approved drawings; E1 inferred and drawn dashed). Surfaces use physically based materials in neutral, untextured tones.
import * as THREE from '../vendor/three/three.module.min.js';

export const COLOURS = {
  ctx: 0xc9c4ba, th: 0xe4ddcf, tower: 0xc2c7cc, terrain: 0xc9cfbf, canopy: 0x6f8a5a, edge: 0x2b2b2b, storey: 0x4a5058,
  E1: 0x1baf7a, E2: 0xeb6834, add: 0xeb6834, removed: 0x2a78d6,      // validated categorical slots (aqua / orange / blue)
};
const TOWER_CLS = new Set(['A', 'B', 'Aroof', 'Broof']);
const signedArea = (P) => { let s = 0; for (let i = 0, n = P.length; i < n; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n]; s += x0 * y1 - x1 * y0; } return s / 2; };

function prismGeometry(prisms) {                    // closed prisms, outward-facing (CCW footprint walls; +z top; -z bottom)
  const pos = [];
  const push = (x, y, z) => pos.push(x, z, -y);
  for (const p of prisms) {
    const P = signedArea(p.P) < 0 ? [...p.P].reverse() : p.P, n = P.length, zb = p.zb, zt = p.zt;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
      push(x0, y0, zb); push(x1, y1, zb); push(x1, y1, zt);
      push(x0, y0, zb); push(x1, y1, zt); push(x0, y0, zt);
    }
    const tris = THREE.ShapeUtils.triangulateShape(P.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (let [a, b, c] of tris) {
      if (signedArea([P[a], P[b], P[c]]) < 0) [b, c] = [c, b];
      for (const k of [a, b, c]) push(P[k][0], P[k][1], zt); for (const k of [a, c, b]) push(P[k][0], P[k][1], zb);
    }
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
// horizontal rings at the recorded floor RLs strictly inside each prism's vertical extent
function storeyGeometry(prisms, levels) {
  const pos = []; const push = (x, y, z) => pos.push(x, z, -y);
  for (const p of prisms) {
    const L = levels?.[p.cls === 'A' ? 'A' : p.cls === 'B' ? 'B' : null]; if (!L) continue;
    for (const z of L) {
      if (z <= p.zb + 0.05 || z >= p.zt - 0.05) continue;
      for (let i = 0, n = p.P.length; i < n; i++) { const [x0, y0] = p.P[i], [x1, y1] = p.P[(i + 1) % n]; push(x0, y0, z); push(x1, y1, z); }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
export function makeMaterials() {
  const std = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  return {
    ctx: std(COLOURS.ctx), th: std(COLOURS.th), tower: std(COLOURS.tower, 0.72), towerE1: std(COLOURS.E1, 0.72), towerE2: std(COLOURS.E2, 0.72),
    terrain: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    canopy: std(0xffffff, 0.95),                     // per-cell colour by height (instanceColor)
    backdrop: new THREE.MeshStandardMaterial({ color: 0xbfbfb8, roughness: 1, metalness: 0 }),
    edge: new THREE.LineBasicMaterial({ color: COLOURS.edge, transparent: true, opacity: 0.16 }),
    edgeTower: new THREE.LineBasicMaterial({ color: COLOURS.edge, transparent: true, opacity: 0.45 }),
    storeyE2: new THREE.LineBasicMaterial({ color: COLOURS.storey, transparent: true, opacity: 0.7 }),
    storeyE1: new THREE.LineDashedMaterial({ color: COLOURS.storey, transparent: true, opacity: 0.7, dashSize: 1.2, gapSize: 0.8 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false }), white: new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false }),   // masks: never fogged
  };
}
// one group per collection; the context collection is split so the 7 Cluster 4 LiDAR quads can be swapped for the VA4 masses
export function buildScene(S, M) {
  const root = new THREE.Group(); const groups = {}; const info = {};
  const add = (key, prisms, role) => {
    const g = new THREE.Group(); g.name = key;
    const byMat = role === 'context' ? [['th', prisms.filter(p => p.cls === 'th')], ['ctx', prisms.filter(p => p.cls !== 'th')]] : [['tower', prisms]];
    for (const [m, list] of byMat) {
      if (!list.length) continue; const mesh = new THREE.Mesh(prismGeometry(list), M[m]); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { role, matKey: m, collection: key }; g.add(mesh);
    }
    const e = new THREE.LineSegments(edgeGeometry(prisms), role === 'scenario' ? M.edgeTower : M.edge); e.userData = { role: 'edge', collection: key }; g.add(e);
    if (role === 'scenario') {
      const e1 = key.startsWith('E1'), lv = S.levels?.[e1 ? 'E1' : 'E2'], sg = storeyGeometry(prisms, lv);
      if (sg) { const s = new THREE.LineSegments(sg, e1 ? M.storeyE1 : M.storeyE2); if (e1) s.computeLineDistances(); s.userData = { role: 'storeys', collection: key, status: lv.status }; g.add(s); }
    }
    groups[key] = g; info[key] = { prisms, role }; root.add(g);
  };
  const ctx = S.collections.CTX_VA2.prisms, rep = new Set(S.collections.CTX_VA4C4_ADD.replaces);
  add('CTX_BASE', ctx.filter(p => !rep.has(p.id)), 'context');
  add('CTX_C4_LIDAR', ctx.filter(p => rep.has(p.id)), 'context');
  add('CTX_VA4C4_ADD', S.collections.CTX_VA4C4_ADD.prisms, 'context');
  for (const k of ['E1_SK48', 'E1_SK52', 'E2', 'ARTW', 'POD']) add(k, S.collections[k].prisms, 'scenario');
  // terrain (LiDAR DEM, 2 m) with UVs over its own extent for the cadastral basemap texture; faces up (+z)
  const T = S.terrain, pos = [], uv = [], idx = []; const Lx = (T.nx - 1) * T.step, Ly = (T.ny - 1) * T.step;
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) { const x = T.x0 + i * T.step, y = T.y0 + j * T.step; pos.push(x, T.z[j * T.nx + i], -y); uv.push((x - T.x0) / Lx, (y - T.y0) / Ly); }
  for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) { const a = j * T.nx + i, b = a + 1, c = a + T.nx, d = c + 1; idx.push(a, b, c, b, d, c); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, M.terrain); terrain.receiveShadow = true; terrain.userData = { role: 'terrain', extent: { x0: T.x0, y0: T.y0, Lx, Ly } }; terrain.name = 'TERRAIN'; root.add(terrain); groups.TERRAIN = terrain;
  // neutral backdrop plane BELOW every modelled surface (outside the DEM extent only; it can never occlude model geometry)
  let zmin = Math.min(...T.z); for (const c of Object.values(S.collections)) for (const p of c.prisms) zmin = Math.min(zmin, p.zb);
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), M.backdrop); bd.position.set(T.x0 + Lx / 2, zmin - 0.5, -(T.y0 + Ly / 2));
  bd.receiveShadow = false; bd.userData = { role: 'backdrop' }; bd.name = 'BACKDROP'; root.add(bd); groups.BACKDROP = bd;
  // LiDAR canopy cells [x, y, top, ground] as 0.5 m columns (off by default)
  const cells = S.canopy.cells, c = S.canopy.cell; const box = new THREE.BoxGeometry(c, 1, c); const inst = new THREE.InstancedMesh(box, M.canopy, cells.length); const m4 = new THREE.Matrix4();
  const lo = new THREE.Color(0x4d6a3a), hi = new THREE.Color(0x8aa766), col = new THREE.Color(); const hs = cells.map(([, , top, g]) => top - g), hmax = Math.max(...hs, 1);
  cells.forEach(([x, y, top, g], k) => { const h = Math.max(0.05, top - g); m4.makeScale(1, h, 1).setPosition(x, g + h / 2, -y); inst.setMatrixAt(k, m4);
    const j = ((Math.imul(k + 1, 2654435761) >>> 0) / 4294967296 - 0.5) * 0.12;                            // deterministic variation (colour only)
    col.copy(lo).lerp(hi, Math.min(1, Math.max(0, h / hmax + j))); inst.setColorAt(k, col); });
  inst.castShadow = true; inst.receiveShadow = true; inst.userData = { role: 'canopy' }; inst.name = 'CANOPY'; inst.visible = false; root.add(inst); groups.CANOPY = inst;
  return { root, groups, info };
}
export function isTowerCls(cls) { return TOWER_CLS.has(cls); }
