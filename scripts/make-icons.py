#!/usr/bin/env python3
# Regenerates public/icon/{16..128}.png from assets/store-logo.png.
# Not part of the build — run manually when the logo changes:
#   python3 -m venv .venv && .venv/bin/pip install pillow && .venv/bin/python scripts/make-icons.py
"""Build squircle brand icons from the ArticleLens logo mark.

Pipeline: crop mark from full logo -> flood-fill background to transparency
(soft alpha by color distance, so shadows fade instead of leaving a hard halo)
-> composite onto a rounded-rect indigo->violet gradient -> export sizes.
"""

import colorsys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "store-logo.png"
OUT_DIR = ROOT / "public" / "icon"

# Mark region established earlier with sips (offset y=15 x=205, 790x790)
CROP = (205, 15, 205 + 790, 15 + 790)

CANVAS = 1024
RADIUS = int(CANVAS * 0.225)  # rounded-rect corner radius
MARK_SCALE = 0.80  # mark size relative to canvas
GRAD_TOP = (13, 13, 15)  # near-black squircle
GRAD_BOTTOM = (13, 13, 15)  # solid, same as GRAD_TOP

# Alpha ramp: color distance to bg where a pixel becomes fully opaque
FULL_TRANSPARENT = 4.0
FULL_OPAQUE = 12.0

# Navy -> white remap (luminance ramp): the A and the lens ring/handle are the
# only near-black pixels; the gray document and the blue lens interior stay put.
WHITE_BELOW_L = 40.0  # fully white at or below this luminance
KEEP_ABOVE_L = 80.0  # untouched at or above this luminance

# Lens-interior remap: the only saturated pixels are the glassy blue/violet
# gradient and the indigo text lines. Both go neutral to match the document:
# gradient -> near-white fill, text lines (more saturated, s>~0.46) -> gray.
LENS_WHITE = (246, 247, 249)
LENS_LINE_GRAY = (170, 176, 188)


def remove_background(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[3, 3][:3]  # sample corner for the off-white bg color

    def dist(c):
        return (
            (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2
        ) ** 0.5

    # BFS flood fill from the borders: only bg-connected pixels get faded,
    # so light grays inside the mark (document, lens highlight) are untouched.
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        r, g, b, a = px[x, y]
        d = dist((r, g, b))
        if d >= FULL_OPAQUE:
            continue  # solid mark pixel: stop the fill here
        if d <= FULL_TRANSPARENT:
            alpha = 0
        else:
            alpha = int(255 * (d - FULL_TRANSPARENT) / (FULL_OPAQUE - FULL_TRANSPARENT))
        px[x, y] = (r, g, b, min(a, alpha))
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return im


def gradient_squircle() -> Image.Image:
    grad = Image.new("RGBA", (CANVAS, CANVAS))
    gpx = grad.load()
    for y in range(CANVAS):
        t = y / (CANVAS - 1)
        row = tuple(
            int(GRAD_TOP[i] + (GRAD_BOTTOM[i] - GRAD_TOP[i]) * t) for i in range(3)
        )
        for x in range(CANVAS):
            gpx[x, y] = (*row, 255)
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, CANVAS - 1, CANVAS - 1), radius=RADIUS, fill=255
    )
    grad.putalpha(mask)
    return grad


def navy_to_white(mark: Image.Image) -> Image.Image:
    px = mark.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < KEEP_ABOVE_L:
                f = min(1.0, (KEEP_ABOVE_L - lum) / (KEEP_ABOVE_L - WHITE_BELOW_L))
                px[x, y] = (
                    int(r + (255 - r) * f),
                    int(g + (255 - g) * f),
                    int(b + (255 - b) * f),
                    a,
                )
    return mark


def lens_to_neutral(mark: Image.Image) -> Image.Image:
    px = mark.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.10 and v > 0.25:
                lineness = min(1.0, max(0.0, (s - 0.46) / 0.12))
                t = tuple(
                    int(LENS_WHITE[i] + (LENS_LINE_GRAY[i] - LENS_WHITE[i]) * lineness)
                    for i in range(3)
                )
                f = min(1.0, (s - 0.10) / 0.10)  # soft edges at low saturation
                px[x, y] = (
                    int(r + (t[0] - r) * f),
                    int(g + (t[1] - g) * f),
                    int(b + (t[2] - b) * f),
                    a,
                )
    return mark


def main():
    mark = remove_background(Image.open(SRC).crop(CROP))
    mark = navy_to_white(mark)
    mark = lens_to_neutral(mark)
    mark = mark.crop(mark.getbbox())  # tighten to the visible mark, then center
    side = int(CANVAS * MARK_SCALE)
    scale = side / max(mark.size)
    mark = mark.resize(
        (round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS
    )

    icon = gradient_squircle()
    icon.alpha_composite(
        mark, ((CANVAS - mark.width) // 2, (CANVAS - mark.height) // 2)
    )

    for size in (16, 32, 48, 96, 128):
        icon.resize((size, size), Image.LANCZOS).save(f"{OUT_DIR}/{size}.png")
    print("done")


if __name__ == "__main__":
    main()
