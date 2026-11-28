"""Private parity run: the Solombra calculation engine on this model's inputs, against the sealed recorded figures.

Reads model/data/greville_model_v1.1-AB.json (not modified). Calls the engine's headless interface in a
separate checkout given by --engine. Writes parity_results.json and parity_table.csv beside this script.
Nothing here is copied into the engine's repository, and nothing in this repository's frozen files is touched.

    python3 -I verify/solombra_parity/run_parity.py --engine /home/user/suncheck
"""
import argparse, copy, csv, json, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def num(x):
    return {"value": x, "source": {"type": "plan", "reference": "parity adapter"}, "confirmed": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    args = ap.parse_args()
    eng = Path(args.engine)
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    template = json.loads((eng / "reference" / "cases" / "04-overshadowing-split" / "input.json").read_text())["case"]
    f0 = template["fences"][0]
    lat, lon, off = d["solar"]["latitude"], d["solar"]["longitude"], d["solar"]["tz_offset_h"]

    def walls(poly, height, status, tag):
        """A flat-topped prism standing clear of the receiver casts, on the receiver's plane, the union of its
        wall shadows. So each edge of the footprint is entered as an opaque wall of the prism's height."""
        pts = poly[:-1] if poly[0] == poly[-1] else poly
        out = []
        for i, a in enumerate(pts):
            b = pts[(i + 1) % len(pts)]
            f = copy.deepcopy(f0)
            f.update({"id": f"{tag}-{i}", "name": f"{tag} edge {i + 1}", "status": status, "u1": num(a[0]), "v1": num(a[1]), "u2": num(b[0]), "v2": num(b[1]), "height": num(height)})
            out.append(f)
        return out

    def case_for(pos, fence, lot):
        z = d["receiver_rl"][lot]
        c = copy.deepcopy(template)
        c["title"] = "Private parity scene"
        c["site"].update({"latitude": num(lat), "longitude": num(lon), "bearingU": num(90), "calculationYear": 2026, "lodgementDate": "2026-10-05"})
        poly = d["receptors"][pos][lot]
        poly = poly[:-1] if poly[0] == poly[-1] else poly
        c["yard"] = {**c["yard"], "kind": "polygon", "vertices": [{"u": num(x), "v": num(y)} for x, y in poly]}
        c["blocks"], fs = [], []
        for name, o in d["occluders"].items():
            fs += walls(o["footprint"], o["top_rl"] - z, "existing-retained", "dwelling-" + name[:2])
        h = d["fence_cases"][fence]["height"]
        if h:
            for i, (a, b) in enumerate(d["fences"][lot]["lines"]):
                f = copy.deepcopy(f0)
                f.update({"id": f"fence-{i}", "name": f"fence {i + 1}", "status": "existing-retained", "u1": num(a[0]), "v1": num(a[1]), "u2": num(b[0]), "v2": num(b[1]), "height": num(h)})
                fs.append(f)
        for name, o in d["approved"].items():
            fs += walls(o["footprint"], o["top_rl"] - z, "new", name)
        c["fences"], c["noFenceDeclared"] = fs, False
        return c

    def when(instant):
        date, clock = instant.split("T")
        _, mo, da = (int(x) for x in date.split("-"))
        hh, mm = int(clock[:2]), int(clock[3:5])
        return mo, da, hh * 60 + mm

    reqs, keys = [], []
    for key, pk in d["frozen"]["peaks"].items():
        pos, fence, lot = key.split("/")
        mo, da, minute = when(pk["instant"])
        reqs.append({"op": "sunlit", "case": case_for(pos, fence, lot), "month": mo, "day": da, "utcOffsetHours": off, "minutes": [minute], "scenarios": ["existing", "proposed"]})
        keys.append(key)
    sun_keys = list(d["frozen"]["comp_at_peaks"].items())
    for key, cp in sun_keys:
        mo, da, minute = when(cp["instant"])
        base = {"lat": lat, "lon": lon, "year": 2026, "month": mo, "day": da, "minute": minute, "utcOffsetHours": off}
        reqs += [{"op": "sun", **base}, {"op": "sunNoaa", **base}]
    n_first = len(reqs)
    reqs.append({"op": "identity"})
    p = subprocess.run(["npx", "--no-install", "tsx", "tools/engine-cli.ts", "batch"], cwd=eng, input=json.dumps(reqs), capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit(p.stderr[-2000:])
    got = json.loads(p.stdout)
    identity = got[-1]
    # Second pass: the same scenes with the engine's sun moved onto the retired routine's position at each instant,
    # to separate the effect of the sun-position difference from the effect of the recorded figures' 0.02 m grid.
    q = []
    for key in keys:
        mo, da, minute = when(d["frozen"]["peaks"][key]["instant"])
        base = {"lat": lat, "lon": lon, "year": 2026, "month": mo, "day": da, "minute": minute, "utcOffsetHours": off}
        q += [{"op": "sun", **base}, {"op": "sunNoaa", **base}]
    pos2 = json.loads(subprocess.run(["npx", "--no-install", "tsx", "tools/engine-cli.ts", "batch"], cwd=eng, input=json.dumps(q), capture_output=True, text=True).stdout)
    second = []
    for i, key in enumerate(keys):
        new, old = pos2[2 * i], pos2[2 * i + 1]
        second.append({**reqs[i], "sunShiftDeg": [old["altitudeDeg"] - new["altitudeDeg"], old["azimuthDeg"] - new["azimuthDeg"]]})
    got2 = json.loads(subprocess.run(["npx", "--no-install", "tsx", "tools/engine-cli.ts", "batch"], cwd=eng, input=json.dumps(second), capture_output=True, text=True).stdout)
    rows = []
    for key, g in zip(keys, got):
        pk = d["frozen"]["peaks"][key]
        if "error" in g:
            rows.append({"key": key, "error": g["error"]})
            continue
        r = g["rows"][0]
        loss = r["existing"] - r["proposed"]
        rows.append({"key": key, "instant": pk["instant"], "altitudeDeg": round(r["altitudeDeg"], 5), "receptorAreaRecorded": pk["pos_area_m2"], "receptorAreaEngine": g["yardAreaM2"],
                     "otherwiseSunlitRecorded": pk["otherwise_sunlit_m2"], "otherwiseSunlitEngine": r["existing"], "lossRecorded": pk["peak_loss_m2"], "lossEngine": loss,
                     "dOtherwiseSunlit": r["existing"] - pk["otherwise_sunlit_m2"], "dLoss": loss - pk["peak_loss_m2"],
                     "dLossSameSun": (got2[keys.index(key)]["rows"][0]["existing"] - got2[keys.index(key)]["rows"][0]["proposed"]) - pk["peak_loss_m2"], "saturated": abs(pk["peak_loss_m2"] - pk["otherwise_sunlit_m2"]) < 1e-9})
    suns = []
    for i, (key, cp) in enumerate(sun_keys):
        new, old = got[len(keys) + 2 * i], got[len(keys) + 2 * i + 1]
        suns.append({"key": key, "instant": cp["instant"], "altRecorded": cp["alt"], "azRecorded": cp["az"], "altEngine": new["altitudeDeg"], "azEngine": new["azimuthDeg"],
                     "dAltEngine": new["altitudeDeg"] - cp["alt"], "dAzEngine": new["azimuthDeg"] - cp["az"], "dAltRetiredRoutine": old["altitudeDeg"] - cp["alt"], "dAzRetiredRoutine": old["azimuthDeg"] - cp["az"]})
    out = {"engine": identity, "areas": rows, "sun": suns}
    (HERE / "parity_results.json").write_text(json.dumps(out, indent=1) + "\n")
    with open(HERE / "parity_table.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows([r for r in rows if "error" not in r])
    ok = [r for r in rows if "error" not in r]
    part = [r for r in ok if not r["saturated"]]
    mx = lambda rs, k: max((abs(r[k]) for r in rs), default=float("nan"))
    print("engine", identity["engineVersion"], "| cases", len(ok), "errors", len(rows) - len(ok), "| partial (not saturated)", len(part))
    print("receptor area: worst difference", mx(ok, "receptorAreaEngine") and max(abs(r["receptorAreaEngine"] - r["receptorAreaRecorded"]) for r in ok))
    print("otherwise sunlit: worst", mx(ok, "dOtherwiseSunlit"), "| loss: worst", mx(ok, "dLoss"), "| loss, partial cases only:", mx(part, "dLoss"))
    print("sun, engine vs recorded: alt", mx(suns, "dAltEngine"), "az", mx(suns, "dAzEngine"), "| retired routine vs recorded: alt", mx(suns, "dAltRetiredRoutine"), "az", mx(suns, "dAzRetiredRoutine"))
    print("loss with the engine's sun moved onto the recorded sun position: worst", mx(ok, "dLossSameSun"))
    for r in sorted(ok, key=lambda r: -abs(r["dLoss"]))[:6]:
        print("  ", r["key"], r["instant"], "alt", r["altitudeDeg"], "loss rec", round(r["lossRecorded"], 4), "eng", round(r["lossEngine"], 4), "d", round(r["dLoss"], 4), "sat" if r["saturated"] else "")


if __name__ == "__main__":
    main()
