"""Render DotaScope PWA icons from the brand geometry without external SVG deps."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "public" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

S = 2048
UNIT = S / 64
ACCENT = (238, 169, 79, 255)
ACCENT_LIGHT = (255, 208, 138, 255)
ACCENT_DEEP = (198, 133, 59, 255)
INK = (8, 11, 16, 255)


def pt(x: float, y: float) -> tuple[int, int]:
    return round(x * UNIT), round(y * UNIT)


def hex_points(cx: float, cy: float, radius: float) -> list[tuple[int, int]]:
    return [
        pt(cx + radius * math.cos(math.radians(90 + i * 60)),
           cy + radius * math.sin(math.radians(90 + i * 60)))
        for i in range(6)
    ]


def make_background() -> Image.Image:
    image = Image.new("RGBA", (S, S), INK)
    draw = ImageDraw.Draw(image)
    top = (13, 19, 29)
    bottom = (4, 6, 10)
    for y in range(S):
        t = y / max(1, S - 1)
        eased = t * t * (3 - 2 * t)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * eased) for i in range(3))
        draw.line([(0, y), (S, y)], fill=(*color, 255))

    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        [pt(11, 7)[0], pt(11, 7)[1], pt(53, 49)[0], pt(53, 49)[1]],
        fill=(238, 169, 79, 38),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(round(S * 0.10)))
    image.alpha_composite(glow)

    # Fine vignette.
    vignette = Image.new("L", (S, S), 0)
    vd = ImageDraw.Draw(vignette)
    vd.ellipse([-S * 0.15, -S * 0.25, S * 1.15, S * 1.2], fill=120)
    vignette = vignette.filter(ImageFilter.GaussianBlur(round(S * 0.08)))
    black = Image.new("RGBA", (S, S), (0, 0, 0, 255))
    image = Image.composite(image, black, vignette.point(lambda p: 130 + p))
    return image


def make_logo() -> Image.Image:
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # Warm bloom behind the emblem.
    bloom = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bloom)
    bd.ellipse(
        [pt(17, 14)[0], pt(17, 14)[1], pt(47, 44)[0], pt(47, 44)[1]],
        fill=(238, 169, 79, 56),
    )
    bloom = bloom.filter(ImageFilter.GaussianBlur(round(S * 0.055)))
    layer.alpha_composite(bloom)

    # Outer scope hex.
    outer = hex_points(32, 32, 27)
    draw.line(outer + [outer[0]], fill=(238, 169, 79, 72), width=round(UNIT * 0.65))
    # Inner core hex.
    inner = hex_points(32, 32, 20)
    draw.polygon(inner, fill=(238, 169, 79, 18), outline=(238, 169, 79, 105))
    draw.line(inner + [inner[0]], fill=(238, 169, 79, 150), width=round(UNIT * 0.48))

    # Faceted arrow.
    arrow = [pt(32, 16.5), pt(43.7, 45.5), pt(32, 37.8), pt(20.3, 45.5)]
    draw.polygon(arrow, fill=ACCENT_DEEP)
    draw.polygon(
        [pt(32, 16.5), pt(43.7, 45.5), pt(32, 37.8)],
        fill=ACCENT,
    )
    draw.polygon(
        [pt(32, 16.5), pt(36.1, 31.5), pt(32, 28.5)],
        fill=ACCENT_LIGHT,
    )
    draw.line(arrow + [arrow[0]], fill=(255, 217, 158, 180), width=round(UNIT * 0.42))
    return layer


def sized(logo: Image.Image, background: Image.Image, size: int, scale: float, offset_y: float = 0) -> Image.Image:
    logo_size = round(size * scale)
    scaled = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    canvas = background.resize((size, size), Image.Resampling.LANCZOS)
    x = (size - logo_size) // 2
    y = round((size - logo_size) / 2 + size * offset_y)
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def main() -> None:
    background = make_background()
    logo = make_logo()

    outputs = {
        "icon-192.png": (192, 0.86, 0.0),
        "icon-512.png": (512, 0.86, 0.0),
        "icon-maskable-512.png": (512, 0.76, 0.0),
        "apple-touch-icon.png": (180, 0.84, 0.0),
        "favicon-32.png": (32, 0.88, 0.0),
    }
    for name, (size, scale, offset) in outputs.items():
        image = sized(logo, background, size, scale, offset)
        image.save(ICON_DIR / name, optimize=True)
        print(f"wrote public/icons/{name} ({size}x{size})")


if __name__ == "__main__":
    main()
