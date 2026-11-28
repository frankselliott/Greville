# Private parity report: the Solombra engine on this model's inputs

**Private. Kept in this workspace only. Not part of any product package, benchmark set or public page.**
Dated 28 November 2026. Prepared with AI assistance (Claude Code); not reviewed by an independent person.

## What was done

The Solombra calculation engine, version 3.2.0 (commit recorded in that repository's certification file),
was run on the inputs of `model/data/greville_model_v1.1-AB.json` and compared with the figures recorded in
that file under `frozen`: every table except the first-contact levels. Nothing in this repository's existing
files was changed. Each script takes `--engine <path to the engine checkout>`.

## How the two models were matched

| Item | Recorded model | Engine run |
|---|---|---|
| Place and time | Latitude -27.422924, longitude 153.041035, UTC+10, no daylight saving, 2026 | The same |
| Frame | Local metres from MGA zone 56, azimuth applied on grid north | +u east, +v north, bearing of +u entered as 90: azimuth on grid north, as recorded |
| Receiver | Each receptor a level plane at the lot's receiver level | The engine's datum plane placed at that level; heights entered relative to it |
| Buildings | Flat-topped prisms from a footprint polygon and a top level | The engine's blocks are rectangles, so each footprint edge was entered as an opaque wall of the prism's height. On a receiver clear of the footprint, the walls' shadows together are exactly the prism's shadow |
| Fences | Lines of no thickness, height above receiver level | The same |
| Two-stage figure | "Otherwise sunlit" = not shaded by dwellings or the lot's own fence; loss = the part of that shaded by the approved buildings | Sunlit area with existing objects only; loss = that less the sunlit area with existing and new together |
| Areas | Sample points on a 0.02 m grid | Exact polygon areas (coordinates held to 0.1 mm) |
| Sun | NOAA equations, no refraction | Engine 3.2.0: astronomy-engine, no refraction. The NOAA routine the engine used up to 3.1.0 was also run |

Not matched, and not needed at these instants: the recorded model treats the sun as down at or below 0.05
degrees; the engine uses 0.

## Results

Run on 28 November 2026 with engine 3.2.0. Scripts and raw output are in this folder: `run_parity.py`
(peaks), `run_instants.py` (attribution, comparator at peaks), `run_full_year.py` (every day of 2026, 04:00
to 10:00, every minute: 131,765 instants for each of 24 configurations), `run_cmp48_check.py`.

### 1. Sun position

| Comparison at the 21 recorded instants | Worst difference |
|---|---|
| Engine 3.2.0 against recorded: altitude | 0.0124 degrees |
| Engine 3.2.0 against recorded: azimuth | 0.0047 degrees |
| The engine's retired NOAA routine against recorded | 0.0000000001 degrees |

### 2. Figures at recorded instants

| Table | Entries | Worst difference | Note |
|---|---|---|---|
| Receptor areas | 8 | 0.00065 m2 | |
| `peaks`: loss and otherwise-sunlit area | 24 | 0.0127 m2 (0.07%) | 0.0006 m2 when the engine's sun is moved onto the recorded sun |
| `attribution`: full, A alone, B alone | 24 | 0.0033 m2 | Building A's share is 0 in every entry, as recorded |
| `attribution`: base | 8 | 0.0117 m2 | |
| `comp_at_peaks`: comparator loss at RL 48 and RL 55.75 | 42 | 0.0012 m2 | The same with either comparator geometry |
| `comp_at_peaks`: peak and incremental | 63 | 0.0128 m2 | |

### 3. Full year (`fullyear`, 24 configurations)

| Quantity | Agreement |
|---|---|
| Peak loss | All 24 within 0.013 m2 of the recorded three-decimal figure |
| Instant of the peak | Of the 16 fenced configurations, the same date and minute in 13. In the other three, and in the open-fence cases where the loss sits at its ceiling for many instants, the two programs name different instants with the same peak figure to within 0.005 m2 |
| Days affected | The definition is not recorded. Counting a day when the loss exceeds 0.0004 m2 (one cell of the recorded model's grid) gives the recorded count exactly in 22 of 24 configurations and within one day in the other two |
| First and last time affected | At a threshold of 0.001 m2: 44 of 48 times identical. The other four are 04:49 against a recorded 04:50: the recorded model treats the sun as down at or below 0.05 degrees, the engine at 0 |
| Loss at 08:00, 08:30, 09:00 | The recorded figures are the year's largest loss at that clock time (their dates are not recorded). Every non-zero 08:00 figure agrees within 0.006 m2 |
| Comparator's own peak at RL 48 | Open fence: all 8 within 0.001 m2. Fenced cases: differences up to **0.15 m2**; see 5 |

### 4. Incremental table (16 entries)

Peak incremental loss, proposed loss and comparator loss agree within 0.0013 m2 in all 16. Days: the
threshold is not recorded; at 0.01 m2 the engine gives the recorded count exactly in 12 of 16, within one day
in 15, and within three days in all. The count is sensitive to the threshold (at 0.0004 m2 the engine counts
about 20 to 60 more days), because on many days the proposal exceeds the comparator by a sliver only.

### 5. One unexplained difference, investigated

For the 16 fenced configurations the recorded "comparator's own peak at RL 48" is lower than the engine's
in 12 and higher in 4, by up to 0.15 m2 (for example 6.339 recorded, 6.491 engine). Scanning with both
comparator geometries shows the recorded figures match the cut-footprint comparator, not the rectangular
envelopes, and lie between what the engine finds on a five-minute grid and what it finds at every minute.
That is what a coarser time scan would produce; the read-me in the sealed archive says peaks were found on
a five-minute scan. The engine cannot confirm the cause, since the original scan settings are not present.
These figures are comparator peaks, not losses from the approved buildings.

## What this shows, and what it does not

1. **The geometry agrees across every recorded table.** A separately written engine using exact polygon
   areas reproduces the sealed figures to about a hundredth of a square metre, and to under a thousandth
   when given the same sun position. It shares no code with the recorded model.
2. **Day counts and times are reproduced** once a counting threshold is chosen, and the threshold that
   reproduces them is the natural one for the recorded model (one grid cell). The threshold itself is not
   in the record, and the incremental day counts depend on it strongly.
3. **The sun routines are the same formulation.** The recorded model and the engine's retired routine both
   follow the NOAA equations. That formulation is up to about 0.013 degrees from the NREL Solar Position
   Algorithm over 2020 to 2040. At the recorded instants this moves areas by up to 0.013 m2. No recorded
   figure changes by more than that.
4. **The comparator peaks for fenced cases differ by up to 0.15 m2** (section 5).
5. **Not run:** first-contact levels (the engine has no inverse function), and the test heights 46, 50
   and 52.
6. **What parity does not do.** It does not authenticate the source geometry, levels or fence assumptions,
   which were taken as recorded. It says nothing about amenity, the appropriateness of the method, or
   admissibility. It is not independent verification: the adapter and the engine were written with AI
   assistance for the same owner, who has a commercial interest in the engine. A person relying on these
   figures in evidence would need their own reproduction, by their own means.

## Outstanding

- Whether and how points 3 and 4 are disclosed is for the owner, with advice. No frozen figure was altered.
- Nothing has been sent to anyone and nothing here has been pushed to any remote.
