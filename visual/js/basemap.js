// Cadastral ground texture from assets/basemap.json (DCDB parcels, LiDAR-derived 1 m contours, rail centrelines; (c) State of
// Queensland, CC BY 4.0), drawn onto a canvas over the DEM extent and mapped onto the terrain by its UVs. Schematic cartography:
// fills are flat neutral tones by parcel type, not imagery and not surface finishes. Cadastre is an index, not survey.
import * as THREE from '../vendor/three/three.module.min.js';

export const BASEMAP_STYLE = {
  ground: '#d8d6cc', lot: '#e2e0d6', road: '#a9aaa6', easement: '#d3d1c6', other: '#cfcdc3', lotLine: 'rgba(70,70,64,0.55)',
  site: '#b4501f', rail: '#5b5650', contour: 'rgba(120,96,60,0.28)', contour5: 'rgba(120,96,60,0.5)',
};
export function drawBasemap(B, ext, { pxPerM = 8, maxPx = 4096, contours = true } = {}) {
  const s = Math.min(pxPerM, maxPx / Math.max(ext.Lx, ext.Ly)); const W = Math.round(ext.Lx * s), H = Math.round(ext.Ly * s);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); const st = BASEMAP_STYLE;
  const X = (x) => (x - ext.x0) * s, Y = (y) => (ext.y0 + ext.Ly - y) * s;     // canvas row 0 = north edge
  const path = (rings) => { c.beginPath(); for (const r of rings) { r.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.closePath(); } };
  c.fillStyle = st.ground; c.fillRect(0, 0, W, H);
  const fillOf = (t) => /^Road/.test(t) ? st.road : /^Lot/.test(t) ? st.lot : /^Easement/.test(t) ? st.easement : st.other;
  const order = (t) => /^Road/.test(t) ? 0 : /^Lot/.test(t) ? 1 : /^Easement/.test(t) ? 2 : 3;
  const parcels = [...B.parcels].sort((a, b) => order(a.type) - order(b.type));
  for (const p of parcels) { path(p.rings); c.fillStyle = fillOf(p.type); c.fill('evenodd'); }
  if (contours) for (const k of B.contours) {
    c.strokeStyle = k.z % 5 === 0 ? st.contour5 : st.contour; c.lineWidth = Math.max(1, s * (k.z % 5 === 0 ? 0.25 : 0.15));
    c.beginPath(); k.line.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.stroke();
  }
  c.lineJoin = 'round';
  for (const p of parcels) { if (/^Easement/.test(p.type)) continue; path(p.rings); c.strokeStyle = st.lotLine; c.lineWidth = Math.max(1, s * 0.12); c.stroke(); }
  for (const l of B.rail) { c.beginPath(); l.forEach(([x, y], i) => i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))); c.strokeStyle = st.rail; c.lineWidth = Math.max(1.5, s * 0.35); c.setLineDash([s * 3, s * 1.5]); c.stroke(); c.setLineDash([]); }
  const site = B.parcels.filter(p => p.lotplan === B.site_lotplan);
  for (const p of site) { path(p.rings); c.strokeStyle = st.site; c.lineWidth = Math.max(2, s * 0.45); c.stroke(); }
  return { canvas: cv, pxPerM: s, W, H };
}
export function basemapTexture(renderer, B, ext, opts) {
  const { canvas, pxPerM } = drawBasemap(B, ext, opts);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.userData = { pxPerM };
  return t;
}
