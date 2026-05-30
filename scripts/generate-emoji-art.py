#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageEnhance, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DESKTOP_DIR = Path("/Users/lucentsnow/Projects/GitHub/Others/CC98-Desktop")
DESKTOP_DIR = Path(os.environ.get("CC98_DESKTOP_DIR", DEFAULT_DESKTOP_DIR))
EMOJI_DIR = DESKTOP_DIR / "Assets" / "Emoji"
DEFAULT_LOGO_URL = "https://www.cc98.org/static/images/98LOGO.ico"
FALLBACK_LOGO_PATH = DESKTOP_DIR / "Assets" / "cc98.ico"
OUTPUT_PATH = REPO_ROOT / "src" / "tui" / "emoji-art.ts"

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"
TRANSPARENT = "."
ALPHA_THRESHOLD = 24
EMOJI_MAX_WIDTH = 16
EMOJI_MAX_HEIGHT = 16
LOGO_MAX_WIDTH = 48
LOGO_MAX_HEIGHT = 34
MAX_COLORS = 48


@dataclass(frozen=True)
class SourceImage:
    code: str
    path: Path
    group: str


@dataclass(frozen=True)
class RenderProfile:
    mode: str = "photo"
    max_width: int = EMOJI_MAX_WIDTH
    max_height: int = EMOJI_MAX_HEIGHT
    max_colors: int = MAX_COLORS
    alpha_threshold: int = ALPHA_THRESHOLD
    contrast: float = 1.0
    color: float = 1.0
    sharpness: float = 1.0


GROUP_PROFILES: dict[str, RenderProfile] = {
    "ac-white": RenderProfile(mode="line", max_width=32, max_height=28, max_colors=8, alpha_threshold=8),
    "CC98": RenderProfile(max_width=28, max_height=28, max_colors=56, alpha_threshold=8, contrast=1.35, color=1.15, sharpness=1.7),
    "em": RenderProfile(max_width=22, max_height=22, max_colors=52, alpha_threshold=12, contrast=1.22, color=1.12, sharpness=1.35),
    "ms": RenderProfile(max_width=22, max_height=22, max_colors=52, alpha_threshold=12, contrast=1.35, color=1.15, sharpness=1.7),
    "tb": RenderProfile(max_width=16, max_height=16, max_colors=48, alpha_threshold=24, contrast=1.05, color=1.05, sharpness=1.05),
}

# Add code-specific overrides here while tuning batches of about 20 emoji.
CODE_PROFILES: dict[str, RenderProfile] = {}


def main() -> None:
    if not EMOJI_DIR.exists():
        raise SystemExit(f"missing emoji directory: {EMOJI_DIR}")
    logo_path = resolve_logo_path()

    sources = list(iter_sources())
    arts = {source.code: convert_image(source.path, source_profile(source), source.code) for source in sources}
    logo = convert_image(
        logo_path,
        RenderProfile(mode="logo", max_width=LOGO_MAX_WIDTH, max_height=LOGO_MAX_HEIGHT, max_colors=4, alpha_threshold=8),
        "cc98-logo"
    )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(render_ts(arts, logo), encoding="utf-8")
    print(f"generated {len(arts)} emoji arts and 1 logo art -> {OUTPUT_PATH}")


def iter_sources() -> Iterable[SourceImage]:
    for path in sorted(EMOJI_DIR.rglob("*")):
        if path.suffix.lower() not in {".png", ".gif"}:
            continue
        group = path.parent.name
        stem = path.stem
        code = normalize_code(group, stem)
        yield SourceImage(code=code, path=path, group=group)


def resolve_logo_path() -> Path:
    configured = os.environ.get("CC98_LOGO_PATH")
    if configured:
        path = Path(configured)
        if not path.exists():
            raise SystemExit(f"missing logo file: {path}")
        return path

    temp_dir = Path(tempfile.gettempdir()) / "cc98-cli"
    temp_dir.mkdir(parents=True, exist_ok=True)
    downloaded = temp_dir / "98LOGO.ico"
    try:
        with urllib.request.urlopen(DEFAULT_LOGO_URL, timeout=10) as response:
            downloaded.write_bytes(response.read())
        return downloaded
    except Exception as error:
        if FALLBACK_LOGO_PATH.exists():
            print(f"warning: failed to download {DEFAULT_LOGO_URL}: {error}; using {FALLBACK_LOGO_PATH}")
            return FALLBACK_LOGO_PATH
        raise SystemExit(
            f"missing logo file: download {DEFAULT_LOGO_URL} or pass CC98_LOGO_PATH"
        ) from error


def normalize_code(group: str, stem: str) -> str:
    value = stem.lower()
    if group == "CC98":
        return value.lower()
    return value


def source_profile(source: SourceImage) -> RenderProfile:
    return CODE_PROFILES.get(source.code, GROUP_PROFILES.get(source.group, RenderProfile()))


def convert_image(path: Path, profile: RenderProfile, label: str) -> dict[str, object]:
    image = Image.open(path)
    try:
        image.seek(0)
    except EOFError:
        pass

    rgba = image.convert("RGBA")
    rgba = crop_transparent(rgba, profile.alpha_threshold)
    if profile.mode == "line":
        rgba = render_line_art(rgba, profile)
    elif profile.mode == "logo":
        rgba = render_logo_art(rgba, profile)
    else:
        rgba.thumbnail((profile.max_width, profile.max_height), Image.Resampling.LANCZOS)
        rgba = enhance_image(rgba, profile)

    palette, rows = indexed_rows(rgba, profile)
    return {
        "label": label,
        "width": rgba.width,
        "height": rgba.height,
        "palette": palette,
        "rows": rows,
    }


def crop_transparent(image: Image.Image, alpha_threshold: int) -> Image.Image:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    bbox = mask.getbbox()
    if bbox is None:
        return image
    return image.crop(bbox)


def enhance_image(image: Image.Image, profile: RenderProfile) -> Image.Image:
    if profile.contrast != 1.0:
        image = ImageEnhance.Contrast(image).enhance(profile.contrast)
    if profile.color != 1.0:
        image = ImageEnhance.Color(image).enhance(profile.color)
    if profile.sharpness != 1.0:
        image = ImageEnhance.Sharpness(image).enhance(profile.sharpness)
    if profile.sharpness > 1.0:
        image = image.filter(ImageFilter.UnsharpMask(radius=0.7, percent=80, threshold=2))
    return image


def render_logo_art(image: Image.Image, profile: RenderProfile) -> Image.Image:
    width, height = fit_size(image.width, image.height, profile.max_width, profile.max_height)
    alpha = image.getchannel("A")
    alpha.thumbnail((width, height), Image.Resampling.LANCZOS)

    mask = Image.new("L", (width, height), 0)
    mask.paste(alpha, ((width - alpha.width) // 2, (height - alpha.height) // 2))

    output = Image.new("RGBA", (width, height), (255, 255, 255, 0))

    outline_alpha = mask.filter(ImageFilter.MaxFilter(3))
    outline = Image.new("RGBA", (width, height), (0, 130, 202, 0))
    outline.putalpha(outline_alpha)
    output.alpha_composite(outline)

    face = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    face.putalpha(mask)
    output.alpha_composite(face)
    return output


def render_line_art(image: Image.Image, profile: RenderProfile) -> Image.Image:
    width, height = fit_size(image.width, image.height, profile.max_width, profile.max_height)
    source = image.convert("RGBA")
    output = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    source_pixels = source.load()
    output_pixels = output.load()

    for y in range(height):
        y0 = int(y * source.height / height)
        y1 = max(y0 + 1, int((y + 1) * source.height / height))
        for x in range(width):
            x0 = int(x * source.width / width)
            x1 = max(x0 + 1, int((x + 1) * source.width / width))
            luminance_values: list[float] = []
            alpha_values: list[int] = []
            area = (x1 - x0) * (y1 - y0)
            for yy in range(y0, y1):
                for xx in range(x0, x1):
                    r, g, b, alpha = source_pixels[xx, yy]
                    if alpha > profile.alpha_threshold:
                        luminance_values.append(pixel_luminance(r, g, b))
                        alpha_values.append(alpha)
            if not luminance_values:
                continue

            average_value = sum(luminance_values) / len(luminance_values)
            coverage = len(luminance_values) / area
            sorted_values = sorted(luminance_values)
            dark_value = sorted_values[max(0, int(len(sorted_values) * 0.20) - 1)]
            value = min(average_value, dark_value + 38)
            if value < 58:
                gray = 35
            elif value < 105:
                gray = 85
            elif value < 155:
                gray = 135
            elif value < 210:
                gray = 190
            else:
                gray = 236

            if gray <= 85:
                alpha = 235 if coverage > 0.11 else 190
            elif gray <= 135:
                alpha = 210 if coverage > 0.18 else 150
            else:
                alpha = int(max(alpha_values) * min(0.82, coverage * 1.65))
            if alpha > 36:
                output_pixels[x, y] = (gray, gray, gray, alpha)

    return bridge_line_gaps(output)


def bridge_line_gaps(image: Image.Image) -> Image.Image:
    output = image.copy()
    source_pixels = image.load()
    output_pixels = output.load()
    for y in range(1, image.height - 1):
        for x in range(1, image.width - 1):
            if source_pixels[x, y][3] > 0:
                continue
            left = source_pixels[x - 1, y]
            right = source_pixels[x + 1, y]
            up = source_pixels[x, y - 1]
            down = source_pixels[x, y + 1]
            horizontal = left[3] > 0 and right[3] > 0 and left[0] < 105 and right[0] < 105
            vertical = up[3] > 0 and down[3] > 0 and up[0] < 105 and down[0] < 105
            if horizontal or vertical:
                output_pixels[x, y] = (95, 95, 95, 135)
    return output


def fit_size(width: int, height: int, max_width: int, max_height: int) -> tuple[int, int]:
    scale = min(max_width / width, max_height / height)
    return max(1, round(width * scale)), max(1, round(height * scale))


def pixel_luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def indexed_rows(image: Image.Image, profile: RenderProfile) -> tuple[list[str], list[str]]:
    if profile.mode == "line":
        return indexed_line_rows(image, profile)

    access = image.load()
    pixels = [
        access[x, y]
        for y in range(image.height)
        for x in range(image.width)
    ]
    opaque = [
        (r, g, b, a)
        for r, g, b, a in pixels
        if a > profile.alpha_threshold
    ]
    if not opaque:
        return [], [TRANSPARENT * image.width for _ in range(image.height)]

    quantized = image.convert("RGBA").quantize(
        colors=min(profile.max_colors, max(1, len({(r, g, b) for r, g, b, _a in opaque}))),
        method=Image.Quantize.FASTOCTREE,
    )
    palette_values = quantized.getpalette() or []
    palette: list[str] = []
    palette_index: dict[int, int] = {}

    rows: list[str] = []
    for y in range(image.height):
        chars: list[str] = []
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            if a <= profile.alpha_threshold:
                chars.append(TRANSPARENT)
                continue
            raw_index = int(quantized.getpixel((x, y)))
            if raw_index not in palette_index:
                offset = raw_index * 3
                color = tuple(palette_values[offset:offset + 3])
                if len(color) != 3:
                    color = (r, g, b)
                palette_index[raw_index] = len(palette)
                palette.append(f"{color[0]:02x}{color[1]:02x}{color[2]:02x}")
            chars.append(ALPHABET[palette_index[raw_index]])
        rows.append("".join(chars))
    return palette, rows


def indexed_line_rows(image: Image.Image, profile: RenderProfile) -> tuple[list[str], list[str]]:
    fixed_palette = [(35, 35, 35), (85, 85, 85), (135, 135, 135), (190, 190, 190), (236, 236, 236)]
    palette: list[str] = []
    palette_index: dict[tuple[int, int, int], int] = {}
    rows: list[str] = []

    for y in range(image.height):
        chars: list[str] = []
        for x in range(image.width):
            r, g, b, alpha = image.getpixel((x, y))
            if alpha <= profile.alpha_threshold:
                chars.append(TRANSPARENT)
                continue
            value = pixel_luminance(r, g, b)
            if value < 68:
                color = fixed_palette[0]
            elif value < 118:
                color = fixed_palette[1]
            elif value < 170:
                color = fixed_palette[2]
            elif value < 218:
                color = fixed_palette[3]
            else:
                color = fixed_palette[4]

            if color not in palette_index:
                palette_index[color] = len(palette)
                palette.append(f"{color[0]:02x}{color[1]:02x}{color[2]:02x}")
            chars.append(ALPHABET[palette_index[color]])
        rows.append("".join(chars))

    return palette, rows


def render_ts(arts: dict[str, dict[str, object]], logo: dict[str, object]) -> str:
    header = [
        "// Generated by scripts/generate-emoji-art.py. Do not edit by hand.",
        "",
        "export interface PixelArt {",
        "  readonly label: string;",
        "  readonly width: number;",
        "  readonly height: number;",
        "  readonly palette: readonly string[];",
        "  readonly rows: readonly string[];",
        "}",
        "",
        f"export const EMOJI_ART_COUNT = {len(arts)};",
        "",
        f"export const CC98_LOGO_ART: PixelArt = {json.dumps(logo, ensure_ascii=False, separators=(',', ':'))};",
        "",
        "export const EMOJI_ART: Record<string, PixelArt> = {",
    ]
    body = [
        f"  {json.dumps(code)}: {json.dumps(art, ensure_ascii=False, separators=(',', ':'))},"
        for code, art in sorted(arts.items())
    ]
    footer = [
        "};",
        "",
    ]
    return "\n".join(header + body + footer)


if __name__ == "__main__":
    main()
