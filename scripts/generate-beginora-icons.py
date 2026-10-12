#!/usr/bin/env python3
"""Generate Beginora's lightweight native icon and splash assets with Pillow."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BG = (247, 244, 239, 255)       # warm linen #F7F4EF
BADGE = (228, 237, 232, 255)    # pale sage #E4EDE8
LEAF = (126, 174, 88, 255)      # calm leaf green
STEM = (92, 122, 107, 255)      # sage #5C7A6B
SCALE = 4                       # supersample for clean edges


def cubic(p0, p1, p2, p3, count=64):
    points = []
    for i in range(count + 1):
        t = i / count
        u = 1 - t
        points.append((
            (u**3 * p0[0] + 3*u*u*t * p1[0] + 3*u*t*t * p2[0] + t**3 * p3[0]),
            (u**3 * p0[1] + 3*u*u*t * p1[1] + 3*u*t*t * p2[1] + t**3 * p3[1]),
        ))
    return points


def px(point, side):
    return (round(point[0] * side), round(point[1] * side))


def leaf_path(side, segments):
    result = []
    for start, control1, control2, end in segments:
        curve = cubic(start, control1, control2, end)
        result.extend(px(point, side) for point in (curve if not result else curve[1:]))
    return result


def draw_sprout(draw: ImageDraw.ImageDraw, side: int, with_badge: bool) -> None:
    if with_badge:
        radius = round(side * 0.405)
        center = side // 2
        draw.ellipse((center-radius, center-radius, center+radius, center+radius), fill=BADGE)

    left_leaf = leaf_path(side, [
        ((0.505, 0.535), (0.405, 0.525), (0.275, 0.425), (0.285, 0.285)),
        ((0.285, 0.285), (0.405, 0.275), (0.525, 0.365), (0.555, 0.495)),
        ((0.555, 0.495), (0.56, 0.52), (0.54, 0.54), (0.505, 0.535)),
    ])
    right_leaf = leaf_path(side, [
        ((0.535, 0.475), (0.55, 0.355), (0.665, 0.245), (0.785, 0.255)),
        ((0.785, 0.255), (0.795, 0.385), (0.69, 0.50), (0.555, 0.535)),
        ((0.555, 0.535), (0.525, 0.53), (0.52, 0.50), (0.535, 0.475)),
    ])
    draw.polygon(left_leaf, fill=LEAF)
    draw.polygon(right_leaf, fill=LEAF)

    vein_width = max(2, round(side * 0.006))
    draw.line(leaf_path(side, [((0.505, 0.53), (0.455, 0.45), (0.365, 0.355), (0.30, 0.30))]),
              fill=STEM, width=vein_width, joint="curve")
    draw.line(leaf_path(side, [((0.54, 0.49), (0.60, 0.40), (0.70, 0.30), (0.775, 0.265))]),
              fill=STEM, width=vein_width, joint="curve")

    stem_width = max(8, round(side * 0.024))
    draw.line(leaf_path(side, [((0.50, 0.76), (0.535, 0.675), (0.485, 0.59), (0.505, 0.535))]),
              fill=STEM, width=stem_width, joint="curve")


def render(size: int, background: tuple[int, int, int, int] | None, badge: bool, output: str) -> None:
    side = size * SCALE
    canvas = Image.new("RGBA", (side, side), background or (0, 0, 0, 0))
    draw_sprout(ImageDraw.Draw(canvas), side, with_badge=badge)
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(ROOT / "assets" / output, optimize=True)


if __name__ == "__main__":
    render(1024, BG, True, "icon.png")
    render(512, None, False, "android-icon-foreground.png")
    render(1024, None, True, "splash-icon.png")
