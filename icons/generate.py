#!/usr/bin/env python3
"""
Build the Memosaic icon set from the master artwork in icons/source.png.

Two things make this more than a resize:

1. The master is a 1254x1254 RGBA render whose artwork occupies a wide band
   (~1138x651) because the circuit traces spread sideways, and it carries a
   faint drop shadow far from the object. Alpha at or below FLOOR is shadow and
   is dropped so the icon has no grey haze.

2. Below ~64px the traces are sub-pixel noise that turns the mark into a blue
   blur, so small sizes use the central M only, cropped from the same master
   and scaled to fill more of the square. That is ordinary optical sizing: the
   16px toolbar icon and the 128px store icon share one design, not one bitmap.

Transparent pixels in the master are black, so a naive RGBA downscale bleeds
black into every edge. All resizing therefore happens premultiplied, and the
colour is divided back out afterwards.

Requires Pillow and numpy:
    pip install pillow numpy
    python icons/generate.py
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "source.png")

FLOOR = 5              # alpha <= this is drop shadow, not artwork
WIDTH_FILL = 0.92      # artwork width as a fraction of the canvas, full mark
CROP_FILL = 0.94       # ...and for the cropped M
# The M body occupies this region of the master; the rest is traces.
M_CROP = (0.17, 0.04, 0.80, 0.96)   # left, top, right, bottom as fractions

# size -> whether to use the tight M crop. Only the two sizes where the traces
# are sub-pixel noise: at 48px and up they are visible detail worth keeping, and
# cropping there would leave visibly truncated traces.
PLAN = {16: True, 32: True, 48: False, 128: False, 512: False}


def _load_master():
    im = Image.open(SOURCE).convert("RGBA")
    arr = np.array(im).astype(np.float64)
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]

    alpha[alpha <= FLOOR] = 0
    ys, xs = np.where(alpha > 0)
    rgb = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    alpha = alpha[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return rgb, alpha


def _m_only(rgb, alpha):
    h, w = alpha.shape
    left, top, right, bottom = M_CROP
    return (rgb[int(h * top):int(h * bottom), int(w * left):int(w * right)],
            alpha[int(h * top):int(h * bottom), int(w * left):int(w * right)])


def _resize_channel(channel, size):
    img = Image.fromarray(channel.astype(np.float32), mode="F")
    return np.array(img.resize(size, Image.LANCZOS))


def _compose(rgb, alpha, size, fill):
    """Scale to `fill` of the width, centre on a square, unpremultiply."""
    h, w = alpha.shape
    scale = (size * fill) / w
    new_w, new_h = max(1, round(w * scale)), max(1, round(h * scale))

    rgb_pre = rgb * (alpha[:, :, None] / 255.0)
    channels = [_resize_channel(rgb_pre[:, :, c], (new_w, new_h)) for c in range(3)]
    small_a = _resize_channel(alpha, (new_w, new_h))

    canvas_rgb = np.zeros((size, size, 3), dtype=np.float64)
    canvas_a = np.zeros((size, size), dtype=np.float64)
    off_x, off_y = (size - new_w) // 2, (size - new_h) // 2
    canvas_rgb[off_y:off_y + new_h, off_x:off_x + new_w] = np.dstack(channels)
    canvas_a[off_y:off_y + new_h, off_x:off_x + new_w] = small_a

    out = np.zeros((size, size, 4), dtype=np.uint8)
    safe = canvas_a > 0.5
    rgb_out = np.zeros_like(canvas_rgb)
    rgb_out[safe] = canvas_rgb[safe] / (canvas_a[safe, None] / 255.0)
    out[:, :, :3] = np.clip(rgb_out, 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(canvas_a, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def toolbar_preview(path):
    """Check the mark on light and dark browser chrome."""
    row_h = 68
    out = Image.new("RGB", (640, row_h * 2 + 20), (255, 255, 255))
    draw = ImageDraw.Draw(out)
    for index, (bg, fg, label) in enumerate(
        [((242, 243, 245), (60, 60, 70), "light toolbar"),
         ((32, 33, 36), (225, 225, 230), "dark toolbar")]
    ):
        y = 10 + index * row_h
        draw.rectangle([0, y, 640, y + row_h - 1], fill=bg)
        draw.text((12, y + 26), label, fill=fg)
        x = 160
        for size in (16, 32, 48):
            icon = Image.open(os.path.join(HERE, f"icon{size}.png")).convert("RGBA")
            out.paste(icon, (x, y + (row_h - size) // 2), icon)
            x += size + 28
    out.save(path)


def main():
    rgb, alpha = _load_master()
    print(f"master artwork: {alpha.shape[1]}x{alpha.shape[0]}")
    m_rgb, m_alpha = _m_only(rgb, alpha)
    print(f"M-only crop:    {m_alpha.shape[1]}x{m_alpha.shape[0]}")

    for size, tight in sorted(PLAN.items()):
        src_rgb, src_alpha = (m_rgb, m_alpha) if tight else (rgb, alpha)
        fill = CROP_FILL if tight else WIDTH_FILL
        _compose(src_rgb, src_alpha, size, fill).save(
            os.path.join(HERE, f"icon{size}.png"), optimize=True
        )
        print(f"  icon{size}.png  ({'M crop' if tight else 'full artwork'})")

    toolbar_preview(os.path.join(HERE, "_toolbar-preview.png"))
    print("  _toolbar-preview.png (design check, not shipped)")


if __name__ == "__main__":
    sys.exit(main())
