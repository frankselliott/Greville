# /visual — build plan and milestone status

The interactive 3D visual-amenity viewer for the Greville site (development application A006835434, Planning and Environment Court appeal 2862/2026). It is an **investigative technical tool**, not expert evidence, and it reaches no planning conclusion.

## Status keys and rules

- **Status keys:** NOT STARTED, IN PROGRESS, DONE, BLOCKED.
- **No dates.** There are no dates or time estimates.
- **What "PASS" means:** a gate reads PASS only when the named test actually ran and passed in this repository; the run is recorded in `QA.md`.

**Protected, never edited:**
- `index.html` (root) and `nrltipping-greville/public/index.html`, SHA-256 `cd551cef…b128f9f`;
- `study/`, `model/`, `verify/`, `context/`, `inverse/`, `tools/`, root `README.md`, `.nojekyll`, `robots.txt`.

`visual/tools/check_protected.py` compares every tracked file outside `visual/` with the baseline recorded at M0.

---

## M0 — Repository and source audit — **DONE**

**Depends on:** nothing.

**Outputs:**
- this plan;
- `SOURCE_REGISTER.md`;
- `QA.md`;
- `tools/protected_baseline.sha256`, the SHA-256 of all 84 tracked files outside `visual/` at base commit `86c7a2c`;
- `tools/check_protected.py`.

**Findings:**
- **Default branch.** `claude/new-session-hmmz55` (GitHub repository metadata, 21 Nov 2026). The repository is **public**, `has_pages: true`, with no workflow directory, so Pages is branch-published.
- **Pages source.** The exact source branch and folder cannot be read: the Pages API path and `*.github.io` are both refused by this build environment's network proxy. The site is served under the `/Greville/` path, so `visual/` must work under any sub-path. Only relative URLs are used.
- **No `visual/` directory** existed at base.
- **Frozen hashes.** Root and mirror `index.html` = `cd551cef…b128f9f` (verified before any edit).
- **No JavaScript build system.** No `package.json`, no bundler. The existing pages are hand-written static HTML, so `visual/` follows the same pattern: static ES modules plus a vendored Three.js. No build step is needed to publish.
- **Existing tests.** `model/run_tests.py` (Python, ~2 min). It was run at M0 as a regression baseline; the result is in `QA.md`.
- **`model/` is the shadow model.** Its approved geometry and comparators are a *different source family* from the visual massing (`model/PROVENANCE.md`). It is **not reused** here.
- **Visual source geometry** is the VA2 visual scene (`scene_dump_v2.json`) and the VA4 corrective archive. Both are held in the project's private archive and were hash-verified against it (`SOURCE_REGISTER.md`). Only derived numeric massing is published; no drawing, photograph or private document is copied.

**Gates:**

| Gate | Test | Result |
|---|---|---|
| G0.1 | Frozen root and mirror hash = `cd551cef…` before edits | PASS (sha256sum at base `86c7a2c`) |
| G0.2 | Protected baseline list written (84 files) | PASS |
| G0.3 | Source files located and hash-matched to the archive manifests | PASS (`SOURCE_REGISTER.md` §2) |
| G0.4 | Existing `model/run_tests.py` baseline recorded | PASS (QA Q0.3) |

## M1 — Geometry pipeline — **DONE**

**Depends on:** M0.

**Outputs:**
- `tools/build_assets.py`: reads the hash-pinned VA2 scene and the VA4 archive, and writes `assets/scene.json`, `assets/controls.json` and `assets/manifest.json`;
- `js/coords.js`.

**Gates:**

| Gate | Test |
|---|---|
| G1.1 | The build refuses any source whose SHA-256 differs from the pinned value |
| G1.2 | Every displayed prism belongs to exactly one manifest collection with an evidence status. No collection mixes families (SK and REC/CUT are never combined). |
| G1.3 | The MGA↔local round trip is exact; the local↔Three.js axis map is a proper rotation (det +1, north → −Z, up → +Y) |
| G1.4 | Preset eye RLs: NG55/57/59 = DEM + 1.60 m within 0.02 m; W01 = 24.92 (stated, an assumption) |
| G1.5 | Regression against the private archive: E1 SK48 / E2 B-plate elevation-angle envelopes at NG55/57/59 reproduce the archived values (66.3–67.3° / 71.5–72.1°) within 0.2° |
| G1.6 | Asset hashes in the manifest equal the files on disk |

**M1 results** (QA Q1.x): G1.1–G1.6 **PASS**. The build refuses unpinned sources and asserts the VA4 ARTW/POD prisms equal the archived Part D run. NG55 / 57 / 59 eye RL = DEM + 1.6 to within 0.005 m. Envelopes: NG57 E1 67.33° / E2 72.09° (archive 67.3 / 72.1); NG55 66.32 / 71.48 (66.3 / 71.5); NG59 67.10 / 71.91 (67.1 / 71.9). 477 prisms; 628 controls; one family per scenario.

## M2 — Working 3D viewer — **DONE**

**Depends on:** M1.

**Outputs:**
- `index.html`;
- `css/`;
- `js/main.js`, `camera_model.js`, `scene_build.js`, `controls.js`;
- `vendor/three/` (pinned r160.1, MIT).

**Gates:**

| Gate | Test |
|---|---|
| G2.1 | A real WebGL depth-buffered render; a near prism occludes a far one (Playwright pixel probe) |
| G2.2 | Camera convention identical to the source tools: the JS projection of 3D points equals the Python reference (`adr_core.project`) within 1e-6 px |
| G2.3 | Presets W01 / NG55 / NG57 / NG59 load the exact E/N/RL/heading/HFOV/shift; HUD readout matches |
| G2.4 | Look-around, zoom (FOV), eye up/down, local movement and reset work by mouse, keyboard and touch (Playwright desktop and mobile emulation) |
| G2.5 | Station mode refuses movement into a solid prism and beyond the local radius. The free/overview camera is labelled NONPHYSICAL. |

**M2 results** (QA Q2.x): G2.1–G2.5 **PASS**.
- **Independent renderer:** WebGL tower silhouettes against the archived VA2 ray-caster give IoU 0.99965 (W01 E1), 0.99968 (W01 E2) and 1.00000 (NG57 E1 and E2, roofline frame).
- **Projection:** JS equals the archived Python to 1e-6 px.
- **Presets:** exact.
- **Controls:** mouse, keyboard and touch (iPhone 13 emulation) all work.
- **Collision:** a point inside townhouse mass C5-57 is refused in station mode and accepted in free mode.

## M3 — Historical versus approved comparison — **DONE**

**Depends on:** M2.

**Outputs:** `js/scenarios.js` and `js/compare.js`, providing:
- an instant toggle;
- side-by-side;
- aligned swipe;
- proposed-only and historical-only mask overlay, with frame-limited solid-angle readout.

**Gates:**

| Gate | Test |
|---|---|
| G3.1 | For every preset, at desktop and mobile viewport, `matrixWorld`, `projectionMatrix`, the frame size and every camera parameter are bit-identical before and after every scenario switch |
| G3.2 | Each scenario shows exactly its manifest prism set (a scene-graph audit) |
| G3.3 | The side-by-side panels and the swipe halves use one camera object (identical matrices) |
| G3.4 | The mask overlay is computed from depth-tested renders. The added-area measure equals the sum of pixel solid angles (unit test against the analytic pinhole formula). |

**M3 results**: G3.1–G3.4 **PASS**.
- **Invariance:** 4 presets × 11 switches × (desktop 1400 × 900, Pixel 7) all hold, with camera, matrices, frame and canvas identical.
- **Mask readout:** at NG57 (pitch 40°, HFOV 100°), the top elevation is 67.25° → 72.06°, consistent with the archive envelopes.
- **Solid angle:** the analytic solid-angle check is within 2e-4.

## M4 — Perspective matching (external image) — **DONE**

**Depends on:** M3.

**Outputs:** `js/match.js` and `js/fit.js`, providing:
- local image import (no network);
- SHA-256 and pixel size;
- manual camera controls;
- landmark picking against the control library;
- robust fit (a port of the archived camera-fit core);
- residuals, leave-one-out, standard errors, grade;
- alternatives;
- ambiguity flags.

**Gates:**

| Gate | Test |
|---|---|
| G4.1 | The imported image bytes are hashed in the browser and never transmitted. The Playwright run fails if any non-local request occurs. |
| G4.2 | A synthetic known camera with ≥ 10 well-spread controls is recovered (position < 0.10 m, angles < 0.1°, RMS < 0.5 px with 0.3 px noise). The JS fit agrees with the Python archive fit. |
| G4.3 | A coplanar / single-façade or fewer-than-8-point control set is flagged UNDERDETERMINED even when RMS is low |
| G4.4 | After a fit, the E1/E2 switch keeps the fitted camera exactly (as G3.1) |
| G4.5 | The same-station framing comparison (HFOV and pitch panels) renders identical geometry with labelled framing |

**M4 results**: G4.1–G4.5 **PASS**.
- **Image privacy:** the image SHA-256 is computed in the browser and equals the Node SHA-256, with zero non-local requests.
- **Archived fixtures:** synthetic recovery in Node gives ng57_up / w01_shift position errors < 0.10 m, agreeing with the archived Python within 0.02 m.
- **In-browser synthetic:** 16 points, < 0.10 m, RMS < 0.6 px.
- **Ambiguity flags:** 5 exact pairs give UNDERDETERMINED / FEW_POINTS, and a single-façade set gives COPLANAR + SUBJECT_ONLY.
- **Fitted camera:** it survives the E1/E2 toggles unchanged.
- **Not done:** automatic landmark detection. Matching is manual picking plus a least-squares fit; this is deliberate, so that the fit is never silently "verified".

## M5 — Forensic exports and automated QA — **DONE**

**Depends on:** M4.

**Outputs:**
- `js/export.js`: a PNG plus JSON sidecar;
- `version.json`;
- `tests/` (Node unit tests and Playwright e2e);
- `tools/run_all_tests.sh`.

**Gates:**

| Gate | Test |
|---|---|
| G5.1 | The JSON records the camera, MGA E/N/RL, h/p/r/HFOV/principal point, frame, scenario plus model version, asset hashes, app file hashes, version and build commit, source-image hash, assumptions, classification and fit residuals |
| G5.2 | The SHA-256 of the PNG bytes in the JSON equals the downloaded PNG. Re-rendering from the JSON state gives an identical PNG (same machine). |
| G5.3 | Protected files are unchanged (`check_protected.py`); `/study/` and the root viewer still load (Playwright) |
| G5.4 | No absolute-root or external URLs; the page works from a sub-path |

**M5 results**: G5.1–G5.4 **PASS**.
- **Export:** the PNG SHA-256 recorded in the JSON equals the downloaded PNG. Two consecutive exports are byte-identical (same machine and GPU path).
- **Frame size:** the PNG is 1800 × 1200, as the frame.
- **Labels:** the forbidden labels are absent.
- **Protected files:** unchanged.
- **Existing pages:** the root viewer is served byte-identical (`cd551cef…`) and `/study/` loads without errors under `/Greville/`.

## M6 — Deployment and verification — **DONE except G6.3 (BLOCKED: needs the owner's merge and network access)**

**Depends on:** M5.

**Outputs:**
- the feature branch `claude/visual-viewer`, pushed;
- a draft PR against the default branch;
- preview instructions;
- this plan, final.

**Gates:**

| Gate | Test |
|---|---|
| G6.1 | The full test suite passes on the final commit |
| G6.2 | The branch is pushed and the PR opened |
| G6.3 | The live `/Greville/visual/` URL serves the new page. This needs the PR merged to the Pages branch by the repository owner, and network access to `*.github.io` to verify. |

**M6 results:**
- **G6.1 — PASS.** The full suite passes on commit `8ac93d8`: protected check PASS, unit 11/11, e2e 15/15.
- **G6.2 — PASS.** Branch `claude/visual-viewer` pushed; draft PR #26 opened against `claude/new-session-hmmz55`.
- **G6.3 — BLOCKED.**
  - **Why.** The live URL needs the PR merged into the Pages source branch, which is the repository owner's decision; nothing has been merged automatically. Checking the deployed page also needs `*.github.io`, which this build environment's proxy refuses.
  - **After merge, verify with:**
    - `curl -sS https://frankselliott.github.io/Greville/` returns the frozen root page, whose SHA-256 should equal `cd551cef…`;
    - `https://frankselliott.github.io/Greville/visual/` loads the viewer.

## v1.1 — Usability and rendering — **DONE**

**Request:** make the viewer usable with menus, make the images look much better, as accurate as possible.
**Rule kept:** nothing in v1.1 changes a prism, the terrain heights, a preset, the camera model or a mask metric. Every new layer is a display layer, and each is labelled with its status.

**Work items:**
- **U1 — Menus and chrome.** Menu bar (File, View, Camera, Scenario, Layers, Lighting, Help) with keyboard navigation; collapsible panel sections; help dialog; shortcuts (1–5, L, M, G, ?, Ctrl+S); status bar; minimap; compass ribbon and elevation ruler; shareable URL state.
- **R1 — Render pipeline.** Physically based materials; sky + PMREM image-based light; sun at the frozen NOAA position with PCF soft shadows; GTAO ambient occlusion; MSAA; ACES tone mapping; sRGB; CIE standard overcast sky; quality levels; interactive frames skip AO.
- **R2 — Accuracy layers.** Storey lines at the dimensioned E2 RLs (solid) and the inferred E1 RLs (dashed); cadastral ground texture (DCDB parcels, 1 m contours, rail); outward-facing prism winding (needed for single-sided shadowed materials).
- **D1 — Defect found during v1.1:** on high-DPI screens, off-screen renders (export panels, mask pixels) used `renderer.setViewport`, which multiplies by the device pixel ratio even when a render target is bound. Fixed by setting the viewport and scissor on the render target itself.
- **D2 — Defect found during v1.1:** on narrow screens the grid column could grow to its content width and push the movement pad off-screen. Fixed with `minmax(0, 1fr)`.

**Gates:**

| Gate | Test |
|---|---|
| G7.1 | Every v1.0 gate still passes, unchanged thresholds (IoU ≥ 0.99, bit-identical camera across E1/E2 switches, deterministic export) |
| G7.2 | Sun direction equals the repository's frozen solar engine to 1e-9°, and the export records it |
| G7.3 | Menus open, act through the panel controls, are keyboard-navigable, and never move the camera |
| G7.4 | A shared link reproduces the camera, scenarios, view, layers, lighting and quality |
| G7.5 | Storey lines sit exactly at the recorded levels and carry their status |
| G7.6 | At device pixel ratio 2, masks still match the ray-caster and exports are byte-identical to 1× |

**v1.1 results:**
- **G7.1–G7.6 — PASS.** Full suite: protected PASS, unit 15/15, e2e 20/20. Details and numbers are in QA.md §v1.1.
- **G6.3 (live URL).** Still verified only after the owner merges, as for v1.0.

## v1.2 — Photomontage mode — **DONE**

**Request:** use photo backgrounds to make the views as realistic as possible, at a standard fit for court.

**Finding that shaped the work:** an inventory of the photographs in Drive found none that can carry a court-standard montage of Buildings A and B.
- The resident's Lot 64 photos face a different building.
- The Street View captures show Hudson Road houses and have no metadata.

So v1.2 builds the montage pipeline. A private brief, outside this repository, sets out how to collect survey-controlled photographs.

**Gates:**

| Gate | Test |
|---|---|
| G8.1 | The EXIF reader handles big- and little-endian files. GPS→MGA56 agrees with pyproj to 1 mm. Capture time converts to AEST correctly. |
| G8.2 | With the lens held from EXIF, the fit recovers a synthetic camera and leaves the focal length exactly as given. |
| G8.3 | The montage occlusion equals the tested masks (IoU ≥ 0.99). Painted foreground keeps the photograph pixel for pixel. |
| G8.4 | The package is complete. The photograph is byte-identical to the input. Every SHA-256 verifies. The record says "not survey-verified". |
| G8.5 | In the browser, the EXIF lens sets the field of view, GPS sets the station prior, and the capture time sets the sun. |
| G8.6 | Every earlier gate still passes. |

**Results:** G8.1–G8.6 PASS. Protected PASS; unit 18/18; e2e 22/22. Details in QA.md §v1.2.

## v1.3 — Usability pass — **DONE**

**Request:** "fix the UX".

**Audit (screenshots, desktop and phone) found:**
- one long scroll of nine panel sections;
- an unordered wall of photo controls;
- the E1/E2 action buried mid-panel, with a cryptic "E2 · E2 ⇄" toggle on the view;
- overlays colliding (scenario label on the ruler, a large minimap);
- a truncated monospace status line;
- a default view of a blank wall at 12 m (NG57).

**Changes:**
- **Panel:** tabbed (Compare / Scene / Photo / About), with arrow-key navigation.
- **Photo workflow:** four steps with live state (current / done / locked). The controls a step cannot use yet are disabled, with reasons. Drag-and-drop loads a photo, a picking banner guides landmark pairing, and Esc stops picking or painting.
- **Scenario control:** an always-visible E1 | ⇄ | E2 bar on the view, placed in the letterbox band when there is room.
- **Header:** Save image and Share.
- **Guides:** the elevation ruler moved to the right; the scenario label is dropped in single view (the bar names it).
- **Minimap:** folds from its own button, and is folded by default on phones.
- **Status bar:** readable segments.
- **Default viewpoint:** W01.
- **Phone:** a bottom sheet with a close button.

**Defects found and fixed:**
- Mouse clicks on on-stage controls were captured by the drag-look handler, so the scenario bar did not respond. Drag-look, landmark picking and mask painting now ignore on-stage controls.
- The pill radio buttons were not real pointer targets.

**Gates:**
- **G9.1** — every earlier gate still passes. The tests now open the right tab first. G2.4's "raise eye" step is pinned to NG57, because W01's archived eye (2.22 m) is at the station limit, where the refusal is correct.
- **G9.2** — a new UX test covers tabs, step order, drop-to-load, the picking banner with Esc, the scenario bar not moving the camera, header actions, the minimap fold, and the status bar.

**Results:** G9.1–G9.2 PASS. Protected PASS; unit 18/18; e2e 23/23. Details in QA.md §v1.3.

## v1.4 — Default approved form E2c — **DONE**

**Request:** "court accurate; make the reconstruction more accurate". Of the tracks offered, the user chose to make E2c the default.

**Why:** VA4 Part D found that the E2 plate lies up to 2.88 m inside the approved Building B west balcony line (about 29 m² per floor), and that the podiums outside the tower plates were absent. E2c carries those corrections, scaled from the approved drawings (±0.15 m) and corroborated by dimensioned setbacks.

**Changes:**
- `tools/build_assets.py`: default `approved = E2c`; E2c reclassified **scaled** (was "sensitivity / provisional"); E2 and E2c notes now state the known under-representation and the podium caveat.
- Assets rebuilt from the hash-pinned sources. A no-change rebuild was first shown to be byte-identical. After the change, only `scenarios` and `default_scenarios` differ: collections, terrain and presets are byte-identical.
- A `scaled` tag is added to the legend.

**Gates:**
- **G10.1** — E2c's silhouette contains E2's at every viewpoint (it only adds approved geometry). E2 → E2c pixels gained at 600×400: W01 about 1.6k, NG57 about 13k, NG55 about 26k, NG59 about 37k (mostly the B south podium, near the ground).
- **G10.2** — every earlier gate still passes. The ray-caster IoU fixtures remain on E2, the geometry the archived ray-caster rendered.

**Results:** G10.1–G10.2 PASS. Protected PASS; unit 18/18; e2e 24/24. Details in QA.md §v1.4.

**Not done (the user did not select them; each needs new sources or access):**
- LiDAR roof and tree reconstruction: needs a session on the "Greville shadow model" environment.
- E2 façade detail from the approved elevations: needs those sheets under 10 MB, or council-portal access.
- Rendering polish.

## v1.5 — Rendering polish — **DONE**

**Request:** "do the rendering polish too". This affects the display only: geometry, cameras, masks and IoU are unchanged.

**Changes:**
- **Aerial perspective (haze).** three's `FogExp2` term, `1 − exp(−(βd)²)`, is patched to Beer–Lambert, `1 − exp(−βd)`. β = 3.912 / V (Koschmieder), so the stated visibility V means what it says:
  - V = 15 km in sun (β ≈ 2.6×10⁻⁴ m⁻¹);
  - V = 8 km overcast and at dusk.
  - At the tower distances (about 50–300 m) the blend is 1–8 % in sun.
  - **Lighting → Aerial haze** turns it off, and `haze=0` goes into the link.
  - The mask materials carry `fog: false`, and the montage occluders write depth only, so neither the masks nor the occlusion can change.
- **Supersampled exports.**
  - At High quality, saved images are rendered at 2× in each direction. They are then box-filtered down in linear light by an exact integer routine (`downsampleLinear`), so they stay byte-reproducible.
  - The PNG remains W × H.
  - The record gains `renderer.supersampling` and `renderer.aerial_perspective`.
- **LiDAR canopy colour.** Each 0.5 m canopy column is now coloured by its LiDAR height: dark green for low, light green for high, plus a fixed per-cell jitter. Only the colour changes: the cells, their heights and the layer's default (off) are unchanged.
- **Softer outlines.** Edge opacity is 0.16 for context (was 0.22) and 0.45 for towers (was 0.6).

**Gates:**
- **G11.1** — masks are byte-identical with haze on and off, and the mask materials have `fog: false`.
- **G11.2** — the haze density equals 3.912 / V for each lighting mode.
- **G11.3** — a High export is 2× supersampled, 1800 × 1200 and byte-identical on re-export.
- **G11.4** — every earlier gate still passes, with IoU unchanged.

**Results:** G11.1–G11.4 PASS. Protected PASS; unit 18/18; e2e 25/25. Details in QA.md §v1.5.

## v1.6 — Default 8-storey comparator: approved footprints at RL 48.0 — **DONE**

**Request:** "update our comparator with these new refined figures". The user chose to add the comparator and make it the default.

**Why:** the applicant's "equivalent 8 storey approved built form" line fits the **approved** footprints, not the SK00.03 2020 envelope plan, at a top of about RL 48 ± 1 m. The sealed v1.1-AB incremental tables and the public study already use this comparator; the viewer did not.

**Changes:**
- `tools/build_assets.py`:
  - copies S-VA2 `E1_CUT48` verbatim, and asserts that its footprints equal the approved A footprint and B plate;
  - derives `E1_CUT47` and `E1_CUT49` by changing the top RL only;
  - adds the three scenarios, and sets `default_scenarios.historical = 'E1_CUT48'`;
  - `E1_SK48`, `E1_SK52` and `E1_SK48_POD` stay available, with their notes updated.
  - A no-change rebuild was first shown to be byte-identical. After the change only `collections`, `scenarios` and `default_scenarios` differ.
- **Viewer.** One shared `SCEN_KEYS` list replaces six hard-coded copies (scene build, visibility, colour, masks, montage layer).
  - `E1_CUT*` storey lines use the approved, dimensioned levels (solid lines; L08 = RL 48.0).
  - The export record lists the drawings and the storey-line rule.

**Gates:**
- **G12.1** — `E1_CUT48` is the default. Its footprints are the approved footprints. Its tops are 48.0 (47.0 and 49.0 for the sensitivities).
- **G12.2** — at every viewpoint, `E1_CUT48` never shows outside E2's silhouette, and RL 47 ⊆ RL 48 ⊆ RL 49 (≤ 2 boundary pixels).
- **G12.3** — `E1_CUT48` storey lines are DIMENSIONED, at 25.3 … 44.9.
- **G12.4** — every earlier gate still passes; the ray-caster IoU fixtures stay on `E1_SK48` / `E2`.

**Results:** G12.1–G12.4 PASS. Details in QA.md §v1.6.

## Outstanding limitations and source gaps

1. **Surveys.** There are no surveyed receiver positions. NG55, NG57 and NG59 are hypothetical, and the W01 eye RL is assumed.
2. **E1 is a reconstruction.** It is a received, not approved, 2020 envelope with an inferred RL. E2c (the VA4 corrections) is scaled and provisional.
3. **Massing is schematic.** Balconies are filled to their lines, and there are no balustrades, screens or façades. The VA2 context is generalised LiDAR. The Cluster 4 plan-derived masses are an optional reconstructed variant.
4. **Matching is manual.** There is no automatic landmark detection: matching is manual pairing plus a robust fit. Control points are model vertices, not survey points.
5. **Rendering determinism** is proven on one machine and GPU path. The renderer string is recorded in every export.
6. **Lighting is illustrative** (v1.1). The sun direction is exact for the frozen convention, but the brightness balance is calibrated by eye. Shadow-map resolution is about 0.16 m per texel over ±330 m. Use `/study/` for shadow evidence.
7. **Haze and canopy colour are depiction choices** (v1.5). The 15 km and 8 km visibilities are typical values, not measured on any date, and the canopy colours are not species or foliage data. Neither affects geometry, masks or any measured quantity.
