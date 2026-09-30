"""Generate web-optimised derivatives of the site media into media/web/ (originals untouched).

Usage (needs ffmpeg and Pillow):
    python tools/make_media.py media            # everything
    python tools/make_media.py media video      # just videos (or: image)

Logos live in tools/make_logos.py.

To add a paper teaser, add a `video(...)` or `image(...)` line below and reference the
output from index.html.
"""
import glob
import os
import subprocess
import sys

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None
M = sys.argv[1]
OUT = os.path.join(M, 'web')
os.makedirs(OUT, exist_ok=True)


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def video(src, name, width, crf=29, poster_at=1.0, max_seconds=None):
    out = os.path.join(OUT, f'{name}.mp4')
    cmd = ['ffmpeg', '-y', '-i', src, '-an']
    if max_seconds:
        cmd += ['-t', str(max_seconds)]
    cmd += ['-vf', f'scale={width}:-2:flags=lanczos,fps=24', '-c:v', 'libx264', '-preset', 'slow',
            '-crf', str(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]
    run(cmd)
    poster = os.path.join(OUT, f'{name}.jpg')
    run(['ffmpeg', '-y', '-ss', str(poster_at), '-i', out, '-frames:v', '1', '-q:v', '4', poster])
    im = Image.open(poster)
    im.save(os.path.join(OUT, f'{name}.webp'), quality=78, method=6)
    os.remove(poster)
    print(f'{name}.mp4 {os.path.getsize(out) / 1e6:.2f} MB')


def image(src, name, width, quality=80):
    im = ImageOps.exif_transpose(Image.open(src))
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[3])
        im = bg
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = os.path.join(OUT, f'{name}.webp')
    im.save(out, quality=quality, method=6)
    print(f'{name}.webp {im.size} {os.path.getsize(out) / 1e3:.0f} kB')


if __name__ == '__main__':
    what = sys.argv[2] if len(sys.argv) > 2 else 'all'
    if what in ('all', 'video'):
        video(f'{M}/teaser_compressed.mp4', 'rtx', 640, crf=30, poster_at=2.5)
        video(f'{M}/big_banner.mp4', 'roboagent', 640, crf=28, poster_at=1.0)
        video(f'{M}/optimized_mosaic.mp4', 'okrobot', 640, crf=29, poster_at=2.0)
        for src, name in [('IMG_2186_AdobeExpress (1) (1).mp4', 'boulder-1'), ('v0.mp4', 'boulder-2'),
                          ('IMG_2168_AdobeExpress (1) (1) (1).mp4', 'boulder-3'),
                          ('IMG_2166_AdobeExpress (1) (1) (1).mp4', 'boulder-4')]:
            video(f'{M}/{src}', name, 480, crf=29, poster_at=0.5)
    if what in ('all', 'image'):
        image(f'{M}/pvrs_sim2real_teaser.png', 'pvrs', 1100)
        image(f'{M}/VC1_teaser_7.png', 'vc1', 720)
        image(f'{M}/slap.png', 'slap', 726)
        image(glob.glob(f'{M}/Screenshot 2024-08-26*')[0], 'homerobot', 960)
        image(f'{M}/Screenshot 2023-10-13 at 11.56.40.png', 'robohive', 720)
        image(f'{M}/bouldering_1.jpeg', 'bouldering-bg', 1600, quality=72)
        # Hero portraits (4:5). Crop = (centre x, top y, width) as fractions of each photo.
        crops = [('jay_1.jpeg', 0.515, 0.31, 0.55), ('jay_3.jpg', 0.55, 0.2, 0.6), ('jay_4.jpeg', 0.36, 0.0, 0.48),
                 ('jay_5.jpg', 0.62, 0.2, 0.42), ('jay_6.jpeg', 0.58, 0.08, 0.8)]
        for k, (src, cx, ty, wf) in enumerate(crops, 1):
            im = ImageOps.exif_transpose(Image.open(f'{M}/{src}')).convert('RGB')
            w = wf * im.width
            h = w * 5 / 4
            x0 = max(0, min(im.width - w, cx * im.width - w / 2))
            y0 = max(0, min(im.height - h, ty * im.height))
            im = im.crop((round(x0), round(y0), round(x0 + w), round(y0 + h))).resize((480, 600), Image.LANCZOS)
            im.save(f'{OUT}/portrait-{k}.webp', quality=82, method=6)
            print(f'portrait-{k}.webp', os.path.getsize(f'{OUT}/portrait-{k}.webp') // 1000, 'kB')
