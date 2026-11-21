#!/usr/bin/env python3
"""Verify that no file outside visual/ has changed since the M0 baseline (visual/tools/protected_baseline.sha256),
and that the two frozen visualisers still hash to the pinned value. Exit 1 on any difference. Run from anywhere."""
import hashlib, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
FROZEN = 'cd551cef6a414987b1153b08dd765fe92393e2170760f0d4d6d8a8481b128f9f'
def h(p): return hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()
bad = []
base = {}
for line in open(os.path.join(HERE, 'protected_baseline.sha256')):
    want, path = line.split(None, 1); path = path.strip(); base[path] = want
    if not os.path.exists(os.path.join(ROOT, path)): bad.append(f'MISSING {path}')
    elif h(path) != want: bad.append(f'CHANGED {path}')
for p in ('index.html', 'nrltipping-greville/public/index.html'):
    if h(p) != FROZEN: bad.append(f'FROZEN HASH MISMATCH {p}')
try:   # any tracked file outside visual/ that is not in the baseline is also a change
    tracked = subprocess.run(['git', '-C', ROOT, 'ls-files'], capture_output=True, text=True, check=True).stdout.split('\n')
    extra = [t for t in tracked if t and not t.startswith('visual/') and t not in base]
    bad += [f'NEW FILE OUTSIDE visual/ {t}' for t in extra]
except Exception as e:
    print('note: git not available, new-file check skipped:', e)
print(f'protected files checked: {len(base)}; frozen viewers: 2')
if bad: print('\n'.join(bad)); print('FAIL'); sys.exit(1)
print('PASS'); sys.exit(0)
