"""Solar position against physics, not against our own frozen output.

The QA gate in verify_frozen_peaks.py proves this engine reproduces the frozen
figures. That is self-consistency: if the frozen model and this port were wrong
in the same way, the gate would still pass. These tests check the solar code
against facts that exist independently of this project — the obliquity of the
ecliptic, the solar-noon altitude identity, and the symmetry of the day about
solar noon.

Tolerances are loose enough to absorb the equation of time and the fact that a
solstice falls at an instant, not on a whole calendar day. They are far tighter
than any error that would matter to a shadow.
"""

import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from greville_model.solar import sun_position

LAT = -27.422924          # the site, from the frozen model
LON = 153.041035
YEAR = 2026
OBLIQUITY = 23.4393       # degrees, IAU value for this epoch


def altitude(y, m, d, minute):
    return sun_position(y, m, d, minute // 60, minute % 60, LAT, LON)[0]


def solar_noon(y, m, d):
    """The minute of highest sun, found by scan then refined."""
    best_min, best_alt = None, -90.0
    for minute in range(540, 840):
        a = altitude(y, m, d, minute)
        if a > best_alt:
            best_alt, best_min = a, minute
    return best_min, best_alt


class SolarNoonAltitude(unittest.TestCase):
    """alt_noon = 90 - |latitude - declination| — spherical trigonometry, no model."""

    def check(self, month, day, declination, label):
        _, alt = solar_noon(YEAR, month, day)
        expected = 90 - abs(LAT - declination)
        self.assertAlmostEqual(
            alt, expected, delta=0.5,
            msg=f"{label}: noon altitude {alt:.3f}deg, identity gives {expected:.3f}deg")

    def test_june_solstice(self):
        # Sun at its northern extreme: declination = +obliquity, lowest noon sun here.
        self.check(6, 21, +OBLIQUITY, "June solstice")

    def test_december_solstice(self):
        # Southern extreme: declination = -obliquity, highest noon sun here.
        self.check(12, 21, -OBLIQUITY, "December solstice")

    def test_march_equinox(self):
        self.check(3, 20, 0.0, "March equinox")

    def test_september_equinox(self):
        self.check(9, 23, 0.0, "September equinox")


class SolarNoonAzimuth(unittest.TestCase):
    def test_sun_is_due_north_at_noon(self):
        """Brisbane sits south of the tropics, so the noon sun is always north.

        |latitude| = 27.4deg exceeds the 23.44deg obliquity, so the subsolar point
        never reaches this parallel and the sun is never overhead or south at noon.
        """
        for month, day in ((1, 15), (4, 15), (6, 21), (9, 15), (12, 21)):
            minute, _ = solar_noon(YEAR, month, day)
            az = sun_position(YEAR, month, day, minute // 60, minute % 60, LAT, LON)[1]
            off = min(abs(az), abs(az - 360))
            self.assertLess(off, 1.0,
                            f"{day}/{month}: noon azimuth {az:.3f}deg is not due north")


class DayIsSymmetricAboutNoon(unittest.TestCase):
    """Altitude depends on hour angle through cos, so it is symmetric about solar noon.

    Two known effects break exact equality and neither is an engine error:

    * solar noon is located here on a whole-minute grid, so the two samples are
      mis-centred by up to half a minute;
    * declination drifts through the day, which tilts the curve slightly.

    So the assertion is not "equal to some hand-picked tolerance" — it is that the
    asymmetry stays inside the budget those two effects actually allow. A genuine
    break in the hour-angle symmetry would blow straight past it.
    """

    def test_asymmetry_stays_inside_its_physical_budget(self):
        for month, day in ((2, 3), (6, 21), (11, 23)):
            noon, _ = solar_noon(YEAR, month, day)
            # declination drift, measured from the change in noon altitude per day
            next_noon, next_alt = solar_noon(YEAR, month, day + 1)
            drift_per_day = abs(next_alt - solar_noon(YEAR, month, day)[1])

            for offset in (30, 60, 120, 180):
                before = altitude(YEAR, month, day, noon - offset)
                after = altitude(YEAR, month, day, noon + offset)
                # one minute of altitude change at this offset covers the mis-centring
                per_minute = abs(after - altitude(YEAR, month, day, noon + offset + 1))
                budget = per_minute + drift_per_day * (2 * offset / 1440.0) + 0.02
                self.assertLessEqual(
                    abs(before - after), budget,
                    msg=(f"{day}/{month} +/-{offset}min: asymmetry "
                         f"{abs(before - after):.4f}deg exceeds the {budget:.4f}deg "
                         f"budget from noon quantisation and declination drift"))


class AltitudeIsMonotoneToNoon(unittest.TestCase):
    def test_rises_then_falls(self):
        noon, _ = solar_noon(YEAR, 11, 23)
        prev = -90.0
        for minute in range(noon - 240, noon, 10):
            a = altitude(YEAR, 11, 23, minute)
            self.assertGreater(a, prev, "altitude must increase toward solar noon")
            prev = a
        prev = 91.0
        for minute in range(noon, noon + 240, 10):
            a = altitude(YEAR, 11, 23, minute)
            self.assertLess(a, prev, "altitude must decrease after solar noon")
            prev = a


class SeasonalOrdering(unittest.TestCase):
    def test_summer_noon_is_higher_than_winter(self):
        """A southern-hemisphere sanity check the frozen tables never exercise."""
        _, dec = solar_noon(YEAR, 12, 21)
        _, jun = solar_noon(YEAR, 6, 21)
        self.assertGreater(dec, jun)
        # The gap between the solstices is twice the obliquity.
        self.assertAlmostEqual(dec - jun, 2 * OBLIQUITY, delta=0.6)


class TimezoneConvention(unittest.TestCase):
    def test_no_daylight_saving_shift(self):
        """Queensland does not observe DST. Solar noon must not jump in October.

        If a DST rule leaked in, solar noon would move by an hour between these
        two dates. It may only drift by the equation of time, minutes at most.
        """
        sep, _ = solar_noon(YEAR, 9, 15)
        nov, _ = solar_noon(YEAR, 11, 15)
        self.assertLess(abs(sep - nov), 30,
                        f"solar noon moved {abs(sep - nov)} min — a DST rule has leaked in")


if __name__ == "__main__":
    unittest.main(verbosity=2)
