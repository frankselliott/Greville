"""The two shadow paths, checked against each other.

PROVENANCE.md asserts that the per-edge Minkowski sweep and the exact
per-point ray test agree, and that only the ray test is ever used for a
reported number. Nothing tested the first half of that claim: both routines
were exercised, neither was compared against the other.

They are independent derivations of the same physics. The sweep translates a
footprint along the anti-solar bearing and bridges each edge; the ray test
asks, for one point, whether the segment toward the sun meets the footprint.
Agreement between them does not depend on the lost original source, on the
frozen result tables, or on any stored output — which is exactly why it is
worth having.
"""
import math
import unittest

from greville_model.geometry import point_in_poly
from greville_model.model import load
from greville_model.shadow_model import occluded_mask, prism_shadow_parts


def in_sweep(x, y, parts):
    """A point is in shadow if it lies in ANY part: the parts union is the shadow."""
    return any(point_in_poly(x, y, p) for p in parts)


class SweepAgreesWithRay(unittest.TestCase):

    def _compare(self, fp, top, base, z, alt, az, cell=0.25, pad=6.0):
        """Compare the two paths over a grid.

        Returns (n_tested, n_disagree, n_disagree_in_the_interior). A
        disagreement is "boundary" if the ray test is not uniform over the
        point's eight neighbours one cell away — i.e. the point sits on the
        shadow edge, where a grid of this spacing cannot resolve which side it
        falls. Those are quantisation. Anything else is a model split and the
        count that must be zero.
        """
        parts = prism_shadow_parts(fp, top, base, z, alt, az)
        if parts is None:
            return 0, 0, 0
        xs = [p[0] for p in fp]; ys = [p[1] for p in fp]
        reach = (top - z) / math.tan(math.radians(alt))
        lo_x, hi_x = min(xs) - reach - pad, max(xs) + reach + pad
        lo_y, hi_y = min(ys) - reach - pad, max(ys) + reach + pad
        pts = []
        y = lo_y
        while y <= hi_y:
            x = lo_x
            while x <= hi_x:
                pts.append((x, y)); x += cell
            y += cell
        ray = occluded_mask(pts, z, alt, az, [(fp, top)], [])
        disagree = [(x, y) for (x, y), r in zip(pts, ray)
                    if r != in_sweep(x, y, parts)]
        interior = 0
        for x, y in disagree:
            ring = [(x + dx * cell, y + dy * cell)
                    for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy)]
            n = occluded_mask(ring, z, alt, az, [(fp, top)], [])
            if all(n) or not any(n):          # neighbours unanimous -> not an edge
                interior += 1
        return len(pts), len(disagree), interior

    def test_square_caster_across_the_sky(self):
        fp = [(-5.0, -5.0), (5.0, -5.0), (5.0, 5.0), (-5.0, 5.0)]
        total = worst = 0
        for alt in (8.0, 15.0, 30.0, 45.0, 60.0, 75.0):
            for az in (0.0, 37.0, 90.0, 143.0, 180.0, 226.0, 270.0, 311.0):
                n, bad, interior = self._compare(fp, 20.0, 0.0, 0.0, alt, az)
                total += n; worst = max(worst, bad)
                self.assertEqual(
                    interior, 0,
                    "sweep and ray disagree AWAY from the shadow edge on %d of %d "
                    "samples at alt %.0f az %.0f — that is a model split, not "
                    "quantisation" % (interior, n, alt, az))
        self.assertGreater(total, 100000, "the sweep was barely sampled")

    def test_the_real_approved_footprints(self):
        M = load()
        z = M.d['receiver_rl']['63SP354191']
        for name, b in M.d['approved'].items():
            for alt, az in ((12.0, 100.0), (25.0, 80.0), (40.0, 300.0), (62.0, 20.0)):
                n, bad, interior = self._compare(b['footprint'], b['top_rl'],
                                                 b['base_rl'], z, alt, az, cell=0.6)
                if n == 0:
                    continue
                self.assertEqual(
                    interior, 0,
                    "%s: sweep and ray disagree away from the shadow edge on %d of "
                    "%d samples at alt %.0f az %.0f" % (name, interior, n, alt, az))

    def test_disagreement_shrinks_as_the_grid_refines(self):
        """Residual disagreement must be boundary quantisation, not a model split."""
        fp = [(-5.0, -5.0), (5.0, -5.0), (5.0, 5.0), (-5.0, 5.0)]
        frac = []
        for cell in (1.0, 0.5, 0.25):
            n, bad, interior = self._compare(fp, 20.0, 0.0, 0.0, 22.0, 115.0, cell=cell)
            self.assertEqual(interior, 0, "interior disagreement at cell %.2f" % cell)
            frac.append(bad / float(n))
        self.assertLess(frac[-1], frac[0] + 1e-9,
                        "disagreement did not fall under refinement: %r" % (frac,))
        self.assertLess(frac[-1], 0.002,
                        "disagreement is not converging to zero: %r" % (frac,))


if __name__ == '__main__':
    unittest.main()
