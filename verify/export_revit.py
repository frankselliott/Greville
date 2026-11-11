#!/usr/bin/env python3
"""Revit- and CAD-ready 3D DXF of the model geometry.

Writes out_revit/ (separate from out/, which export.py owns):

  greville_revit_mga.dxf     GDA2020 / MGA zone 56 eastings and northings
  greville_revit_local.dxf   the same, shifted near the origin:
                             local = MGA - (E 504045, N 6966712); heights unchanged
  README.txt, SHA256SUMS

Both are AutoCAD 2000 DXF with units declared as metres ($INSUNITS = 6) and
heights in metres AHD. Buildings are closed polyface meshes, so they import as
solids rather than outlines:

  APPROVED_A, APPROVED_B_PLATE      approved ground floor RL 21.600 to top RL
  APPROVED_B_COMMUNAL_ROOF,
  APPROVED_B_LIFT_OVERRUN           on the B plate roof, RL 62.900 to top RL
  DWELLINGS_CLUSTER5                each Lot 60-63 dwelling, receiver level to top RL
  FENCE_1500                        each lot's boundary fence, receiver level + 1.5 m
                                    (geometry only: its solar opacity is not
                                    established, so the model brackets it)
  RECEPTOR_SCHED, RECEPTOR_YARD     the measured backyards, at receiver level
  CADASTRE_LOT                      Lots 60-63, at receiver level
  CADASTRE_PARCEL                   the development parcel, at RL 21.600

The model itself extrudes the approved buildings from RL 0. Any base below
the lowest receiver level (RL 23.320) casts exactly the same shadow on the
backyards, so drawing them from the approved ground floor changes nothing that
is measured. The eight-storey comparator is deliberately not included; see
README.txt.

Needs ezdxf (pip install ezdxf==1.4.5). Output is byte-reproducible with that
version. Run from this directory:   python3 export_revit.py
"""
import hashlib, json, os, sys

import ezdxf
from ezdxf.math.triangulation import mapbox_earcut_2d
from ezdxf.math import Vec2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out_revit')
os.makedirs(OUT, exist_ok=True)
D = json.load(open(os.path.join(HERE, '..', 'model', 'data', 'greville_model_v1.1-AB.json')))
E0, N0 = D['crs']['local_origin_E'], D['crs']['local_origin_N']
APPROVED_GROUND_RL = 21.6          # approved ground floor RL, from the approved plans
FENCE_H = D['fence_cases']['f150']['height']   # 1.5 m, the approved 1500H fence

ezdxf.options.write_fixed_meta_data_for_testing = True   # no timestamps or random GUIDs


def ring(poly):
    p = [tuple(map(float, q[:2])) for q in poly]
    if p[0] == p[-1]:
        p = p[:-1]
    # counter-clockwise, so cap and side normals face outward
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(p, p[1:] + p[:1]))
    return p if a > 0 else p[::-1]


def prism(msp, layer, poly, z0, z1, off):
    """Closed polyface: triangulated bottom and top, one quad per side."""
    p = [(x + off[0], y + off[1]) for x, y in ring(poly)]
    n = len(p)
    idx = {pt: i for i, pt in enumerate(p)}
    tris = [[idx[(v.x, v.y)] for v in t] for t in mapbox_earcut_2d([Vec2(q) for q in p])]
    pf = msp.add_polyface(dxfattribs={'layer': layer})
    bot = [(x, y, z0) for x, y in p]
    top = [(x, y, z1) for x, y in p]
    for a, b, c in tris:
        pf.append_face([bot[a], bot[c], bot[b]])     # bottom faces down
        pf.append_face([top[a], top[b], top[c]])     # top faces up
    for i in range(n):
        j = (i + 1) % n
        pf.append_face([bot[i], bot[j], top[j], top[i]])
    pf.optimize()
    return pf


def wall(msp, layer, a, b, z0, z1, off):
    a = (a[0] + off[0], a[1] + off[1]); b = (b[0] + off[0], b[1] + off[1])
    msp.add_3dface([(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)],
                   dxfattribs={'layer': layer})


def outline(msp, layer, poly, z, off):
    pts = [(x + off[0], y + off[1]) for x, y in ring(poly)]
    msp.add_lwpolyline(pts, close=True, dxfattribs={'layer': layer, 'elevation': z})


LAYERS = [('APPROVED_A', 30), ('APPROVED_B_PLATE', 30), ('APPROVED_B_COMMUNAL_ROOF', 32),
          ('APPROVED_B_LIFT_OVERRUN', 32), ('DWELLINGS_CLUSTER5', 41), ('FENCE_1500', 23),
          ('RECEPTOR_SCHED', 2), ('RECEPTOR_YARD', 52), ('CADASTRE_LOT', 8), ('CADASTRE_PARCEL', 9)]


def build(path, off):
    doc = ezdxf.new('R2000', setup=False)
    doc.units = 6                                   # metres
    doc.header['$INSUNITS'] = 6
    doc.header['$MEASUREMENT'] = 1                  # metric
    for name, colour in LAYERS:
        doc.layers.add(name, color=colour)
    msp = doc.modelspace()
    A = D['approved']
    plate_top = A['building_B_plate']['top_rl']
    prism(msp, 'APPROVED_A', A['building_A']['footprint'], APPROVED_GROUND_RL, A['building_A']['top_rl'], off)
    prism(msp, 'APPROVED_B_PLATE', A['building_B_plate']['footprint'], APPROVED_GROUND_RL, plate_top, off)
    prism(msp, 'APPROVED_B_COMMUNAL_ROOF', A['building_B_communal_roof']['footprint'], plate_top,
          A['building_B_communal_roof']['top_rl'], off)
    prism(msp, 'APPROVED_B_LIFT_OVERRUN', A['building_B_lift_overrun']['footprint'], plate_top,
          A['building_B_lift_overrun']['top_rl'], off)
    for lot in sorted(D['occluders']):
        z = D['receiver_rl'][lot]
        prism(msp, 'DWELLINGS_CLUSTER5', D['occluders'][lot]['footprint'], z, D['occluders'][lot]['top_rl'], off)
        for a, b in D['fences'][lot]['lines']:
            wall(msp, 'FENCE_1500', a, b, z, z + FENCE_H, off)
        outline(msp, 'RECEPTOR_SCHED', D['receptors']['sched'][lot], z, off)
        outline(msp, 'RECEPTOR_YARD', D['receptors']['yard'][lot], z, off)
        outline(msp, 'CADASTRE_LOT', D['cadastre']['lots'][lot], z, off)
    outline(msp, 'CADASTRE_PARCEL', D['cadastre']['parcel_913SP337678_part'], APPROVED_GROUND_RL, off)
    doc.saveas(path)


build(os.path.join(OUT, 'greville_revit_mga.dxf'), (E0, N0))
build(os.path.join(OUT, 'greville_revit_local.dxf'), (0.0, 0.0))

open(os.path.join(OUT, 'README.txt'), 'w').write("""Greville model geometry in 3D for Revit and other CAD (v1.1-AB)

greville_revit_mga.dxf    GDA2020 / MGA zone 56 eastings and northings
greville_revit_local.dxf  the same geometry near the origin:
                          local = MGA - (E %d, N %d); heights unchanged
Units: metres (declared in the files). Heights: metres AHD.

Revit: Insert > Link CAD (or Import CAD), Layers: All, Import units: Meter.
  Local file:  Positioning "Auto - Origin to Internal Origin".
  MGA file:    Positioning "Auto - Center to Center", then
               Manage > Coordinates > Acquire Coordinates and pick the link.
               (MGA coordinates are thousands of km from Revit's origin;
               do not place them origin to origin.)
Grid north and true north differ by about 0.02 deg here; that is negligible.
For a Revit sun study use latitude %.6f, longitude %.6f, time zone UTC+10
(Brisbane, no daylight saving). Revit's solar routine is not this model's
(NOAA geometric, no refraction), so expect small differences near sunrise.

Layers
  APPROVED_A, APPROVED_B_PLATE   closed solids, approved ground floor RL 21.600 to top RL
  APPROVED_B_COMMUNAL_ROOF,
  APPROVED_B_LIFT_OVERRUN        on the B plate roof, RL 62.900 to top RL
  DWELLINGS_CLUSTER5             Lot 60-63 dwellings, receiver level to top RL
  FENCE_1500                     boundary fences, receiver level + 1.5 m. Geometry only:
                                 their solar opacity is not established, so the model
                                 brackets them fully open / fully solid.
  RECEPTOR_SCHED, RECEPTOR_YARD  the measured backyards, at receiver level
  CADASTRE_LOT                   Lots 60-63, at receiver level
  CADASTRE_PARCEL                the development parcel, at RL 21.600

The model extrudes the approved buildings from RL 0. Any base below the lowest
receiver level (RL 23.320) gives exactly the same shadow on the backyards, so
starting them at the approved ground floor changes nothing that is measured.

The eight-storey comparator is not included. The sealed day counts were
computed against the approved A and B-plate footprints cut to the comparator
height, not the rectangular envelopes in geometry.dxf (layer COMPARATOR); until
that is reconciled, a 3D comparator here would invite the wrong one.

Regenerate: python3 export_revit.py  (needs ezdxf 1.4.5; byte-reproducible)
""" % (E0, N0, D['solar']['latitude'], D['solar']['longitude']))

lines = []
for f in sorted(os.listdir(OUT)):
    if f == 'SHA256SUMS':
        continue
    lines.append('%s  %s' % (hashlib.sha256(open(os.path.join(OUT, f), 'rb').read()).hexdigest(), f))
open(os.path.join(OUT, 'SHA256SUMS'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
