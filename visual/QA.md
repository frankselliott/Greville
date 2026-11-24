# /visual — QA log

Every entry records a test that **actually ran**, on which commit or working tree, and with what result. A gate never reads PASS unless its run appears here.

## M0 — audit (base commit `86c7a2c`, branch `claude/visual-viewer`)

| # | Test | Command | Result |
|---|---|---|---|
| Q0.1 | Frozen viewers hash to `cd551cef…b128f9f` | `sha256sum index.html nrltipping-greville/public/index.html` | PASS (both) |
| Q0.2 | Protected baseline of the 84 tracked files outside `visual/` | `python3 visual/tools/check_protected.py` | PASS |
| Q0.3 | Existing shadow-model suite | `cd model && python3 run_tests.py` | PASS: "ALL GREEN — the engine is independently checked and reproduces the frozen figures." |
| Q0.4 | VA2 scene source = archive copy | SHA-256 of the archive download = `b9d4ca3a…ba70c` = local copy = VA v2 SHA256SUMS entry | PASS |
| Q0.5 | VA4 code archive = archive manifest | SHA-256 `a75ad6b3…2901` = `GRE_VA4_SHA256SUMS.txt` entry | PASS |
| Q0.6 | Three.js tarball integrity | sha512 of `three-0.160.1.tgz` = npm `dist.integrity` | PASS |
| Q0.7 | Pages deployment reachable for checking | `curl https://frankselliott.github.io/Greville/` | NOT RUN: the build environment's proxy refuses `*.github.io` (HTTP 403 from the proxy). Recorded as a limitation; see M6. |

## M1 — geometry pipeline

| # | Test | Command | Result |
|---|---|---|---|
| Q1.1 | Asset build with source pinning and the archived-ARTW/POD equality assertion | `python3 -I visual/tools/build_assets.py <scene_dump_v2.json> <VA4 code dir>` | PASS. All 13 build checks pass (manifest `checks`). |
| Q1.2 | Unit tests (coords, projection vs archived Python, Three.js matrices, shift convention, solid angle, fit vs archived Python, ambiguity flags, manifest hashes, scenario identity, preset RLs and envelopes) | `node --test visual/tests/*.test.mjs` | PASS, 10/10 |
| Q1.3 | Python reference fixture from the archived fit core (`adr_core.py` sha `f1e0caa8…`) | `python3 -I visual/tools/xcheck_fit.py <adr_core.py>` | ng57_up: n = 24, RMS 0.349 px, grade A, position error 0.029 m. w01_shift (free principal point): n = 24, RMS 0.389 px, grade A, 0.065 m. |

## M2–M5 — viewer, comparison, matching, export (working tree before the M2–M5 commit)

| # | Test | Command | Result |
|---|---|---|---|
| Q2.1 | Independent render reference (archived `v2_render.py` sha `9d3c8282…`, archived scene) | `python3 -I visual/tools/xcheck_render.py <v2_render.py> <scene_dump_v2.json>` | Fixtures written. Tower pixels: W01 E1 48,405 / E2 114,090; NG57 E1 300,600 / E2 499,500 (900 × 600). |
| Q2.2 | Full suite | `bash visual/tools/run_all_tests.sh` | `check_protected.py` PASS; unit 11/11 PASS; e2e 15/15 PASS |
| Q2.3 | WebGL vs ray-caster silhouettes (e2e test 2) | as above | IoU: W01 E1 0.99965 (17 px differ), W01 E2 0.99968 (37 px), NG57 E1 1.00000, NG57 E2 1.00000 |
| Q2.4 | Collision (e2e test 6) | as above | A point inside C5-57 is refused in station mode ("Blocked: … C5-57"), accepted in free mode; the radius limit holds (≤ 3.0 m) |
| Q3.1 | E1/E2 invariance (e2e tests 7–8) | as above | 4 presets × 11 switches × 2 viewports: camera, matrixWorld, projection and canvas all bit-identical |
| Q4.1 | Local image import (e2e test 11) | as above | Browser SHA-256 = Node SHA-256; no request left 127.0.0.1 |
| Q5.1 | Export determinism (e2e test 14) | as above | The PNG SHA-256 in the JSON matches the file; a second export is byte-identical; 1800 × 1200 |

Browser: Playwright Chromium (headless; renderer as recorded in each export JSON). Rendering determinism is established on this machine only. Another GPU or driver can differ by anti-aliased edge pixels, which is why the export JSON records the renderer string.

## v1.1 — usability and rendering (branch `claude/visual-v1-1`, base `22c6d8c`)

| # | Test | Command | Result |
|---|---|---|---|
| Q7.1 | Protected files | `python3 visual/tools/check_protected.py` | PASS (84 files; both frozen viewers byte-identical) |
| Q7.2 | Unit tests | `node --test visual/tests/unit.test.mjs` | 15/15 PASS (adds: sun = frozen engine to 1e-9° over 48 cases; storey levels; basemap asset; vendored add-on hashes) |
| Q7.3 | End-to-end | `node --test visual/tests/e2e.test.cjs` | 20/20 PASS in 229 s (15 v1.0 tests, thresholds unchanged, + 5 v1.1 tests) |
| Q7.4 | Silhouettes after dropping the logarithmic depth buffer (needed for ambient occlusion; near 0.2 m, far 3000 m) | e2e test 2 | IoU unchanged from v1.0: W01 E1 0.99965 (17 px), W01 E2 0.99968 (37 px), NG57 E1 1.00000, NG57 E2 1.00000 |
| Q7.5 | Export determinism at full quality (shadows + GTAO with seeded noise) | e2e test 14 | Re-export byte-identical; JSON sun altitude/azimuth equal the frozen engine's values exactly |
| Q7.6 | High-DPI regression (D1) | e2e test 20 | At device pixel ratio 2: W01 E2 mask IoU ≥ 0.99 against the ray-caster and identical to 1×; export PNG SHA-256 identical to 1× |
| Q7.7 | Phone layout (D2) | e2e test 5 (Pixel/iPhone viewports) | First run FAILED: the movement pad was pushed off-screen by the menu bar's width. Fixed with `minmax(0, 1fr)`; PASS |
| Q7.8 | Menus, help, shortcuts, link round-trip, storey lines | e2e tests 16–19 | PASS |

**Lighting calibration (by eye, recorded so it can be challenged).**
- Three.js r160 has no `scene.environmentIntensity` (added in r163). The first build therefore ran the sky light at full strength, which washed every surface out (sunlit and shaded ground sampled at sRGB 228 vs 193).
- It is now set per material (`envMapIntensity` 0.35, sun 3.0, hemisphere 0.12, exposure 0.8, ACES). Overview samples: sunlit ground ≈ 207, shaded ground ≈ 117–141, sunlit roof ≈ 193–199, shaded wall ≈ 105–159.
- These are display choices, not photometry. No metric depends on them.

**Cross-check of sun and camera.**
- At W01 on 21 June 07:30, the rendered sun disc sits at grid bearing ≈ 57°, elevation ≈ 9°.
- This agrees with the engine (azimuth 57.3°, altitude 9.4°) read off the independently projected compass and elevation guides.

## v1.2 — photomontage mode (branch `claude/visual-montage`, base `46971b9`)

| # | Test | Result |
|---|---|---|
| Q8.1 | Protected files | PASS |
| Q8.2 | Unit tests | 18/18 PASS. New: EXIF big- and little-endian; GPS→MGA56 within 1 mm of pyproj over 7 positions; capture time to AEST with a +08:00 offset and with no offset recorded; fixed-lens fit recovery; ZIP structure and CRC-32. |
| Q8.3 | End-to-end | 22/22 PASS in 197 s. All v1.0 and v1.1 tests pass with unchanged thresholds; IoU 0.99965 / 0.99968 / 1 / 1. |
| Q8.4 | Montage occlusion | The tower layer, hidden by the modelled context through a depth-only pre-pass, agrees with the tested mask at IoU ≥ 0.99 at W01. |
| Q8.5 | Foreground mask | Every masked tower pixel keeps the photograph exactly; pixels outside the mask are changed. |
| Q8.6 | Package | The photo in the ZIP is byte-identical to the input; every SHA-256 in SHA256SUMS verifies; `record.json` says camera-matched, not survey-verified. |

**Defect found and fixed during development.** The first montage showed the towers in front of the laundry roof, which stands in front of them in the model. The cause was draw order: the depth-only occluders were drawn after the towers, so the depth test had nothing to test against. The occluders are now forced to render first (`renderOrder −10`). The occlusion test (Q8.4) guards against a regression.

**Not a defect, but worth recording.** Loading a photograph resets the principal point to the image centre. This is right for an ordinary photograph. A frame rendered with a lens shift (such as W01's archived 0.2081) needs that shift entered again, either by hand or through the fit.

## v1.3 — usability pass (branch `claude/visual-montage`)

| # | Test | Result |
|---|---|---|
| Q9.1 | Protected files | PASS |
| Q9.2 | Unit tests | 18/18 PASS |
| Q9.3 | End-to-end | 23/23 PASS in 160 s. IoU unchanged: 0.99965 / 0.99968 / 1 / 1. |
| Q9.4 | New UX test | PASS. It covers: tabs and arrow keys; step order (photo → align → montage → save) with controls disabled until there is a photo; drop-to-load; the picking banner, with Esc stopping picking and leaving the camera unchanged; the scenario bar swapping E1/E2 without moving the camera; Save and Share in the header; the minimap fold; and the status-bar text. |

**Defects found by the UX test:**
1. Mouse clicks on on-stage controls were captured by the drag-look handler's pointer capture, so the scenario bar did not respond to a mouse.
2. Locked photo steps blocked the synthetic self-test, which does not need a photo.
3. Pill-style radios hid the real input from the pointer.

All three are fixed.

## v1.4 — default approved form E2c (branch `claude/visual-e2c-default`, base `98e75c4`)

| # | Test | Result |
|---|---|---|
| Q10.1 | Asset rebuild determinism | A no-change rebuild from the pinned sources was byte-identical to the committed assets (`sha256sum -c`). |
| Q10.2 | Rebuild with E2c as default | All 13 build checks PASS. Only `scenarios` and `default_scenarios` changed; collections, terrain and presets are byte-identical. |
| Q10.3 | Suite | Protected PASS; unit 18/18; e2e 24/24 in 256 s. IoU 0.99965 / 0.99968 / 1 / 1 (on E2, the geometry the archived ray-caster rendered). |
| Q10.4 | E2c ⊇ E2 at every preset | PASS. Zero E2 pixels lost. Pixels gained at 600 × 400: W01 1,573; NG55 26,283; NG57 13,180; NG59 36,855. |

## v1.5 — rendering polish (branch `claude/visual-render-polish`, base `a41d8b6`)

| # | Test | Result |
|---|---|---|
| Q11.1 | Haze never touches masks | PASS. `renderMaskPixels` for E1_SK48 and E2c at W01 (480 × 320) is identical with haze on and off. `M.black.fog` and `M.white.fog` are both `false`. |
| Q11.2 | Haze model | PASS. The fog chunk is patched to `1 − exp(−βd)`. β = 3.912/15000 in sun and 3.912/8000 overcast, exactly. `haze=0` is written to the link only when the haze is off. |
| Q11.3 | Supersampled export | PASS. At High, `renderer.supersampling` = 2. The PNG is 1800 × 1200, and two exports are byte-identical. The record states the aerial-perspective model and that it applies to the display render only. |
| Q11.4 | Canopy colour | PASS. The canopy InstancedMesh has per-instance colour. Its matrices (geometry) are unchanged. |
| Q11.5 | Suite | Protected PASS; unit 18/18; e2e 25/25. IoU 0.99965 / 0.99968 / 1 / 1, unchanged. E2 → E2c gains unchanged. |
| Q11.6 | Visual check | Screenshots of the overview (sun) and NG57 (overcast) checked by eye. Distant context softens slightly; near geometry is unchanged; no console errors. |

## v1.6 — default 8-storey comparator E1_CUT48 (branch `claude/visual-comparator-app48`, base `6815881`)

| # | Test | Result |
|---|---|---|
| Q12.1 | Asset rebuild determinism | A no-change rebuild from the pinned sources was byte-identical (`sha256sum -c`). After the change, only `collections` (+E1_CUT47/48/49), `scenarios` and `default_scenarios` differ. |
| Q12.2 | Source identity | Build check PASS: S-VA2 `E1_CUT48` footprints equal the approved `E2-building_A` and `E2-building_B_plate` footprints (atol 1e-9), with top 48.0. CUT47 and CUT49 differ in top RL only. All 16 build checks PASS. |
| Q12.3 | Unit G1.2 (amended) | `E1_CUT48` is no longer banned: the user asked for it on 24 Nov 2026. In its place the test asserts family `CUT`, footprints equal to the approved footprints, CUT47/49 sharing those footprints, and `E1_CUT48` as the default. REC48, REC52 and the invented-tree sensitivities stay banned. |
| Q12.4 | e2e v1.6 | PASS. Default historical `E1_CUT48`, classified reconstructed. At W01, NG55, NG57 and NG59: CUT48 ⊆ E2, CUT47 ⊆ CUT48 ⊆ CUT49 (≤ 2 boundary px). Storey lines DIMENSIONED at 25.3 … 44.9 (ground + L01–L07; L08 = RL 48.0). |
| Q12.5 | Suite | Protected PASS; unit 18/18; e2e 26/26. IoU 0.99965 / 0.99968 / 1 / 1 (fixtures remain E1_SK48 / E2, as archived). E2 → E2c gains unchanged. |
| Q12.6 | Visual check | W01 side by side, E1_CUT48 against E2c: identical footprints, comparator topped at RL 48; no console errors. |

Basis for the RL: the sealed v1.1-AB comparator; the best-fitting height to the applicant's DA-600/601 Rev 8 "equivalent 8 storey" line (RL 48.0, `verify/out/ellivo_registration.json`); and approved L08 = RL 48.0 on DA-201 / DA-402. Without-prejudice material is not cited in this repository.

