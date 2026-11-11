Greville model geometry in 3D for Revit and other CAD (v1.1-AB)

greville_revit_mga.dxf    GDA2020 / MGA zone 56 eastings and northings
greville_revit_local.dxf  the same geometry near the origin:
                          local = MGA - (E 504045, N 6966712); heights unchanged
Units: metres (declared in the files). Heights: metres AHD.

Revit: Insert > Link CAD (or Import CAD), Layers: All, Import units: Meter.
  Local file:  Positioning "Auto - Origin to Internal Origin".
  MGA file:    Positioning "Auto - Center to Center", then
               Manage > Coordinates > Acquire Coordinates and pick the link.
               (MGA coordinates are thousands of km from Revit's origin;
               do not place them origin to origin.)
Grid north and true north differ by about 0.02 deg here; that is negligible.
For a Revit sun study use latitude -27.422924, longitude 153.041035, time zone UTC+10
(Brisbane, no daylight saving). Revit's solar routine is not this model's
(NOAA geometric, no refraction), so expect small differences near sunrise.

Layers
  APPROVED_A, APPROVED_B_PLATE   closed solids, approved ground floor RL 21.600 to top RL
  APPROVED_B_COMMUNAL_ROOF,
  APPROVED_B_LIFT_OVERRUN        on the B plate roof, RL 62.900 to top RL
  COMPARATOR_RL48,
  COMPARATOR_RL55_75             the eight-storey comparator: Buildings A and B on their
                                 approved footprints, RL 21.600 cut to RL 48.0 / RL 55.75.
                                 This is what the sealed incremental table used. Turn the
                                 approved layers off to see it alone.
  DWELLINGS_CLUSTER5             Lot 60-63 dwellings, receiver level to top RL
  FENCE_1500                     boundary fences, receiver level + 1.5 m. Geometry only:
                                 their solar opacity is not established, so the model
                                 brackets them fully open / fully solid.
  RECEPTOR_SCHED, RECEPTOR_YARD  the measured backyards, at receiver level
  CADASTRE_LOT                   Lots 60-63, at receiver level
  CADASTRE_PARCEL                the development parcel, at RL 21.600

The model extrudes the approved buildings from RL 0. Any base below the lowest
receiver level (RL 23.320) gives exactly the same shadow on the backyards, so
starting them at the approved ground floor changes nothing that is measured.

The rectangular envelopes on the COMPARATOR_ENVELOPE layer of geometry.dxf are
what the frozen browser page draws for its comparator; they are not what the
sealed results used, and are not drawn here.

Regenerate: python3 export_revit.py  (needs ezdxf 1.4.5; byte-reproducible)
