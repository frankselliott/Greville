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
