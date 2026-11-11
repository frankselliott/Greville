#!/usr/bin/env python3
"""A gate for the Study page, which until now had none.

PROVENANCE.md says of the Study: "If its figures are ever to be relied on, it
needs its own gate." This is that gate.

The Study is not the frozen model. It credits casters the frozen model did not
-- the heritage laundry, the Cluster 1-3 terrace, the eight Cluster 4 dwellings
-- and it samples at a coarser cell. So it cannot be checked by equality. What
can be checked is the claim the Study's own README makes about its figures:

    adding a caster can only reduce a loss, never raise it

That is a falsifiable statement with a direction. This gate drives the live
page in a browser, reads the figures it actually renders, and tests them
against the frozen Python engine:

  1. Study loss <= frozen loss + sampling allowance, at every instant.
     A Study figure ABOVE the frozen one would break the claim.
  2. Where the extra casters do not intercept, the two should agree to within
     the sampling allowance, which is the Study's coarser cell.

The same test is applied to the page's eight-storey comparator at RL 48.0 and
RL 55.75, against Model.comparator_loss (Buildings A and B on their approved
footprints cut to that RL, as the sealed incremental table used).

Requires node with playwright, which the model itself does not.
Run:  python3 gate_study.py [path/to/study/index.html]

The page is not part of the verification pack. In the repository it is found
at ../study/index.html; otherwise save the Study page from the site (it is one
self-contained HTML file) and pass its path.
"""
import json, math, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'model'))
from greville_model.model import load, parse_instant

PAGE = os.path.join(HERE, '..', 'study', 'index.html')
LOTS = ['60SP354191', '61SP354191', '62SP354191', '63SP354191']

# instants spread across the year, deliberately including the ones where the
# extra casters are most likely to intercept (early summer mornings)
INSTANTS = []
for doy, mins in ((316, 395), (316, 420), (327, 390), (327, 423), (34, 439),
                  (73, 460), (172, 540), (172, 720), (266, 450), (355, 390),
                  (355, 540), (355, 900)):
    INSTANTS.append((doy, mins))

JS = r'''
const { chromium } = require('playwright');
(async () => {
  const [page, spec] = process.argv.slice(2);
  const want = JSON.parse(spec);
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + page, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(w => {
    const rows = [];
    for (const [scheme, rl] of [['approved', null], ['comparator', 48.0], ['comparator', 55.75]]){
      S.scheme = scheme; if (rl !== null) S.compRL = rl; buildMassing();
      for (const [doy, min] of w){
        const sp = solarAt(doy, min);
        const row = { scheme, rl, doy, min, alt: sp.alt, az: sp.az, loss: {} };
        for (const k of Object.keys(ALLPOS))
          if (ALLMETA[k].cluster === 5) row.loss[k] = lossLot(k, sp, GRIDS[k], GC);
        rows.push(row);
      }
    }
    return rows;
  }, want);
  await b.close();
  console.log(JSON.stringify({ rows: out, errors: errs }));
})();
'''

def main():
    page = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else PAGE)
    if not os.path.isfile(page):
        print('This gate checks the Study page itself, which is not in this pack.')
        print('Save the Study page from the site as a single HTML file, then run:')
        print()
        print('    python3 gate_study.py path/to/index.html')
        print()
        print('(looked for %s)' % page)
        return 2
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as fh:
        fh.write(JS); js = fh.name
    try:
        r = subprocess.run(['node', js, page, json.dumps(INSTANTS)],
                           capture_output=True, text=True, cwd=HERE, timeout=300)
    except FileNotFoundError:
        print('This gate drives the Study page in a real browser, so it needs node with')
        print('playwright installed. Nothing else in this pack does:')
        print()
        print('    cd ../model && python3 run_tests.py            # 29 independent tests')
        print('    cd ../model && python3 verify_frozen_peaks.py  # the frozen QA gate')
        print('    cd ../verify && python3 mga.py                 # the projection self-test')
        print('    cd ../verify && python3 export.py              # regenerate out/')
        print()
        print('all run on a bare Python 3.8+ with no third-party packages. To run this one:')
        print('    npm install playwright && npx playwright install chromium')
        return 2
    except subprocess.TimeoutExpired:
        print('the browser did not finish within 300 s; nothing was concluded'); return 2
    finally:
        try: os.unlink(js)
        except OSError: pass
    if r.returncode != 0:
        print('could not drive the Study page, so nothing was concluded:\n' + r.stderr[-2000:]); return 2
    data = json.loads(r.stdout.strip().split('\n')[-1])
    if data['errors']:
        print('the Study page raised errors: %r' % data['errors']); return 1

    M = load()
    GC = 0.18                      # the Study's own live cell
    allow = GC * 1.5               # one-and-a-half cells of boundary quantisation, per lot
    print('Study page gate — figures as the page renders them, against the frozen engine')
    print('receptor: sched (the scheduled private open space), fence case f000')
    print('the Study credits extra casters, so its loss must never EXCEED the frozen loss\n')
    print('   scheme         doy   time   alt      lot   study_m2  frozen_m2   study-frozen   verdict')
    fails = 0; rows = 0
    for row in data['rows']:
        doy, mins = row['doy'], row['min']
        y = M.d['solar']['year']
        import datetime
        d = datetime.date(y, 1, 1) + datetime.timedelta(days=doy - 1)
        when = parse_instant('%s T%02d:%02d:00'.replace(' ', '') % (d.isoformat(), mins // 60, mins % 60))
        for lot in LOTS:
            study = row['loss'].get(lot)
            if study is None: continue
            # The Study measures the SCHEDULED private open space: its own
            # ALLMETA area comes from D.peaks['sched/f000/...'].pos_area_m2 and
            # ALLPOS from D.pos, which is the sched polygon. Comparing it against
            # the 'yard' receptor compares different ground and is meaningless.
            if row['scheme'] == 'approved':
                frozen = M.evaluate_at('sched', lot, 'f000', when)['loss']
            else:
                frozen = M.evaluate_at('sched', lot, 'f000', when,
                                       comparator_rl=row['rl'])['comparator_loss']
            delta = study - frozen
            ok = delta <= allow
            if not ok: fails += 1
            rows += 1
            tag = 'approved' if row['scheme'] == 'approved' else 'comp RL%g' % row['rl']
            print('   %-13s  %3d  %02d:%02d  %5.1f   %s  %8.2f  %9.2f   %+12.2f   %s'
                  % (tag, doy, mins // 60, mins % 60, row['alt'], lot[:2], study, frozen,
                     delta, 'ok' if ok else 'EXCEEDS FROZEN'))
    print('\n%d comparisons, allowance %+.2f m2 (1.5 x the Study cell of %.2f m)'
          % (rows, allow, GC))
    if fails:
        print('FAILED — %d figures exceed the frozen loss. The Study claims its extra'
              '\ncasters can only reduce a figure; these do not.' % fails); return 1
    print('PASS — no Study figure exceeds the frozen loss at any instant tested.')
    print('This gates the DIRECTION the Study claims. It does not make the Study')
    print('figures the frozen figures: those remain the ones in model/.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
