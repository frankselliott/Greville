# Greville Shadow Study

`index.html` here is the interactive study — the isometric scene on the
registered aerial, the plan, the hour-by-hour day chart and the per-lot tiles,
all driven off one clock.

Open it directly. Like the frozen visualiser it is fully self-contained: no
server, no network, no external fonts.

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

* It carries the registered aerial base. `../README.md` lists that as a
  withheld layer; the reasoning for carrying one here is set out in
  `../inverse/README.md`.
* Its live areas recompute at a coarser cell than the frozen gate, so live
  readouts differ in the third decimal.

## Provenance

Extracted verbatim from the published artifact. Only three things changed, none
of them content:

1. the artifact host's frame runtime and its `<base href>` were removed;
2. the Google Fonts `<link>` was replaced with the same faces embedded as
   base64 WOFF2, so the page keeps working from `file://` with no network;
3. `<title>` was lifted into `<head>` and a `noindex` meta added.

Fonts are Instrument Serif, Karla and IBM Plex Mono, all OFL-1.1, which permits
embedding. See `../inverse/README.md` for the weights.

## Status

Class A internal forensic physical model. **Not independent expert evidence.**
No planning conclusion is offered here.
