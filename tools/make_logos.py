"""Trim, resize and convert the colour logos used on the site into media/web/logos/.

Logos are shown on white tiles, so each one is trimmed to its artwork (white or transparent
margins removed) and scaled to 120 px tall, which covers 60 px tiles on retina screens.

Usage (needs Pillow and numpy):
    python tools/make_logos.py media [path/to/meta_rasterized.png]

The Meta lockup ships as an SVG with an embedded bitmap; rasterize it first (any browser
screenshot of the SVG with a transparent background works) and pass the PNG as the 2nd arg.
"""
import os
import sys

import numpy as np
from PIL import Image

M = sys.argv[1]
META_PNG = sys.argv[2] if len(sys.argv) > 2 else None
OUT = os.path.join(M, 'web', 'logos')
os.makedirs(OUT, exist_ok=True)

LOGOS = {
    'cu': 'boulder-fl-centered-2.png',
    'uw': 'uw.png',
    'myolab': 'Myolab_logo_def.png',
    'nsc': 'nsc.png',
    'techcrunch': 'techcrunch.png',
    'mit-tr': 'mittech.png',
    'ieee-spectrum': 'IEEE-Spectrum-Logo.jpg',
    'foxnews': 'foxnews.png',
    'cmu': 'cmu-wordmark-horizontal-r.jpg',
    'cmu-ri': 'cmu-ri-may2023-medium.png',
    'hackaday': 'hackaday.png',
    'acm': 'acm.png',
    'rockingrobots': 'rockingrobots.png',
    'studyfinds': 'studyFind.png',
    'techbriefs': 'techBriefs.png',
}


def trim(im, pad=0.03):
    a = np.asarray(im.convert('RGBA')).astype(np.float32) / 255
    ink = (a[..., 3] > 0.05) & (a[..., :3].min(-1) < 0.94)
    ys, xs = np.nonzero(ink)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    p = int(max(x1 - x0, y1 - y0) * pad)
    return im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))


def save(im, name, height=120):
    im = trim(im.convert('RGBA'))
    w = round(im.width * height / im.height)
    if w > 720:  # very wide wordmarks: cap the width instead
        w, height = 720, round(im.height * 720 / im.width)
    im = im.resize((w, height), Image.LANCZOS)
    path = os.path.join(OUT, f'{name}.webp')
    im.save(path, quality=92, method=6)
    print(f'logos/{name}.webp {im.size} {os.path.getsize(path) / 1e3:.1f} kB')


# Some source files carry a frame around the artwork; shave it off first (pixels per side).
FRAME = {'techbriefs': 6}

for name, src in LOGOS.items():
    im = Image.open(os.path.join(M, src))
    f = FRAME.get(name, 0)
    if f:
        im = im.crop((f, f, im.width - f, im.height - f))
    save(im, name)
if META_PNG:
    save(Image.open(META_PNG), 'meta')
