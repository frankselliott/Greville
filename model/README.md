# The Greville shadow model, in Python

A dependency-free reconstruction of the frozen **v1.1-AB** overshadowing model
for Greville Stage 5, Wooloowin — lots 60–63 SP354191.

Read [`PROVENANCE.md`](PROVENANCE.md) first. It says where this came from,
and it is the part that matters: the original model source is lost, and this
is a port back from the JavaScript inside the frozen visualiser.

## Why it exists

`index.html` in this repository is a frozen artifact that must not change.
That made it the only surviving executable form of the model — a 67 KB page
that has to be opened in a browser to run, and cannot be imported, scripted,
tested or diffed. This directory makes the same model available as ordinary
Python without touching the frozen page.

Nothing outside `model/` was modified. `index.html` still hashes to
`cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f`.

## Layout

```
model/
  greville_model/
    solar.py          NOAA geometric solar position, UTC+10, no DST, no refraction
    geometry.py       point-in-polygon, ray-segment, receptor gridding
    shadow_model.py   the Minkowski sweep (display) and ray occlusion (areas)
    model.py          receptors, casters, the loss calculation, the inverse
  data/
    greville_model_v1.1-AB.json    __MODEL__, lifted verbatim from index.html
  verify_frozen_peaks.py           the QA gate
  PROVENANCE.md
```

Python 3.8+. No third-party packages.

## What the model measures

For one receptor — a lot's private open space — one fence case and one instant:

1. Sample the receptor polygon at the receiver RL.
2. Remove every sample already shaded by a Stage 5 dwelling or by the lot's own
   boundary fence. What remains is the **otherwise sunlit** area.
3. Of that remainder, count what the approved Sorella buildings shade. That is
   the **loss**.

Step 2 is not a refinement. Without it every figure is overstated, because
ground that was never going to see the sun is counted as taken.

Two receptor definitions are carried, and they are not interchangeable:
`yard` is the mapped backyard, `sched` the scheduled ~35 m² private open space.

Three fence cases bracket an opacity the source does not establish:

| case | height | what it is |
|---|---|---|
| `f000` | — | optically open; the lower shadow bound |
| `f150` | 1.5 m | fully opaque; the upper shadow bound |
| `f180` | 1.8 m | superseded sensitivity, **not** the approved condition |

The approved fence is 1500 mm metal batten. Nothing between the brackets has
been invented, and a transmission percentage must never be.

## Usage

```python
from greville_model import load
from greville_model.model import parse_instant

m = load()
r = m.evaluate_at('yard', '63SP354191', 'f000',
                  parse_instant('2026-01-11T07:20:00'), cell=0.02)

r['otherwise_sunlit']   # 32.2952 m² — what the sun could have reached
r['loss']               # 32.2952 m² — what the approved buildings take
r['a_loss'], r['b_loss']  # the attribution split
```

Pass `comparator_rl=` to get `comparator_loss` and `incremental` against the
bounded eight-storey family. The 2020 approval fixed height as a storey count
only — no top RL appears in any source — so `comparator` is a bounded family at
RL 46.0 / 48.0 / 50.0 / 52.0 / 55.75, of which 48.0 is the true eight-storey
plate. It is never the applicant's model and must not be described as one.

### The inverse

`Model.first_contact_rl(pos, lot, alt, az)` runs the calculation backwards: not
"what does this envelope take", but "how high would an envelope have to be to
take anything at all from this receptor, at this instant". The ray from each
sample point is clipped against each comparator ring by half-plane
intersection — the rings are convex, so the clip is exact with no sampling
along the ray — and the entry distance gives the height needed to reach that
far. The smallest such height over the receptor is the answer.

## The QA gate

```sh
cd model
python3 verify_frozen_peaks.py            # frozen 0.02 m cell, ~2 min
python3 verify_frozen_peaks.py --sweep    # convergence as the cell refines
```

It recomputes the frozen result tables and compares. Two thresholds are in
play and the output distinguishes them. `0.001 m²` is the **frozen browser
gate** — the deviation the visualiser's own engine was held to; rows outside it
are marked `>gate`. `0.0013 m²` is the **measured fidelity** of this
reconstruction: the largest deviation it has ever actually shown. The exit
status keys off the second, so a genuine regression fails while known
quantisation does not. That number is recorded, not chosen — raising it to make
a new figure pass would defeat the file.

Current state at the frozen 0.02 m cell:

| check | result |
|---|---|
| Solar position, 21 recorded instants | all within 1e-9° |
| Full-year peaks, 24 entries | 22/24 inside the browser gate, worst 0.0012 m² (23/24 at 0.01 m) |
| Peak instants — loss and otherwise-sunlit | worst 0.0012 m² |
| A/B attribution split | worst 0.0010 m² |

The frozen figures are exact areas; this engine counts grid cells, so those
deviations are sampling quantisation. `--sweep` shows it: at 0.05 m only 8 of
24 land inside 0.001 m², at 0.02 m 22 do, at 0.01 m 23.

Read that table per case, not by its maximum. Each individual deviation falls
toward zero under refinement, but the maximum over 24 entries does not move
monotonically — a finer grid re-aligns against the receptor boundary and one
entry can get slightly worse while the rest improve. That is why the gate
reports every row rather than a single number.

A deviation that stops shrinking **for its own case** is a model difference,
and a finding. **Do not widen the tolerance to make a figure pass.**

## An open finding

The inverse does **not** reproduce the frozen offline `first_contact_RL`
table. 16 of 21 recorded values disagree by more than 10 mm, worst 0.32 m, and
refining the cell does not close the gap — so this is a genuine difference in
method, not sampling.

The Python here is a faithful port of the frozen *browser* implementation
(`firstContactRL()` in `index.html`), which samples the receptor on a grid and
takes the minimum over sample points. The frozen *offline* table appears to
have been produced some other way — its values are mostly lower, which is what
an exact continuous minimum over the receptor polygon would give, rather than a
minimum over cell centres. That is a hypothesis, and it has not been adopted:
the original method is lost and reconstructing it by fitting to the answer
would be fabrication.

**Nothing reported turns on this.** Every first-contact RL on both sides sits
around 57–62 m, well clear of the comparator test family's 46.0–55.75 m — so
the frozen conclusion that no comparator in the range reaches those backyards
at the governing instants holds either way, with metres of margin. The two
values that fall below the family (37.76 and 39.50) are below it on both sides.
The disagreement is between two frozen artifacts, and it is recorded here so
that it is not discovered later and mistaken for drift.

## Status

Class A internal forensic physical model. **Not independent expert evidence.**
No planning conclusion is offered here.
