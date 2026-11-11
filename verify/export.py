"""Build the verification pack: geometry and results in formats an architect
or shadow consultant can load and re-derive independently.

Run from this directory:   python3 -I export.py
Everything it writes goes to out/ and is listed in out/SHA256SUMS.
"""
import csv, hashlib, json, math, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'model'))
sys.path.insert(0, HERE)

from greville_model.model import load, parse_instant
from greville_model.shadow_model import prism_shadow_parts, occluded_mask
import mga

OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

M = load(); D = M.d
ZONE = 56
E0 = D['crs']['local_origin_E']; N0 = D['crs']['local_origin_N']
GZ = D['receiver_rl']['63SP354191']
LAT, LON = D['solar']['latitude'], D['solar']['longitude']

to_mga = lambda p: (E0 + p[0], N0 + p[1])
def to_wgs(p):
    la, lo = mga.grid_to_geo(E0 + p[0], N0 + p[1], ZONE)
    return [round(lo, 9), round(la, 9)]

# ---- the instants an expert would want to check -------------------------
INSTANTS = []
for k, v in sorted(D['frozen']['peaks'].items()):
    INSTANTS.append(('frozen peak · ' + k, v['instant']))
seen = set(); UNIQ = []
for name, when in INSTANTS:
    if when in seen: continue
    seen.add(when); UNIQ.append((name, when))
for lbl, when in [('Ellivo DA-600 · 21 Dec 9AM','2026-12-21T09:00:00'),
                  ('Ellivo DA-600 · 21 Dec 12PM','2026-12-21T12:00:00'),
                  ('Ellivo DA-600 · 21 Dec 3PM','2026-12-21T15:00:00'),
                  ('Ellivo DA-600 · 21 Dec 4PM','2026-12-21T16:00:00'),
                  ('Ellivo DA-600 · 21 Dec 5PM','2026-12-21T17:00:00'),
                  ('Ellivo DA-601 · 21 Jun 9AM','2026-06-21T09:00:00'),
                  ('Ellivo DA-601 · 21 Jun 12PM','2026-06-21T12:00:00'),
                  ('Ellivo DA-601 · 21 Jun 2PM','2026-06-21T14:00:00'),
                  ('Ellivo DA-601 · 21 Jun 3PM','2026-06-21T15:00:00'),
                  ('Ellivo DA-601 · 21 Jun 4PM','2026-06-21T16:00:00'),
                  ('Ellivo DA-601 · 21 Jun 5PM','2026-06-21T17:00:00')]:
    if when not in seen: seen.add(when); UNIQ.append((lbl, when))

# ---- static geometry ------------------------------------------------------
LAYERS = []
def add(layer, name, ring, props):
    LAYERS.append(dict(layer=layer, name=name, ring=ring, props=props))

for k, b in D['approved'].items():
    add('APPROVED', k, b['footprint'],
        {'top_rl': b['top_rl'], 'base_rl': b['base_rl'],
         'source': 'approved plans A006835434 via model v1.1-AB'})
for k in ('A','B'):
    add('COMPARATOR_ENVELOPE', 'envelope_'+k, D['comparator'][k],
        {'test_heights_rl': D['comparator']['test_heights'],
         'note': 'rectangular envelope the frozen browser page uses for its live comparator. '
                 'The sealed incremental table used Buildings A and B on their approved '
                 'footprints (layer APPROVED, building_A and building_B_plate) cut to the '
                 'comparator RL; see model/PROVENANCE.md, The two comparators. '
                 'The 2020 approval fixed storey count only; no top RL exists in any source'})
for k, ring in D['cadastre']['lots'].items():
    add('CADASTRE_LOT', k, ring, {'label': D['lot_meta'][k]['label'],
                                  'dwelling': D['lot_meta'][k]['dwelling'],
                                  'ffl': D['lot_meta'][k]['ffl']})
add('CADASTRE_PARCEL', 'parcel_913SP337678_part', D['cadastre']['parcel_913SP337678_part'], {})
for pos in ('yard','sched'):
    for k, ring in D['receptors'][pos].items():
        add('RECEPTOR_'+pos.upper(), '%s_%s' % (pos, k), ring,
            {'area_m2': D['receptor_meta'][pos][k]['area_m2'],
             'receiver_rl': D['receiver_rl'][k]})
for k, o in D['occluders'].items():
    add('DWELLING', 'occluder_'+k, o['footprint'], {'top_rl': o['top_rl']})

# ---- GeoJSON --------------------------------------------------------------
feats = []
for it in LAYERS:
    ring = it['ring']
    closed = ring if ring[0] == ring[-1] else ring + [ring[0]]
    p = dict(it['props']); p.update({'layer': it['layer'], 'name': it['name'],
             'mga2020_zone56': [[round(x,4), round(y,4)] for x,y in map(to_mga, closed)]})
    feats.append({'type':'Feature','properties':p,
                  'geometry':{'type':'Polygon','coordinates':[[to_wgs(q) for q in closed]]}})
gj = {'type':'FeatureCollection',
      'name':'Greville shadow model v1.1-AB — geometry',
      'note':('Coordinates are WGS84 lon/lat for GeoJSON conformance. The authoritative '
              'values are in each feature\'s mga2020_zone56 property, GDA2020 / MGA zone 56, '
              'EPSG:7856. GDA2020 and WGS84 differ by well under a metre at this epoch.'),
      'features':feats}
json.dump(gj, open(os.path.join(OUT,'geometry.geojson'),'w'), indent=1)
print('geometry.geojson  %d features' % len(feats))

# ---- DXF (R12 ASCII, MGA eastings/northings) ------------------------------
def dxf(path, items):
    L = ['999','Greville shadow model v1.1-AB — GDA2020 / MGA zone 56 (EPSG:7856)',
         '0','SECTION','2','ENTITIES']
    for it in items:
        ring = it['ring']
        closed = ring if ring[0]==ring[-1] else ring+[ring[0]]
        L += ['0','POLYLINE','8',it['layer'],'66','1','70','1']
        for q in closed:
            e,n = to_mga(q)
            L += ['0','VERTEX','8',it['layer'],'10','%.4f'%e,'20','%.4f'%n,'30','%.4f'%it.get('z',0.0)]
        L += ['0','SEQEND','8',it['layer']]
    L += ['0','ENDSEC','0','EOF']
    open(path,'w').write('\n'.join(L)+'\n')

dxf(os.path.join(OUT,'geometry.dxf'), LAYERS)
print('geometry.dxf      %d polylines, MGA zone 56 coordinates' % len(LAYERS))

# ---- sun positions at every instant --------------------------------------
with open(os.path.join(OUT,'sun_positions.csv'),'w',newline='') as fh:
    w = csv.writer(fh)
    w.writerow(['label','local_instant_UTC+10','altitude_deg','azimuth_deg',
                'shadow_bearing_deg','shadow_length_per_metre_of_height'])
    for name, when in UNIQ:
        alt, az = M.sun(parse_instant(when))
        if alt > 0.05:
            w.writerow([name, when, '%.4f'%alt, '%.4f'%az, '%.4f'%((az+180)%360),
                        '%.5f'%(1.0/math.tan(math.radians(alt)))])
        else:
            w.writerow([name, when, '%.4f'%alt, '%.4f'%az, '', 'SUN BELOW HORIZON'])
print('sun_positions.csv %d instants' % len(UNIQ))

# ---- shadow sweeps at each instant ---------------------------------------
sh_items = []
for name, when in UNIQ:
    alt, az = M.sun(parse_instant(when))
    if alt <= 0.05: continue
    tag = when.replace(':','').replace('-','')
    for k, b in D['approved'].items():
        parts = prism_shadow_parts(b['footprint'], b['top_rl'], b['base_rl'], GZ, alt, az)
        for i, pr in enumerate(parts or []):
            sh_items.append(dict(layer='SHADOW_APPROVED_'+tag, name='%s_part%d'%(k,i),
                                 ring=pr, props={'instant':when,'caster':k,
                                 'alt_deg':round(alt,4),'az_deg':round(az,4)}))
    # the comparator the sealed incremental table used: A and B on their
    # approved footprints, cut to RL 48.0 (Model.comparator_casters)
    for k, (fp, top) in zip(('A','B'), M.comparator_casters(48.0)):
        parts = prism_shadow_parts(fp, top, 0.0, GZ, alt, az)
        for i, pr in enumerate(parts or []):
            sh_items.append(dict(layer='SHADOW_COMPARATOR_RL48_'+tag, name='comp%s_part%d'%(k,i),
                                 ring=pr, props={'instant':when,'caster':'comparator_'+k,
                                 'top_rl':48.0,'alt_deg':round(alt,4),'az_deg':round(az,4)}))
dxf(os.path.join(OUT,'shadows.dxf'), sh_items)
feats2=[]
for it in sh_items:
    ring=it['ring']; closed=ring if ring[0]==ring[-1] else ring+[ring[0]]
    p=dict(it['props']); p.update({'layer':it['layer'],'name':it['name']})
    feats2.append({'type':'Feature','properties':p,
                   'geometry':{'type':'Polygon','coordinates':[[to_wgs(q) for q in closed]]}})
json.dump({'type':'FeatureCollection',
           'name':'Greville shadow model v1.1-AB — shadow sweeps',
           'note':('Each feature is ONE PART of the per-edge Minkowski sweep, not the '
                   'finished shadow. The shadow is their union; see shadow_model.py, '
                   'prism_shadow_parts. Reported AREAS never come from these parts — they '
                   'come from occluded_mask, the exact per-point ray test.'),
           'features':feats2}, open(os.path.join(OUT,'shadows.geojson'),'w'), indent=1)
print('shadows.dxf/.geojson  %d sweep parts' % len(sh_items))

# ---- the frozen figures, recomputed here -----------------------------------
with open(os.path.join(OUT,'frozen_peaks_recomputed.csv'),'w',newline='') as fh:
    w=csv.writer(fh)
    w.writerow(['key','position','fence_case','lot','instant','sun_alt_deg','sun_az_deg',
                'frozen_peak_loss_m2','recomputed_loss_m2','difference_m2',
                'otherwise_sunlit_m2','receptor_area_m2'])
    worst=0.0
    for key,v in sorted(D['frozen']['peaks'].items()):
        pos,fence,lot = key.split('/')
        when=v['instant']; alt,az=M.sun(parse_instant(when))
        r=M.evaluate_at(pos,lot,fence,parse_instant(when))
        diff=r['loss']-v['peak_loss_m2']; worst=max(worst,abs(diff))
        w.writerow([key,pos,fence,lot,when,'%.4f'%alt,'%.4f'%az,
                    '%.4f'%v['peak_loss_m2'],'%.4f'%r['loss'],'%+.4f'%diff,
                    '%.4f'%r['otherwise_sunlit'],'%.4f'%r['pos_area']])
print('frozen_peaks_recomputed.csv   worst difference %.4f m2' % worst)

# ---- Cluster 5 at the applicant's own instants -----------------------------
LOTS=['60SP354191','61SP354191','62SP354191','63SP354191']
with open(os.path.join(OUT,'cluster5_at_applicant_instants.csv'),'w',newline='') as fh:
    w=csv.writer(fh)
    # All three fence cases. f000 is the open end of the bracket and gives the
    # LARGEST attributable loss; f150 is the fully opaque end and the smallest.
    # The approved 1500 mm metal batten fence has no established solar opacity,
    # so the answer lies between and must be quoted as a bracket, never as f000
    # alone. f180 is a superseded sensitivity, not the approved condition.
    w.writerow(['label','instant','sun_alt_deg','fence_case']
               +['loss_m2_'+l[:2] for l in LOTS]+['total_m2'])
    for name,when in UNIQ:
        if not name.startswith('Ellivo'): continue
        alt,az=M.sun(parse_instant(when))
        for f in ('f000','f150','f180'):
            if alt<=0.05:
                w.writerow([name,when,'%.4f'%alt,f]+['']*4+['SUN BELOW GEOMETRIC HORIZON']); continue
            v=[M.evaluate_at('yard',l,f,parse_instant(when))['loss'] for l in LOTS]
            w.writerow([name,when,'%.4f'%alt,f]+['%.4f'%x for x in v]+['%.4f'%sum(v)])
print('cluster5_at_applicant_instants.csv')

# ---- receptor grids: spec + checksum, so they can be regenerated ----------
# The full point set is 684,988 samples and would dominate the pack. It is
# fully determined by the receptor polygon and the cell size, so what is
# recorded here is the specification and a hash of the point set. Regenerate
# with Model.grid(position, lot, FROZEN_CELL) and compare the hash.
from greville_model.model import FROZEN_CELL
with open(os.path.join(OUT,'receptor_grid_spec.csv'),'w',newline='') as fh:
    w=csv.writer(fh)
    w.writerow(['position','lot','cell_m','n_points','polygon_area_m2',
                'grid_area_m2','sha256_of_point_set'])
    for pos in ('yard','sched'):
        for lot in LOTS:
            pts=M.grid(pos,lot,FROZEN_CELL)
            blob=''.join('%.6f,%.6f;'%(p[0],p[1]) for p in pts).encode()
            w.writerow([pos,lot,FROZEN_CELL,len(pts),
                        '%.4f'%D['receptor_meta'][pos][lot]['area_m2'],
                        '%.4f'%(len(pts)*FROZEN_CELL*FROZEN_CELL),
                        hashlib.sha256(blob).hexdigest()])
print('receptor_grid_spec.csv')

# ---- manifest --------------------------------------------------------------
lines=[]
for f in sorted(os.listdir(OUT)):
    if f=='SHA256SUMS': continue
    h=hashlib.sha256(open(os.path.join(OUT,f),'rb').read()).hexdigest()
    lines.append('%s  %s' % (h,f))
open(os.path.join(OUT,'SHA256SUMS'),'w').write('\n'.join(lines)+'\n')
print('\nSHA256SUMS')
for l in lines: print('  '+l)
