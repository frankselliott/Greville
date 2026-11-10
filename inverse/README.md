# The envelope inverse

`index.html` in this directory is a second visualiser, alongside the frozen one
at the repository root. It asks the model's question backwards.

The frozen visualiser asks: **what do the approved buildings take** from these
backyards. This one asks: **how tall would something have to be** to reach this
ground at all, at this moment? That height is the *first-contact RL*, and where
it sits above the bounded comparator family, nothing in that family reaches.

## What it does not do

It does not restate, recompute or alter a single frozen forward figure. The
losses, the peaks and the otherwise-sunlit areas are finalised and live in the
frozen `../index.html`, which is untouched and still hashes to
`cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f`.

This page embeds the same `__MODEL__` data verbatim and computes only the
inverse from it. Like the frozen page it is fully self-contained: it opens from
`file://` with no server, no network and no external fonts.

## What it shows

**The year map.** Every day of 2026 across, every five minutes of daylight
(04:00–19:00) down, coloured by the lowest first-contact RL anywhere in the
receptor at that moment. Bands are the comparator family — 46.0, 48.0, 50.0,
52.0, 55.75 — with everything above 55.75 in one "beyond the family" tone.
Click any cell to go to that instant.

The empty lower half is not wasted space. It is the result: for every lot, on
every day of the year, the requirement only ever falls inside the comparator
family in the morning — the page measures and states the window rather than
asserting it — and never once in the afternoon.

**The instant panel.** The receptor at the selected moment, shaded by the
required RL point by point, lighter where less height is needed. Where a family
threshold falls inside the range at that instant it is drawn as a white
contour. The circle marks the point of lowest requirement, with the bearing to
the sun.

**The ladder.** Each member of the comparator family, whether it reaches, and
by what margin.

**The site panel**, underneath, drawn from the model's geometry. The dashed line runs
from the point of lowest requirement in the receptor, toward the sun, to where
it first enters a comparator envelope — the distance that sets the number.

## No base imagery

The site panel is drawn geometry only — the cadastre, the approved buildings,
the comparator envelopes and the receptors — from the model's own MGA2020
coordinates, north up. Like the frozen `../index.html`, this page carries no
aerial or satellite base map. Every number on it comes from the vector model.

Fence opacity as a rendered transmission also remains withheld. It is
bracketed as `f000` / `f150` / `f180`, never interpolated.

## Typography and fonts

The page uses the same design language as the Greville Shadow Study — Instrument
Serif for display, Karla for text, IBM Plex Mono for labels and figures, on the
Study's night palette.

Those three faces are **embedded in the page as base64 WOFF2**, latin subsets
only, rather than linked from Google Fonts. That is deliberate: the page has to
keep opening from `file://` with no network, exactly like the frozen one, and a
linked stylesheet would break that. Karla is a variable font and is embedded
once for the whole 300–700 range rather than three times.

All three are licensed under the SIL Open Font License 1.1, which permits
embedding and redistribution:

| Face | Weights embedded | Licence |
|---|---|---|
| Instrument Serif | 400 | OFL-1.1 |
| Karla (variable) | 300–700 | OFL-1.1 |
| IBM Plex Mono | 400, 500 | OFL-1.1 |

The embedded fonts are about 110 KB of the page's total.

## Method

NOAA geometric solar position, UTC+10, no daylight saving, no refraction — the
frozen convention, ported unchanged. Geometry in EPSG:7856 minus the local
origin.

For each sample point the ray toward the sun is clipped against each comparator
ring by half-plane intersection. The rings are convex, so the clip is exact and
there is no sampling along the ray; the entry distance gives the height a prism
must reach to cast that far. The minimum over the receptor is the first-contact
RL. The year map samples the receptor at 0.50 m, the instant panel at 0.05 m.

## The finding stated on the page, now explained

This reproduces the frozen **browser** method — a minimum over grid sample
points. The frozen **offline** `first_contact_RL` table was produced another
way: 16 of its 21 values differ by more than 10 mm, worst 0.32 m, and refining
the cell does not close the gap, so it is a difference in method rather than in
sampling.

The offline table is *also* a 20 mm cell-centre grid, but it takes ray entry
against the **convex hulls** of building A and the building B plate rather
than their true footprints. A hull is larger, so the ray meets it sooner and
the required RL comes out lower, which is the observed pattern. Reimplementing
it reproduces all 21 values to 0.028 mm; `../verify/diff_original.py` runs the
check.

Nothing reported turns on it. Every value on both sides is metres clear of the
46.0–55.75 m family. See `../model/README.md` for the numbers.

## Checking it

The page's JavaScript and the Python in `../model/` are independent
implementations of the same inverse, and they agree. To confirm:

```sh
cd ../model
python3 -c "
from greville_model import load
from greville_model.model import parse_instant
m = load()
print(m.first_contact_rl_at('yard','63SP354191',parse_instant('2026-01-11T07:20:00'),cell=0.05))"
```

That should match the RL the page reports for lot 63, yard, at 11 Jan 07:20.

## Status

Class A internal forensic physical model. Not independent expert evidence. No
planning conclusion is offered here.

The access posture in the root `README.md` applies to this page too: `noindex`
and `robots.txt` are not access control.
