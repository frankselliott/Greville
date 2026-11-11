# Map context

Open-licence map data for the area around the Greville site: cadastral parcels,
addresses, building outlines with LiDAR heights, 1 m contours, roads and rail.

Each dated folder is one run of `../tools/fetch_shadow_map_data.py` and holds:

| file | what |
|---|---|
| `raw/<layer>.geojson` | the service responses for each layer, paged and merged; contour lines clipped to the frame |
| `shadow_context.json` | derived from the raw layers: building footprints with ground, eave and top RL; parcels; clipped contours |
| `MANIFEST.json` | query parameters, fetch time, feature counts, warnings, and a SHA-256 for every other file in the folder |
| `NOTICE.txt` | attribution and the publisher's accuracy statements |

Everything is in GDA2020 / MGA zone 56 (EPSG:7856), heights in metres AHD.

## Licence

© State of Queensland (Department of Resources), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `NOTICE.txt` in
each run for the layers used and the changes made.

## What this is not

**This is context only. It is not an input to the sealed v1.1-AB results.**
Nothing under `../model/`, the frozen `../index.html`, or the verification pack
reads from this folder, and no frozen figure depends on it. The v1.1-AB release
(SHA-256 `6df4dde6…c76d4f0`) and the frozen page (`cd551cef…b128f9f`) are
unchanged by it.

## Known limits

- **Attached dwellings are merged.** Building outlines are generated
  automatically from LiDAR and orthogonally simplified. Terraces and other
  attached dwellings usually appear as one block, not one outline per dwelling.
- **Outline edges carry about 1–4 m of error.** The outlines favour whether a
  building is present over its exact shape.
- **Heights are LiDAR surface elevations, not surveyed RLs.** Base RL is the
  ground elevation at the outline's centroid; eave RL is a mean eave elevation;
  top RL is the highest point, including ridges and plant.
- **Contours are cartographic only.** The publisher states that the 1 m
  contours are generalised and not for precision work or modelling.
- **Two buildings have eave RL above top RL.** Buildings `2710944` and `2711147`
  violate base ≤ eave ≤ top in the published attributes; the run records both in
  `MANIFEST.json` under `warnings`. Their heights should not be used without
  checking.
- **The layers were captured at different times.** The LiDAR was captured in May
  2025; the cadastre is as current at fetch time. Anything built after the LiDAR
  capture is absent.
- **The cadastre is an index, not a survey.** Registered plan dimensions prevail.

## Reproducing and checking a run

```sh
python3 -I tools/fetch_shadow_map_data.py context/<date>/        # default bbox
```

To confirm the files in a folder are the ones its manifest describes:

```sh
cd context/<date>
python3 -c "import json,hashlib; m=json.load(open('MANIFEST.json')); \
print(all(hashlib.sha256(open(f,'rb').read()).hexdigest()==h for f,h in m['sha256'].items()))"
```

A later run fetches the data as it stands on that day, so its files and hashes
can differ from an earlier run's.
