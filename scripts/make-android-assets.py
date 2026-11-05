"""Build source art for @capacitor/assets from the DotaScope brand geometry."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
BG = (8, 11, 16)
AMBER = (238, 169, 79)
SS = 4  # supersample for clean edges


def logo(size: int, ratio: float = 0.72) -> Image.Image:
    """Render the hexagonal scope mark on a transparent canvas."""
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    mark = s * ratio
    offset = (s - mark) / 2
    unit = mark / 64

    def p(x: float, y: float) -> tuple[float, float]:
        return (offset + x * unit, offset + y * unit)

    def poly(points: list[tuple[float, float]], fill=None, outline=None, width=1):
        draw.polygon(
            [p(x, y) for x, y in points],
            fill=fill,
            outline=outline,
            width=max(1, round(width * unit)),
        )

    outer = [(32, 5), (55.4, 18.5), (55.4, 45.5), (32, 59), (8.6, 45.5), (8.6, 18.5)]
    inner = [(32, 11.7), (49.6, 22), (49.6, 42), (32, 52.3), (14.4, 42), (14.4, 22)]
    draw.line([p(x, y) for x, y in outer + [outer[0]]], fill=(*AMBER, 92), width=max(1, round(0.75 * unit)))
    poly(inner, fill=(*AMBER, 20), outline=(*AMBER, 143), width=0.75)

    left = [(32, 16.5), (43.7, 45.5), (32, 37.8), (20.3, 45.5)]
    right = [(32, 16.5), (43.7, 45.5), (32, 37.8)]
    glint = [(32, 16.5), (36.1, 31.5), (32, 28.5)]
    poly(left, fill=(198, 133, 59, 255), outline=(255, 217, 158, 166), width=0.5)
    poly(right, fill=(*AMBER, 255))
    poly(glint, fill=(255, 208, 138, 255))

    return layer.resize((size, size), Image.Resampling.LANCZOS)


def dark_plate(size: int) -> Image.Image:
    """Midnight field with a restrained amber bloom."""
    plate = Image.new("RGBA", (size, size), (*BG, 255))
    glow = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(glow)
    center = size / 2
    for radius in range(int(size * 0.72), 0, -max(2, size // 120)):
        value = int(30 * (1 - radius / (size * 0.72)) ** 1.8)
        gd.ellipse((center - radius, center - radius, center + radius, center + radius), fill=value)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.035))
    amber = Image.new("RGBA", (size, size), (*AMBER, 0))
    amber.putalpha(glow)
    plate.alpha_composite(amber)
    return plate


OUT.mkdir(exist_ok=True)

# Legacy launcher icon: full-bleed background plate plus mark.
icon_only = dark_plate(1024)
icon_only.alpha_composite(logo(1024, 0.76))
icon_only.save(OUT / "icon-only.png")

# Adaptive icon foreground: transparent mark kept inside the safe zone.
logo(1024, 0.70).save(OUT / "icon-foreground.png")
dark_plate(1024).save(OUT / "icon-background.png")

# Splash: the mark floating in a dark field, with no square carrier behind it.
splash = dark_plate(2732)
mark = logo(950, 0.82)
splash.alpha_composite(mark, ((2732 - mark.width) // 2, (2732 - mark.height) // 2))
splash.save(OUT / "splash.png")

print("wrote assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png")
