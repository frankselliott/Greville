#!/usr/bin/env python3
"""Independent-renderer reference (M2 G2.3 / M3): runs the ARCHIVED VA v2 column ray-caster (v2_render.py, sha256 9d3c8282…;
private archive, not republished) on the archived scene (scene_dump_v2.json, sha256 b9d4ca3a…) for the archived W01 camera and for an
NG57 camera, and writes tower-class masks (classes A, B, Aroof, Broof) to tests/fixtures/xrender_*.json (run-length encoded) so the
Playwright suite can compare the WebGL depth-tested render with this independent engine.
    python3 visual/tools/xcheck_render.py <v2_render.py> <scene_dump_v2.json>"""
import hashlib, importlib.util, json, math, os, sys
import numpy as np
from scipy.ndimage import map_coordinates
HERE = os.path.dirname(os.path.abspath(__file__)); FIX = os.path.join(HERE, '..', 'tests', 'fixtures')
vr, sp = sys.argv[1], sys.argv[2]
assert hashlib.sha256(open(vr, 'rb').read()).hexdigest().startswith('9d3c82824325'), 'v2_render.py hash'
assert hashlib.sha256(open(sp, 'rb').read()).hexdigest() == 'b9d4ca3a19e98454060896ae07a80a58d8be625d60c178bbce613e8ee4aba70c', 'scene hash'
spec = importlib.util.spec_from_file_location('v2_render', vr); VR = importlib.util.module_from_spec(spec); spec.loader.exec_module(VR)
D = json.load(open(sp)); T = D['terrain']; ZZ = np.array(T['z'], dtype=np.float32).reshape(T['ny'], T['nx'])
def dem(XY):
    XY = np.asarray(XY); q = np.vstack(((XY[:, 1] - T['y0']) / T['step'], (XY[:, 0] - T['x0']) / T['step'])); return map_coordinates(ZZ, q, order=1, mode='nearest')
FRAME = (T['x0'] - 1, T['y0'] - 1, T['x0'] + T['nx'] * T['step'] + 1, T['y0'] + T['ny'] * T['step'] + 1)
c = D['canopy']; cells = c['cells']; x0 = min(p[0] for p in cells); y1 = max(p[1] for p in cells); cell = c['cell']
nx = round((max(p[0] for p in cells) - x0) / cell) + 1; ny = round((y1 - min(p[1] for p in cells)) / cell) + 1
top = np.full((ny, nx), np.nan, np.float32)
for x, y, h, g in cells: top[round((y1 - y) / cell), round((x - x0) / cell)] = h
CANOPY = dict(x0=x0, y1=y1, cell=cell, top=top)
def P(lst): return [{**p, 'P': np.array(p['P'])} for p in lst]
CTX = P(D['collections']['E0_context_v2'] + D['collections']['E0_townhouses'])
w01 = next(k for k in D['cameras'] if k['view'] == 'W01')
W, H = 900, 600                                                  # half of the archived 1800x1200 (same HFOV/shift => same projection)
cams = {'W01': dict(x=w01['x'], y=w01['y'], z=w01['z'], heading=w01['heading'], hfov=w01['hfov'], shift=w01['shift'], W=W, H=H),
        'NG57': dict(x=504144.50 - 504045, y=6966674.00 - 6966712, z=23.97, heading=8.864, hfov=110.0, shift=1.6, W=W, H=H)}   # frame spans ~53-73 deg elevation: both rooflines
def rle(m):
    flat = m.astype(np.uint8).ravel(); out = []; cur = flat[0]; n = 0
    for v in flat:
        if v == cur: n += 1
        else: out.append(int(n)); cur = v; n = 1
    out.append(int(n)); return dict(first=int(flat[0]), runs=out)
os.makedirs(FIX, exist_ok=True); res = {}
for cid, cam in cams.items():
    for scen in ('E1_SK48', 'E2'):
        C = VR.Caster(CTX + P(D['collections'][scen]), (cam['x'], cam['y'], cam['z']), dem, FRAME, CANOPY)
        R = VR.render(C, dict(cam))
        m = np.isin(R['cls'], [10, 11, 12, 13]); res[f'{cid}_{scen}'] = m.sum()
        json.dump(dict(generator='visual/tools/xcheck_render.py', engine='v2_render.py (archived VA v2 column ray-caster)', camera=cam, scenario=scen, canopy=True,
                       W=W, H=H, tower_classes=['A', 'B', 'Aroof', 'Broof'], mask_rle=rle(m), tower_px=int(m.sum())),
                  open(os.path.join(FIX, f'xrender_{cid}_{scen}.json'), 'w'))
print(res)
