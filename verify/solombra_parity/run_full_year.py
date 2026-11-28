"""Private parity run, full year: the Solombra engine on this model's inputs for every day of 2026,
04:00 to 10:00 at one-minute steps, against the sealed full-year, incremental, attribution and
comparator-at-peak figures. Reads the data file only; writes into this folder only.

    python3 -I verify/solombra_parity/run_full_year.py --engine <engine checkout> [--days N] [--jobs 4]
"""
import argparse, calendar, copy, json, subprocess, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MINUTES = list(range(240, 601))
THRESHOLDS = [0.0001, 0.0004, 0.001, 0.01, 0.1]


def num(x):
    return {"value": x, "source": {"type": "plan", "reference": "parity adapter"}, "confirmed": True}


def build(d, template, pos, fence, lot, new):
    """A case for one receptor. `new` is a list of (footprint, top level) entered as the development."""
    f0 = template["fences"][0]
    z = d["receiver_rl"][lot]

    def wall(a, b, h, status, tag):
        f = copy.deepcopy(f0)
        f.update({"id": tag, "name": tag, "status": status, "u1": num(a[0]), "v1": num(a[1]), "u2": num(b[0]), "v2": num(b[1]), "height": num(h)})
        return f

    def walls(poly, top, status, tag):
        pts = poly[:-1] if poly[0] == poly[-1] else poly
        return [wall(a, pts[(i + 1) % len(pts)], top - z, status, f"{tag}-{i}") for i, a in enumerate(pts) if top - z > 0]

    c = copy.deepcopy(template)
    c["title"] = "Private parity scene"
    c["site"].update({"latitude": num(d["solar"]["latitude"]), "longitude": num(d["solar"]["longitude"]), "bearingU": num(90), "calculationYear": 2026, "lodgementDate": "2026-10-05"})
    poly = d["receptors"][pos][lot]
    poly = poly[:-1] if poly[0] == poly[-1] else poly
    c["yard"] = {**c["yard"], "kind": "polygon", "vertices": [{"u": num(x), "v": num(y)} for x, y in poly]}
    fs = []
    for name, o in d["occluders"].items():
        fs += walls(o["footprint"], o["top_rl"], "existing-retained", "dw" + name[:2])
    h = d["fence_cases"][fence]["height"]
    if h:
        fs += [wall(a, b, h, "existing-retained", f"fence-{i}") for i, (a, b) in enumerate(d["fences"][lot]["lines"])]
    for k, (fp, top) in enumerate(new):
        fs += walls(fp, top, "new", f"new{k}")
    c["blocks"], c["fences"], c["noFenceDeclared"] = [], fs, False
    return c


def approved(d, parts="AB"):
    a = d["approved"]
    out = []
    if parts != "B":
        out.append((a["building_A"]["footprint"], a["building_A"]["top_rl"]))
    if parts != "A":
        out += [(a[k]["footprint"], a[k]["top_rl"]) for k in ("building_B_plate", "building_B_communal_roof", "building_B_lift_overrun")]
    return out


def cut(d, rl):
    a = d["approved"]
    return [(a["building_A"]["footprint"], rl), (a["building_B_plate"]["footprint"], rl)]


def engine(eng, reqs):
    p = subprocess.run(["npx", "--no-install", "tsx", "tools/engine-cli.ts", "batch"], cwd=eng, input=json.dumps(reqs), capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-1500:])
    return json.loads(p.stdout)


def hhmm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def scan(job):
    eng, key, days = job
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    template = json.loads((Path(eng) / "reference" / "cases" / "04-overshadowing-split" / "input.json").read_text())["case"]
    pos, fence, lot = key.split("/")
    off = d["solar"]["tz_offset_h"]
    base = {"op": "sunlitDays", "days": days, "utcOffsetHours": off, "minutes": MINUTES}
    reqs = [{**base, "case": build(d, template, pos, fence, lot, approved(d)), "scenarios": ["existing", "proposed"]},
            {**base, "case": build(d, template, pos, fence, lot, cut(d, 48.0)), "scenarios": ["proposed"]}]
    if fence == "f000":
        reqs.append({**base, "case": build(d, template, pos, fence, lot, cut(d, 55.75)), "scenarios": ["proposed"]})
    got = engine(eng, reqs)
    for g in got:
        if "error" in g:
            raise RuntimeError(key + ": " + g["error"])
    out = {"key": key, "peak": 0.0, "peakInstant": None, "cmp48Peak": 0.0, "at": {"0800": 0.0, "0830": 0.0, "0900": 0.0}, "atPeakDay": {},
           "days": {str(t): 0 for t in THRESHOLDS}, "first": {str(t): None for t in THRESHOLDS}, "last": {str(t): None for t in THRESHOLDS}, "incremental": {}}
    incr = {rl: {"peak": 0.0, "instant": None, "prop": 0.0, "comp": 0.0, "days": {str(t): 0 for t in THRESHOLDS}} for rl in (["48.0", "55.75"] if fence == "f000" else [])}
    per_day = []
    for di, day in enumerate(got[0]["days"]):
        E, P = day["existing"], day["proposed"]
        C48 = got[1]["days"][di]["proposed"]
        loss = [e - p for e, p in zip(E, P)]
        comp48 = [e - c for e, c in zip(E, C48)]
        mx = max(loss)
        if mx > out["peak"] + 1e-9:
            out["peak"], out["peakInstant"] = mx, f"2026-{day['month']:02d}-{day['day']:02d}T{hhmm(MINUTES[loss.index(mx)])}"
            out["peakOtherwiseSunlit"] = E[loss.index(mx)]
        out["cmp48Peak"] = max(out["cmp48Peak"], max(comp48))
        for label, m in (("0800", 480), ("0830", 510), ("0900", 540)):
            out["at"][label] = max(out["at"][label], loss[m - 240])
        per_day.append({"date": f"2026-{day['month']:02d}-{day['day']:02d}", "max": mx, "l0800": loss[240], "l0830": loss[270], "l0900": loss[300]})
        for t in THRESHOLDS:
            idx = [i for i, x in enumerate(loss) if x > t]
            if idx:
                out["days"][str(t)] += 1
                a, b = MINUTES[idx[0]], MINUTES[idx[-1]]
                out["first"][str(t)] = a if out["first"][str(t)] is None else min(out["first"][str(t)], a)
                out["last"][str(t)] = b if out["last"][str(t)] is None else max(out["last"][str(t)], b)
        for rl, comp in (("48.0", comp48),) + ((("55.75", [e - c for e, c in zip(E, got[2]["days"][di]["proposed"])]),) if fence == "f000" else ()):
            if rl not in incr:
                continue
            inc = [l - c for l, c in zip(loss, comp)]
            m = max(inc)
            if m > incr[rl]["peak"] + 1e-9:
                k = inc.index(m)
                incr[rl].update({"peak": m, "instant": f"2026-{day['month']:02d}-{day['day']:02d}T{hhmm(MINUTES[k])}", "prop": loss[k], "comp": comp[k]})
            for t in THRESHOLDS:
                if m > t:
                    incr[rl]["days"][str(t)] += 1
    for t in THRESHOLDS:
        for k in ("first", "last"):
            out[k][str(t)] = None if out[k][str(t)] is None else hhmm(out[k][str(t)])
    pk = next((x for x in per_day if out["peakInstant"] and x["date"] == out["peakInstant"][:10]), None)
    out["atPeakDay"] = pk
    out["incremental"] = incr
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    ap.add_argument("--days", type=int, default=0, help="first N days only (a timing run)")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--only")
    a = ap.parse_args()
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    days = [[m, day] for m in range(1, 13) for day in range(1, calendar.monthrange(2026, m)[1] + 1)]
    if a.days:
        days = days[: a.days]
    keys = [f"{pos}/{fk}" for pos, tbl in d["frozen"]["fullyear"].items() for fk in tbl]
    if a.only:
        keys = [k for k in keys if k == a.only]
    t = time.time()
    with ProcessPoolExecutor(a.jobs) as ex:
        res = list(ex.map(scan, [(a.engine, k, days) for k in keys]))
    ident = engine(a.engine, [{"op": "identity"}])[0]
    out = {"engine": ident, "daysScanned": len(days), "minutes": "04:00 to 10:00, every minute", "seconds": round(time.time() - t), "thresholdsM2": THRESHOLDS, "results": res}
    name = "full_year_results.json" if not a.days and not a.only else "full_year_partial.json"
    (HERE / name).write_text(json.dumps(out, indent=1) + "\n")
    print(name, "configs", len(res), "days", len(days), "seconds", out["seconds"])


if __name__ == "__main__":
    main()
