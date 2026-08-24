"""NOAA geometric solar position — the frozen convention.

Line-for-line port of the JavaScript in the frozen visualiser
(``index.html``, SHA-256 cd551cef…b128f9f), which is itself labelled in that
file as an "Exact port of v1.0.2 scripts/solar.py".

Australia/Brisbane is UTC+10 with no daylight saving, and no atmospheric
refraction correction is applied.  DO NOT "improve" either of those: they are
the frozen convention, and every frozen figure in
``data/greville_model_v1.1-AB.json`` was produced under them.
"""

import math

TZ_OFFSET_H = 10.0


def julian_day(y, m, d, hour_frac):
    if m <= 2:
        y -= 1
        m += 12
    a = math.floor(y / 100)
    b = 2 - a + math.floor(a / 4)
    return (math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1))
            + d + hour_frac / 24.0 + b - 1524.5)


def sun_position(y, m, d, hh, mm, lat_deg, lon_deg):
    """Sun altitude and azimuth for a LOCAL (AEST) civil date and time.

    Returns ``(alt, az)`` in degrees; azimuth is measured from north, clockwise.
    """
    # local -> UTC
    total_min = hh * 60 + mm - TZ_OFFSET_H * 60
    day_shift = math.floor(total_min / 1440)
    min_in_day = total_min - day_shift * 1440

    # apply the day shift on a plain UTC calendar (no timezone involvement)
    import datetime
    shifted = datetime.date(y, m, d) + datetime.timedelta(days=int(day_shift))
    y, m, d = shifted.year, shifted.month, shifted.day
    hour_frac = min_in_day / 60.0

    jd = julian_day(y, m, d, hour_frac)
    t = (jd - 2451545.0) / 36525.0
    l0 = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360 + 360) % 360
    mm_ = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    mr = mm_ * math.pi / 180
    c = (math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + math.sin(2 * mr) * (0.019993 - 0.000101 * t)
         + math.sin(3 * mr) * 0.000289)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * t
    app_long = true_long - 0.00569 - 0.00478 * math.sin(omega * math.pi / 180)
    e0 = 23 + (26 + ((21.448 - t * (46.815 + t * (0.00059 - t * 0.001813)))) / 60) / 60
    e = e0 + 0.00256 * math.cos(omega * math.pi / 180)
    decl = math.asin(math.sin(e * math.pi / 180)
                     * math.sin(app_long * math.pi / 180)) * 180 / math.pi
    yv = math.pow(math.tan(e / 2 * math.pi / 180), 2)
    eo = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    l0r = l0 * math.pi / 180
    eq = 4 * (180 / math.pi) * (yv * math.sin(2 * l0r) - 2 * eo * math.sin(mr)
                                + 4 * eo * yv * math.sin(mr) * math.cos(2 * l0r)
                                - 0.5 * yv * yv * math.sin(4 * l0r)
                                - 1.25 * eo * eo * math.sin(2 * mr))

    mins = hh * 60 + mm                       # LOCAL clock minutes
    tst = math.fmod(mins + eq + 4 * lon_deg - 60 * TZ_OFFSET_H, 1440)
    if tst < 0:
        tst += 1440
    ha = tst / 4.0 - 180.0

    lr = lat_deg * math.pi / 180
    dr = decl * math.pi / 180
    hr = ha * math.pi / 180
    cz = math.sin(lr) * math.sin(dr) + math.cos(lr) * math.cos(dr) * math.cos(hr)
    cz = max(-1.0, min(1.0, cz))
    zen = math.acos(cz)
    alt = 90 - zen * 180 / math.pi
    altr = alt * math.pi / 180
    if math.cos(altr) < 1e-9:
        az = 0.0
    else:
        s_a = -math.cos(dr) * math.sin(hr) / math.cos(altr)
        c_a = ((math.sin(dr) - math.sin(lr) * math.sin(altr))
               / (math.cos(lr) * math.cos(altr)))
        az = math.atan2(s_a, c_a) * 180 / math.pi
    return alt, (math.fmod(az, 360) + 360) % 360


def sun_dir(az_deg):
    """Unit vector along which shadows fall — i.e. away from the sun."""
    a = az_deg * math.pi / 180
    return -math.sin(a), -math.cos(a)
