# Greville Shadow Study

`index.html` here is the interactive study — the isometric scene on the
registered block drawing, the plan, the hour-by-hour day chart and the per-lot tiles,
all driven off one clock.

Open it directly. The page itself carries its fonts, its data and its base
raster inline and needs no server and no network — but it is no longer a single
self-contained file. Two features load sibling files by relative path:

* the applicant-diagram overlay reads `ellivo/*.png`;
* the method panel links `download/greville-verification-pack.tar.gz`.

Both work from `file://` so long as the whole `study/` directory travels
together. `index.html` on its own still opens and still computes; the overlay
dropdown simply finds nothing to load.

## What this is not

**This is not the frozen v1.1-AB result set, and its figures are not the frozen
figures.** The frozen model lives in `../index.html` and its numbers are the
ones that have been gated. This study shares the solar and sweep code but
models more of the site than the frozen model credited:

* the eight Type F dwellings of Cluster 4 and their gardens, derived from the
  stamped unit sheets rather than traced;
* the Cluster 1–3 terrace continuing west, outlined from the orthophoto;
* the heritage laundry, segmented from the orthophoto with an assumed ridge.

Every one of those is an additional caster. Adding a caster can only *reduce* a
loss figure, never raise it — so where they intercept, the number here falls
below the frozen peak. The page says so itself, and the frozen model's own
figures are unaffected.

Two further differences from the frozen page:

* It carries a registered base drawing: cadastre, building outlines, roads
  and rail, © State of Queensland (CC BY 4.0). It is a drawing, not
  photography; the frozen page carries no base map at all.
* Its live areas recompute at a coarser cell than the frozen gate, so live
  readouts differ in the third decimal.

## Shade in 3D

The Study drew shade where it *lands* — the ground print. The **Shade in 3D**
toggle adds the body of shade in the air on the way down: for each silhouette
edge of a caster, the ruled surface running from the roof edge to the matching
edge of the ground shadow.

This draws the model, it does not add to it. The ground edge is the footprint
translated by `(top_rl - ground) / tan(altitude)` along the anti-solar bearing —
the same sweep the frozen engine uses, and the same one the ground shadow
already came from. No new geometry, no new assumption, and no figure anywhere
on the page changes when the toggle is on.

Everything is filled in one path with nonzero winding, so overlapping curtains
never double-darken and no depth sort is needed.

## Provenance

Extracted from the published artifact. Four things changed. The first three are
not content:

1. the artifact host's frame runtime and its `<base href>` were removed;
2. the Google Fonts `<link>` was replaced with the same faces embedded as
   base64 WOFF2, so the page keeps working from `file://` with no network;
3. `<title>` was lifted into `<head>` and a `noindex` meta added.

The fourth is an addition, so this page is **no longer byte-identical to the
artifact**: the Shade in 3D toggle described above. It is drawn from the sweep
the page already computes and changes no figure. The frozen visualiser at
`../index.html` is untouched and still hashes to
`cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f`.

Fonts are Instrument Serif, Karla and IBM Plex Mono, all OFL-1.1, which permits
embedding. See `../inverse/README.md` for the weights.

## Status

Class A internal forensic physical model. **Not independent expert evidence.**
No planning conclusion is offered here.
