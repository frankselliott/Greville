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
