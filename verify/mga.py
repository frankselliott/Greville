"""GDA2020 <-> MGA grid, Krueger n-series transverse Mercator.

Self-tests against the test point published in the GDA2020 Technical Manual
(Flinders Peak) and by round trip. Run this file directly to see both.
"""
import math

A   = 6378137.0                 # GRS80 semi-major axis, metres
RF  = 298.257222101             # GRS80 inverse flattening
K0  = 0.9996                    # MGA central scale factor
FE  = 500000.0                  # false easting
FN  = 10000000.0                # false northing (southern hemisphere)

def cm_of_zone(z):
    """Central meridian of an MGA zone, degrees east."""
    return z * 6 - 183

def _const():
    f = 1.0 / RF
    n = f / (2 - f)
    n2 = n*n; n3 = n2*n; n4 = n3*n; n5 = n4*n; n6 = n5*n; n7 = n6*n; n8 = n7*n
    Aa = A / (1 + n) * (1 + n2/4 + n4/64 + n6/256 + 25*n8/16384)
    alpha = [
        n/2 - 2*n2/3 + 5*n3/16 + 41*n4/180 - 127*n5/288,
        13*n2/48 - 3*n3/5 + 557*n4/1440 + 281*n5/630,
        61*n3/240 - 103*n4/140 + 15061*n5/26880,
        49561*n4/161280 - 179*n5/168,
        34729*n5/80640,
    ]
    beta = [
        n/2 - 2*n2/3 + 37*n3/96 - n4/360 - 81*n5/512,
        n2/48 + n3/15 - 437*n4/1440 + 46*n5/105,
        17*n3/480 - 37*n4/840 - 209*n5/4480,
        4397*n4/161280 - 11*n5/504,
        4583*n5/161280,
    ]
    return n, Aa, alpha, beta

def geo_to_grid(lat_deg, lon_deg, zone):
    """Geographic (GDA2020) -> MGA easting, northing."""
    n, Aa, alpha, _ = _const()
    lat = math.radians(lat_deg)
    dl  = math.radians(lon_deg - cm_of_zone(zone))
    t  = math.tan(lat)
    e2n = 2*math.sqrt(n)/(1+n)                       # first eccentricity
    sin_lat = math.sin(lat)
    sigma = math.sinh(e2n * math.atanh(e2n * sin_lat / math.sqrt(1 + t*t) * math.sqrt(1 + t*t)))
    # conformal latitude
    tau = t
    sigma = math.sinh(e2n * math.atanh(e2n * tau / math.sqrt(1 + tau*tau)))
    tau_p = tau * math.sqrt(1 + sigma*sigma) - sigma * math.sqrt(1 + tau*tau)
    xi_p  = math.atan2(tau_p, math.cos(dl))
    eta_p = math.asinh(math.sin(dl) / math.hypot(tau_p, math.cos(dl)))
    xi, eta = xi_p, eta_p
    for j, a in enumerate(alpha, start=1):
        xi  += a * math.sin(2*j*xi_p) * math.cosh(2*j*eta_p)
        eta += a * math.cos(2*j*xi_p) * math.sinh(2*j*eta_p)
    return FE + K0*Aa*eta, FN + K0*Aa*xi

def grid_to_geo(E, N, zone):
    """MGA easting, northing -> geographic (GDA2020) lat, lon in degrees."""
    n, Aa, _, beta = _const()
    xi  = (N - FN) / (K0 * Aa)
    eta = (E - FE) / (K0 * Aa)
    xi_p, eta_p = xi, eta
    for j, b in enumerate(beta, start=1):
        xi_p  -= b * math.sin(2*j*xi) * math.cosh(2*j*eta)
        eta_p -= b * math.cos(2*j*xi) * math.sinh(2*j*eta)
    tau_p = math.sin(xi_p) / math.hypot(math.sinh(eta_p), math.cos(xi_p))
    e2n = 2*math.sqrt(n)/(1+n)
    tau = tau_p
    for _ in range(8):                               # Newton on the conformal latitude
        s = math.sinh(e2n * math.atanh(e2n * tau / math.sqrt(1 + tau*tau)))
        g = tau * math.sqrt(1 + s*s) - s*math.sqrt(1 + tau*tau) - tau_p
        dg = ((math.sqrt(1+s*s)*math.sqrt(1+tau*tau) - s*tau)
              * (1 - e2n*e2n) * math.sqrt(1+tau*tau)
              / (1 + (1 - e2n*e2n)*tau*tau))
        tau -= g/dg
    lat = math.atan(tau)
    lon = math.radians(cm_of_zone(zone)) + math.atan2(math.sinh(eta_p), math.cos(xi_p))
    return math.degrees(lat), math.degrees(lon)

if __name__ == '__main__':
    dms = lambda d, m, s: d + m/60 + s/3600
    # GDA2020 Technical Manual test point, Flinders Peak, zone 55
    lat = -dms(37, 57, 3.72030); lon = dms(144, 25, 29.52440)
    gotE, gotN = geo_to_grid(lat, lon, 55)
    wantE, wantN = 273741.2966, 5796489.7769
    print('Flinders Peak, MGA zone 55')
    print('  published  E %.4f  N %.4f' % (wantE, wantN))
    print('  computed   E %.4f  N %.4f' % (gotE, gotN))
    print('  difference dE %+.4f mm   dN %+.4f mm'
          % ((gotE-wantE)*1000, (gotN-wantN)*1000))
    blat, blon = grid_to_geo(wantE, wantN, 55)
    print('  inverse of the published grid coordinates:')
    print('    dlat %+.6f mm   dlon %+.6f mm'
          % ((blat-lat)*111320*1000, (blon-lon)*111320*math.cos(math.radians(lat))*1000))
    # round trip on the Greville origin
    E0, N0 = 504045.0, 6966712.0
    la, lo = grid_to_geo(E0, N0, 56)
    rE, rN = geo_to_grid(la, lo, 56)
    print('\nGreville local origin, MGA zone 56  E %.1f N %.1f' % (E0, N0))
    print('  -> %.8f, %.8f' % (la, lo))
    print('  round trip dE %+.6f mm  dN %+.6f mm' % ((rE-E0)*1000, (rN-N0)*1000))
