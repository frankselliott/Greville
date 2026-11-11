#!/usr/bin/env python3
"""Fetch open-licence map data for the Greville shadow model.

Every layer comes from Queensland Government ArcGIS REST services and is
CC BY 4.0 (State of Queensland). No imagery, no Mapbox/Nearmap/Google content.

Outputs, all in GDA2020 / MGA zone 56 (EPSG:7856), heights in m AHD:
  raw/<layer>.geojson     verbatim service responses (paged and merged)
  shadow_context.json     derived inputs for the shadow engine:
                            buildings: footprint rings + base/eave/top RL
                            parcels:   lotplan + rings
                            contours:  1 m LiDAR contour lines (terrain)
  MANIFEST.json           query parameters, fetch time, counts, SHA-256 per file
  NOTICE.txt              CC BY 4.0 attribution and accuracy limits

Standard library only. Usage:
  python3 -I fetch_shadow_map_data.py OUTDIR [--bbox XMIN,YMIN,XMAX,YMAX]
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://spatial-gis.information.qld.gov.au/arcgis/rest/services"
SR = 7856  # GDA2020 / MGA zone 56

# Default frame: Greville site + Cluster 5 + east of the rail to Hudson Rd.
DEFAULT_BBOX = (503840.0, 6966480.0, 504360.0, 6966900.0)

LAYERS = {
    # name: (service path, where clause)
    "parcels":   ("PlanningCadastre/LandParcelPropertyFramework/MapServer/4", "1=1"),
    "addresses": ("PlanningCadastre/LandParcelPropertyFramework/MapServer/0", "1=1"),
    # Current (May 2025 LiDAR) outlines only; superseded 2019 outlines excluded.
    "buildings": ("Structure/BuildingsAndSettlements/MapServer/11", "status = 'Current'"),
    "contours":  ("Elevation/Contours/MapServer/30", "1=1"),
    "roads":     ("Transportation/RoadsAndTracks/MapServer/10", "1=1"),
    "rail":      ("Transportation/OtherTransport/MapServer/155", "1=1"),
}

UA = "greville-shadow-map-fetch/1.0"


def get_json(url, params, retries=4):
    q = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(f"service error: {d['error']}")
            return d
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  retry {attempt + 1} in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)


def layer_info(path):
    return get_json(f"{BASE}/{path}", {"f": "json"})


def fetch_layer(path, where, bbox):
    info = layer_info(path)
    page = int(info.get("maxRecordCount") or 1000)
    oid = next((f["name"] for f in info["fields"] if f["type"] == "esriFieldTypeOID"), None)
    base = {
        "where": where,
        "geometry": ",".join(f"{v:.3f}" for v in bbox),
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "inSR": SR,
        "outSR": SR,
        "outFields": "*",
        "returnGeometry": "true",
        "f": "geojson",
    }
    if oid:
        base["orderByFields"] = oid
    feats, offset = [], 0
    while True:
        d = get_json(f"{BASE}/{path}/query", {**base, "resultOffset": offset, "resultRecordCount": page})
        fs = d.get("features", [])
        feats.extend(fs)
        if not (d.get("exceededTransferLimit") or d.get("properties", {}).get("exceededTransferLimit")) and len(fs) < page:
            break
        if not fs:
            break
        offset += len(fs)
    # dedupe on OID in case pages overlap
    if oid:
        seen, uniq = set(), []
        for f in feats:
            k = f.get("id", f["properties"].get(oid))
            if k in seen:
                continue
            seen.add(k)
            uniq.append(f)
        feats = uniq
    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": f"EPSG:{SR}"}},
        "features": feats,
    }
    return fc, {
        "layer_name": info.get("name"),
        "copyright": info.get("copyrightText"),
        "query": {**base, "url": f"{BASE}/{path}/query"},
        "count": len(feats),
    }


def rings(geom):
    if not geom:
        return []
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return geom["coordinates"]
    return []


def shoelace(ring):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        a += x1 * y2 - x2 * y1
    return a / 2.0


def orient(ring, ccw):
    """Exterior rings CCW, holes CW (consistent extrusion winding)."""
    r = [list(map(float, p[:2])) for p in ring]
    if r[0] != r[-1]:
        r.append(r[0])
    if (shoelace(r) > 0) != ccw:
        r.reverse()
    return r


def clip_segment(p, q, bbox):
    """Liang-Barsky. Returns clipped (p, q) or None."""
    x0, y0, x1, y1 = bbox
    dx, dy = q[0] - p[0], q[1] - p[1]
    t0, t1 = 0.0, 1.0
    for pk, qk in ((-dx, p[0] - x0), (dx, x1 - p[0]), (-dy, p[1] - y0), (dy, y1 - p[1])):
        if pk == 0:
            if qk < 0:
                return None
            continue
        r = qk / pk
        if pk < 0:
            if r > t1:
                return None
            t0 = max(t0, r)
        else:
            if r < t0:
                return None
            t1 = min(t1, r)
    return ((p[0] + t0 * dx, p[1] + t0 * dy), (p[0] + t1 * dx, p[1] + t1 * dy))


def clip_polyline(pts, bbox):
    out, cur = [], []
    for p, q in zip(pts, pts[1:]):
        c = clip_segment(p, q, bbox)
        if c is None:
            if len(cur) > 1:
                out.append(cur)
            cur = []
            continue
        a, b = c
        if cur and abs(cur[-1][0] - a[0]) < 1e-9 and abs(cur[-1][1] - a[1]) < 1e-9:
            cur.append(b)
        else:
            if len(cur) > 1:
                out.append(cur)
            cur = [a, b]
    if len(cur) > 1:
        out.append(cur)
    return out


def derive(raw, bbox):
    buildings, warnings = [], []
    for f in raw["buildings"]["features"]:
        p = f["properties"]
        polys = [[orient(poly[0], True)] + [orient(h, False) for h in poly[1:]]
                 for poly in rings(f["geometry"])]
        if not polys:
            continue
        area = sum(abs(shoelace(poly[0])) - sum(abs(shoelace(h)) for h in poly[1:]) for poly in polys)
        base, eave, top = p.get("dtm_centre"), p.get("bsm_edge"), p.get("bsm_max")
        rec = {
            "id": p.get("objectid"),  # ufi is 0 for every generated outline
            "source_project": p.get("featuresourceproject"),
            "polygons": polys,
            "area_m2": round(area, 2),
            "base_rl": base,       # ground AHD at centroid
            "eave_rl": eave,       # mean eave elevation AHD
            "top_rl": top,         # max building elevation AHD (ridge/plant)
            "min_rl": p.get("bsm_min"),
            "height_eave_m": round(eave - base, 2) if None not in (eave, base) else None,
            "height_top_m": round(top - base, 2) if None not in (top, base) else None,
        }
        if None in (base, eave, top):
            warnings.append(f"building {rec['id']}: missing elevation attribute")
        elif not (base <= eave <= top):
            warnings.append(f"building {rec['id']}: RL order base<=eave<=top violated "
                            f"({base}, {eave}, {top})")
        dm = p.get("dimension_m2")
        if dm and abs(area - dm) / dm > 0.02:
            warnings.append(f"building {rec['id']}: computed area {area:.1f} vs published {dm:.1f}")
        buildings.append(rec)

    # DCDB can hold several records for one lotplan (multipart lots); merge them.
    by_lot = {}
    for f in raw["parcels"]["features"]:
        p = f["properties"]
        polys = [[orient(poly[0], True)] + [orient(h, False) for h in poly[1:]]
                 for poly in rings(f["geometry"])]
        key = p.get("lotplan") or f"_oid{p.get('objectid')}"
        rec = by_lot.setdefault(key, {
            "lotplan": p.get("lotplan"),
            "parcel_typ": p.get("parcel_typ"),
            "tenure": p.get("tenure"),
            "lot_area": p.get("lot_area"),
            "source_objectids": [],
            "polygons": [],
        })
        rec["source_objectids"].append(p.get("objectid"))
        for poly in polys:
            if poly not in rec["polygons"]:
                rec["polygons"].append(poly)
    parcels = list(by_lot.values())

    # Contour features run far outside the frame; clip each segment to bbox.
    contours = []
    for f in raw["contours"]["features"]:
        g = f["geometry"] or {}
        lines = g["coordinates"] if g.get("type") == "MultiLineString" else [g.get("coordinates", [])]
        for ln in lines:
            for piece in clip_polyline([c[:2] for c in ln], bbox):
                contours.append({"elevation_m": f["properties"].get("elevation_m"),
                                 "coords": [[round(x, 3), round(y, 3)] for x, y in piece]})

    return {
        "crs": f"EPSG:{SR}",
        "height_datum": "AHD",
        "buildings": sorted(buildings, key=lambda b: b["id"]),
        "parcels": sorted(parcels, key=lambda p: str(p["lotplan"])),
        "contours": contours,
    }, warnings


NOTICE = """Map data: (c) State of Queensland (Department of Resources), licensed under
CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Layers: Cadastral
parcels, Addresses, Building outlines [generated] (LiDAR, Brisbane 2025
project), Contour LiDAR 1m, Roads and tracks, Railways [detail].
Changes: queried by bounding box, reprojected to GDA2020 / MGA zone 56
(EPSG:7856) by the service, ring winding normalised, heights derived as
eave/top RL minus ground RL. Processed by E. Franks.

Accuracy limits (publisher's own statements and observed):
- Cadastre is an index, not survey; registered plan dimensions prevail.
- Building outlines are auto-generated from LiDAR class 6 points and
  orthogonally simplified; presence/absence is prioritised over shape.
  Attached dwellings are often merged into one block. Expect ~1-4 m edge
  error. Heights are LiDAR surface elevations, not surveyed RLs.
- 1 m contours are generalised and stated by the publisher to be for
  cartographic use only, not precision work or modelling.
- Layers have different capture dates (LiDAR May 2025; cadastre current
  at fetch time). Anything built after the LiDAR capture is absent.
No aerial or satellite imagery is used or embedded.
"""


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dump(obj, path):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=1, sort_keys=True)
        fh.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--bbox", help="XMIN,YMIN,XMAX,YMAX in EPSG:7856")
    ap.add_argument("--layers", default=",".join(LAYERS), help="comma list; default all")
    a = ap.parse_args()

    bbox = tuple(float(v) for v in a.bbox.split(",")) if a.bbox else DEFAULT_BBOX
    if len(bbox) != 4 or bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        sys.exit("bad --bbox")
    want = [n.strip() for n in a.layers.split(",") if n.strip()]
    for n in want:
        if n not in LAYERS:
            sys.exit(f"unknown layer {n}")

    os.makedirs(os.path.join(a.outdir, "raw"), exist_ok=True)
    fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    raw, meta = {}, {}
    for name in want:
        path, where = LAYERS[name]
        print(f"fetching {name} ...", file=sys.stderr)
        fc, m = fetch_layer(path, where, bbox)
        if name == "contours":
            # Service returns whole contour lines (tens of km); clip to the frame
            # so the raw file stays small. Attributes are kept verbatim.
            for f in fc["features"]:
                g = f["geometry"] or {}
                lines = g["coordinates"] if g.get("type") == "MultiLineString" else [g.get("coordinates", [])]
                pieces = [[[round(x, 3), round(y, 3)] for x, y in pc]
                          for ln in lines for pc in clip_polyline([c[:2] for c in ln], bbox)]
                f["geometry"] = {"type": "MultiLineString", "coordinates": pieces}
            m["clipped_to_bbox"] = True
        raw[name] = fc
        meta[name] = m
        print(f"  {m['count']} features", file=sys.stderr)
        dump(fc, os.path.join(a.outdir, "raw", f"{name}.geojson"))

    warnings = []
    if all(k in raw for k in ("buildings", "parcels", "contours")):
        ctx, warnings = derive(raw, bbox)
        ctx["bbox"] = list(bbox)
        ctx["fetched_at"] = fetched_at
        dump(ctx, os.path.join(a.outdir, "shadow_context.json"))
    with open(os.path.join(a.outdir, "NOTICE.txt"), "w") as fh:
        fh.write(NOTICE)

    files = {}
    for root, _, names in os.walk(a.outdir):
        for n in sorted(names):
            if n == "MANIFEST.json":
                continue
            fp = os.path.join(root, n)
            files[os.path.relpath(fp, a.outdir)] = sha256(fp)
    dump({
        "fetched_at": fetched_at,
        "bbox_epsg7856": list(bbox),
        "layers": meta,
        "warnings": warnings,
        "sha256": dict(sorted(files.items())),
    }, os.path.join(a.outdir, "MANIFEST.json"))

    for w in warnings:
        print("WARN", w, file=sys.stderr)
    print(f"done: {a.outdir} ({len(warnings)} warnings)", file=sys.stderr)


if __name__ == "__main__":
    main()
