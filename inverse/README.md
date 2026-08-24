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

**The site panel**, underneath, on the registered aerial. The dashed line runs
from the point of lowest requirement in the receptor, toward the sun, to where
it first enters a comparator envelope — the distance that sets the number.

## The aerial base — a change of posture, stated

The root `README.md` lists the aerial base map as a **deliberately withheld
layer**, on the grounds that the imagery was supplied inline in chat with no
pixels to georeference. That withholding was correct for the frozen page and
still holds there: `../index.html` has no base map and is untouched.

This page carries one, and the reason it can is that a registration was
actually performed rather than eyeballed. The frame is a Mapbox satellite
screenshot, registered north-up in Web Mercator to a georeferenced Queensland
Government GeoTIFF by FFT cross-correlation, then reprojected to MGA2020, at
0.3764 m native ground sample distance. It is drawn at 0.4 m in the local
frame.

The registration was checked before use, not assumed: with the model geometry
overlaid, the four Type G footprints land on the four townhouses, the Cluster
1–3 terrace on the long row to the west, the heritage laundry on the
red-roofed range, and both approved buildings on their cleared construction
sites.

Three things about it are load-bearing and are stated on the page itself:

1. **It is photography, not drawn geometry.** Nothing is measured off it. Every
   number on the page comes from the vector model; the aerial is a base map.
2. **It predates construction.** The approved buildings are drawn over ground
   that was still bare when the frame was taken.
3. **Attribution and licensing.** © Mapbox © OpenStreetMap. The root README
   flags a licensing question over a Mapbox screenshot; that question is not
   resolved by this page, only carried forward with the attribution shown.

The second withheld layer — fence opacity as a rendered transmission — remains
withheld. It is still bracketed as `f000` / `f150` / `f180`, never
interpolated.

## The aerial base — a change of posture, stated rather than slipped in

The root `README.md` lists the aerial base map as a **deliberately withheld
layer**, on the grounds that the imagery arrived inline in chat with no pixels
to georeference, and that *"registering a screenshot by eye would be
fabrication."* That reasoning was right, and it still is.

This page carries an aerial anyway, because the objection was met. The frame
was subsequently registered by **FFT cross-correlation against a georeferenced
Queensland Government GeoTIFF**, then reprojected Web Mercator → MGA2020 — a
measured registration, not an eyeball fit. Its native ground sample distance is
0.3764 m, resampled to 0.4 m in the local frame.

The registration was re-checked before the imagery went in here, by drawing the
independent DCDB and sheet-derived geometry over it: the four Type G footprints
land on the four townhouses, the Cluster 1–3 terrace on the long terrace row,
the heritage laundry on the red-roofed range, and both approved buildings on
their cleared sites. It holds.

Three limits ride with it, and the page says all three on its face:

1. **It is photography, not drawn geometry.** Roads, trees, the park, the
   church, the rail corridor and neighbouring houses are pixels. Nothing is
   measured off the image; every number on the page comes from the vector
   geometry and the frozen model.
2. **It predates construction.** The approved buildings are drawn over ground
   that was still bare when the frame was taken, so their outlines are the
   approved footprints, not something visible in the photograph.
3. **The licensing question is still open.** The frame is a Mapbox satellite
   screenshot. `© Mapbox © OpenStreetMap` is displayed on the panel, as the root
   README's own note requires, but attribution is not a licence. If this
   material is ever put in front of the court or published, the imagery should
   be re-sourced from a tile with an unambiguous licence and its own world file
   — a QImagery or Brisbane City Council orthophoto — rather than relied on as
   it stands.

The frozen `../index.html` is unaffected and still carries no base map.

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
