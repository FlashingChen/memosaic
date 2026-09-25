#!/usr/bin/env python3
"""
Generate the GitHub social preview card (1280x640).

GitHub has no REST API for social previews, so this file is generated here and
uploaded by hand: repo Settings -> Social preview -> Upload an image.

Requires Pillow and numpy:
    pip install pillow numpy
    python assets/generate_social.py
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MARK = os.path.join(ROOT, "icons", "icon512.png")
OUT = os.path.join(HERE, "social-preview.png")

W, H = 1280, 640
BG = ["#0B1220", "#241B4D"]
TILE = (255, 255, 255, 13)

FONT_BOLD = [("/System/Library/Fonts/Avenir Next.ttc", 8),   # Heavy
             ("/System/Library/Fonts/Supplemental/Futura.ttc", 2)]
FONT_REG = [("/System/Library/Fonts/Avenir Next.ttc", 5),    # Medium
            ("/System/Library/Fonts/Supplemental/Futura.ttc", 0)]


def _rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def font(candidates, px):
    for path, index in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, px, index=index)
    raise SystemExit("No usable font found for the social card.")


def background():
    y, x = np.mgrid[0:H, 0:W]
    t = ((x / (W - 1)) * 0.55 + (y / (H - 1)) * 0.45).astype(np.float32)
    a, b = _rgb(BG[0]), _rgb(BG[1])
    arr = np.zeros((H, W, 3), dtype=np.float32)
    for c in range(3):
        arr[:, :, c] = a[c] + (b[c] - a[c]) * t
    img = Image.fromarray(arr.astype(np.uint8)).convert("RGBA")

    # a quiet mosaic of cells, echoing the mark
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cols, rows, margin, gap = 12, 6, 0.0, 14
    cw, ch = W / cols, H / rows
    for r in range(rows):
        for c in range(cols):
            x0 = c * cw + gap / 2
            y0 = r * ch + gap / 2
            draw.rounded_rectangle([x0, y0, x0 + cw - gap, y0 + ch - gap],
                                   radius=18, fill=TILE)
    return Image.alpha_composite(img, layer)


def mark(width):
    icon = Image.open(MARK).convert("RGBA")
    scale = width / icon.width
    return icon.resize((width, max(1, round(icon.height * scale))), Image.LANCZOS)


def main():
    card = background()
    draw = ImageDraw.Draw(card)

    # the mark, vertically centred on the left
    logo = mark(452)
    card.paste(logo, (56, (H - logo.height) // 2), logo)

    # text block on the right
    x = 560
    draw.text((x, 176), "Memosaic", font=font(FONT_BOLD, 104), fill=(255, 255, 255))
    draw.text((x, 300), "One local memory for every AI chat.",
              font=font(FONT_REG, 34), fill=(196, 205, 245))

    draw.line([x, 372, x + 620, 372], fill=(255, 255, 255, 46), width=2)
    draw.text((x, 396), "Local-first · No account · No server",
              font=font(FONT_REG, 27), fill=(150, 160, 205))
    draw.text((x, 468), "github.com/FlashingChen/memosaic",
              font=font(FONT_REG, 25), fill=(120, 130, 180))

    card.convert("RGB").save(OUT, optimize=True)
    print(f"  {os.path.relpath(OUT, ROOT)}  {card.width}x{card.height}")


if __name__ == "__main__":
    sys.exit(main())
