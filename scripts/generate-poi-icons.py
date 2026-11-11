#!/usr/bin/env python3
"""
Draws the business pins for the map: a circle in the family colour with a white
MaterialCommunityIcons glyph inside, as in the maps apps people already know.

    pip install Pillow && python3 scripts/generate-poi-icons.py

The list of images and the family colours come from `src/utils/poiStyle.ts`
(the colours are read from there, so they cannot drift). Writes
`assets/poi/<family>-<icon>.png` at 1x, 2x and 3x, plus `index.ts`, which
`require`s them all — React Native needs literal `require` calls.
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
STYLE = ROOT / "src/utils/poiStyle.ts"
OUT = ROOT / "assets/poi"
VENDOR = ROOT / "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons"
FONT = VENDOR / "Fonts/MaterialCommunityIcons.ttf"
GLYPHS = json.loads((VENDOR / "glyphmaps/MaterialCommunityIcons.json").read_text())

# Size in dp: the whole image, the coloured disc, the white ring, the glyph.
SIZE, DISC, RING, GLYPH = 28, 22, 1.5, 13

source = STYLE.read_text()
colours = dict(re.findall(r"^\s+(\w+): '(#[0-9A-Fa-f]{6})',", source[source.index("POI_FAMILY_COLOURS"):], re.M)[:7])
pairs = set(re.findall(r"\['([a-z0-9-]+)', '(food|shop|health|lodging|service|leisure|other)'\]", source))


# Bus stops on the transport map: smaller than the businesses, as in the Maps,
# in a transit blue of their own. (name, glyph, colour, size, disc, glyph size)
STOPS = [
    ("stop-bus", "bus", "#1A73E8", 18, 14, 9),
    # Stations: a little bigger than a bus stop, each mode in its usual colour —
    # train green (CP), metro red (Metro de Lisboa), light rail teal (MTS), boat
    # deep blue. Drawn from the same STATION_ICONS glyphs the panel uses.
    ("station-train", "train", "#2E7D32", 22, 18, 12),
    ("station-subway", "subway-variant", "#D32F2F", 22, 18, 12),
    ("station-light_rail", "tram", "#00897B", 22, 18, 12),
    ("station-boat", "ferry", "#1565C0", 22, 18, 12),
    # A stop of a bus operator with a timetable only (Carris de Lisboa, Braga):
    # amber, so it is not taken for a live Carris Metropolitana stop (blue).
    ("station-bus", "bus", "#E8A200", 18, 14, 9),
]

# A live bus (author's request, November 2026, chosen from three drawings): a
# drop in the vehicle colour (`theme.vehicle`, light) whose point is turned on
# the map to where the bus is heading (`vehicle-heading`), a plain disc when
# the service sends no bearing (`vehicle-disc`), a white bus on top that never
# turns (`vehicle-live`), and the line number in a pill under it
# (`vehicle-pill`, sized for four digits — Carris lines are 4).
VEHICLE_SIZE, VEHICLE_R, VEHICLE_TIP, VEHICLE_EDGE = 60, 16, 25, 2.2
VEHICLE_GLYPH = 17
PILL_W, PILL_H = 40, 16
VEHICLE_COLOUR = "#2F7D32"


def _drop(d: ImageDraw.ImageDraw, c: float, r: float, tip: float | None, fill: str) -> None:
    import math
    if tip is None:
        d.ellipse((c - r, c - r, c + r, c + r), fill=fill)
        return
    a = math.asin(r / tip)
    start = -math.pi / 2 + (math.pi / 2 - a)
    sweep = 2 * math.pi - 2 * (math.pi / 2 - a)
    pts = [(c, c - tip)]
    for k in range(97):
        ang = start + k * sweep / 96
        pts.append((c + r * math.cos(ang), c + r * math.sin(ang)))
    d.polygon(pts, fill=fill)


def draw_vehicle_base(scale: int, pointed: bool) -> Image.Image:
    size = VEHICLE_SIZE * scale
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c, r, e = size / 2, VEHICLE_R * scale, VEHICLE_EDGE * scale
    _drop(d, c, r, VEHICLE_TIP * scale if pointed else None, "#FFFFFF")
    _drop(d, c, r - e, (VEHICLE_TIP * scale - e * 1.8) if pointed else None, VEHICLE_COLOUR)
    return img


def draw_vehicle_glyph(scale: int) -> Image.Image:
    size = VEHICLE_SIZE * scale
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT), int(VEHICLE_GLYPH * scale))
    ch = chr(GLYPHS["bus"])
    box = d.textbbox((0, 0), ch, font=font)
    c = size / 2
    d.text((c - (box[2] - box[0]) / 2 - box[0], c - (box[3] - box[1]) / 2 - box[1]), ch,
           font=font, fill="#FFFFFF")
    return img


def draw_vehicle_pill(scale: int) -> Image.Image:
    w, h = PILL_W * scale, PILL_H * scale
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h / 2, fill="#FFFFFF")
    e = 1.5 * scale
    d.rounded_rectangle((e, e, w - 1 - e, h - 1 - e), radius=h / 2 - e, fill=VEHICLE_COLOUR)
    return img


def draw(icon: str, family: str, scale: int, colour: str | None = None,
         dims: tuple[int, int, int] | None = None) -> Image.Image:
    SIZE, DISC, GLYPH = dims or (globals()["SIZE"], globals()["DISC"], globals()["GLYPH"])
    size = SIZE * scale
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # A soft shadow under the disc, so it lifts off the map.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    r = DISC / 2 * scale
    c = size / 2
    ImageDraw.Draw(shadow).ellipse((c - r, c - r + scale, c + r, c + r + scale), fill=(0, 0, 0, 90))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(scale * 1.2)))

    d = ImageDraw.Draw(img)
    d.ellipse((c - r, c - r, c + r, c + r), fill="#FFFFFF")
    inner = r - RING * scale
    d.ellipse((c - inner, c - inner, c + inner, c + inner), fill=colour or colours[family])

    font = ImageFont.truetype(str(FONT), int(GLYPH * scale))
    ch = chr(GLYPHS[icon])
    box = d.textbbox((0, 0), ch, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text((c - w / 2 - box[0], c - h / 2 - box[1]), ch, font=font, fill="#FFFFFF")
    return img


# The cone in front of the blue dot showing which way the phone points, as in
# Google Maps. Centred on the image, so it rotates around the dot.
CONE_SIZE, CONE_RADIUS, CONE_HALF_ANGLE = 120, 56, 38
CONE_COLOUR = (26, 115, 232)


def draw_cone(scale: int) -> Image.Image:
    import math
    size = CONE_SIZE * scale
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    c = size / 2
    r_max = CONE_RADIUS * scale
    for y in range(size):
        for x in range(size):
            dx, dy = x + 0.5 - c, c - (y + 0.5)
            r = math.hypot(dx, dy)
            if r > r_max or r < 1:
                continue
            angle = abs(math.degrees(math.atan2(dx, dy)))  # 0 = straight up
            if angle > CONE_HALF_ANGLE:
                continue
            # Strong near the dot, fading out towards the edge and the sides.
            fade = (1 - r / r_max) ** 1.3 * min(1.0, (CONE_HALF_ANGLE - angle) / 8)
            px[x, y] = (*CONE_COLOUR, int(200 * fade))
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    names = []
    for icon, family in sorted(pairs):
        name = f"{family}-{icon}"
        names.append(name)
        for scale in (1, 2, 3):
            suffix = "" if scale == 1 else f"@{scale}x"
            draw(icon, family, scale).save(OUT / f"{name}{suffix}.png", optimize=True)
    for name, icon, colour, size, disc, glyph in STOPS:
        names.append(name)
        for scale in (1, 2, 3):
            suffix = "" if scale == 1 else f"@{scale}x"
            draw(icon, "other", scale, colour, (size, disc, glyph)).save(
                OUT / f"{name}{suffix}.png", optimize=True)

    for name, painter in (
        ("vehicle-heading", lambda sc: draw_vehicle_base(sc, True)),
        ("vehicle-disc", lambda sc: draw_vehicle_base(sc, False)),
        ("vehicle-live", draw_vehicle_glyph),
        ("vehicle-pill", draw_vehicle_pill),
    ):
        names.append(name)
        for scale in (1, 2, 3):
            suffix = "" if scale == 1 else f"@{scale}x"
            painter(scale).save(OUT / f"{name}{suffix}.png", optimize=True)

    names.append("heading-cone")
    for scale in (1, 2, 3):
        suffix = "" if scale == 1 else f"@{scale}x"
        draw_cone(scale).save(OUT / f"heading-cone{suffix}.png", optimize=True)

    lines = [
        "// Generated by scripts/generate-poi-icons.py — do not edit by hand.",
        "export const POI_IMAGE_SOURCES = {",
        *[f"  '{n}': require('./{n}.png')," for n in names],
        "};",
        "",
    ]
    (OUT / "index.ts").write_text("\n".join(lines))
    print(f"{len(names)} icons in {OUT}")


if __name__ == "__main__":
    main()
