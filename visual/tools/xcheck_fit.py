#!/usr/bin/env python3
"""Cross-language reference for the camera model and fit (M2 G2.2, M4 G4.2). Runs the ARCHIVED camera-fit core
(adr_core.py, sha256 f1e0caa8...; private archive, not republished) on synthetic data and writes tests/fixtures/fit_reference.json,
which tests/unit.test.mjs compares with js/camera_model.js and js/fit.js.
    python3 visual/tools/xcheck_fit.py <path to adr_core.py>"""
import hashlib, importlib.util, json, math, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); VIS = os.path.abspath(os.path.join(HERE, '..'))
src = sys.argv[1]; h = hashlib.sha256(open(src, 'rb').read()).hexdigest()
assert h == 'f1e0caa83d6dbee7ec13d5c891a6135cb223f4f63947c0cf00aa58fa7747b4b6', h
spec = importlib.util.spec_from_file_location('adr_core', src); C = importlib.util.module_from_spec(spec); spec.loader.exec_module(C)
L = json.load(open(os.path.join(VIS, 'assets', 'controls.json')))['points']
W, H = 1800, 1200
cases = []
# case 1: NG57-like near-ground camera, looking north-north-east and up, well-spread tower + context controls
true1 = [99.5, -38.0, 23.97, 15.0, 28.0, 0.6, W / 2 / math.tan(math.radians(80 / 2)), W / 2, H / 2]
# case 2: W01-like level camera with vertical shift (principal point off-centre), fit with free principal point
f2 = W / 2 / math.tan(math.radians(73.7 / 2)); true2 = [12.907, 7.971, 24.92, 87.0, 0.0, 0.0, f2, W / 2, H / 2 + 0.2081 * W / 2]
rng = np.random.default_rng(11)
for name, true, fixpp, init in (('ng57_up', true1, True, dict(x=101.0, y=-36.5, z=24.3, heading=10.0, pitch=24.0, roll=0.0, hfov=75.0)),
                                  ('w01_shift', true2, False, dict(x=14.0, y=9.0, z=24.6, heading=84.0, pitch=1.0, roll=0.0, hfov=70.0))):
    X = np.array([[p['x'], p['y'], p['z']] for p in L])
    uv, zf = C.project(np.array(true), X); ok = (zf > 1) & (uv[:, 0] > 5) & (uv[:, 0] < W - 5) & (uv[:, 1] > 5) & (uv[:, 1] < H - 5)
    idx = np.nonzero(ok)[0]; idx = idx[np.linspace(0, len(idx) - 1, min(24, len(idx))).astype(int)]
    Xs = X[idx]; Us = uv[idx] + rng.normal(0, 0.3, (len(idx), 2))
    F = C.fit(Xs, Us, W, H, init, prior=None, fix_pp=fixpp)
    cases.append(dict(name=name, W=W, H=H, true_par=true, fix_pp=fixpp, init=init, ids=[L[i]['id'] for i in idx], X=Xs.tolist(), U=Us.tolist(),
                      py_fit=dict(par=F['par'], rms_px=F['rms_px'], max_px=F['max_px'], loo_px=F['loo_px'], se=F['se'], grade=C.grade(F)),
                      proj_check=[dict(X=X[i].tolist(), uv=C.project(np.array(true), X[i:i + 1])[0][0].tolist()) for i in idx[:6]]))
    print(name, 'n', len(idx), 'py rms', round(F['rms_px'], 3), 'grade', C.grade(F), 'dpos', round(float(np.linalg.norm(np.array(F['par'][:3]) - true[:3])), 4))
os.makedirs(os.path.join(VIS, 'tests', 'fixtures'), exist_ok=True)
json.dump(dict(generator='visual/tools/xcheck_fit.py', adr_core_sha256=h, cases=cases), open(os.path.join(VIS, 'tests', 'fixtures', 'fit_reference.json'), 'w'), indent=1)
