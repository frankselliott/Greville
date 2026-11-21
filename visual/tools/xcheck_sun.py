#!/usr/bin/env python3
"""Reference sun positions from the repository's frozen solar engine (model/greville_model/solar.py) for tests/unit.test.mjs."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'model'))
from greville_model import solar
D = json.load(open(os.path.join(ROOT, 'model', 'data', 'greville_model_v1.1-AB.json')))['solar']
cases = []
for (m, d) in ((1, 1), (3, 21), (6, 21), (9, 23), (12, 22), (12, 31)):
    for (hh, mm) in ((0, 30), (6, 5), (8, 0), (10, 0), (12, 0), (15, 45), (17, 30), (23, 50)):
        alt, az = solar.sun_position(2026, m, d, hh, mm, D['latitude'], D['longitude'])
        cases.append(dict(y=2026, m=m, d=d, hh=hh, mm=mm, alt=alt, az=az))
json.dump(dict(generator='visual/tools/xcheck_sun.py', engine='model/greville_model/solar.py', site=D, cases=cases), open(os.path.join(HERE, '..', 'tests', 'fixtures', 'sun_reference.json'), 'w'), indent=1)
print(len(cases), 'cases')
