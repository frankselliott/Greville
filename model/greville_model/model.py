"""The receptor calculation — what the frozen figures actually measure.

For one receptor (a lot's private open space), one fence case and one instant:

1.  Sample the receptor polygon on a regular grid at the receiver RL.
2.  Remove every sample already shaded by a Stage 5 dwelling or by the lot's
    own boundary fence.  What remains is the **otherwise sunlit** area — the
    only ground that the approved buildings can take anything from.
3.  Of that remainder, count what the approved buildings shade.  That is the
    **loss**.

Step 2 is not a refinement.  Without it every figure is overstated, because
ground that was never going to see the sun is counted as taken.
"""

import datetime
import json
import math
import os

from .geometry import grid_in_polygon
from .shadow_model import occluded_mask
from .solar import sun_position

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "greville_model_v1.1-AB.json")

LOTS = ["60SP354191", "61SP354191", "62SP354191", "63SP354191"]
FENCE_CASES = ["f000", "f150", "f180"]

#: The cell the frozen full-year figures were computed at.
FROZEN_CELL = 0.02
#: The cell the browser recomputes at live — coarser, hence the third-decimal drift.
LIVE_CELL = 0.05


def load(path=DATA_PATH):
    with open(path, encoding="utf-8") as fh:
        return Model(json.load(fh))


def parse_instant(iso):
    return datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S")


class Model:
    def __init__(self, data):
        self.d = data
        self._grids = {}

    # ---- casters -----------------------------------------------------------

    def approved_casters(self, parts="AB"):
        """The approved Sorella buildings, as ``(footprint, top_rl)`` pairs.

        ``parts`` selects the attribution split used in the frozen model:
        ``"A"`` is building A alone, ``"B"`` the building B plate plus its
        communal roof and lift overrun, ``"AB"`` both.
        """
        a = self.d["approved"]
        out = []
        if parts != "B":
            out.append((a["building_A"]["footprint"], a["building_A"]["top_rl"]))
        if parts != "A":
            for k in ("building_B_plate", "building_B_communal_roof",
                      "building_B_lift_overrun"):
                out.append((a[k]["footprint"], a[k]["top_rl"]))
        return out

    def comparator_casters(self, top_rl):
        """The bounded eight-storey comparator prisms at one test RL.

        The 2020 approval fixed height as a storey count only; no top RL
        appears in any source.  These are a bounded family, never the
        applicant's model, and must not be described as one.
        """
        c = self.d["comparator"]
        return [(c["A"], top_rl), (c["B"], top_rl)]

    def dwelling_casters(self):
        """Every Stage 5 dwelling that can shade a backyard."""
        return [(o["footprint"], o["top_rl"]) for o in self.d["occluders"].values()]

    def fence_casters(self, lot, fence):
        """The lot's own boundary fence for one bracketed opacity case.

        ``f000`` is the optically-open bound and casts nothing.  The approved
        fence is 1500 mm metal batten whose solar opacity is not established
        by the source, so it is bracketed, never interpolated.
        """
        height = self.d["fence_cases"][fence]["height"]
        if height is None:
            return []
        z = self.d["receiver_rl"][lot]
        return [(tuple(map(tuple, ln)), z + height)
                for ln in self.d["fences"][lot]["lines"]]

    # ---- receptors ---------------------------------------------------------

    def receptor(self, pos, lot):
        return self.d["receptors"][pos][lot]

    def grid(self, pos, lot, cell):
        key = (pos, lot, cell)
        if key not in self._grids:
            self._grids[key] = grid_in_polygon(self.receptor(pos, lot), cell)
        return self._grids[key]

    def sun(self, when):
        s = self.d["solar"]
        return sun_position(when.year, when.month, when.day, when.hour, when.minute,
                            s["latitude"], s["longitude"])

    # ---- the calculation ---------------------------------------------------

    def evaluate(self, pos, lot, fence, alt, az, cell=FROZEN_CELL, comparator_rl=None):
        """Areas at one instant, in m².

        Returns a dict with ``otherwise_sunlit``, ``loss``, ``a_loss``,
        ``b_loss``, ``pct`` and — when ``comparator_rl`` is given —
        ``comparator_loss`` and ``incremental``.
        """
        z = self.d["receiver_rl"][lot]
        pts = self.grid(pos, lot, cell)
        cell_area = cell * cell
        result = {
            "pos_area": self.d["receptor_meta"][pos][lot]["area_m2"],
            "otherwise_sunlit": 0.0, "loss": 0.0,
            "a_loss": 0.0, "b_loss": 0.0, "pct": 0.0,
        }
        if alt <= 0.05:
            return result

        shaded = occluded_mask(pts, z, alt, az,
                               self.dwelling_casters(), self.fence_casters(lot, fence))
        sunlit = [p for p, s in zip(pts, shaded) if not s]
        base = len(sunlit) * cell_area
        result["otherwise_sunlit"] = base

        m_all = occluded_mask(sunlit, z, alt, az, self.approved_casters("AB"), [])
        m_a = occluded_mask(sunlit, z, alt, az, self.approved_casters("A"), [])
        m_b = occluded_mask(sunlit, z, alt, az, self.approved_casters("B"), [])
        loss = sum(m_all) * cell_area
        result["loss"] = loss
        result["a_loss"] = sum(m_a) * cell_area
        result["b_loss"] = sum(m_b) * cell_area
        result["pct"] = 100 * loss / base if base > 0 else 0.0

        if comparator_rl is not None:
            m_c = occluded_mask(sunlit, z, alt, az,
                                self.comparator_casters(comparator_rl), [])
            comp = sum(m_c) * cell_area
            result["comparator_loss"] = comp
            result["incremental"] = loss - comp
        return result

    # ---- the inverse: what envelope height would first reach this receptor? ---

    def first_contact_rl(self, pos, lot, alt, az, cell=LIVE_CELL):
        """The lowest comparator top RL whose shadow would just touch this receptor.

        This is the inverse of the forward shadow calculation.  Instead of
        asking what a given envelope takes, it asks what envelope height is
        needed to take anything at all, at this instant, from this receptor.

        For each sample point the ray toward the sun is clipped against each
        comparator ring by half-plane intersection — the rings are convex, so
        the clip is exact and there is no sampling along the ray.  ``s`` is the
        distance at which the ray enters the ring; a prism must reach
        ``z + s * tan(alt)`` to cast that far.  The smallest such height over
        every point and every ring is the answer.

        Returns None when the sun is down or no ray reaches a comparator ring —
        which means no envelope of any height touches this receptor now.
        """
        z = self.d["receiver_rl"][lot]
        if alt <= 0.05:
            return None
        pts = self.grid(pos, lot, cell)
        a = az * math.pi / 180
        dx, dy = math.sin(a), math.cos(a)
        t = math.tan(alt * math.pi / 180)
        best = math.inf
        for fp in (self.d["comparator"]["A"], self.d["comparator"]["B"]):
            n = len(fp)
            cx = sum(q[0] for q in fp) / n
            cy = sum(q[1] for q in fp) / n
            for px, py in pts:
                lo, hi, ok = -math.inf, math.inf, True
                for i in range(n):
                    a0 = fp[i]
                    b0 = fp[(i + 1) % n]
                    nx = b0[1] - a0[1]
                    ny = -(b0[0] - a0[0])
                    if nx * (cx - a0[0]) + ny * (cy - a0[1]) > 0:
                        nx, ny = -nx, -ny
                    den = dx * nx + dy * ny
                    num = (a0[0] - px) * nx + (a0[1] - py) * ny
                    if abs(den) < 1e-12:
                        if num < 0:
                            ok = False
                            break
                    else:
                        tt = num / den
                        if den < 0:
                            lo = max(lo, tt)
                        else:
                            hi = min(hi, tt)
                if ok and lo <= hi and hi >= 0:
                    s = max(lo, 0.0)
                    need = z + s * t
                    if need < best:
                        best = need
        return best if math.isfinite(best) else None

    def first_contact_rl_at(self, pos, lot, when, **kw):
        alt, az = self.sun(when)
        return self.first_contact_rl(pos, lot, alt, az, **kw)

    def evaluate_at(self, pos, lot, fence, when, **kw):
        alt, az = self.sun(when)
        out = self.evaluate(pos, lot, fence, alt, az, **kw)
        out["alt"] = alt
        out["az"] = az
        return out
