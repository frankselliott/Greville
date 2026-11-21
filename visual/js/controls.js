// Input: mouse, keyboard and touch -> camera intents. The app applies them through setCam(), which enforces the mode's limits.
//   drag: look (station/free) or orbit (overview); wheel / pinch: zoom (HFOV, or distance in overview);
//   W/A/S/D or arrow keys with Shift: move; arrows: look; R/F: eye up/down; +/-: zoom; Home or 0: reset; T: toggle historical/approved.
export function attachControls(el, app) {
  let drag = null; const touches = new Map(); let pinch0 = null;
  const isTyping = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName);
  el.addEventListener('pointerdown', (e) => {
    if (app.pickActive()) return;                     // perspective-match picking owns clicks
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic or already-released pointer */ }
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 1) drag = { x: e.clientX, y: e.clientY };
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; drag = null; }
  });
  el.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2 && pinch0) {
      const [a, b] = [...touches.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0 && pinch0.d > 0) { app.zoom(pinch0.d / d); pinch0.d = d; } return;
    }
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    app.lookDrag(dx, dy);
  });
  const end = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = null; if (!touches.size) drag = null; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); app.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || e.ctrlKey || e.metaKey || app.keysBlocked?.()) return; const k = e.key; let used = true; const step = e.altKey ? 0.1 : 0.5, ang = e.altKey ? 0.2 : 2;
    if (k === 'w' || k === 'W' || (e.shiftKey && k === 'ArrowUp')) app.move(step, 0);
    else if (k === 's' || k === 'S' || (e.shiftKey && k === 'ArrowDown')) app.move(-step, 0);
    else if (k === 'a' || k === 'A' || (e.shiftKey && k === 'ArrowLeft')) app.move(0, -step);
    else if (k === 'd' || k === 'D' || (e.shiftKey && k === 'ArrowRight')) app.move(0, step);
    else if (k === 'ArrowLeft') app.look(-ang, 0); else if (k === 'ArrowRight') app.look(ang, 0);
    else if (k === 'ArrowUp') app.look(0, ang); else if (k === 'ArrowDown') app.look(0, -ang);
    else if (k === 'r' || k === 'R') app.eye(0.05); else if (k === 'f' || k === 'F') app.eye(-0.05);
    else if (k === '+' || k === '=') app.zoom(1 / 1.08); else if (k === '-' || k === '_') app.zoom(1.08);
    else if (k === 'Home' || k === '0') app.reset(); else if (k === 't' || k === 'T') app.toggleScenario();
    else used = false;
    if (used) e.preventDefault();
  });
}
