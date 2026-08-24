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

## Method

NOAA geometric solar position, UTC+10, no daylight saving, no refraction — the
frozen convention, ported unchanged. Geometry in EPSG:7856 minus the local
origin.

For each sample point the ray toward the sun is clipped against each comparator
ring by half-plane intersection. The rings are convex, so the clip is exact and
there is no sampling along the ray; the entry distance gives the height a prism
must reach to cast that far. The minimum over the receptor is the first-contact
RL. The year map samples the receptor at 0.50 m, the instant panel at 0.05 m.

## The open finding, stated on the page

This reproduces the frozen **browser** method — a minimum over grid sample
points. The frozen **offline** `first_contact_RL` table was produced some other
way: 16 of its 21 values differ by more than 10 mm, worst 0.32 m, and refining
the cell does not close the gap, so it is a difference in method rather than in
sampling. The original method is lost and has not been reconstructed by fitting
to its answers.

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
