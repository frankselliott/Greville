#!/bin/bash
# Full /visual test run: protected files, Node unit tests, Playwright end-to-end (Chromium). Exit non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 visual/tools/check_protected.py
node --test visual/tests/unit.test.mjs
node --test visual/tests/e2e.test.cjs
