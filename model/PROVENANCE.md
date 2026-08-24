# Where this code came from

This directory is a **reconstruction**. It is not the original model source,
and it must never be described as one.

## The chain

| Stage | Status |
|---|---|
| Original Python — `scripts/solar.py`, `shadow_model.py`, v1.0.2 then v1.1-AB | **Lost.** Held in no repository. |
| Frozen model archive `greville_shadow_model_v1.1-AB.tar.gz`, SHA-256 `6df4dde6…c76d4f0`, 56,012 bytes | **Not held.** Referenced by hash only. |
| Frozen visualiser `index.html`, SHA-256 `cd551cef…b128f9f`, 67,636 bytes | **Held**, in this repository, unmodified. Contains a JavaScript port of the model that its own comments describe as an "Exact port of v1.0.2 scripts/solar.py", together with the whole frozen result set as `__MODEL__`. |
| `model/` — this directory | Ported back to Python from that JavaScript. |

So the lineage is Python → JavaScript → Python, with the middle link the only
one that survives. Every routine here was written against the frozen
JavaScript, function by function, including its epsilons, its tie-breaking and
its float accumulation order. Where the JavaScript carries an instruction not
to "improve" something — the UTC+10 no-DST convention, the absence of a
refraction correction — that instruction is carried over verbatim.

## What the QA gate does and does not establish

`verify_frozen_peaks.py` recomputes the frozen figures and compares. Passing
it establishes one thing: **this Python computes what the frozen visualiser
computes.** It does not establish that either matches the original v1.1-AB
Python, because that source is gone and cannot be diffed. The frozen result
tables are the only witness, and they are a witness to outputs, not to code.

Two consequences worth stating plainly:

* Any behaviour of the original that never showed up in the frozen result
  tables could be absent here and the gate would still pass.
* The frozen figures are **exact areas**; this engine **counts grid cells**.
  The deviations the gate reports are sampling quantisation, and refining
  `--cell` drives them toward zero. If a deviation ever stops shrinking under
  refinement, that is a model difference and a finding — not something to
  widen the tolerance for.

## The data file

`data/greville_model_v1.1-AB.json` is the `__MODEL__` literal lifted verbatim
out of the frozen `index.html`. It was not re-derived, re-projected, rounded
or reformatted; it is the same JSON text, extracted and written to disk.

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
