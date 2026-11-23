# /visual — Greville 3D visual viewer

An interactive 3D model viewer for studying how Buildings A and B relate visually to the Greville townhouses. It compares a reconstructed historical lower form (E1) with the approved 2026 form (E2) from **exactly the same camera**.

It is an **investigative technical tool**:
- It is not expert evidence, not a survey and not a photomontage.
- It reaches no planning conclusion.
- Its outputs are technical records.

- **Live path (once published by the repository owner):** `/Greville/visual/`
- **Sources:** `SOURCE_REGISTER.md`. **Milestones and gates:** `BUILD_PLAN.md`. **Test log:** `QA.md`.

## Run locally

There is no build step: static ES modules plus a vendored Three.js r160.1 and its MIT add-ons (post-processing, GTAO, Sky; hashes in `vendor/three/addons/SHA256SUMS`), resolved by an import map.

```
cd <repository root>
node visual/tests/serve.cjs 8766      # serves the repo under /Greville/, like GitHub Pages
# open http://127.0.0.1:8766/Greville/visual/
```

Any static server also works, for example `python3 -m http.server` from the repository root, then open `/visual/`. Opening via `file://` does not work, because browsers block module and JSON loading from `file://`.

## Using it

**Layout (v1.3).**
- **Header:** *Save image* (Ctrl+S) and *Share* (copy a link to this exact view) are always there.
- **On the view:** the scenario bar shows which form you are looking at. Click **E1** or **E2**, or **⇄** (T), to swap. The camera never moves.
- **Side panel:** four tabs.
  - **Compare:** viewpoint, scenarios, view mode, camera.
  - **Scene:** lighting and layers.
  - **Photo:** the four-step photomontage. You can also drop a photo onto the view to start it.
  - **About:** what this is, and its sources.
- **Status bar:** the exact camera in readable segments.
- **Phone:** the panel is a bottom sheet, opened with ☰ and closed with ✕.

**Menus.** The menu bar holds every command: **File** (save PNG + JSON, load a perspective image, copy a link to this view), **View** (view modes 1–5, side panel, minimap, guides, render quality), **Camera** (viewpoints, station/free/overview, reset, level), **Scenario** (E1/E2 choices and the toggle), **Layers** (context variant, canopy, edges, storey lines, ground map, tower colour), **Lighting** (sun or overcast, solstice/equinox dates, times) and **Help** (shortcuts and the accuracy statement; also the **?** key). Each menu command drives the same side-panel control a mouse user would, so there is one code path per action. Panel sections collapse; the browser remembers which.

**Shortcuts.** T toggle E1/E2 · W A S D move · arrows look · R/F eye height · +/− zoom · Home reset · 1–5 view modes · L sun/overcast · M minimap · G guides · Ctrl+S save · ? help.

**Shareable link.** The address bar always encodes the current preset, camera (when changed from the preset), scenarios, view, layers, lighting and quality. *Copy link to this view* copies it; opening it reproduces the view.

**Guides.** A compass ribbon gives grid bearings along the horizontal; an elevation ruler gives elevation angle along a line of constant bearing (labelled with that bearing); a dashed line marks the horizontal (0°). All three are projected through the exact camera model. The minimap shows the cadastre, modelled footprints of the current scenario, viewpoints and the camera's horizontal field of view; click it to move the target (Overview) or the camera (Free).

**Rendering.** Physically based materials in neutral, untextured tones; sky and image-based light; a sun at the true position for the chosen date and time (the repository's frozen NOAA convention, AEST, no refraction) with soft shadow maps; ground-truth ambient occlusion; 4× MSAA; ACES tone mapping. *Overcast* uses a CIE standard overcast sky (no sun, no shadows). Distant surfaces take a light aerial haze (Beer–Lambert, 15 km visibility in sun, 8 km overcast; *Lighting → Aerial haze* turns it off). The haze is never applied to masks or occlusion. Quality High / Medium / Low trades effects for speed (mobile defaults to Medium); while you move, frames skip ambient occlusion and the full frame follows when you stop. **Lighting is illustrative**: it changes no geometry or camera, and the shadows are not a shadow study (see `/study/`).

**Storey lines and ground.** E2 storey lines are drawn at the floor RLs dimensioned on the approved drawings (solid); E1 at inferred equal 3.3 m storeys (dashed, labelled INFERRED). The ground carries the Queensland cadastre (DCDB parcels, road parcels, the site parcel outlined) and 1 m LiDAR contours — a cartographic index, not survey or imagery. A plain grey plane beyond the terrain edge is outside the model and sits below every modelled surface.

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
   - **Scenario choices:** E1 `E1_SK48` (reconstructed), `E1_SK52` (sensitivity), `E1_SK48_POD` (hypothetical); E2 `E2c` (**default**: approved plates plus the VA4-corrected B west balcony line and podiums, scaled ±0.15 m) and `E2` (plates only, kept for continuity with VA2). E2c includes the approved podiums; the 2020 podium is unknown, so compare with `E1_SK48_POD` for a like-for-like podium.
   - **View modes:** side-by-side, swipe, and a mask overlay. The mask marks orange = only in E2 and blue = only in E1, with frame-limited angular areas and top-elevation readouts.
4. **Framing.** The framing view renders the same station and geometry with four HFOV and pitch settings. A dramatic or restrained-looking frame is a framing choice, not a change in the development.
5. **Export.** *Save PNG + JSON* renders off-screen at the exact frame size.
   - The JSON records the camera (MGA E/N, eye RL, heading, pitch, roll, HFOV, focal length, principal point, matrices) and the scenario with its collections and classification.
   - It also records asset and source SHA-256 values, app-file SHA-256 values, version and source commit, drawing references, assumptions, limitations, any mask metrics and any image-match record.
   - It records the lighting (mode, date, time, sun altitude and azimuth, engine), render quality and pipeline, storey-line status and the ground-map source.
   - The PNG's SHA-256 is in the JSON. Exports are rendered at full quality with seeded ambient-occlusion noise (at High, also at 2× and averaged down in linear light), so re-exporting the same state is byte-identical, and identical on standard and high-DPI screens.

## Matching an external perspective image or photograph

1. Under *Perspective match*, choose the PNG or JPEG. It is read and hashed **in this browser only and never uploaded**. Its name, size, pixel dimensions and SHA-256 are shown and go into the export record. The image file itself is not exported.
2. The frame switches to the image's pixel size; *Use image frame* re-applies it. Set the station (E, N, eye RL), heading, pitch, roll, HFOV and shift by hand, and adjust *Image opacity* to compare.
3. **Landmarks.** *Add landmark pairs*: click a point on the image, then the matching red control dot (or type a control ID). There are 628 control points (`assets/controls.json`): model vertices with a source status each, **not survey points**. Use eight or more well-spread points, **including context beyond the towers**.
4. **Fit.** *Fit camera* runs the ported archive fit: robust least squares, multi-start, standard errors, leave-one-out and grade A–D.
   - It flags FEW_POINTS, COPLANAR, COLLINEAR, CLUSTERED, ILL_CONDITIONED, SUBJECT_ONLY and MULTIPLE_SOLUTIONS, and lists alternative solutions.
   - A low-residual fit that carries a blocking flag is reported as **UNDERDETERMINED / AMBIGUOUS**.
   - No fit is ever labelled "verified".
5. *Apply fitted camera*, then switch E1 / E2. The fitted camera is kept exactly. Export.

*Synthetic test* checks the implementation on a known model camera. It is QA, not evidence about any real image.

## Photomontage (v1.2)

Use your own photograph as the background. Everything happens in the browser: the photograph is never uploaded.

1. **Load.** Load the original JPEG in *Photo match and montage*. HEIC is not read; export it as JPEG and keep the metadata. The tool reads the EXIF:
   - **Lens:** the 35 mm-equivalent focal length sets the field of view, by the CIPA diagonal definition. *Hold lens from EXIF* keeps it fixed in the fit.
   - **Capture time:** *Light the model at the photo's time* sets the sun.
   - **GPS:** *Use photo GPS as prior* moves the camera there, converted from GDA2020 to MGA56 with the Krüger series (checked against pyproj to 1 mm), and sets the station prior.
2. **Fit the camera** to landmark pairs (§ matching below). Aim for grade A.
3. **Show the montage** and choose a layer:
   - E2 massing;
   - E1 massing;
   - *As-built check*: the E1 outline, with the part of E2 outside the E1 envelope tinted. Use this when the photo already shows the built towers.
   - *Wireline*: E1 and E2 outlines.
4. **Occlusion and foreground.** The towers are hidden behind every modelled surface by a depth test, using the same rule as the tested masks. *Paint foreground mask* keeps the photograph over trees, poles or fences that the model does not contain.
5. **Save montage package** writes one ZIP. It contains:
   - the unaltered photograph;
   - the wireline;
   - the E1 and E2 montages;
   - the as-built check;
   - a camera plan;
   - the mask;
   - `record.json`: camera, lens, time, residuals, sources, and a checklist of the elements NSW LEC Policy PPL 15 asks for, each marked provided / missing / not done;
   - `SHA256SUMS`.

**Status of the output.** A montage from this tool is **camera-matched, not survey-verified**. It becomes survey-verified only when a registered surveyor coordinates the camera station and the reference points, and an expert adopts the method. See the private photography and survey brief.

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
