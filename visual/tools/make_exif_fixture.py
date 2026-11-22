#!/usr/bin/env python3
"""Write two small synthetic JPEGs with known EXIF (big- and little-endian TIFF) and the expected values, for the photo-metadata
unit tests. Synthetic: no real photograph is involved. Needs Pillow, piexif and pyproj (expected MGA from EPSG:7844 -> EPSG:7856)."""
import io, json, os, piexif
from PIL import Image
from pyproj import Transformer
HERE = os.path.dirname(os.path.abspath(__file__)); FIX = os.path.join(HERE, '..', 'tests', 'fixtures')
lat, lon, alt = -27.4231234, 153.0402468, 24.6
def dms(v):
    v = abs(v); d = int(v); m = int((v - d) * 60); s = (v - d - m / 60) * 3600
    return ((d, 1), (m, 1), (int(round(s * 10000)), 10000))
exif = {'0th': {piexif.ImageIFD.Make: b'SyntheticCam', piexif.ImageIFD.Model: b'Fixture 1', piexif.ImageIFD.Orientation: 1},
        'Exif': {piexif.ExifIFD.DateTimeOriginal: b'2026:06:21 08:30:15', piexif.ExifIFD.OffsetTimeOriginal: b'+10:00',
                 piexif.ExifIFD.FocalLength: (157, 100), piexif.ExifIFD.FocalLengthIn35mmFilm: 26, piexif.ExifIFD.DigitalZoomRatio: (1, 1)},
        'GPS': {piexif.GPSIFD.GPSLatitudeRef: b'S', piexif.GPSIFD.GPSLatitude: dms(lat), piexif.GPSIFD.GPSLongitudeRef: b'E', piexif.GPSIFD.GPSLongitude: dms(lon),
                piexif.GPSIFD.GPSAltitudeRef: 0, piexif.GPSIFD.GPSAltitude: (246, 10), piexif.GPSIFD.GPSImgDirectionRef: b'T', piexif.GPSIFD.GPSImgDirection: (8750, 100)}}
img = Image.new('RGB', (300, 200), (120, 140, 160)); b = io.BytesIO(); img.save(b, 'JPEG', quality=80)
out_be = io.BytesIO(); piexif.insert(piexif.dump(exif), b.getvalue(), out_be)             # piexif writes big-endian ('MM')
open(os.path.join(FIX, 'exif_sample_be.jpg'), 'wb').write(out_be.getvalue())
img2 = Image.open(io.BytesIO(out_be.getvalue())); ex2 = img2.getexif()                   # Pillow re-writes little-endian ('II')
b2 = io.BytesIO(); img.save(b2, 'JPEG', quality=80, exif=ex2.tobytes()); open(os.path.join(FIX, 'exif_sample_le.jpg'), 'wb').write(b2.getvalue())
latq = -(27 + 25 / 60 + round((abs(lat) - 27 - 25 / 60) * 3600 * 10000) / 10000 / 3600); lonq = 153 + 2 / 60 + round((lon - 153 - 2 / 60) * 3600 * 10000) / 10000 / 3600
E, N = Transformer.from_crs('EPSG:7844', 'EPSG:7856', always_xy=True).transform(lonq, latq)
mga_cases = [[la, lo] + list(Transformer.from_crs('EPSG:7844', 'EPSG:7856', always_xy=True).transform(lo, la)) for la, lo in
             [(-27.422924, 153.041035), (-27.43, 153.03), (-27.40, 153.06), (-27.5, 152.9), (-26.9, 154.1), (-28.2, 151.9)]]
json.dump({'lat': latq, 'lon': lonq, 'alt_m': 24.6, 'E': E, 'N': N, 'datetime_original': '2026:06:21 08:30:15', 'offset': '+10:00', 'focal_mm': 1.57,
           'focal_35': 26, 'img_direction': 87.5, 'make': 'SyntheticCam', 'W': 300, 'H': 200, 'mga_cases': mga_cases,
           'generator': 'visual/tools/make_exif_fixture.py (pyproj EPSG:7844->EPSG:7856)'}, open(os.path.join(FIX, 'exif_expected.json'), 'w'), indent=1)
print('ok', E, N)
