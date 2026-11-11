# Greville shadow visualiser — hosting repository

This repository serves the frozen evidentiary visualiser at the root, and
alongside it the Shadow Study (`study/`), the envelope inverse (`inverse/`),
the reconstructed model (`model/`), the verification pack (`verify/`) and open
map context (`context/`). Each has its own README. **The frozen visualiser and
its mirror must never be edited**; everything else is versioned work around it.

## What is served

`index.html` at the repository root is the interactive evidentiary visualiser,
byte-for-byte as frozen:

| Property | Value |
|---|---|
| SHA-256 | `cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f` |
| Size | 67,636 bytes |

It is fully self-contained: it opens from `file://` with no server and no
network access.

The root copy is byte-identical to `nrltipping-greville/public/index.html`.
Both must verify to the hash above.

## Provenance

The frozen deployment package was reassembled from five parts and verified
before anything was committed:

| Property | Value |
|---|---|
| Archive | `greville_cloudflare_deploy.tar.gz` |
| SHA-256 | `176e0118f587d6855dcb56a1d10d113f44546a700f9df6db720be8448bac4dc2` |
| Size | 21,682 bytes |

`nrltipping-greville/` is that package unpacked and unmodified, retained so the
Cloudflare route can be completed later without re-deriving anything.

The visualiser displays the frozen model archive
`greville_shadow_model_v1.1-AB.tar.gz`, SHA-256
`6df4dde6b3f11a087c8dea33d8b4e3da9609f4237f9e6c3740ffc54d2c76d4f0`,
56,012 bytes. It does not recompute or alter any frozen result.

QA gate: the browser engine was checked against all 24 frozen full-year peaks
(2 POS × 3 fence × 4 lots) at 0.02 m cell — 24/24 pass, maximum deviation
0.001 m².

## Verifying what is actually served

```
curl -sS https://<pages-url>/ | sha256sum
# MUST equal cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f
```

`.nojekyll` is present so GitHub Pages serves the file verbatim rather than
passing it through Jekyll. It must not be removed; without it byte-identity is
not guaranteed.

## Withheld layers — deliberate, do not quietly fill in

1. **Aerial base map.** The imagery was supplied inline in chat rather than as
   files, so there are no pixels to georeference to EPSG:7856. The base map is
   authoritative DCDB cadastral geometry only. Registering a screenshot by eye
   would be fabrication. To unblock, the imagery must be re-supplied as file
   uploads, ideally from a source with known georeferencing (a QImagery or
   Brisbane City Council orthophoto tile with its world file) rather than a
   Mapbox screenshot, which also carries a watermark and a licensing question.
2. **Fence opacity as a rendered transmission.** Approved Stage 5 fencing is
   bracketed as three discrete cases (f000 / f150 / f180) because metal-batten
   solar opacity is not established by the source. A transmission percentage
   must never be invented.

## Known incomplete

Compare/swipe: state handles `off` / `swipe` / `diff` in the shadow-draw path,
but the draggable split-divider UI is not built. This is the only unfinished
feature.

## Presentation-only limitations

Custom canvas projection; painter's-algorithm depth sort with no z-buffer
(appearance only — areas come from the verified engine); live areas recompute
at 0.05 m cell against the gate's 0.02 m, so live readouts differ in the third
decimal.

## Access control

This repository is public, and GitHub Pages serves it on an open URL with no
access control, by choice: the material is meant to be checked.

The Study and inverse pages carry a `noindex` tag, so search engines leave them
out. The frozen visualiser cannot carry one without changing its hash, and the
`robots.txt` here is served under `/Greville/`, where crawlers do not look, so
it has no effect. The frozen page can therefore appear in search results.
Neither measure is access control.

## Status

The visualiser is not expert-certified and carries no planning conclusions.
