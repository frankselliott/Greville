// Photo metadata, read locally: a minimal EXIF (TIFF/IFD) reader for JPEG files, the camera intrinsics implied by the EXIF
// 35 mm-equivalent focal length, and GDA2020 latitude/longitude -> MGA zone 56 (EPSG:7856) by the Krüger n-series (GRS80).
// Pure functions; no DOM, no network. HEIC is not read here: export the photo as JPEG keeping its metadata.

const TAGS = { 0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x0131: 'Software', 0x0132: 'DateTime', 0x8769: 'ExifIFD', 0x8825: 'GPSIFD',
  0x9003: 'DateTimeOriginal', 0x9011: 'OffsetTimeOriginal', 0x920A: 'FocalLength', 0xA405: 'FocalLengthIn35mmFilm', 0xA404: 'DigitalZoomRatio',
  0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension', 0xA401: 'CustomRendered', 0xA434: 'LensModel', 0x829D: 'FNumber', 0x829A: 'ExposureTime', 0x8827: 'ISO' };
const GPS = { 1: 'GPSLatitudeRef', 2: 'GPSLatitude', 3: 'GPSLongitudeRef', 4: 'GPSLongitude', 5: 'GPSAltitudeRef', 6: 'GPSAltitude', 16: 'GPSImgDirectionRef', 17: 'GPSImgDirection', 31: 'GPSHPositioningError', 18: 'GPSMapDatum' };

function readIFD(dv, tiff, off, le, names, out) {
  const n = dv.getUint16(tiff + off, le); const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  for (let i = 0; i < n; i++) {
    const e = tiff + off + 2 + i * 12, tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
    const name = names[tag]; if (!name || !SZ[type]) continue;
    const bytes = SZ[type] * cnt, vo = bytes <= 4 ? e + 8 : tiff + dv.getUint32(e + 8, le); const vals = [];
    if (vo + bytes > dv.byteLength) continue;
    for (let k = 0; k < cnt; k++) {
      const p = vo + k * SZ[type];
      if (type === 1 || type === 7) vals.push(dv.getUint8(p)); else if (type === 2) vals.push(dv.getUint8(p));
      else if (type === 3) vals.push(dv.getUint16(p, le)); else if (type === 4) vals.push(dv.getUint32(p, le)); else if (type === 9) vals.push(dv.getInt32(p, le));
      else if (type === 5) vals.push(dv.getUint32(p, le) / (dv.getUint32(p + 4, le) || NaN)); else if (type === 10) vals.push(dv.getInt32(p, le) / (dv.getInt32(p + 4, le) || NaN));
    }
    out[name] = type === 2 ? String.fromCharCode(...vals).replace(/\0+$/, '').trim() : (cnt === 1 ? vals[0] : vals);
  }
}
/** EXIF of a JPEG (ArrayBuffer). Returns {} when there is none. Values are as stored; absent fields are absent, never guessed. */
export function parseExif(buf) {
  const dv = new DataView(buf); if (dv.byteLength < 4 || dv.getUint16(0) !== 0xFFD8) return {};
  let p = 2;
  while (p + 4 <= dv.byteLength) {
    const m = dv.getUint16(p); if ((m & 0xFF00) !== 0xFF00) break; const len = dv.getUint16(p + 2);
    if (m === 0xFFE1 && dv.getUint32(p + 4) === 0x45786966) {                   // 'Exif'
      const tiff = p + 10, le = dv.getUint16(tiff) === 0x4949; const out = {};
      readIFD(dv, tiff, dv.getUint32(tiff + 4, le), le, TAGS, out);
      if (out.ExifIFD) readIFD(dv, tiff, out.ExifIFD, le, TAGS, out);
      if (out.GPSIFD) { const g = {}; readIFD(dv, tiff, out.GPSIFD, le, GPS, g); Object.assign(out, g); }
      delete out.ExifIFD; delete out.GPSIFD; return out;
    }
    if (m === 0xFFDA) break; p += 2 + len;
  }
  return {};
}
const dms = (v) => Array.isArray(v) ? v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600 : v;
/** Summary used by the app and the record: capture time (with its offset, if recorded), lens, GPS. */
export function photoSummary(ex) {
  const s = { make: ex.Make ?? null, model: ex.Model ?? null, software: ex.Software ?? null, lens: ex.LensModel ?? null,
    datetime_original: ex.DateTimeOriginal ?? null, offset_time_original: ex.OffsetTimeOriginal ?? null,
    focal_mm: ex.FocalLength ?? null, focal_35mm_equiv: ex.FocalLengthIn35mmFilm ?? null, digital_zoom: ex.DigitalZoomRatio ?? null,
    orientation: ex.Orientation ?? null, custom_rendered: ex.CustomRendered ?? null, gps: null };
  if (ex.GPSLatitude && ex.GPSLongitude) {
    const lat = dms(ex.GPSLatitude) * (ex.GPSLatitudeRef === 'S' ? -1 : 1), lon = dms(ex.GPSLongitude) * (ex.GPSLongitudeRef === 'W' ? -1 : 1);
    s.gps = { lat, lon, alt_m: ex.GPSAltitude != null ? ex.GPSAltitude * (ex.GPSAltitudeRef === 1 ? -1 : 1) : null, img_direction_deg: ex.GPSImgDirection ?? null,
              img_direction_ref: ex.GPSImgDirectionRef ?? null, h_error_m: ex.GPSHPositioningError ?? null, datum: ex.GPSMapDatum ?? null };
  }
  return s;
}
/** Capture time in AEST (UTC+10) as {date:[y,m,d], time:[h,mi], assumed_offset:boolean}, or null. */
export function captureTimeAEST(summary) {
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)(?::(\d\d))?/.exec(summary.datetime_original || ''); if (!m) return null;
  const off = /^([+-])(\d\d):(\d\d)$/.exec(summary.offset_time_original || ''); const offMin = off ? (off[1] === '-' ? -1 : 1) * (+off[2] * 60 + +off[3]) : 600;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offMin * 60000 + 600 * 60000;   // to UTC, then to UTC+10
  const d = new Date(t); return { date: [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()], time: [d.getUTCHours(), d.getUTCMinutes()], assumed_offset: !off };
}
/** Focal length in pixels from the 35 mm-equivalent focal length (CIPA definition: equivalent by the frame DIAGONAL, 43.27 mm). */
export function focalPxFrom35(f35, W, H) { return f35 > 0 ? f35 / Math.hypot(36, 24) * Math.hypot(W, H) : null; }

// ---- GDA2020 geographic -> MGA (transverse Mercator, Krüger n-series to n^6; GRS80) -------------------------------------
const GRS80 = { a: 6378137, f: 1 / 298.257222101 };
export function latLonToMGA(latDeg, lonDeg, zone = 56) {
  const { a, f } = GRS80, k0 = 0.9996, FE = 500000, FN = 10000000, lon0 = (zone * 6 - 183) * Math.PI / 180;
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  const al = [0, n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180 - 127 * n5 / 288 + 7891 * n6 / 37800,
    13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440 + 281 * n5 / 630 - 1983433 * n6 / 1935360,
    61 * n3 / 240 - 103 * n4 / 140 + 15061 * n5 / 26880 + 167603 * n6 / 181440,
    49561 * n4 / 161280 - 179 * n5 / 168 + 6601661 * n6 / 7257600,
    34729 * n5 / 80640 - 3418889 * n6 / 1995840,
    212378941 * n6 / 319334400];
  const phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180 - lon0, e = Math.sqrt(f * (2 - f));
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
  const xi1 = Math.atan2(t, Math.cos(lam)), eta1 = Math.asinh(Math.sin(lam) / Math.sqrt(t * t + Math.cos(lam) ** 2));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 6; j++) { xi += al[j] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += al[j] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1); }
  return { E: FE + k0 * A * eta, N: FN + k0 * A * xi, zone };
}
