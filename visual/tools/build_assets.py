#!/usr/bin/env python3
"""Build the /visual geometry assets from the hash-pinned private sources (see visual/SOURCE_REGISTER.md).

    python3 visual/tools/build_assets.py <scene_dump_v2.json> <VA4 'code' directory>

Reads ONLY:
  S-VA2   scene_dump_v2.json                           sha256 b9d4ca3a…  (refused if different)
  S-VA4a  code/partD_artic.py   (ARTW/POD literals)    sha256 b82fea3c…
  S-VA4b  code/masses.py        (Cluster 4 masses)     sha256 pinned below
  S-VA4c  code/adr/control_points_library_va4.json     sha256 1ae589ea…
Writes visual/assets/{scene.json, controls.json, manifest.json}. Geometry values are copied, not rounded or edited; the only
transformation is the documented frame (local x=E-504045, y=N-6966712, z=RL), which the viewer maps to Three.js at load time.
Also runs the M1 source-regression checks (preset RLs, elevation envelopes) and exits non-zero on failure."""
import ast, hashlib, json, math, os, sys, types
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); VIS = os.path.abspath(os.path.join(HERE, '..')); OUT = os.path.join(VIS, 'assets')
PIN = {'scene_dump_v2.json': 'b9d4ca3a19e98454060896ae07a80a58d8be625d60c178bbce613e8ee4aba70c',
       'partD_artic.py': 'b82fea3ce34b210f188d0167f67eb94a364879e4be802bc347e7dbf2ddf319b0',
       'masses.py': None,   # filled below from the archive; checked against the archive zip by the caller (see SOURCE_REGISTER)
       'control_points_library_va4.json': '1ae589eac3c90497e2b39fe3a0444129ba79ce1f55b959464cd9e74425c4a694'}
E0, N0 = 504045.0, 6966712.0
AZ = 8.864; _a = math.radians(AZ); GU = np.array([math.cos(_a), -math.sin(_a)]); GV = np.array([math.sin(_a), math.cos(_a)])

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
def need(path, key):
    h = sha(path)
    if PIN.get(key) and h != PIN[key]: sys.exit(f'REFUSED: {key} sha256 {h} != pinned {PIN[key]}')
    return h

def prism(p, src):
    P = [[float(x), float(y)] for x, y in (p['P'].tolist() if hasattr(p['P'], 'tolist') else p['P'])]
    return dict(id=p['name'], cls=p['cls'], zb=float(p['zb']), zt=float(p['zt']), P=P, src=src)

def main(scene_path, va4_code):
    h_scene = need(scene_path, 'scene_dump_v2.json'); D = json.load(open(scene_path))
    assert D['crs'].startswith('local = EPSG:7856 minus (504045, 6966712)'), D['crs']
    # ---- VA4 Part D literals (ARTW / POD) by AST: no execution of the analysis harness
    pd_path = os.path.join(va4_code, 'partD_artic.py'); h_pd = need(pd_path, 'partD_artic.py'); tree = ast.parse(open(pd_path).read())
    keep = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name == 'P') or (isinstance(n, ast.Assign) and getattr(n.targets[0], 'id', '') in ('ARTW', 'POD'))]
    V = types.SimpleNamespace(GU=GU, GV=GV); ns = dict(np=np, V=V); exec(compile(ast.Module(body=keep, type_ignores=[]), pd_path, 'exec'), ns)
    ARTW = [prism(p, 'S-VA4a') for p in ns['ARTW']]; POD = [prism(p, 'S-VA4a') for p in ns['POD']]
    # cross-check against the archived Part D result file (prisms as saved by the original run)
    arch = json.load(open(os.path.join(va4_code, '..', 'work', 'partD_artic.json')))['prisms']
    for k, mine in (('ARTW', ARTW), ('POD', POD)):
        for a, b in zip(arch[k], mine):
            assert a['name'] == b['id'] and np.allclose(a['P'], b['P'], atol=1e-9) and a['zb'] == b['zb'] and a['zt'] == b['zt'], (k, a['name'])
    # ---- VA4 Cluster 4 plan-derived masses (optional context variant)
    ms_path = os.path.join(va4_code, 'masses.py'); h_ms = sha(ms_path)
    sys.modules['va4_common'] = types.SimpleNamespace(GU=GU, GV=GV, CTX=[])
    spec = types.ModuleType('masses'); exec(compile(open(ms_path).read(), ms_path, 'exec'), spec.__dict__)
    C4 = [prism(p, 'S-VA4b') for n in range(48, 55) for p in spec.lot(n)['prisms']]
    C4_REMOVE = list(spec.LIDAR_C4)
    # ---- collections from S-VA2 (verbatim)
    col = {k: [prism(p, 'S-VA2') for p in D['collections'][k]] for k in ('E0_context_v2', 'E0_townhouses', 'E1_SK48', 'E1_SK52', 'E1_CUT48', 'E2')}
    # E1_CUT48 (S-VA2, verbatim) is the approved A footprint and B plate cut at RL 48.0: the sealed v1.1-AB comparator. Check that its footprints
    # ARE the approved E2 footprints, then derive the RL 47.0 / 49.0 bracket by changing the top RL only (no plan geometry is altered).
    e2fp = {q['id']: q['P'] for q in col['E2']}
    for q, k in zip(col['E1_CUT48'], ('E2-building_A', 'E2-building_B_plate')):
        assert q['zt'] == 48.0 and np.allclose(q['P'], e2fp[k], atol=1e-9), (q['id'], k)
    for rl in (47.0, 49.0):
        col[f'E1_CUT{rl:g}'] = [dict(q, id=q['id'].replace('CUT48', f'CUT{rl:g}'), zt=rl, src='S-VA2 (E1_CUT48 footprints; top RL set to %.1f)' % rl) for q in col['E1_CUT48']]
    names = [p['id'] for p in col['E0_context_v2']]; assert all(n in names for n in C4_REMOVE), 'C4 LiDAR quads not found in context'
    collections = {
        'CTX_VA2': dict(label='Context (VA2): LiDAR envelopes, heritage laundry, approved townhouse massing', classification='source-derived', source=['S-VA2'],
                        prisms=col['E0_context_v2'] + col['E0_townhouses']),
        'CTX_VA4C4_ADD': dict(label='VA4 plan-derived Cluster 4 masses (Lots 48-54), replacing 7 LiDAR template quads', classification='reconstructed', source=['S-VA4b'],
                              prisms=C4, replaces=C4_REMOVE),
        'E1_CUT48': dict(label='Approved A/B footprints cut at RL 48.0 (sealed 8-storey comparator)', classification='reconstructed', source=['S-VA2'], family='CUT', prisms=col['E1_CUT48']),
        'E1_CUT47': dict(label='Approved A/B footprints cut at RL 47.0', classification='sensitivity', source=['S-VA2'], family='CUT', prisms=col['E1_CUT47']),
        'E1_CUT49': dict(label='Approved A/B footprints cut at RL 49.0', classification='sensitivity', source=['S-VA2'], family='CUT', prisms=col['E1_CUT49']),
        'E1_SK48': dict(label='SK00.03 A footprints extruded to RL 48.0', classification='reconstructed', source=['S-VA2'], family='SK', prisms=col['E1_SK48']),
        'E1_SK52': dict(label='SK00.03 A footprints extruded to RL 52.0', classification='sensitivity', source=['S-VA2'], family='SK', prisms=col['E1_SK52']),
        'E2': dict(label='Approved Buildings A/B massing (VA2 plates, B communal roof, lift overruns)', classification='source-derived', source=['S-VA2'], family='E2', prisms=col['E2']),
        'ARTW': dict(label='VA4 Part D: Building B west balcony line (scaled, DA-106/107)', classification='sensitivity', source=['S-VA4a'], prisms=ARTW),
        'POD': dict(label='VA4 Part D: A/B west podium and B south podium (scaled, DA-103/402)', classification='sensitivity', source=['S-VA4a'], prisms=POD)}
    scenarios = [
        dict(id='E1_CUT48', label='E1 — 8-storey comparator, approved footprints at RL 48.0 (default)', members=['E1_CUT48'], classification='reconstructed', side='historical',
             note='The approved Building A footprint and Building B plate cut at RL 48.0: the comparator of the sealed v1.1-AB incremental tables. '
                  "It matches the applicant's own 'equivalent 8 storey approved built form' line on DA-600/601 Rev 8 (best-fitting height RL 48.0; "
                  'verify/out/ellivo_registration.json). Same footprints as the approved towers, so any difference from E2/E2c is height alone. '
                  'The 2020 approval fixed eight storeys, not an RL: RL 47.0 and 49.0 bracket the fit.'),
        dict(id='E1_CUT47', label='E1 sensitivity — approved footprints at RL 47.0', members=['E1_CUT47'], classification='sensitivity', side='historical',
             note='Lower bound of the RL 48 ± 1 m fit; plan geometry identical to E1_CUT48.'),
        dict(id='E1_CUT49', label='E1 sensitivity — approved footprints at RL 49.0', members=['E1_CUT49'], classification='sensitivity', side='historical',
             note='Upper bound of the RL 48 ± 1 m fit; plan geometry identical to E1_CUT48.'),
        dict(id='E1_SK48', label='E1 — 2020 reconstruction, SK48', members=['E1_SK48'], classification='reconstructed', side='historical',
             note='Received (not approved) 2020 envelope plan SK00.03 A, extruded to RL 48.0. No RL was ever fixed; not an exact approved 2020 envelope. '
                  'Its footprints differ from the approved towers, so E1_SK48 vs E2 mixes footprint position with height; E1_CUT48 isolates height.'),
        dict(id='E1_SK52', label='E1 sensitivity — SK52', members=['E1_SK52'], classification='sensitivity', side='historical',
             note='Same SK family at RL 52.0 (roof-plant allowance).'),
        dict(id='E1_SK48_POD', label='E1 hypothetical — SK48 + approved podium', members=['E1_SK48', 'POD'], classification='hypothetical', side='historical',
             note='Bounds the unknown 2020 podium by adding the approved podium to SK48. Hypothetical.'),
        dict(id='E2', label='E2 — approved 2026 form, VA2 plates only', members=['E2'], classification='source-derived', side='approved',
             note='Approved-plan plates; balcony volumes filled to the plate line; balustrades not modelled separately. Known under-representation: '
                  'over part of the Building B west face the plate lies up to 2.88 m inside the approved balcony line, and the podiums outside '
                  'the tower plates are absent (VA4 Part D). Kept for continuity with VA2; E2c is the default.'),
        dict(id='E2c', label='E2c — approved 2026 form, VA4-corrected (default)', members=['E2', 'ARTW', 'POD'], classification='scaled', side='approved',
             note='E2 plates plus the corrections VA4 Part D found necessary: the Building B west balcony line (DA-106 dimensions 3000 / 4100 and '
                  "Council's \"3 m to balcony, 4.1 m to wall\"; outline traced from DA-107 Rev 15, ±0.15 m) and the A/B west and B south podiums "
                  '(DA-103 / DA-402 content, ±0.15 m). Scaled from the approved drawings, not dimensioned at every vertex. It includes the approved '
                  'podiums; the 2020 podium is unknown, so compare with E1_SK48_POD for a like-for-like podium.')]
    T = D['terrain']; ZZ = np.array(T['z'], float).reshape(T['ny'], T['nx'])
    def dem(x, y):
        fx = (x - T['x0']) / T['step']; fy = (y - T['y0']) / T['step']; i = int(math.floor(fx)); j = int(math.floor(fy)); tx = fx - i; ty = fy - j
        return float(ZZ[j, i] * (1 - tx) * (1 - ty) + ZZ[j, i + 1] * tx * (1 - ty) + ZZ[j + 1, i] * (1 - tx) * ty + ZZ[j + 1, i + 1] * tx * ty)
    w01 = next(c for c in D['cameras'] if c['view'] == 'W01')
    presets = [dict(id='W01', label='W01 — Lot 63 courtyard', E=504057.91, N=6966719.97, RL=24.92, heading=w01['heading'], pitch=0.0, roll=0.0, hfov=w01['hfov'],
                    shift=w01['shift'], W=w01['W'], H=w01['H'], classification='model-defined', eye_basis='assumed standing eye RL 24.92 (source value)',
                    framing_basis='archived VA2 camera (heading, HFOV, vertical shift, 1800x1200)', radius=2.5,
                    note='Model-defined courtyard viewpoint, west/north-west of Building B. Not one of the townhouses immediately south.')]
    for nid, E, N, RL in (('NG55', 504155.20, 6966672.00, 24.36), ('NG57', 504144.50, 6966674.00, 23.97), ('NG59', 504130.30, 6966676.00, 23.73)):
        presets.append(dict(id=nid, label=f'{nid} — candidate near-ground', E=E, N=N, RL=RL, heading=AZ, pitch=0.0, roll=0.0, hfov=90.0, shift=0.0, W=1800, H=1200,
                            classification='hypothetical', eye_basis='DEM + 1.6 m (model ground; hypothetical)',
                            framing_basis='initial heading = site-grid north (8.864 deg), level, HFOV 90 deg: chosen by the viewer, NOT a source camera', radius=3.0,
                            note='Hypothetical near-ground model camera in the modelled gap south of Building B. Not surveyed, not an occupied or verified position.'))
    # ---- M1 regression checks
    checks = []
    for p in presets:
        x, y = p['E'] - E0, p['N'] - N0; g = dem(x, y); p['dem_RL'] = round(g, 3)
        if p['classification'] == 'hypothetical':
            ok = abs(g + 1.6 - p['RL']) <= 0.02; checks.append((f"G1.4 {p['id']} RL = DEM+1.6", ok, f"DEM {g:.3f} +1.6 = {g + 1.6:.3f} vs {p['RL']}"))
    from shapely.geometry import Point, Polygon
    want = {'NG55': (66.3, 71.5), 'NG57': (67.3, 72.1), 'NG59': (67.1, 71.9)}
    Bsk = Polygon(next(q['P'] for q in col['E1_SK48'] if q['id'].endswith('-B'))); Bp = Polygon(next(q['P'] for q in col['E2'] if q['id'] == 'E2-building_B_plate'))
    for p in presets:
        if p['id'] not in want: continue
        pt = Point(p['E'] - E0, p['N'] - N0); d1 = Bsk.exterior.distance(pt); d2 = Bp.exterior.distance(pt)
        a1 = math.degrees(math.atan2(48.0 - p['RL'], d1)); a2 = math.degrees(math.atan2(62.9 - p['RL'], d2)); p['envelope_deg'] = dict(E1_SK48=round(a1, 2), E2_Bplate=round(a2, 2), d_E1=round(d1, 2), d_E2=round(d2, 2))
        ok = abs(a1 - want[p['id']][0]) <= 0.2 and abs(a2 - want[p['id']][1]) <= 0.2
        checks.append((f"G1.5 {p['id']} envelopes", ok, f"E1 {a1:.2f} (archive {want[p['id']][0]}), E2 {a2:.2f} (archive {want[p['id']][1]}); d_E2 {d2:.2f} m"))
    # family isolation
    for s in scenarios:
        fams = {collections[m].get('family') for m in s['members'] if collections[m].get('family')}
        ok = len(fams) <= 1; checks.append((f"G1.2 {s['id']} single family", ok, str(fams)))
    ids = [q['id'] for c in collections.values() for q in c['prisms']]
    checks.append(('G1.2 prism ids unique across collections', len(ids) == len(set(ids)), f'{len(ids)} prisms'))
    # ---- controls
    lib_path = os.path.join(va4_code, 'adr', 'control_points_library_va4.json'); h_lib = need(lib_path, 'control_points_library_va4.json'); L = json.load(open(lib_path))
    c4ids = {q['id'] for q in C4}
    controls = [dict(id=p['id'], cls=p['cls'], x=p['x'], y=p['y'], z=p['z'], status=p['source_status'],
                     needs_context='CTX_VA4C4' if p['id'].split(':')[0] in c4ids else None) for p in L]
    checks.append(('controls count 628', len(controls) == 628, str(len(controls))))
    # ---- storey levels (approved plans, DIMENSIONED RLs per VA4 D_dims / D_DA402 extraction) and E1 inferred levels
    lv_B = [25.3, 29.4] + [round(32.5 + 3.1 * k, 3) for k in range(0, 10)]            # L01, L02, L03..L12 (60.4)
    lv_A = [25.3, 29.4] + [round(32.5 + 3.1 * k, 3) for k in range(0, 11)]            # L01, L02, L03..L13 (63.5)
    assert abs(lv_B[-1] - 60.4) < 1e-9 and abs(lv_A[-1] - 63.5) < 1e-9
    levels = dict(
        E2=dict(status='DIMENSIONED', source='DA-201 Rev 11 / DA-200 Rev 9 / DA-402 Rev 10 (Ground RL 21.600, L01 25.300, L02 29.400, L03 32.500, +3.100 per level; B L12 60.400, rooftop 62.900; A L13 63.500, roof 66.600)',
                A=lv_A, B=lv_B, ground=21.6),
        E1=dict(status='INFERRED', source='SK00.01 B: Ground + Levels 1-7 (8 storeys) below a rooftop with no units; ground RL 21.6 assumed; RL 48.0 top inferred; equal storeys of 3.3 m assumed',
                A=[round(21.6 + 3.3 * k, 3) for k in range(1, 8)], B=[round(21.6 + 3.3 * k, 3) for k in range(1, 8)], ground=21.6))
    # ---- public basemap (repository context/2026-11-11, CC BY 4.0 State of Queensland), transformed to the local frame
    ctxp = os.path.abspath(os.path.join(VIS, '..', 'context', '2026-11-11', 'shadow_context.json')); h_ctx = sha(ctxp)
    assert h_ctx == 'fd6a4c45370b475f8253a56a876c6d02570a66ee79ac89433ca7d06adc4f49ce', h_ctx
    CX = json.load(open(ctxp)); assert CX['crs'] == 'EPSG:7856'
    loc = lambda ring: [[round(x - E0, 3), round(y - N0, 3)] for x, y in ring]
    parcels = [dict(lotplan=p['lotplan'], type=p['parcel_typ'], rings=[loc(r) for poly in p['polygons'] for r in poly]) for p in CX['parcels']]
    contours = [dict(z=c['elevation_m'], line=loc(c['coords'])) for c in CX['contours']]
    railp = os.path.join(os.path.dirname(ctxp), 'raw', 'rail.geojson'); h_rail = sha(railp)
    rail = [loc(f['geometry']['coordinates']) for f in json.load(open(railp))['features'] if f['geometry']['type'] == 'LineString']
    basemap = dict(schema='greville-visual-basemap/1', src='context/2026-11-11 (repository)', licence='(c) State of Queensland (Department of Resources), CC BY 4.0',
                   note='Cadastre is an index, not survey. 1 m contours are generalised (cartographic use). Fill colours are schematic.',
                   site_lotplan='913SP337678', parcels=parcels, contours=contours, rail=rail)
    scene = dict(schema='greville-visual-scene/1', levels=levels, frame=dict(epsg=7856, E0=E0, N0=N0, vertical='AHD', local='x=E-E0, y=N-N0, z=RL; Z up',
                 three='X=x (east), Y=z (up), Z=-y (north is -Z)', site_grid_rotation_deg=AZ),
                 collections=collections, scenarios=scenarios, default_scenarios=dict(historical='E1_CUT48', approved='E2c'),
                 terrain=dict(x0=T['x0'], y0=T['y0'], step=T['step'], nx=T['nx'], ny=T['ny'], z=T['z'], src='S-VA2'),
                 canopy=dict(cell=D['canopy']['cell'], cells=D['canopy']['cells'], src='S-VA2'), presets=presets)
    os.makedirs(OUT, exist_ok=True)
    def dump(name, obj):
        p = os.path.join(OUT, name); s = json.dumps(obj, separators=(',', ':'), sort_keys=False); open(p, 'w').write(s); return sha(p), len(s)
    hb, nb_ = dump('basemap.json', basemap)
    hs, ns_ = dump('scene.json', scene); hc, nc = dump('controls.json', dict(schema='greville-visual-controls/1', src='S-VA4c', points=controls))
    manifest = dict(schema='greville-visual-manifest/1', generator='visual/tools/build_assets.py', generator_sha256=sha(os.path.abspath(__file__)),
                    sources={'S-VA2': dict(file='scene_dump_v2.json', sha256=h_scene), 'S-VA4a': dict(file='code/partD_artic.py', sha256=h_pd),
                             'S-VA4b': dict(file='code/masses.py', sha256=h_ms), 'S-VA4c': dict(file='code/adr/control_points_library_va4.json', sha256=h_lib),
                             'S-CTX': dict(file='context/2026-11-11/shadow_context.json (this repository; CC BY 4.0)', sha256=h_ctx),
                             'S-RAIL': dict(file='context/2026-11-11/raw/rail.geojson (this repository; CC BY 4.0)', sha256=h_rail),
                             'S-VA4': dict(file='GRE_VA4_code_and_results.zip', sha256='a75ad6b31c0241de5a8148eac89711146c5e5a7f461f07f9429b43febed52901')},
                    assets={'scene.json': dict(sha256=hs, bytes=ns_), 'controls.json': dict(sha256=hc, bytes=nc), 'basemap.json': dict(sha256=hb, bytes=nb_)},
                    collections={k: dict(label=v['label'], classification=v['classification'], source=v['source'], family=v.get('family'), n_prisms=len(v['prisms']),
                                         replaces=v.get('replaces')) for k, v in collections.items()},
                    scenarios={s['id']: dict(members=s['members'], classification=s['classification']) for s in scenarios},
                    transformation='none to source values; local frame x=E-504045, y=N-6966712, z=RL AHD; viewer maps (x,y,z)->(X=x,Y=z,Z=-y)',
                    licence='Derived numeric massing from publicly lodged DA drawings (no drawing reproduced); LiDAR/DEM/canopy derived from Queensland Government data (CC BY 4.0).',
                    excluded=['E1_REC48', 'E1_REC52', 'E1_SK46.5 (other families / not exposed)', 'SENS_trees12_opaque', 'SENS_C5_verge_trees (invented crowns)',
                              'SENS_C3_laundry_flat_top', 'model/ shadow-model geometry (different method)'],
                    checks=[dict(gate=g, ok=bool(o), detail=d) for g, o, d in checks])
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    for g, o, d in checks: print('PASS' if o else 'FAIL', g, '|', d)
    if not all(o for _, o, _ in checks): sys.exit(1)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
