#!/usr/bin/env python3
"""Stamp visual/version.json with the git commit the code was taken from (run after committing code; commit the stamp next)."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); P = os.path.join(HERE, '..', 'version.json')
v = json.load(open(P)); v['source_commit'] = subprocess.run(['git', '-C', HERE, 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
if len(sys.argv) > 1: v['version'] = sys.argv[1]
json.dump(v, open(P, 'w'), indent=1); print(v)
