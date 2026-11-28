# Private parity report: the Solombra engine on this model's inputs

**Private. Kept in this workspace only. Not part of any product package, benchmark set or public page.**
Dated 28 November 2026. Prepared with AI assistance (Claude Code); not reviewed by an independent person.

## What was done

The Solombra calculation engine, version 3.2.0 (commit recorded in that repository's certification file),
was run on the inputs of `model/data/greville_model_v1.1-AB.json` and compared with the figures recorded in
that file under `frozen`. Nothing in this repository's existing files was changed. The adapter and its output
are in this folder: `run_parity.py`, `parity_results.json`, `parity_table.csv`.

    python3 -I verify/solombra_parity/run_parity.py --engine <path to the engine checkout>

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

24 of 24 recorded peak cases ran (`frozen.peaks`: both receptors, three fence cases, four lots).

| Comparison | Worst difference |
|---|---|
| Receptor area, engine against recorded | 0.00065 m2 |
| Sun altitude at the 21 recorded instants: engine 3.2.0 against recorded | 0.0124 degrees |
| Sun azimuth, the same | 0.0047 degrees |
| Sun altitude and azimuth: the engine's retired NOAA routine against recorded | 0.0000000001 degrees |
| Loss and otherwise-sunlit area, engine 3.2.0 against recorded | 0.0127 m2 (on 17.13 m2; 0.07%) |
| The same, the two cases that are not saturated | 0.0020 m2 |
| Loss, with the engine's sun moved onto the recorded sun position at each instant | 0.0006 m2 |

The recorded model's own stated fidelity against its frozen figures is 0.0013 m2.

## What this shows, and what it does not

1. **The geometry agrees.** Given the same sun position, a separately written engine using exact polygons
   reproduces every recorded peak figure to 0.0006 m2. The engine shares no code with the recorded model.
2. **The sun routines are the same formulation.** The engine's retired routine and the recorded model both
   follow the NOAA equations and agree to ten decimal places. They are therefore not independent of each
   other on the sun's position.
3. **That formulation is up to about 0.013 degrees from the NREL Solar Position Algorithm** over 2020 to
   2040 at Australian latitudes (the engine's benchmark T-SOL-5). At these instants the recorded altitudes
   differ from the engine's corrected ones by up to 0.0124 degrees, which moves the recorded areas by up to
   0.013 m2. This is a property of the recorded figures that a reader should know; it is small beside the
   areas involved and does not change any figure at the precision the sealed logs print (three decimals move
   in the second place at most).
4. **Limits of the comparison.** 22 of the 24 peak cases are saturated (the whole otherwise-sunlit area is
   lost), so they test little beyond the receptor area and the existing-object shadows. Only the peak
   instants were compared: the full-year day counts, first and last times, the 08:00 residues, the comparator
   envelopes and the first-contact levels were **not** run. The engine has no first-contact (inverse) function.
5. **What parity does not do.** It does not authenticate the source geometry, levels or fence assumptions,
   which were taken as recorded. It says nothing about amenity, about the appropriateness of the method, or
   about admissibility. It is not an independent expert verification: both the adapter and the engine were
   written with AI assistance for the same owner, who has a commercial interest in the engine.

## Outstanding, if this is taken further

- Run the unsaturated quantities: `fullyear` day counts and times, the 08:00/08:30/09:00 residues (their
  dates are not recorded in the data file), `incremental`, `attribution`, `comp_at_peaks`.
- Decide, with advice, whether and how the 0.013 degree point is disclosed. No frozen figure was altered.
- No person has been contacted and nothing has been sent anywhere.
