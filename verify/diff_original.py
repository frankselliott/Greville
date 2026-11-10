#!/usr/bin/env python3
"""Verify this model against the sealed v1.1-AB release.

The model in ``model/`` is a Python reconstruction of the v1.1-AB shadow model.
This script checks it against the sealed release, so that the geometry it
computes over and the results it reproduces can be shown to be the release's
own rather than taken on trust.

It accepts either form of the release:

    python3 diff_original.py /path/to/greville_shadow_model_v1.1-AB.tar.gz
    python3 diff_original.py /path/to/model-data-directory-or-tarball

The complete release is identified by its SHA-256, 6df4dde6...c76d4f0.  A model
data set -- geometry/ and outputs/ alone -- is identified file by file against
SHA-256 values pinned below in SEALED_FILE_HASHES, not against anything shipped
with it, so a manifest regenerated to match altered data does not pass.

Exit status: 0 all checks pass, 1 a check failed, 2 could not run.

What this does and does not establish
-------------------------------------
It establishes that the approved geometry, the receptors and every row of every
results table in this model are the sealed release's, to the precision each is
stored at.

It does not establish the engine.  The reconstruction's solar and shadow code is
checked by the independent physics tests in ``model/tests/``, not against the
original source.  Nor does it check the receiver levels, which the release
carries forward from v1.0.2 rather than restating.
"""

import hashlib
import json
import math
import os
import sys
import re
import tarfile
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "model"))

#: The archive sealed in model/PROVENANCE.md.  56,012 bytes.
ARCHIVE_SHA256 = "6df4dde6b3f11a087c8dea33d8b4e3da9609f4237f9e6c3740ffc54d2c76d4f0"
ARCHIVE_BYTES = 56012
ROOT = "greville_shadow_model_v1.1-AB"

#: SHA-256 of each model data file, as sealed in the v1.1-AB release's own
#: MANIFEST.txt.  They are pinned here so that the data can be verified
#: against this published script, rather than against a manifest that
#: happens to travel with it.  A manifest shipped alongside the data is then
#: a convenience; these values are the root of trust.
SEALED_FILE_HASHES = {
    "geometry/approved_AB_model.json":
        "079d56b22292b93096fb736cc3c7f495540241dadd6908814bf94b80d2cd54bb",
    "geometry/receptors.json":
        "53d0d1e7833fc8ce1125d63800f91ccf4161162fccee0f4caa8d9aa3c019fe5d",
    "geometry/casting_edge.json":
        "a1a9bb2a8790baebf40602df6bb76172a4a7c6781facf7340b42993c93dfa141",
    "outputs/peaks.json":
        "a530f2f9dd7cb03d5877e9b98fe9a7ef365cdd766292eea74e8232c5a4a46ea5",
    "outputs/comp_at_peaks.json":
        "feaefe0773cb156d4e139f6151bba75fd087f3470f932d1aafeb85dc31845ce5",
    "outputs/attribution.json":
        "0fc7f759dd59666774bf58e6f9cc16ed96a914db3f791f8535db44a7a9a369ef",
    "outputs/fy_yard.log":
        "7bedcf6408ab5dd1502bb6d192203e055d5f3872fa07ccb75d654e9a4d4c2e58",
    "outputs/fy_sched.log":
        "75087361c1b1e4957d1fa19dc14d0e8f94d0b2a6c501787ac9f8e308b128037e",
    "outputs/inc2_yard_f000.log":
        "c2bbc6c86b8f12a506779f9486f0cdfaa816cbc33f2cb7ad60c0a022dc98248a",
    "outputs/inc2_sched_f000.log":
        "e0a8391c030fa36880ba4998b5d132e1c3dc5db554e045021143e83851679557",
}

#: Coordinates in the reconstruction's data file are stored to 4 decimals, so
#: a vertex can sit half a unit in the last place away from the original.
#: 0.00005 m is that floor; anything larger is a real difference.
VERTEX_TOL_M = 1.0e-4
#: Frozen areas are exact polygon areas; this engine counts grid cells.
AREA_TOL_M2 = 2.0e-3
#: first_contact_RL is a grid minimum over 20 mm cells on rounded coordinates.
RL_TOL_M = 1.0e-3


class Check:
    def __init__(self):
        self.rows = []

    def add(self, name, ok, detail=""):
        self.rows.append((name, bool(ok), detail))
        return ok

    def report(self):
        width = max(len(n) for n, _, _ in self.rows)
        failed = 0
        for name, ok, detail in self.rows:
            tag = "PASS" if ok else "FAIL"
            if not ok:
                failed += 1
            print(f"  {tag}  {name.ljust(width)}  {detail}")
        print()
        if failed:
            print(f"{failed} of {len(self.rows)} checks FAILED")
        else:
            print(f"all {len(self.rows)} checks pass")
        return failed


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(131072), b""):
            h.update(block)
    return h.hexdigest()


def hull(pts):
    """Andrew monotone chain, as the original's comp_at_peaks.py computes it."""
    P = sorted(set(map(tuple, pts)))
    if len(P) < 3:
        return P

    def half(pts):
        out = []
        for q in pts:
            while len(out) >= 2:
                (ax, ay), (bx, by) = out[-2], out[-1]
                if (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax) <= 0:
                    out.pop()
                else:
                    break
            out.append(q)
        return out

    return half(P)[:-1] + half(P[::-1])[:-1]


def ray_entry(px, py, dx, dy, poly):
    """Distance from (px,py) along (dx,dy) to the convex polygon; inf if clear.

    The original's analytic slab test, transcribed.  Not a march.
    """
    n = len(poly)
    cx = sum(p[0] for p in poly) / n
    cy = sum(p[1] for p in poly) / n
    lo, hi = -math.inf, math.inf
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        nx, ny = by - ay, -(bx - ax)
        if nx * (cx - ax) + ny * (cy - ay) > 0:
            nx, ny = -nx, -ny
        den = dx * nx + dy * ny
        num = (ax - px) * nx + (ay - py) * ny
        if abs(den) < 1e-12:
            if num < 0:
                return math.inf
        else:
            t = num / den
            if den < 0:
                lo = max(lo, t)
            else:
                hi = min(hi, t)
    if lo > hi or hi < 0:
        return math.inf
    return max(lo, 0.0)


def ring(poly):
    """Drop a duplicated closing vertex."""
    pts = [tuple(p[:2]) for p in poly]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def max_vertex_dev(recon_local, orig_abs, E0, N0):
    """Largest vertex separation, after shifting the local frame to absolute."""
    a = ring(recon_local)
    b = ring(orig_abs)
    if len(a) != len(b):
        return None, f"vertex count {len(a)} vs {len(b)}"
    worst = 0.0
    for (x, y), (ox, oy) in zip(a, b):
        worst = max(worst, math.hypot(x + E0 - ox, y + N0 - oy))
    return worst, ""


def shoelace(pts):
    pts = ring(pts)
    total = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        print("usage: diff_original.py <greville_shadow_model_v1.1-AB.tar.gz>")
        return 2

    archive = argv[1]
    if not os.path.exists(archive):
        print(f"no such file or directory: {archive}")
        return 2

    sealed = False
    if os.path.isfile(archive):
        size = os.path.getsize(archive)
        digest = sha256_file(archive)
        print(f"input   : {archive}")
        print(f"bytes   : {size}")
        print(f"sha256  : {digest}")
        sealed = digest == ARCHIVE_SHA256
        if sealed:
            print(f"identified as the sealed v1.1-AB archive ({ARCHIVE_BYTES} bytes)")
        else:
            print("not the sealed archive; treating as a model data set and"
                  " checking it against the hashes pinned in this script")
    else:
        print(f"input   : {archive} (directory)")
    print()

    try:
        from greville_model import model as M
    except Exception as exc:  # pragma: no cover
        print(f"cannot import the reconstruction: {exc}")
        return 2

    chk = Check()

    with tempfile.TemporaryDirectory() as tmp:
        if os.path.isdir(archive):
            base = archive
        else:
            try:
                with tarfile.open(archive, "r:gz") as tf:
                    names = tf.getnames()
                    bad = [n for n in names
                           if n.startswith("/") or ".." in n.split("/")]
                    if bad:
                        print(f"refusing unsafe member paths: {bad[:3]}")
                        return 2
                    tf.extractall(tmp)
            except tarfile.TarError as exc:
                print(f"cannot read {archive} as a gzip tar: {exc}")
                return 2
            base = os.path.join(tmp, ROOT)
            if not os.path.isdir(base):
                # A subset may have been packed without the archive's top
                # directory, or under a different one.
                entries = [os.path.join(tmp, e) for e in os.listdir(tmp)]
                dirs = [e for e in entries if os.path.isdir(e)]
                base = dirs[0] if len(dirs) == 1 and not any(
                    os.path.isfile(e) for e in entries) else tmp

        # ---- identify the data against the pinned sealed hashes ----------
        if sealed:
            # Verify the release end to end against its own manifest.
            manifest = os.path.join(base, "MANIFEST.txt")
            ok_count = bad_count = absent = 0
            with open(manifest, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    want, _, rel = line.partition("  ")
                    rel = rel.strip().lstrip("./")
                    target = os.path.join(base, rel)
                    if not os.path.isfile(target):
                        absent += 1
                    elif sha256_file(target) == want:
                        ok_count += 1
                    else:
                        bad_count += 1
            chk.add("archive self-manifest", bad_count == 0 and absent == 0,
                    f"{ok_count} files verified, {bad_count} mismatched")
        else:
            # Check whatever was supplied against the hashes pinned in this
            # script.  Nothing shipped with the data is trusted to do this:
            # a manifest alongside it could say anything.
            ok_count = bad_count = absent = 0
            bad_names = []
            for rel, want in sorted(SEALED_FILE_HASHES.items()):
                target = os.path.join(base, rel)
                if not os.path.isfile(target):
                    absent += 1
                elif sha256_file(target) == want:
                    ok_count += 1
                else:
                    bad_count += 1
                    bad_names.append(rel)
            chk.add("data files match the sealed v1.1-AB hashes",
                    bad_count == 0 and ok_count > 0,
                    f"{ok_count} of {len(SEALED_FILE_HASHES)} model data files "
                    f"verified against hashes pinned in this script"
                    + (f", {bad_count} MISMATCHED {bad_names[:3]}" if bad_names else "")
                    + (f", {absent} not supplied" if absent else ""))

        G = os.path.join(base, "geometry")
        O = os.path.join(base, "outputs")

        def maybe(path):
            """Load a JSON file, or None if it was not supplied."""
            if not os.path.isfile(path):
                return None
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)

        orig_geom = maybe(os.path.join(G, "approved_AB_model.json"))
        orig_rec = maybe(os.path.join(G, "receptors.json"))
        orig_edge = maybe(os.path.join(G, "casting_edge.json"))
        orig_peaks = maybe(os.path.join(O, "peaks.json"))
        orig_comp = maybe(os.path.join(O, "comp_at_peaks.json"))
        orig_attr = maybe(os.path.join(O, "attribution.json"))

        if not any((orig_geom, orig_rec, orig_peaks, orig_comp, orig_attr)):
            print("none of the model's data files were supplied; nothing to diff.")
            return 2

        skipped = []

        m = M.load().d
        E0 = m["crs"]["local_origin_E"]
        N0 = m["crs"]["local_origin_N"]
        LAT = m["solar"]["latitude"]
        LON = m["solar"]["longitude"]

        # ---- building footprints ----------------------------------------
        if orig_geom is None:
            skipped.append('approved geometry')
        else:
            worst_v = 0.0
            worst_a = 0.0
            notes = []
            for part in ("building_A", "building_B_plate",
                         "building_B_communal_roof", "building_B_lift_overrun"):
                o = orig_geom[part]
                r = m["approved"].get(part)
                if r is None:
                    notes.append(f"{part} missing")
                    continue
                if float(r["top_rl"]) != float(o["top_rl"]):
                    notes.append(f"{part} top_rl {r['top_rl']} vs {o['top_rl']}")
                dev, err = max_vertex_dev(r["footprint"], o["footprint"], E0, N0)
                if dev is None:
                    notes.append(f"{part} {err}")
                    continue
                worst_v = max(worst_v, dev)
                worst_a = max(worst_a, abs(shoelace(r["footprint"]) - o["area"]))
            chk.add("approved geometry: vertices", not notes and worst_v <= VERTEX_TOL_M,
                    f"max deviation {worst_v * 1000:.4f} mm" + (f"; {notes}" if notes else ""))
            chk.add("approved geometry: areas", worst_a <= AREA_TOL_M2,
                    f"max |delta| {worst_a:.2e} m2")

        # ---- receptors ---------------------------------------------------
        if orig_rec is None:
            skipped.append('receptors')
        else:
            worst_v = 0.0
            rnotes = []
            for pos in ("yard", "sched"):
                for lot in sorted(orig_rec["pos"][pos]):
                    dev, err = max_vertex_dev(m["receptors"][pos][lot],
                                              orig_rec["pos"][pos][lot], E0, N0)
                    if dev is None:
                        rnotes.append(f"{pos}/{lot} {err}")
                    else:
                        worst_v = max(worst_v, dev)
            chk.add("receptor polygons", not rnotes and worst_v <= VERTEX_TOL_M,
                    f"max deviation {worst_v * 1000:.4f} mm" + (f"; {rnotes}" if rnotes else ""))

            # receptor metadata is stored at full float precision, so demand exact
            meta_bad = []
            for pos in ("yard", "sched"):
                for lot in sorted(orig_rec["meta"][pos]):
                    om = orig_rec["meta"][pos][lot]
                    rm = m["receptor_meta"][pos][lot]
                    for field in ("depth_m", "width_m", "area_m2"):
                        if repr(float(rm[field])) != repr(float(om[field])):
                            meta_bad.append(f"{pos}/{lot}.{field}")
            chk.add("receptor metadata (exact)", not meta_bad,
                    "identical to full float precision" if not meta_bad else f"{meta_bad}")

        # ---- casting edge -------------------------------------------------
        if orig_edge is None:
            skipped.append('casting edge')
        else:
            ce = m["casting_edge"]
            dev = max(
                max(abs(ce["union_bbox"][0] + E0 - orig_edge["union_bbox"][0]),
                    abs(ce["union_bbox"][2] + E0 - orig_edge["union_bbox"][2])),
                max(abs(ce["union_bbox"][1] + N0 - orig_edge["union_bbox"][1]),
                    abs(ce["union_bbox"][3] + N0 - orig_edge["union_bbox"][3])),
                abs(ce["centroid"][0] + E0 - orig_edge["centroid"][0]),
                abs(ce["centroid"][1] + N0 - orig_edge["centroid"][1]),
            )
            chk.add("casting edge", dev <= 1e-6, f"max deviation {dev:.2e} m")

        # ---- the 24 frozen peaks, at the original's full precision --------
        if orig_peaks is None:
            skipped.append('frozen peaks')
        else:
            frozen = m["frozen"]["peaks"]
            worst = 0.0
            worst_k = None
            inst_bad = []
            missing = []
            for key, v in orig_peaks.items():
                fr = frozen.get(key)
                if fr is None:
                    missing.append(key)
                    continue
                d = abs(float(fr["peak_loss_m2"]) - v["peak_loss_m2"])
                if d > worst:
                    worst, worst_k = d, key
                if fr.get("instant") != v["instant"]:
                    inst_bad.append(key)
            chk.add("frozen peaks: embedded values", not missing and worst <= 1e-6,
                    f"{len(orig_peaks)} compared, max |delta| {worst:.2e} m2"
                    + (f" on {worst_k}" if worst_k else "")
                    + (f"; missing {missing}" if missing else ""))
            chk.add("frozen peaks: governing instants", not inst_bad and not missing,
                    f"{len(orig_peaks) - len(inst_bad)}/{len(orig_peaks)} exact")

        # ---- attribution: A vs B, at full float precision -----------------
        if orig_attr is None:
            skipped.append('attribution')
        else:
            orig_attr = json.load(open(os.path.join(O, "attribution.json")))
            attr = m["frozen"]["attribution"]
            bad = []
            for key, v in orig_attr.items():
                fr = attr.get(key)
                if fr is None:
                    bad.append(f"{key} missing")
                    continue
                for field in ("full", "A_only", "B_only", "base"):
                    if abs(float(fr[field]) - float(v[field])) > 1e-9:
                        bad.append(f"{key}.{field}")
                if fr.get("instant") != v["instant"]:
                    bad.append(f"{key}.instant")
            chk.add("frozen attribution", not bad,
                    f"{len(orig_attr)} entries, A/B split exact" if not bad else f"{bad[:4]}")

        # ---- full-year table, parsed from the original's own logs ---------
        fy_re = re.compile(
            r"^(\S+?)/(\S+?/\S+)\s+peak\s+([\d.]+)\s+\(([\d.]+)%\)\s+at\s+(\S+)\s+"
            r"days\s+(\d+)\s+(\d\d:\d\d)-(\d\d:\d\d)\s+"
            r"0800\s+(-?[\d.]+)\s+0830\s+(-?[\d.]+)\s+0900\s+(-?[\d.]+)\s+"
            r"cmp48\s+(-?[\d.]+)\s*$")
        bad = []
        n_fy = 0
        fy_logs = [p for p in (os.path.join(O, f"fy_{x}.log")
                               for x in ("yard", "sched")) if os.path.isfile(p)]
        if not fy_logs:
            skipped.append("full-year table")
        for log in fy_logs:
            pos = os.path.basename(log)[3:-4]
            for line in open(log, encoding="utf-8"):
                mt = fy_re.match(line.strip())
                if not mt:
                    continue
                lpos, fkey, peak, pct, inst, days, t0, t1, l8, l830, l9, c48 = mt.groups()
                fr = m["frozen"]["fullyear"].get(lpos, {}).get(fkey)
                if fr is None:
                    bad.append(f"{lpos}/{fkey} missing")
                    continue
                n_fy += 1
                for got, want, label in (
                    (round(float(fr["peak"]), 3), float(peak), "peak"),
                    (round(float(fr["pct"]), 1), float(pct), "pct"),
                    (int(fr["days"]), int(days), "days"),
                    (round(float(fr["l0800"]), 3), float(l8), "l0800"),
                    (round(float(fr["l0830"]), 3), float(l830), "l0830"),
                    (round(float(fr["l0900"]), 3), float(l9), "l0900"),
                    (round(float(fr["cmp48"]), 3), float(c48), "cmp48"),
                ):
                    if abs(got - want) > 5e-4:
                        bad.append(f"{lpos}/{fkey}.{label} {got} vs {want}")
                if fr.get("instant") != inst:
                    bad.append(f"{lpos}/{fkey}.instant")
                if fr.get("first_time") != t0 or fr.get("last_time") != t1:
                    bad.append(f"{lpos}/{fkey}.window")
        # A regex that silently matched nothing would otherwise pass, so
        # demand that every frozen row was accounted for by a log row.
        if fy_logs:
            n_fy_frozen = sum(len(v) for v in m["frozen"]["fullyear"].values())
            if n_fy != n_fy_frozen:
                bad.append(f"covered {n_fy} of {n_fy_frozen} frozen rows")
            chk.add("frozen full-year table", not bad,
                    f"{n_fy}/{n_fy_frozen} rows from fy_*.log, all fields match"
                    if not bad else f"{bad[:4]}")

        # ---- incremental table --------------------------------------------
        # The archive logs only f000; the frozen table holds only f000 as
        # well, so these logs cover it completely.
        inc_re = re.compile(
            r"^(\S+?)/(\S+?/\S+?)/(RL\S+)\s+incr\s+(-?[\d.]+)\s+m2\s+at\s+(\S+)\s+"
            r"\(prop\s+(-?[\d.]+),\s*comp\s+(-?[\d.]+)\)\s+days\s+(\d+)\s*$")
        bad = []
        n_inc = 0
        inc_logs = [p for p in (os.path.join(O, f"inc2_{x}_f000.log")
                                for x in ("yard", "sched")) if os.path.isfile(p)]
        if not inc_logs:
            skipped.append("incremental table")
        for log in inc_logs:
            pos = os.path.basename(log)[5:-10]
            for line in open(log, encoding="utf-8"):
                mt = inc_re.match(line.strip())
                if not mt:
                    continue
                lpos, fkey, rl, incr, inst, prop, comp, days = mt.groups()
                fr = m["frozen"]["incremental"].get(lpos, {}).get(fkey, {}).get(rl)
                if fr is None:
                    bad.append(f"{lpos}/{fkey}/{rl} missing")
                    continue
                n_inc += 1
                for got, want, label in (
                    (round(float(fr["incremental"]), 3), float(incr), "incremental"),
                    (round(float(fr["prop"]), 3), float(prop), "prop"),
                    (round(float(fr["comp"]), 3), float(comp), "comp"),
                    (int(fr["days"]), int(days), "days"),
                ):
                    if abs(got - want) > 5e-4:
                        bad.append(f"{lpos}/{fkey}/{rl}.{label} {got} vs {want}")
                if fr.get("instant") != inst:
                    bad.append(f"{lpos}/{fkey}/{rl}.instant")
        if inc_logs:
            n_inc_frozen = sum(len(rls) for pos in m["frozen"]["incremental"].values()
                               for rls in pos.values())
            if n_inc != n_inc_frozen:
                bad.append(f"covered {n_inc} of {n_inc_frozen} frozen rows")
            chk.add("frozen incremental table", not bad,
                    f"{n_inc}/{n_inc_frozen} rows from inc2_*_f000.log, all fields match"
                    if not bad else f"{bad[:4]}")

        # ---- the offline first_contact_RL table, by the original's method -
        if orig_comp is None:
            skipped.append('offline first_contact_RL')
        else:
            from greville_model.solar import sun_position
            from greville_model.geometry import point_in_poly

            A = ring(m["approved"]["building_A"]["footprint"])
            Bp = ring(m["approved"]["building_B_plate"]["footprint"])
            Ah, Bh = hull(A), hull(Bp)
            CELL = M.FROZEN_CELL

            worst = 0.0
            worst_k = None
            n = 0
            for key, v in orig_comp.items():
                want = v.get("first_contact_RL")
                if want is None:
                    continue
                pos, _fence, lot = key.split("/")
                dt = M.parse_instant(v["instant"])
                alt, az = sun_position(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                                       LAT, LON)
                z = m["receiver_rl"][lot]
                POS = ring(m["receptors"][pos][lot])
                x0 = min(p[0] for p in POS)
                x1 = max(p[0] for p in POS)
                y0 = min(p[1] for p in POS)
                y1 = max(p[1] for p in POS)
                a = math.radians(az)
                dx, dy = math.sin(a), math.cos(a)
                tan_alt = math.tan(math.radians(alt))
                best = math.inf
                y = y0 + CELL / 2
                while y < y1:
                    x = x0 + CELL / 2
                    while x < x1:
                        if point_in_poly(x, y, POS):
                            e = min(ray_entry(x, y, dx, dy, Ah),
                                    ray_entry(x, y, dx, dy, Bh))
                            if math.isfinite(e):
                                need = z + e * tan_alt
                                if need < best:
                                    best = need
                        x += CELL
                    y += CELL
                d = abs(best - want)
                if d > worst:
                    worst, worst_k = d, key
                n += 1
            # Every field of every row, as embedded in the model.
            emb = m["frozen"]["comp_at_peaks"]
            row_bad = []
            for key, v in orig_comp.items():
                e = emb.get(key)
                if e is None:
                    row_bad.append(f"{key} missing")
                    continue
                for field, want in v.items():
                    got = e.get(field)
                    if isinstance(want, float) and isinstance(got, (int, float)):
                        if abs(float(got) - want) > 1e-9:
                            row_bad.append(f"{key}.{field}")
                    elif got != want:
                        row_bad.append(f"{key}.{field}")
            if len(emb) != len(orig_comp):
                row_bad.append(f"{len(emb)} rows vs {len(orig_comp)}")
            chk.add("comparator-at-peaks table",
                    not row_bad and worst <= RL_TOL_M,
                    (f"{len(orig_comp)} rows, every field exact"
                     if not row_bad else
                     f"{len(row_bad)} field(s) differ {row_bad[:4]}")
                    + f"; first_contact_RL recomputed by the hull method to "
                      f"{worst * 1000:.4f} mm")

    print("Diff of this reconstruction against the sealed original v1.1-AB:")
    print()
    failed = chk.report()
    if skipped:
        print()
        print("Not supplied, so not checked: " + ", ".join(skipped) + ".")
    print()
    print("Not established by this check:")
    print("  * The engine.  The reconstruction's solar and shadow code is")
    print("    checked by the physics tests in model/tests/, not against the")
    print("    original source.")
    print("  * The receiver levels, which v1.1-AB carries forward from v1.0.2")
    print("    rather than restating.")
    print("    This reconstruction holds:",
          ", ".join(f"{k}={v}" for k, v in sorted(m["receiver_rl"].items())))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
