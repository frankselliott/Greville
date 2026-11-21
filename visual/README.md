# /visual — Greville 3D visual viewer

An interactive 3D model viewer for studying how Buildings A and B relate visually to the Greville townhouses. It compares a reconstructed historical lower form (E1) with the approved 2026 form (E2) from **exactly the same camera**.

It is an **investigative technical tool**:
- It is not expert evidence, not a survey and not a photomontage.
- It reaches no planning conclusion.
- Its outputs are technical records.

- **Live path (once published by the repository owner):** `/Greville/visual/`
- **Sources:** `SOURCE_REGISTER.md`. **Milestones and gates:** `BUILD_PLAN.md`. **Test log:** `QA.md`.

## Run locally

There is no build step: static ES modules plus a vendored Three.js r160.1.

```
cd <repository root>
node visual/tests/serve.cjs 8766      # serves the repo under /Greville/, like GitHub Pages
# open http://127.0.0.1:8766/Greville/visual/
```

Any static server also works, for example `python3 -m http.server` from the repository root, then open `/visual/`. Opening via `file://` does not work, because browsers block module and JSON loading from `file://`.

## Using it

1. **Viewpoint.** Pick a preset.
   - **W01** is the model-defined Lot 63 courtyard viewpoint. It uses the archived camera: heading 87°, HFOV 73.7°, vertical shift 0.2081, frame 1800 × 1200, and an assumed standing eye at RL 24.92.
   - **NG55, NG57 and NG59** are *hypothetical* near-ground model cameras (DEM + 1.6 m) in the modelled gap south of Building B. Their initial heading, level pitch and 90° HFOV are chosen by the viewer, not taken from a source.
   - Every preset shows its MGA coordinates, eye RL, model ground and classification.
2. **Look around.**
   - **Mouse:** drag to look; the wheel changes HFOV (zoom).
   - **Keyboard:** W/A/S/D to move, R/F to raise or lower the eye, arrow keys to look, +/− to zoom, Home to reset.
   - **Touch:** drag to look, pinch to zoom, and use the on-screen pad to move.
   - **Station mode** keeps you within the preset's local radius (2.5–3 m, a viewer limit and not a verified boundary). It keeps you out of any modelled solid and within a 0.3–2.2 m eye height above the model ground.
   - **Free and Overview** cameras are labelled **NONPHYSICAL**.
3. **Compare.**
   - **E1 / E2.** The E1 / E2 buttons, the on-stage toggle or the **T** key switch scenario. The camera, projection, frame and canvas are asserted unchanged by the tests.
   - **Scenario choices:** E1 `E1_SK48` (reconstructed), `E1_SK52` (sensitivity), `E1_SK48_POD` (hypothetical); E2 `E2` (source-derived), `E2c` (VA4 corrections, provisional).
   - **View modes:** side-by-side, swipe, and a mask overlay. The mask marks orange = only in E2 and blue = only in E1, with frame-limited angular areas and top-elevation readouts.
4. **Framing.** The framing view renders the same station and geometry with four HFOV and pitch settings. A dramatic or restrained-looking frame is a framing choice, not a change in the development.
5. **Export.** *Save PNG + JSON* renders off-screen at the exact frame size.
   - The JSON records the camera (MGA E/N, eye RL, heading, pitch, roll, HFOV, focal length, principal point, matrices) and the scenario with its collections and classification.
   - It also records asset and source SHA-256 values, app-file SHA-256 values, version and source commit, drawing references, assumptions, limitations, any mask metrics and any image-match record.
   - The PNG's SHA-256 is in the JSON.

## Matching an external perspective image (for example an applicant-supplied view)

1. Under *Perspective match*, choose the PNG or JPEG. It is read and hashed **in this browser only and never uploaded**. Its name, size, pixel dimensions and SHA-256 are shown and go into the export record. The image file itself is not exported.
2. The frame switches to the image's pixel size; *Use image frame* re-applies it. Set the station (E, N, eye RL), heading, pitch, roll, HFOV and shift by hand, and adjust *Image opacity* to compare.
3. **Landmarks.** *Add landmark pairs*: click a point on the image, then the matching red control dot (or type a control ID). There are 628 control points (`assets/controls.json`): model vertices with a source status each, **not survey points**. Use eight or more well-spread points, **including context beyond the towers**.
4. **Fit.** *Fit camera* runs the ported archive fit: robust least squares, multi-start, standard errors, leave-one-out and grade A–D.
   - It flags FEW_POINTS, COPLANAR, COLLINEAR, CLUSTERED, ILL_CONDITIONED, SUBJECT_ONLY and MULTIPLE_SOLUTIONS, and lists alternative solutions.
   - A low-residual fit that carries a blocking flag is reported as **UNDERDETERMINED / AMBIGUOUS**.
   - No fit is ever labelled "verified".
5. *Apply fitted camera*, then switch E1 / E2. The fitted camera is kept exactly. Export.

*Synthetic test* checks the implementation on a known model camera. It is QA, not evidence about any real image.

## Camera convention

These are the archived conventions, unchanged.
- **Heading:** clockwise from grid north (+y).
- **Pitch:** positive up.
- **Roll:** as `adr_core.axes`.
- **Pixels:** `u = cx + f(W·right)/zf` and `v = cy − f(W·up)/zf`, with v downwards.
- **Shift:** the archived vertical "shift" relates by `cy = H/2 + shift·W/2`.
- **Frames:** EPSG:7856 / AHD. Local `x = E − 504045`, `y = N − 6966712`. Three.js `(X, Y, Z) = (x, z, −y)`.

## Data pipeline

`tools/build_assets.py <scene_dump_v2.json> <VA4 code dir>` regenerates `assets/` from the hash-pinned private sources and refuses any other file. It writes `assets/manifest.json`, including the build-time checks.

The archive sources are not in this repository; only derived numeric massing is. `tools/xcheck_fit.py` and `tools/xcheck_render.py` regenerate the cross-check fixtures from the archived Python fit core and ray-caster.

## Tests

```
bash visual/tools/run_all_tests.sh    # protected-file check + Node unit tests + Playwright e2e (Chromium)
```

## Not modelled, and why

- Façades, materials, windows, balustrade transparency, screens and people are not modelled. Balcony volumes are filled to the plate or balcony line.
- Trees are not modelled. The only vegetation is the optional LiDAR canopy layer.
- Surveyed receiver positions are not modelled.
- The E1 envelope is a **reconstruction** from a 2020 envelope plan that was received, not approved; no RL was ever fixed. E1–E2 differences are not an isolated "upper floors" effect.
