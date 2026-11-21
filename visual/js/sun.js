// Solar position: line-for-line port of the repository's frozen convention (model/greville_model/solar.py, itself a port of the
// frozen visualiser's JavaScript): NOAA geometric algorithm, Australia/Brisbane UTC+10 with no daylight saving, NO refraction.
// Azimuth clockwise from north, applied in the MGA grid frame exactly as the shadow model does (grid convergence ~0.01 deg, ignored).
export const SITE = { lat: -27.422924, lon: 153.041035, tz: 10.0 };          // model/data/greville_model_v1.1-AB.json 'solar'
function julianDay(y, m, d, hourFrac) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + hourFrac / 24 + b - 1524.5;
}
export function sunPosition(y, mo, d, hh, mi, lat = SITE.lat, lon = SITE.lon) {
  const total = hh * 60 + mi - SITE.tz * 60, dayShift = Math.floor(total / 1440), minInDay = total - dayShift * 1440;
  const dt = new Date(Date.UTC(y, mo - 1, d)); dt.setUTCDate(dt.getUTCDate() + dayShift);
  const jd = julianDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), minInDay / 60), t = (jd - 2451545.0) / 36525.0;
  const l0 = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360 + 360) % 360;
  const mm = 357.52911 + t * (35999.05029 - 0.0001537 * t), mr = mm * Math.PI / 180;
  const c = Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * mr) * 0.000289;
  const omega = 125.04 - 1934.136 * t, appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * Math.PI / 180);
  const e0 = 23 + (26 + ((21.448 - t * (46.815 + t * (0.00059 - t * 0.001813)))) / 60) / 60, e = e0 + 0.00256 * Math.cos(omega * Math.PI / 180);
  const decl = Math.asin(Math.sin(e * Math.PI / 180) * Math.sin(appLong * Math.PI / 180)) * 180 / Math.PI;
  const yv = Math.pow(Math.tan(e / 2 * Math.PI / 180), 2), eo = 0.016708634 - t * (0.000042037 + 0.0000001267 * t), l0r = l0 * Math.PI / 180;
  const eq = 4 * (180 / Math.PI) * (yv * Math.sin(2 * l0r) - 2 * eo * Math.sin(mr) + 4 * eo * yv * Math.sin(mr) * Math.cos(2 * l0r) - 0.5 * yv * yv * Math.sin(4 * l0r) - 1.25 * eo * eo * Math.sin(2 * mr));
  let tst = (hh * 60 + mi + eq + 4 * lon - 60 * SITE.tz) % 1440; if (tst < 0) tst += 1440;
  const ha = tst / 4 - 180, lr = lat * Math.PI / 180, dr = decl * Math.PI / 180, hr = ha * Math.PI / 180;
  const cz = Math.max(-1, Math.min(1, Math.sin(lr) * Math.sin(dr) + Math.cos(lr) * Math.cos(dr) * Math.cos(hr)));
  const alt = 90 - Math.acos(cz) * 180 / Math.PI, altr = alt * Math.PI / 180;
  let az = 0;
  if (Math.cos(altr) >= 1e-9) { const sA = -Math.cos(dr) * Math.sin(hr) / Math.cos(altr), cA = (Math.sin(dr) - Math.sin(lr) * Math.sin(altr)) / (Math.cos(lr) * Math.cos(altr)); az = Math.atan2(sA, cA) * 180 / Math.PI; }
  return { alt, az: ((az % 360) + 360) % 360 };
}
// unit vector TOWARDS the sun in the local frame (x east, y north, z up)
export function sunVectorLocal(alt, az) { const a = alt * Math.PI / 180, z = az * Math.PI / 180; return [Math.sin(z) * Math.cos(a), Math.cos(z) * Math.cos(a), Math.sin(a)]; }
