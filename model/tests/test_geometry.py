"""Geometry and shadow engine against closed-form answers and invariants.

Like the solar tests, none of these compare against the frozen result set. They
check the engine against things that are true regardless of what this project
computed: the shoelace area of a polygon, the length of a shadow at a known sun
altitude, and structural invariants the project's own reasoning depends on.
"""

import math
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from greville_model import load
from greville_model.geometry import grid_in_polygon, point_in_poly, seg_poly
from greville_model.shadow_model import occluded_mask, prism_shadow_parts
from greville_model.solar import sun_dir

M = load()


def shoelace(ring):
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    total = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


#: Ring coordinates are published rounded to four decimals — 0.1 mm — so the
#: worst a stored vertex can be from its true position is half of that.
VERTEX_QUANTUM = 0.00005


def rounding_budget(ring):
    """The most the shoelace area can move when every vertex is rounded to 0.1 mm.

    d(area)/dx_i is (y_{i+1} - y_{i-1})/2 and d(area)/dy_i is (x_{i-1} - x_{i+1})/2,
    so the worst case is the sum of those magnitudes times the quantum. This is an
    exact first-order bound, not a fudge factor.
    """
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    n = len(pts)
    total = 0.0
    for i in range(n):
        nxt = pts[(i + 1) % n]
        prv = pts[(i - 1) % n]
        total += abs(nxt[1] - prv[1]) + abs(prv[0] - nxt[0])
    return 0.5 * total * VERTEX_QUANTUM


class ReceptorPolygons(unittest.TestCase):
    def test_areas_match_recorded_metadata_within_coordinate_rounding(self):
        """Shoelace area vs the area_m2 the model records for each receptor.

        These never agree exactly, and should not be expected to: the published
        rings are rounded to 0.1 mm while the recorded areas were computed from
        unrounded geometry. Every receptor differs, in both directions, by well
        under a millimetre-squared.

        So the assertion is against the rounding budget that mis-match is allowed
        to occupy. A ring edited without its metadata — or a metadata figure that
        never belonged to its ring — would exceed it immediately.
        """
        for pos in ("yard", "sched"):
            for lot, ring in M.d["receptors"][pos].items():
                recorded = M.d["receptor_meta"][pos][lot]["area_m2"]
                measured = shoelace(ring)
                budget = rounding_budget(ring)
                self.assertLessEqual(
                    abs(measured - recorded), budget,
                    msg=(f"{pos}/{lot}: shoelace {measured:.6f} vs recorded "
                         f"{recorded:.6f}, difference {abs(measured - recorded):.6f} m2 "
                         f"exceeds the {budget:.6f} m2 coordinate-rounding budget"))

    def test_the_discrepancy_really_is_only_rounding(self):
        """Guard the reasoning above: every gap must be small AND both-signed.

        If the recorded areas came from different geometry rather than unrounded
        geometry, the errors would tend to share a sign or cluster far from zero.
        """
        diffs = []
        for pos in ("yard", "sched"):
            for lot, ring in M.d["receptors"][pos].items():
                diffs.append(shoelace(ring) - M.d["receptor_meta"][pos][lot]["area_m2"])
        self.assertLess(max(abs(d) for d in diffs), 0.001,
                        "a receptor area is off by more than a millimetre squared")
        self.assertTrue(any(d > 0 for d in diffs) and any(d < 0 for d in diffs),
                        "all area errors share a sign — that is bias, not rounding")

    def test_receptors_are_simple_and_non_degenerate(self):
        for pos in ("yard", "sched"):
            for lot, ring in M.d["receptors"][pos].items():
                self.assertGreater(shoelace(ring), 1.0, f"{pos}/{lot} is degenerate")
                self.assertGreaterEqual(len(ring), 4, f"{pos}/{lot} has too few vertices")


class GridConvergence(unittest.TestCase):
    def test_cell_count_converges_to_true_area(self):
        """Cell-counting must approach the exact area as the cell refines.

        This is what licenses the QA gate's claim that its residuals are
        sampling quantisation rather than a model difference.
        """
        ring = M.d["receptors"]["yard"]["63SP354191"]
        exact = shoelace(ring)
        errors = []
        for cell in (0.20, 0.10, 0.05):
            approx = len(grid_in_polygon(ring, cell)) * cell * cell
            errors.append(abs(approx - exact))
        self.assertLess(errors[-1], errors[0],
                        f"error did not fall as the cell refined: {errors}")
        self.assertLess(errors[-1], 0.05,
                        f"0.05 m sampling still {errors[-1]:.4f} m2 from exact")


class ShadowLength(unittest.TestCase):
    """A prism of height h at sun altitude a throws its far edge h/tan(a) away.

    Closed form, no model involved. The sweep must land the translated footprint
    exactly there, along the anti-solar bearing.
    """

    def test_far_edge_distance_and_bearing(self):
        square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        ground, top = 20.0, 30.0
        height = top - ground
        for alt in (10.0, 25.0, 45.0, 70.0):
            for az in (0.0, 45.0, 99.0, 180.0, 285.0):
                parts = prism_shadow_parts(square, top, ground, ground, alt, az)
                expected = height / math.tan(math.radians(alt))
                dx, dy = sun_dir(az)
                far = parts[1]          # footprint translated to the far offset
                for (ox, oy), (sx, sy) in zip(far, square):
                    self.assertAlmostEqual(ox - sx, dx * expected, places=9)
                    self.assertAlmostEqual(oy - sy, dy * expected, places=9)

    def test_shadow_falls_away_from_the_sun(self):
        """The anti-solar bearing is the sun's bearing plus 180 degrees."""
        for az in (0.0, 37.0, 99.0, 180.0, 271.0, 359.0):
            dx, dy = sun_dir(az)
            bearing = math.degrees(math.atan2(-dx, -dy)) % 360
            self.assertAlmostEqual(bearing, az % 360, places=9)

    def test_nothing_is_cast_with_the_sun_down(self):
        square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        self.assertIsNone(prism_shadow_parts(square, 30.0, 20.0, 20.0, 0.0, 90.0))
        self.assertIsNone(prism_shadow_parts(square, 30.0, 20.0, 20.0, -5.0, 90.0))

    def test_a_caster_below_the_receiver_casts_nothing(self):
        """A prism whose top is under your feet cannot shade you."""
        square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)]
        self.assertIsNone(prism_shadow_parts(square, 18.0, 10.0, 20.0, 30.0, 90.0))


class OcclusionAgainstClosedForm(unittest.TestCase):
    """A point is shaded iff the caster stands within h/tan(alt) along the sun ray."""

    def test_reach_boundary_is_where_the_closed_form_puts_it(self):
        # caster: a 2 m square centred 50 m due east of the origin
        caster = [(49.0, -1.0), (51.0, -1.0), (51.0, 1.0), (49.0, 1.0)]
        z, alt, az = 0.0, 30.0, 90.0        # sun due east, 30 degrees up
        reach = math.tan(math.radians(alt)) * 49.0   # height needed to just reach x=0
        for delta, expect in ((-0.5, False), (+0.5, True)):
            mask = occluded_mask([(0.0, 0.0)], z, alt, az, [(caster, reach + delta)], [])
            self.assertEqual(
                mask[0], expect,
                f"top RL {reach + delta:.3f} should {'shade' if expect else 'miss'} the origin")

    def test_a_point_inside_the_footprint_is_always_occluded(self):
        caster = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)]
        mask = occluded_mask([(0.0, 0.0)], 0.0, 45.0, 90.0, [(caster, 5.0)], [])
        self.assertTrue(mask[0])


class OcclusionInvariants(unittest.TestCase):
    """Structural properties the project's own reasoning leans on."""

    def setUp(self):
        self.lot = "63SP354191"
        self.pts = M.grid("yard", self.lot, 0.25)
        self.z = M.d["receiver_rl"][self.lot]

    def test_a_taller_caster_shades_a_superset(self):
        """Raising a caster can never un-shade a point that was already shaded."""
        rng = random.Random(20260824)
        for _ in range(12):
            alt = rng.uniform(5.0, 60.0)
            az = rng.uniform(60.0, 130.0)
            low = occluded_mask(self.pts, self.z, alt, az, M.comparator_casters(48.0), [])
            high = occluded_mask(self.pts, self.z, alt, az, M.comparator_casters(60.0), [])
            for i, (a, b) in enumerate(zip(low, high)):
                self.assertFalse(a and not b,
                                 f"point {i} shaded at RL 48 but lit at RL 60 "
                                 f"(alt {alt:.2f}, az {az:.2f})")

    def test_adding_a_caster_only_ever_shades_more(self):
        """The claim that an extra caster can only REDUCE a loss depends on this.

        An extra caster enlarges the already-shaded set, which is subtracted from
        the otherwise-sunlit area — so the reported loss can only fall.
        """
        alt, az = 25.0, 100.0
        one = occluded_mask(self.pts, self.z, alt, az, M.dwelling_casters(), [])
        both = occluded_mask(self.pts, self.z, alt, az,
                             M.dwelling_casters() + M.approved_casters("AB"), [])
        for i, (a, b) in enumerate(zip(one, both)):
            self.assertFalse(a and not b, f"point {i} lost its shadow when a caster was added")

    def test_areas_are_ordered_and_bounded(self):
        """0 <= loss <= otherwise-sunlit <= receptor area, at every instant tried."""
        rng = random.Random(11)
        for _ in range(10):
            doy = rng.randint(1, 365)
            minute = rng.randrange(300, 700, 5)
            import datetime
            when = datetime.datetime(2026, 1, 1) + datetime.timedelta(
                days=doy - 1, minutes=minute)
            for fence in ("f000", "f150", "f180"):
                r = M.evaluate_at("yard", self.lot, fence, when, cell=0.25)
                self.assertGreaterEqual(r["loss"], 0.0)
                self.assertLessEqual(r["loss"], r["otherwise_sunlit"] + 1e-9)
                self.assertLessEqual(r["otherwise_sunlit"], r["pos_area"] + 0.5)

    def test_an_opaque_fence_never_leaves_more_sunlit_than_an_open_one(self):
        import datetime
        when = datetime.datetime(2026, 1, 14, 7, 24)
        open_f = M.evaluate_at("yard", self.lot, "f000", when, cell=0.25)
        shut_f = M.evaluate_at("yard", self.lot, "f150", when, cell=0.25)
        self.assertLessEqual(shut_f["otherwise_sunlit"], open_f["otherwise_sunlit"] + 1e-9)

    def test_sun_below_the_horizon_yields_nothing(self):
        import datetime
        r = M.evaluate_at("yard", self.lot, "f000",
                          datetime.datetime(2026, 6, 21, 3, 0), cell=0.25)
        self.assertEqual(r["loss"], 0.0)
        self.assertEqual(r["otherwise_sunlit"], 0.0)


class InverseAgreesWithForward(unittest.TestCase):
    """The strongest check here: the inverse must predict the forward result.

    first_contact_rl says the lowest envelope that reaches a receptor. So a
    comparator just above that height must shade at least one sample, and one
    just below must shade none. The two paths share no code — the inverse clips
    the ray into a convex ring by half-planes, the forward one tests ray against
    polygon edges — so agreement is real evidence, not a tautology.
    """

    def test_first_contact_predicts_when_the_comparator_lands(self):
        import datetime
        cell = 0.10
        cases = [
            ("yard", "63SP354191", datetime.datetime(2026, 1, 11, 7, 20)),
            ("yard", "60SP354191", datetime.datetime(2026, 2, 3, 7, 0)),
            ("yard", "61SP354191", datetime.datetime(2026, 10, 29, 5, 54)),
            ("sched", "62SP354191", datetime.datetime(2026, 4, 26, 7, 0)),
            ("sched", "63SP354191", datetime.datetime(2026, 11, 23, 7, 3)),
        ]
        for pos, lot, when in cases:
            alt, az = M.sun(when)
            need = M.first_contact_rl(pos, lot, alt, az, cell=cell)
            self.assertIsNotNone(need, f"{pos}/{lot}: no first-contact RL found")
            pts = M.grid(pos, lot, cell)
            z = M.d["receiver_rl"][lot]

            below = occluded_mask(pts, z, alt, az, M.envelope_casters(need - 0.05), [])
            above = occluded_mask(pts, z, alt, az, M.envelope_casters(need + 0.05), [])
            self.assertEqual(
                sum(below), 0,
                f"{pos}/{lot}: an envelope BELOW the first-contact RL "
                f"({need:.3f}) still shaded {sum(below)} samples")
            self.assertGreater(
                sum(above), 0,
                f"{pos}/{lot}: an envelope ABOVE the first-contact RL "
                f"({need:.3f}) shaded nothing")

    def test_raising_the_comparator_never_shades_less(self):
        import datetime
        alt, az = M.sun(datetime.datetime(2026, 1, 11, 7, 20))
        lot, pos, cell = "63SP354191", "yard", 0.25
        pts = M.grid(pos, lot, cell)
        z = M.d["receiver_rl"][lot]
        counts = [sum(occluded_mask(pts, z, alt, az, M.comparator_casters(rl), []))
                  for rl in (46.0, 48.0, 50.0, 52.0, 55.75, 60.0, 70.0)]
        self.assertEqual(counts, sorted(counts),
                         f"shaded count is not monotone in envelope height: {counts}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
