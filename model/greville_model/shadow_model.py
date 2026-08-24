"""The frozen v1.1-AB shadow model.

Two independent paths, exactly as in the frozen engine:

``prism_shadow_parts``
    The per-edge Minkowski sweep — footprint translated to both offsets plus
    one quad per ring edge.  This is the DISPLAY path.  Its visual union is
    obtained by compositing the parts, never by re-deriving geometry.

``occluded_mask``
    Exact per-point ray occlusion.  This is the AREA path, and it is the one
    the QA gate is written against.  A point at receiver level ``z`` is
    shadowed by a prism of top RL ``T`` iff the segment from that point
    toward the sun, of length ``(T - z) / tan(alt)``, meets the footprint.

The two agree, but only the second is used for any number that is reported.
"""

import math

from .geometry import bbox, point_in_poly, seg_poly, seg_seg
from .solar import sun_dir

# Below this altitude the frozen model treats the sun as down and casts nothing.
MIN_ALT_DEG = 0.05


def prism_shadow_parts(fp, top_rl, base_rl, z, alt, az):
    """Display-only sweep of an extruded footprint. Returns a list of rings, or None."""
    if alt <= MIN_ALT_DEG:
        return None
    t = math.tan(alt * math.pi / 180)
    h = top_rl - z
    if h <= 0:
        return None
    l1 = h / t
    l0 = max(0.0, base_rl - z) / t
    d = sun_dir(az)
    o0 = (d[0] * l0, d[1] * l0)
    o1 = (d[0] * l1, d[1] * l1)
    parts = [[(p[0] + o0[0], p[1] + o0[1]) for p in fp],
             [(p[0] + o1[0], p[1] + o1[1]) for p in fp]]
    dx = o1[0] - o0[0]
    dy = o1[1] - o0[1]
    n = len(fp)
    for i in range(n):
        a = fp[i]
        b = fp[(i + 1) % n]
        parts.append([
            (a[0] + o0[0], a[1] + o0[1]),
            (b[0] + o0[0], b[1] + o0[1]),
            (b[0] + o0[0] + dx, b[1] + o0[1] + dy),
            (a[0] + o0[0] + dx, a[1] + o0[1] + dy),
        ])
    return parts


def line_shadow_parts(ln, top_rl, z, alt, az):
    """Display-only sweep of a thin caster (a fence run). Returns one ring, or None."""
    if alt <= MIN_ALT_DEG:
        return None
    t = math.tan(alt * math.pi / 180)
    h = top_rl - z
    if h <= 0:
        return None
    length = h / t
    d = sun_dir(az)
    a, b = ln[0], ln[1]
    return [[(a[0], a[1]), (b[0], b[1]),
             (b[0] + d[0] * length, b[1] + d[1] * length),
             (a[0] + d[0] * length, a[1] + d[1] * length)]]


def occluded_mask(pts, z, alt, az, casters, lines):
    """Per-point occlusion at receiver level ``z``.

    ``casters`` are ``(footprint, top_rl)`` pairs; ``lines`` are
    ``((a, b), top_rl)`` pairs.  Returns a list of bools, one per point.

    The footprint bounding-box prefilter below is an exact short-circuit: the
    ray is clipped to ``length``, so a ray whose whole extent lies outside the
    footprint's bounding box cannot meet the footprint.  It changes speed only.
    """
    n = len(pts)
    out = [False] * n
    if alt <= MIN_ALT_DEG:
        return out
    a = az * math.pi / 180
    dx = math.sin(a)
    dy = math.cos(a)                    # toward the sun
    t = math.tan(alt * math.pi / 180)

    for fp, top_rl in casters:
        length = (top_rl - z) / t
        if length <= 0:
            continue
        fx0, fy0, fx1, fy1 = bbox(fp)
        ex = dx * length
        ey = dy * length
        for i in range(n):
            if out[i]:
                continue
            px, py = pts[i]
            qx = px + ex
            qy = py + ey
            if max(px, qx) < fx0 or min(px, qx) > fx1:
                continue
            if max(py, qy) < fy0 or min(py, qy) > fy1:
                continue
            if seg_poly(px, py, dx, dy, length, fp):
                out[i] = True

    for ln, top_rl in lines:
        length = (top_rl - z) / t
        if length <= 0:
            continue
        for i in range(n):
            if out[i]:
                continue
            px, py = pts[i]
            if seg_seg(px, py, dx, dy, length, ln[0], ln[1]):
                out[i] = True
    return out
