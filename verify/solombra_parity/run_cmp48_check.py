"""Why does the comparator's own peak at RL 48 differ for the fenced cases? Scans the year with both
comparator geometries and reports the peak over every minute and over a five-minute grid.

    python3 -I verify/solombra_parity/run_cmp48_check.py --engine <engine checkout>
"""
import argparse, calendar, json, sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_full_year import MINUTES, ROOT, build, cut, engine  # noqa: E402


def scan(job):
    eng, key, days = job
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    template = json.loads((Path(eng) / "reference" / "cases" / "04-overshadowing-split" / "input.json").read_text())["case"]
    pos, fence, lot = key.split("/")
    base = {"op": "sunlitDays", "days": days, "utcOffsetHours": d["solar"]["tz_offset_h"], "minutes": MINUTES}
    env = [(d["comparator"]["A"], 48.0), (d["comparator"]["B"], 48.0)]
    got = engine(eng, [{**base, "case": build(d, template, pos, fence, lot, cut(d, 48.0)), "scenarios": ["existing", "proposed"]},
                       {**base, "case": build(d, template, pos, fence, lot, env), "scenarios": ["proposed"]}])
    out = {"key": key}
    for name, g in (("cut", got[0]), ("env", got[1])):
        best, best5, when = 0.0, 0.0, None
        for di, day in enumerate(g["days"]):
            E = got[0]["days"][di]["existing"]
            c = [e - p for e, p in zip(E, day["proposed"])]
            m = max(c)
            if m > best:
                best, when = m, f"{day['month']:02d}-{day['day']:02d} {MINUTES[c.index(m)] // 60:02d}:{MINUTES[c.index(m)] % 60:02d}"
            best5 = max(best5, max(c[i] for i in range(0, len(c), 5)))
        out[name] = {"everyMinute": best, "fiveMinuteGrid": best5, "when": when}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    a = ap.parse_args()
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    days = [[m, day] for m in range(1, 13) for day in range(1, calendar.monthrange(2026, m)[1] + 1)]
    keys = [f"{pos}/{fk}" for pos, tbl in d["frozen"]["fullyear"].items() for fk in tbl if not fk.startswith("f000")]
    with ProcessPoolExecutor(4) as ex:
        res = list(ex.map(scan, [(a.engine, k, days) for k in keys]))
    (HERE / "cmp48_check.json").write_text(json.dumps(res, indent=1) + "\n")
    for r in res:
        pos, fk = r["key"].split("/", 1)
        rec = d["frozen"]["fullyear"][pos][fk]["cmp48"]
        print(r["key"][:12], "recorded", rec, "| cut footprints: every minute", round(r["cut"]["everyMinute"], 3), "5-min", round(r["cut"]["fiveMinuteGrid"], 3), "| envelopes: every minute", round(r["env"]["everyMinute"], 3), "5-min", round(r["env"]["fiveMinuteGrid"], 3), r["env"]["when"])
