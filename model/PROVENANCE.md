# Where this code came from

This directory is a **reconstruction**. It is not the original model source,
and it must never be described as one.

## The chain

| Stage | Status |
|---|---|
| Sealed release `greville_shadow_model_v1.1-AB.tar.gz`, SHA-256 `6df4dde6…c76d4f0`, 56,012 bytes | The v1.1-AB release. Its model data — the approved geometry, the receptors and every results table — is what `../verify/diff_original.py` checks this reconstruction against. The SHA-256 of each of those ten data files is pinned in that script. |
| Original engine — `scripts/solar.py` (2,350 B, `e7485ace…`) and `scripts/shadow_model.py` (5,728 B, `9360959d…`), from the sealed v1.0.2 release | Identified by SHA-256 in the v1.0.2 sealed manifest. Not available to this reconstruction, so the engine here is checked by independent tests rather than against that source. |
| Frozen visualiser `index.html`, SHA-256 `cd551cef…b128f9f`, 67,636 bytes | In this repository, unmodified. Contains a JavaScript port of the model that its own comments describe as an "Exact port of v1.0.2 scripts/solar.py", together with the whole frozen result set as `__MODEL__`. |
| `model/` — this directory | Ported back to Python from that JavaScript, then checked against the sealed release's data. |

The code lineage is Python → JavaScript → Python: every routine here was
written against the frozen JavaScript, function by function, including its
epsilons, its tie-breaking and its float accumulation order. Where the
JavaScript carries an instruction not to "improve" something — the UTC+10
no-DST convention, the absence of a refraction correction — that instruction is
carried over verbatim.

## What the gates establish

There are two, and they answer different questions.

`verify_frozen_peaks.py` recomputes the frozen figures and compares. Passing it
establishes that **this Python computes what the frozen visualiser computes.**

`../verify/diff_original.py` checks this reconstruction against the sealed
release. It accepts the whole release, identified by its SHA-256, or the model
data alone, identified file by file against the pinned hashes. Passing it
establishes that **the data this Python computes over, and the results it
reproduces, are the sealed release's.** Measured:

| Checked against the sealed release | Result |
|---|---|
| Approved building footprints — 4 parts, vertex by vertex | identical to **0.065 mm**, the 4-decimal storage floor; `top_rl` exact on all four |
| Receptor polygons — `yard` and `sched`, 4 lots each | identical to **0.067 mm** |
| Receptor metadata — `depth_m`, `width_m`, `area_m2` | **exact to full float precision**, all 24 values |
| Casting edge — union bbox and centroid | **exact**, 0.00 m |
| The 24 frozen peak figures embedded in the page | **bit-identical**, max delta 0.00 m² |
| The 24 governing instants | **24/24 exact** |
| Attribution table — the A-only / B-only split, 8 entries | **exact** |
| Full-year table — 24 rows, every field incl. day counts and 08:00/08:30/09:00 residues | **exact**, 24/24 rows covered |
| Incremental table — 16 rows at RL48.0 and RL55.75 | **exact**, 16/16 rows covered |
| Comparator-at-peaks table — 21 rows | **every field exact**; `first_contact_RL` also recomputed independently to **0.028 mm** (see below) |

That is every frozen table the page carries — `fullyear`, `incremental`,
`peaks`, `attribution` and `comp_at_peaks` — not a sample of them. The
full-year and incremental checks also assert their own coverage, so a parser
that silently matched nothing would fail rather than pass.

So the geometry is not a reverse-engineering that happens to agree. It is the
release's geometry, at the precision it is stored at.

## What is not established

The engine *implementation*. The reconstruction's solar and shadow code cannot
be compared line by line with the original modules named above. What stands
behind the physics is the independent tests in `tests/` — in particular
`tests/test_sweep_vs_ray.py`, which checks the two shadow paths against each
other over tens of thousands of samples and does not depend on the original
source or on any stored output.

Nor are the receiver levels checked by `diff_original.py`: v1.1-AB carries them
forward from v1.0.2 rather than restating them.

Two further consequences worth stating plainly:

* Any behaviour of the original engine that never showed up in the frozen
  result tables could be absent here and both gates would still pass.
* The frozen figures are **exact areas**; this engine **counts grid cells**.
  The deviations `verify_frozen_peaks.py` reports are sampling quantisation,
  and refining `--cell` drives them toward zero. If a deviation ever stops
  shrinking under refinement, that is a model difference and a finding — not
  something to widen the tolerance for.

## The two first-contact methods

The frozen *offline* `first_contact_RL` table and the frozen *browser*
`firstContactRL()` use different methods, so their values differ: 16 of 21 by
more than 10 mm, worst 0.32 m.

Both sample the receptor on a 20 mm cell-centre grid. The browser takes ray
entry against the true building footprints. The offline table takes it against
the **convex hulls** of building A and the building B plate. A hull is larger
than the footprint it wraps, so the ray meets it sooner and the required RL,
`z + t·tan(alt)`, comes out lower — which is why the offline values are mostly
the lower of the two. Using the hull overstates the comparator's reach, so it
is the conservative choice for a finding that the comparator does not reach.

Reimplementing the hull method reproduces all 21 offline values to
**0.028 mm**. Nothing reported turns on the difference: every value on both
sides sits metres clear of the 46.0–55.75 m comparator family.

## The data file

`data/greville_model_v1.1-AB.json` is the `__MODEL__` literal lifted verbatim
out of the frozen `index.html`. It was not re-derived, re-projected, rounded
or reformatted; it is the same JSON text, extracted and written to disk.

`../verify/diff_original.py` checks it against the sealed release's own
`geometry/` and `outputs/`, and it matches — so the frozen visualiser's
embedded `__MODEL__` is faithful to the release it was built from. The 24 peak
figures in the page are bit-identical to the release's `outputs/peaks.json`,
and every field of the 21-row `comp_at_peaks` table matches the release's
`outputs/comp_at_peaks.json`.

To reproduce the extraction:

```sh
python3 - <<'EOF'
import re
s = open('index.html', encoding='utf-8').read()
js = max(re.findall(r'<script[^>]*>([\s\S]*?)</script>', s), key=len)
for line in js.split('\n'):
    if line.startswith('const __MODEL__ = '):
        raw = line[len('const __MODEL__ = '):].rstrip().rstrip(';')
        open('data/greville_model_v1.1-AB.json', 'w').write(raw + '\n')
        break
EOF
```

## A second derivative, which is not this model

A later interactive study ("Greville Shadow Study") exists as a published
artifact. It shares the solar and sweep code but it is **not** the frozen
model, and its figures are not the frozen figures. It adds casters the frozen
model did not credit — the heritage laundry, the Cluster 1–3 terrace, the
Cluster 4 dwellings — and adding a caster can only reduce a loss figure,
never raise it. It also carries a registered aerial base that the frozen
version deliberately withholds.

Nothing from that study has been merged into this reconstruction. If its
figures are ever to be relied on, it needs its own gate.

## Still withheld, still deliberate

The two layers the root `README.md` names as withheld remain withheld here,
for the same reasons:

1. **Aerial base georeferencing.** No imagery with known georeferencing is
   held. Registering a screenshot by eye would be fabrication.
2. **Fence opacity as a rendered transmission.** The approved 1500 mm metal
   batten fence has no established solar opacity, so `f000` / `f150` / `f180`
   bracket it as discrete cases. A transmission percentage must never be
   invented, and nothing between the brackets has been.

`f180` is a superseded 1.8 m sensitivity case retained only for continuity
with v1.0.2 / v0.1-AB / v0.2-AB. It is **not** the approved condition.

## Status

Class A internal forensic physical model. Not independent expert evidence.
No planning conclusion is offered here.
