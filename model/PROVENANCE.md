# Where this code came from

This directory is a **reconstruction**. It is not the original model source,
and it must never be described as one.

## The chain

| Stage | Status |
|---|---|
| Sealed model archive `greville_shadow_model_v1.1-AB.tar.gz`, SHA-256 `6df4dde6…c76d4f0`, 56,012 bytes | **Held.** Recovered 10 Nov 2026 and hash-identified. Carries the original geometry, receptors, every frozen output, the driver scripts and the preserved-failure set. Its own `MANIFEST.txt` verifies 47/47. |
| Original v1.1-AB driver scripts — `scripts/*.py` in that archive | **Held**, inside the archive above. |
| Original engine modules — `scripts/solar.py` (2,350 B, `e7485ace…`), `scripts/shadow_model.py` (5,728 B, `9360959d…`) | **Not held.** These live in the v1.0.2 archive, which is in no repository and not in Drive. Hash-pinned by the v1.0.2 sealed manifest, but the artefact is absent. |
| v1.0.1 | **Lost**, and documented as lost (R1-077 RG-13). Built, hash-verified out of band, never uploaded. |
| Frozen visualiser `index.html`, SHA-256 `cd551cef…b128f9f`, 67,636 bytes | **Held**, in this repository, unmodified. Contains a JavaScript port of the model that its own comments describe as an "Exact port of v1.0.2 scripts/solar.py", together with the whole frozen result set as `__MODEL__`. |
| `model/` — this directory | Ported back to Python from that JavaScript, then diffed against the sealed archive. |

An earlier revision of this file recorded the archive as "not held, referenced
by hash only" and the original Python as flatly "lost". That was wrong, and it
was wrong in the direction that understated what can be checked. The archive
was in Drive the whole time. Only the two v1.0.2 engine modules are genuinely
unheld, and v1.0.1 genuinely lost.

The code lineage is still Python → JavaScript → Python: every routine here was
written against the frozen JavaScript, function by function, including its
epsilons, its tie-breaking and its float accumulation order. Where the
JavaScript carries an instruction not to "improve" something — the UTC+10
no-DST convention, the absence of a refraction correction — that instruction is
carried over verbatim. What changed on 10 Nov 2026 is not the lineage but the
evidence: the *inputs and outputs* of that chain can now be compared against
the sealed original, rather than only against the page that embedded them.

## What the gates establish

There are two, and they answer different questions.

`verify_frozen_peaks.py` recomputes the frozen figures and compares. Passing it
establishes that **this Python computes what the frozen visualiser computes.**

`../verify/diff_original.py` diffs this reconstruction against the sealed
archive, and refuses to run on an archive that does not hash to
`6df4dde6…c76d4f0`. Passing it establishes that **the data this Python computes
over is the original's data.** Measured:

| Compared against the sealed original | Result |
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
| Offline `first_contact_RL` table, 21 values | reproduced to **0.028 mm** (see below) |

That is every frozen table the page carries — `fullyear`, `incremental`,
`peaks`, `attribution` and `comp_at_peaks` — not a sample of them. The
full-year and incremental checks also assert their own coverage, so a parser
that silently matched nothing would fail rather than pass.

So the geometry is not a reverse-engineering that happens to agree. It is the
original geometry, at the precision it is stored at.

## What is still not established

The engine *implementation*. `scripts/solar.py` and `scripts/shadow_model.py`
are in the v1.0.2 archive, which is not held, so roughly 8 KB of the original
cannot be diffed against anything. The v1.0.2 sealed manifest pins both by
SHA-256, and its own custody warning is the relevant one here: *"Confirm the
archive itself is in Drive before relying on these hashes. A manifest without
its artefact proves nothing."* It is not in Drive. It was checked.

What stands behind the physics is therefore the independent tests in `tests/`,
not either gate — in particular `tests/test_sweep_vs_ray.py`, which checks the
two shadow paths against each other over tens of thousands of samples and does
not depend on the original source at all.

Two further consequences worth stating plainly:

* Any behaviour of the original engine that never showed up in the frozen
  result tables could be absent here and both gates would still pass.
* The frozen figures are **exact areas**; this engine **counts grid cells**.
  The deviations `verify_frozen_peaks.py` reports are sampling quantisation,
  and refining `--cell` drives them toward zero. If a deviation ever stops
  shrinking under refinement, that is a model difference and a finding — not
  something to widen the tolerance for.

## The offline first-contact method, previously an open finding

`model/README.md` and `inverse/` recorded that the frozen *offline*
`first_contact_RL` table was produced by some method that could not be
identified — 16 of its 21 values differed from the browser method by more than
10 mm, worst 0.32 m — and offered a hypothesis: an exact continuous minimum
over the receptor polygon.

**That hypothesis was wrong.** The recovered `scripts/comp_at_peaks.py` settles
it. The offline method is also a 20 mm cell-centre grid, but it takes ray entry
against the **convex hulls** of building A and the building B plate, not their
true footprints. A hull is larger than the footprint it wraps, so the ray meets
it sooner, making `need = z + t·tan(alt)` smaller — which is exactly the
"mostly lower" pattern that was observed and not explained. The original says
so in its own docstring: the hull "OVER-states comparator reach, so a 0.000
result is conservative against us."

Reimplementing that method reproduces all 21 values to **0.028 mm**. The
finding is closed. Nothing reported ever turned on it — every value on both
sides sits metres clear of the 46.0–55.75 m comparator family — but the gap is
now explained rather than open, and the explanation came from the source, not
from fitting to the answer.

## The data file

`data/greville_model_v1.1-AB.json` is the `__MODEL__` literal lifted verbatim
out of the frozen `index.html`. It was not re-derived, re-projected, rounded
or reformatted; it is the same JSON text, extracted and written to disk.

Since 10 Nov 2026 that is no longer only an assertion about how the file was
produced. `../verify/diff_original.py` compares it against the sealed
archive's own `geometry/` and `outputs/`, and it matches — which also settles a
question nobody had been able to ask before: whether the frozen visualiser's
embedded `__MODEL__` is faithful to the archive it was built from. It is. The
24 frozen peak figures in the page are bit-identical to the original's
`outputs/peaks.json`, and the 21-row `comp_at_peaks` table is bit-identical to
the original's `outputs/comp_at_peaks.json`.

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
