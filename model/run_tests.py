#!/usr/bin/env python3
"""Run everything: the independent test suite, then the frozen QA gate.

    python3 run_tests.py

Two layers, and they prove different things.

**tests/** checks the engine against facts that exist outside this project —
the obliquity of the ecliptic, the solar-noon altitude identity, the shoelace
area of a polygon, the closed-form length of a shadow, and invariants the
project's own reasoning depends on. These would catch an engine that is
self-consistent but wrong.

**verify_frozen_peaks.py** checks that this engine reproduces the frozen
v1.1-AB result set. That is a different claim: not "the physics is right" but
"this is the same model that produced the figures on record".

Neither subsumes the other. Passing both is the claim worth making.
"""

import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    print("=" * 72)
    print("1/2  Independent tests — physics, geometry, invariants")
    print("=" * 72)
    loader = unittest.TestLoader()
    suite = loader.discover(os.path.join(HERE, "tests"), top_level_dir=HERE)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        print("\nIndependent tests FAILED — not running the frozen gate.")
        return 1

    print()
    print("=" * 72)
    print("2/2  Frozen QA gate — does this reproduce the v1.1-AB figures?")
    print("=" * 72)
    gate = subprocess.run(
        [sys.executable, os.path.join(HERE, "verify_frozen_peaks.py")], cwd=HERE)
    if gate.returncode != 0:
        return gate.returncode

    print("\nALL GREEN — the engine is independently checked and reproduces the "
          "frozen figures.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
