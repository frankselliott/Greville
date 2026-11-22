// SHA-256 in the browser (SubtleCrypto). Local only: nothing is sent anywhere.
export async function sha256Hex(buf) {
  const d = await crypto.subtle.digest('SHA-256', buf instanceof ArrayBuffer ? buf : await new Response(buf).arrayBuffer());
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// hashes of the application files actually served (code identity for the export record)
export const APP_FILES = ['index.html', 'css/visual.css', 'js/main.js', 'js/coords.js', 'js/camera_model.js', 'js/fit.js', 'js/scene_build.js',
  'js/controls.js', 'js/compare.js', 'js/match.js', 'js/export.js', 'js/hash.js', 'js/render_fx.js', 'js/sun.js', 'js/basemap.js', 'js/ui.js', 'js/montage.js', 'js/photo_meta.js',
  'vendor/three/three.module.min.js', 'vendor/three/addons/SHA256SUMS', 'version.json'];
export async function appFileHashes(base) {
  const out = {};
  for (const f of APP_FILES) {
    try { const r = await fetch(new URL(f, base), { cache: 'no-store' }); out[f] = r.ok ? await sha256Hex(await r.arrayBuffer()) : `HTTP ${r.status}`; }
    catch (e) { out[f] = `unavailable (${e.message})`; }
  }
  return out;
}
