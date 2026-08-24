"""Planar geometry primitives — exact ports of the frozen engine.

Every routine here mirrors the corresponding function in the frozen
visualiser's script, including its tie-breaking and epsilon choices.  The
conventions are deliberate; changing one changes the frozen figures.

Coordinates are local metres: EPSG:7856 (MGA2020 zone 56) minus the local
origin E 504045 / N 6966712.  The transform is exact and reversible.
"""

import math


def point_in_poly(px, py, poly):
    """Crossing-number test, matching the frozen ``pointInPoly`` exactly."""
    inside = False
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        if (a[1] > py) != (b[1] > py):
            xint = (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]
            if px < xint:
                inside = not inside
    return inside


def seg_seg(px, py, dx, dy, length, a, b):
    """Does the ray from (px,py) along (dx,dy), of the given length, meet segment a-b?"""
    rx = dx * length
    ry = dy * length
    sx = b[0] - a[0]
    sy = b[1] - a[1]
    rxs = rx * sy - ry * sx
    if abs(rxs) < 1e-14:
        return False
    qx = a[0] - px
    qy = a[1] - py
    t = (qx * sy - qy * sx) / rxs
    u = (qx * ry - qy * rx) / rxs
    return 0 <= t <= 1 and 0 <= u <= 1


def seg_poly(px, py, dx, dy, length, poly):
    """Does that same ray meet polygon ``poly`` (interior or boundary)?"""
    if point_in_poly(px, py, poly):
        return True
    if point_in_poly(px + dx * length, py + dy * length, poly):
        return True
    n = len(poly)
    for i in range(n):
        if seg_seg(px, py, dx, dy, length, poly[i], poly[(i + 1) % n]):
            return True
    return False


def bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def grid_in_polygon(poly, cell):
    """Cell-centre sample points inside ``poly``.

    The float accumulation (``y += cell`` rather than ``y0 + i*cell``) is
    reproduced from the frozen engine deliberately: it decides which centres
    fall on the boundary, and so the sampled area in the third decimal.
    """
    x0, y0, x1, y1 = bbox(poly)
    pts = []
    y = y0 + cell / 2
    while y < y1:
        x = x0 + cell / 2
        while x < x1:
            if point_in_poly(x, y, poly):
                pts.append((x, y))
            x += cell
        y += cell
    return pts
