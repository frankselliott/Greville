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

## M1 — Geometry pipeline — **NOT STARTED**

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

## M2 — Working 3D viewer — **NOT STARTED**

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

## M3 — Historical versus approved comparison — **NOT STARTED**

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

## M4 — Perspective matching (external image) — **NOT STARTED**

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

## M5 — Forensic exports and automated QA — **NOT STARTED**

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

## M6 — Deployment and verification — **NOT STARTED**

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
