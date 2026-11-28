"""Private parity run at the recorded instants: attribution (building A alone, B alone) and the comparator
at each recorded peak, for both comparator geometries the provenance notes describe.

    python3 -I verify/solombra_parity/run_instants.py --engine <engine checkout>
"""
import argparse, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from run_full_year import ROOT, approved, build, cut, engine  # noqa: E402


def when(instant):
    date, clock = instant.split("T")
    _, mo, da = (int(x) for x in date.split("-"))
    return mo, da, int(clock[:2]) * 60 + int(clock[3:5])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", required=True)
    a = ap.parse_args()
    d = json.loads((ROOT / "model" / "data" / "greville_model_v1.1-AB.json").read_text())
    template = json.loads((Path(a.engine) / "reference" / "cases" / "04-overshadowing-split" / "input.json").read_text())["case"]
    off = d["solar"]["tz_offset_h"]
    env = lambda rl: [(d["comparator"]["A"], rl), (d["comparator"]["B"], rl)]
    reqs, plan = [], []

    def ask(key, instant, new, label):
        pos, fence, lot = key.split("/")
        mo, da, minute = when(instant)
        reqs.append({"op": "sunlit", "case": build(d, template, pos, fence, lot, new), "month": mo, "day": da, "utcOffsetHours": off, "minutes": [minute], "scenarios": ["existing", "proposed"]})
        plan.append((key, label))

    for key, at in d["frozen"]["attribution"].items():
        for label, new in (("full", approved(d)), ("A_only", approved(d, "A")), ("B_only", approved(d, "B"))):
            ask(key, at["instant"], new, "attr." + label)
    for key, cp in d["frozen"]["comp_at_peaks"].items():
        ask(key, cp["instant"], approved(d), "cap.peak")
        for rl, name in ((48.0, "RL48"), (55.75, "RL5575")):
            ask(key, cp["instant"], cut(d, rl), "cap.cut." + name)
            ask(key, cp["instant"], env(rl), "cap.env." + name)
    got = engine(a.engine, reqs)
    val = {}
    for (key, label), g in zip(plan, got):
        r = g["rows"][0]
        val[(key, label)] = r["existing"] - r["proposed"]
        val[(key, label + ".base")] = r["existing"]
    rows = []
    for key, at in d["frozen"]["attribution"].items():
        for f in ("full", "A_only", "B_only"):
            rows.append({"table": "attribution", "key": key, "field": f, "instant": at["instant"], "recorded": at[f], "engine": val[(key, "attr." + f)]})
        rows.append({"table": "attribution", "key": key, "field": "base", "instant": at["instant"], "recorded": at["base"], "engine": val[(key, "attr.full.base")]})
    for key, cp in d["frozen"]["comp_at_peaks"].items():
        rows.append({"table": "comp_at_peaks", "key": key, "field": "peak", "instant": cp["instant"], "recorded": cp["peak"], "engine": val[(key, "cap.peak")]})
        for name, rec in (("RL48", "comp_RL48"), ("RL5575", "comp_RL5575")):
            rows.append({"table": "comp_at_peaks", "key": key, "field": rec + " (cut footprints)", "instant": cp["instant"], "recorded": cp[rec], "engine": val[(key, "cap.cut." + name)]})
            rows.append({"table": "comp_at_peaks", "key": key, "field": rec + " (rectangular envelopes)", "instant": cp["instant"], "recorded": cp[rec], "engine": val[(key, "cap.env." + name)]})
        for name, rec in (("RL48", "incr_RL48"), ("RL5575", "incr_RL5575")):
            rows.append({"table": "comp_at_peaks", "key": key, "field": rec + " (cut footprints)", "instant": cp["instant"], "recorded": cp[rec], "engine": val[(key, "cap.peak")] - val[(key, "cap.cut." + name)]})
    for r in rows:
        r["difference"] = r["engine"] - r["recorded"]
    (HERE / "instants_results.json").write_text(json.dumps(rows, indent=1) + "\n")
    groups = {}
    for r in rows:
        g = groups.setdefault((r["table"], r["field"].split(" (")[1][:-1] if "(" in r["field"] else "", "comp" if r["field"].startswith("comp") else "incr" if r["field"].startswith("incr") else r["field"]), [])
        g.append(abs(r["difference"]))
    for k, v in groups.items():
        print(k, "n", len(v), "worst", round(max(v), 4), "over 0.01:", sum(1 for x in v if x > 0.01))
    for r in sorted(rows, key=lambda r: -abs(r["difference"]))[:8]:
        print("  ", r["table"], r["key"], r["field"], r["instant"], "rec", round(r["recorded"], 4), "eng", round(r["engine"], 4))


if __name__ == "__main__":
    main()
