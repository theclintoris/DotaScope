"""Build a cohesive Steam library art set for DotaScope.

The source render is the Shattered Sanity Ancient Apparition set from the
Trove of Terror. Art is composed at print-friendly sizes so Steam can scale
cleanly to capsules, hero banners and taskbar icons.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ART_DIR = ROOT / "steam-art"
SOURCE = ART_DIR / "source-shattered-sanity.webp"
OUT = ART_DIR
ART = Image.open(SOURCE).convert("RGB")

BG = (7, 10, 16)
INK = (6, 9, 14)
WHITE = (245, 246, 248)
GOLD = (238, 169, 79)
GOLD_LIGHT = (255, 211, 148)
GOLD_DIM = (170, 123, 62)
MUTED = (188, 174, 150)

FONT_PATH = Path(r"C:\Windows\Fonts\bahnschrift.ttf")


def display_font(size: int, variation: str = "Bold Condensed") -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(FONT_PATH), size)
    font.set_variation_by_name(variation)
    return font


def body_font(size: int, variation: str = "Regular") -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(FONT_PATH), size)
    font.set_variation_by_name(variation)
    return font


def cover(image: Image.Image, size: tuple[int, int], focus: tuple[float, float] = (0.5, 0.45)) -> Image.Image:
    w, h = size
    src_w, src_h = image.size
    scale = max(w / src_w, h / src_h)
    nw, nh = math.ceil(src_w * scale), math.ceil(src_h * scale)
    scaled = image.resize((nw, nh), Image.Resampling.LANCZOS)
    left = round((nw - w) * focus[0])
    top = round((nh - h) * focus[1])
    return scaled.crop((left, top, left + w, top + h))


def gradient_layer(size: tuple[int, int], top: tuple[int, int, int, int], bottom: tuple[int, int, int, int]) -> Image.Image:
    w, h = size
    layer = Image.new("RGBA", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        color = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(4))
        layer.putpixel((0, y), color)
    return layer.resize((w, h), Image.Resampling.BILINEAR)


def soft_glow(size: tuple[int, int], color: tuple[int, int, int], alpha: int = 90) -> Image.Image:
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    w, h = size
    draw.ellipse((-w * 0.22, h * 0.12, w * 0.72, h * 1.04), fill=(*color, alpha))
    return glow.filter(ImageFilter.GaussianBlur(max(24, round(w * 0.05))))


def tracked_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: int) -> float:
    return sum(draw.textlength(ch, font=font) for ch in text) + max(0, len(text) - 1) * tracking


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    tracking: int = 0,
) -> float:
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def load_mark(height: int) -> Image.Image:
    mark = Image.open(ROOT / "assets" / "icon-foreground.png").convert("RGBA")
    bbox = mark.getchannel("A").getbbox()
    if bbox:
        mark = mark.crop(bbox)
    width = round(mark.width * height / mark.height)
    return mark.resize((width, height), Image.Resampling.LANCZOS)


def make_logo() -> Image.Image:
    canvas = Image.new("RGBA", (1600, 430), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    mark = load_mark(315)
    canvas.alpha_composite(mark, (55, 48))
    x = 430
    y = 28

    font = display_font(224)
    draw.text((x, y), "DOTA", font=font, fill=(*WHITE, 255))
    dota_w = draw.textlength("DOTA", font=font)
    draw.text((x + dota_w, y), "SCOPE", font=font, fill=(*GOLD, 255))

    rule_y = 298
    draw.rectangle((x + 4, rule_y, 1510, rule_y + 3), fill=(*GOLD_DIM, 210))

    sub_font = body_font(30, "SemiCondensed")
    draw_tracked(draw, (x + 6, 330), "META INTELLIGENCE", sub_font, (*MUTED, 235), 8)

    tag_font = body_font(18, "SemiBold Condensed")
    draw_tracked(draw, (x + 6, 382), "DOTA 2 · OPEN DATA COCKPIT", tag_font, (150, 143, 132, 190), 4)

    return canvas


def apply_vignette(image: Image.Image, strength: int = 170) -> Image.Image:
    w, h = image.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((-w * 0.25, -h * 0.25, w * 1.25, h * 1.25), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(w, h) // 7))
    dark = Image.new("RGBA", (w, h), (4, 6, 11, strength))
    dark.putalpha(ImageOps.invert(mask).point(lambda p: p * strength // 255))
    image = image.convert("RGBA")
    image.alpha_composite(dark)
    return image


def make_portrait() -> Image.Image:
    art = cover(ART, (600, 900), (0.5, 0.36))
    canvas = ImageOps.autocontrast(art, cutoff=1).convert("RGBA")

    canvas.alpha_composite(gradient_layer((600, 340), (4, 7, 12, 0), (4, 7, 12, 252)), (0, 560))

    # A small data tag above the wordmark.
    draw = ImageDraw.Draw(canvas)
    tag = body_font(17, "SemiBold Condensed")
    draw_tracked(draw, (42, 690), "ANCIENT APPARITION · SHATTERED SANITY", tag, (*GOLD_LIGHT, 220), 2)
    draw.rectangle((42, 719, 558, 721), fill=(*GOLD_DIM, 150))

    logo = make_logo()
    lockup = logo.resize((548, 147), Image.Resampling.LANCZOS)
    canvas.alpha_composite(lockup, (34, 736))

    return canvas.convert("RGB")


def make_header() -> Image.Image:
    canvas = Image.new("RGBA", (920, 430), BG)
    art = cover(ART, (920, 430), (0.52, 0.34))
    art = ImageOps.autocontrast(art, cutoff=1)
    canvas.paste(art, (0, 0))
    canvas.alpha_composite(gradient_layer((920, 430), (4, 7, 12, 190), (4, 7, 12, 8)), (0, 0))
    canvas.alpha_composite(gradient_layer((920, 260), (4, 7, 12, 0), (4, 7, 12, 250)), (0, 170))
    canvas.alpha_composite(soft_glow((420, 430), (36, 92, 170), 70), (0, 0))

    draw = ImageDraw.Draw(canvas)
    tag = body_font(16, "SemiBold Condensed")
    draw_tracked(draw, (35, 29), "DOTA 2 · META INTELLIGENCE", tag, (*GOLD_LIGHT, 220), 4)

    logo = make_logo().resize((600, 161), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (28, 238))
    return canvas.convert("RGB")


def make_hero() -> Image.Image:
    canvas = Image.new("RGBA", (1920, 620), BG)
    art = cover(ART, (1920, 620), (0.53, 0.38))
    art = ImageOps.autocontrast(art, cutoff=1)
    canvas.paste(art, (0, 0))
    canvas.alpha_composite(gradient_layer((1920, 620), (4, 7, 12, 52), (4, 7, 12, 178)), (0, 0))

    # Left-side reading gradient for Steam's logo overlay; keep the character clear.
    left = Image.new("RGBA", (1000, 620), (0, 0, 0, 0))
    px = left.load()
    for x in range(1000):
        alpha = round(155 * max(0.0, 1 - x / 1000) ** 1.4)
        for y in range(620):
            px[x, y] = (4, 7, 12, alpha)
    canvas.alpha_composite(left, (0, 0))
    canvas.alpha_composite(soft_glow((900, 620), (43, 104, 180), 42), (0, 0))
    return canvas.convert("RGB")


def make_icon() -> Image.Image:
    # Close-up of the Shattered Sanity mask and crown.
    crop = ART.crop((455, 5, 1015, 565))
    icon = crop.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon = apply_vignette(icon, 175)

    overlay = gradient_layer((1024, 1024), (4, 8, 15, 80), (4, 8, 15, 155))
    icon.alpha_composite(overlay)

    # Rounded dark rim with an etched amber keyline.
    mask = Image.new("L", (1024, 1024), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((10, 10, 1013, 1013), radius=185, fill=255)
    framed = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    framed.paste(icon, (0, 0), mask)
    draw = ImageDraw.Draw(framed)
    draw.rounded_rectangle((10, 10, 1013, 1013), radius=185, outline=(238, 169, 79, 205), width=7)
    draw.rounded_rectangle((28, 28, 995, 995), radius=166, outline=(255, 215, 160, 60), width=2)
    return framed


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source artwork: {SOURCE}")
    OUT.mkdir(exist_ok=True)
    logo = make_logo()
    portrait = make_portrait()
    header = make_header()
    hero = make_hero()
    icon = make_icon()

    logo.save(OUT / "steam-logo.png")
    portrait.save(OUT / "steam-portrait.png", quality=95, subsampling=0)
    header.save(OUT / "steam-header.png", quality=95, subsampling=0)
    hero.save(OUT / "steam-hero.png", quality=95, subsampling=0)
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(OUT / "steam-icon.png")
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(
        OUT / "DotaScope.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    preview = Image.new("RGB", (1600, 1200), (9, 12, 18))
    preview.paste(cover(portrait, (260, 390)), (40, 40))
    preview.paste(cover(header, (740, 346)), (330, 40))
    preview.paste(cover(hero, (1030, 333)), (330, 420))
    preview.paste(cover(icon, (200, 200)), (40, 470))
    preview.save(OUT / "steam-preview.jpg", quality=94)

    print("wrote steam artwork:")
    for path in sorted(OUT.glob("steam-*")):
        print(f"  {path.name}  {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
