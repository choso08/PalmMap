#!/usr/bin/env python3
"""
Draws PalmMap's icons into the assets/ folder.

The logo is a palm tree — brown trunk, green leaves — on a small sandy island
sitting in the sea, on a white background. It was a map pin with the palm inside
until November 2026; it looked like Google Maps', and the author asked for
another. `pin_layer` stays in the file, unused, in case anyone wants it back.

Run from the project root:

    pip install Pillow
    python3 scripts/generate-icons.py

Everything is drawn at 4x and scaled down at the end, the simple way to get
smooth edges without depending on anything else.
"""

from PIL import Image, ImageDraw

SCALE = 4
SIZE = 1024

# White background, with an almost invisible gradient so it does not look like
# a hole in the phone screen.
BG_TOP = (255, 255, 255)
BG_BOTTOM = (241, 244, 238)
PIN = (46, 125, 50, 255)
LEAF = (67, 160, 71, 255)
TRUNK = (141, 90, 43, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def gradient_background(size: int) -> Image.Image:
    """White background, with a very soft top-to-bottom gradient."""
    image = Image.new("RGB", (1, size))
    pixels = image.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        pixels[0, y] = tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)
        )
    return image.resize((size, size))


def rounded_mask(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Rounded-square mask, in the style of Android icons."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def frond(length: int, droop: float, color) -> Image.Image:
    """
    A palm leaf, curving down at the tip.

    Drawn on a square canvas with its base at the centre, pointing right. That
    way it can rotate around the centre without the base moving.
    """
    # With room to spare: the leaf reaches the edge and, rotated, the tip got cut.
    canvas = int(length * 2.6)
    image = Image.new("RGBA", (canvas, canvas), TRANSPARENT)
    draw = ImageDraw.Draw(image)

    ox = oy = canvas / 2
    steps = 48
    top, bottom = [], []

    for i in range(steps + 1):
        t = i / steps
        # The leaf's spine: goes right and droops.
        x = t * length
        y = droop * length * t * t
        # Width: narrow at the base, fuller in the middle, pointed at the tip.
        w = length * 0.27 * (t**0.40) * (1 - t) ** 0.50
        # The spine's slope, so the width stays perpendicular to it.
        slope = 2 * droop * length * t / max(length, 1)
        norm = (1 + slope * slope) ** 0.5
        nx, ny = -slope / norm, 1 / norm
        top.append((ox + x - nx * w, oy + y - ny * w))
        bottom.append((ox + x + nx * w, oy + y + ny * w))

    draw.polygon(top + bottom[::-1], fill=color)
    return image


def draw_palm(
    base: Image.Image, cx: int, cy: int, size: int, color, trunk_color=None, detail=None
) -> None:
    """
    Draws a palm tree centred on the given point.

    `detail` (for the big logo) is a dict with `leaf_dark`, `trunk_dark` and
    `coconut`: back leaves in a darker green, rings on the trunk and coconuts
    under the crown. They add volume without adding new shapes.
    """
    draw = ImageDraw.Draw(base)

    # Trunk: rises from the bottom, curving slightly right and thinning as it
    # goes up.
    trunk_bottom = cy + size * 0.66
    trunk_top = cy - size * 0.12
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        y = trunk_bottom + (trunk_top - trunk_bottom) * t
        x = cx + size * 0.13 * (t**2)
        r = size * 0.085 * (1 - 0.4 * t)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=trunk_color or color)

    # Trunk rings: small darker arcs, every so often.
    if detail:
        ring = max(1, int(size * 0.014))
        for i in range(5, steps - 6, 5):
            t = i / (steps - 1)
            y = trunk_bottom + (trunk_top - trunk_bottom) * t
            x = cx + size * 0.13 * (t**2)
            rr = size * 0.085 * (1 - 0.4 * t)
            draw.arc([x - rr, y - rr * 0.55, x + rr, y + rr * 0.55], 20, 160, fill=detail["trunk_dark"], width=ring)

    crown_x = cx + size * 0.13
    crown_y = trunk_top
    length = int(size * 0.60)

    # Five leaves fanned over the trunk. The outer ones droop more.
    # With detail, the two back leaves go first and darker.
    leaves = [(12, 0.34), (58, 0.30), (100, 0.24), (140, 0.30), (172, 0.34)]
    if detail:
        leaves = [(78, 0.28, True), (122, 0.28, True)] + [(a, d, False) for a, d in leaves]
    else:
        leaves = [(a, d, False) for a, d in leaves]
    for angle, droop, back in leaves:
        tone = detail["leaf_dark"] if back else color
        leaf_image = frond(length, droop, tone).rotate(angle, resample=Image.BICUBIC)
        base.alpha_composite(
            leaf_image,
            (int(crown_x - leaf_image.width / 2), int(crown_y - leaf_image.height / 2)),
        )

    # Closes the point where the leaves meet.
    r = size * 0.10
    draw.ellipse([crown_x - r, crown_y - r, crown_x + r, crown_y + r], fill=color)

    # Three coconuts under the crown.
    if detail:
        cr = size * 0.055
        for dx, dy in ((-0.06, 0.11), (0.05, 0.12), (0.0, 0.17)):
            x, y = crown_x + size * dx, crown_y + size * dy
            draw.ellipse([x - cr, y - cr, x + cr, y + cr], fill=detail["coconut"])


def pin_layer(size: int, color=PIN, leaf=LEAF, trunk=TRUNK) -> Image.Image:
    """The map pin, with the palm in the hole."""
    image = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(image)

    cx = size / 2
    head_y = size * 0.42
    radius = size * 0.27
    tip_y = size * 0.90

    # Round head plus a point at the bottom, the classic drop shape.
    draw.ellipse([cx - radius, head_y - radius, cx + radius, head_y + radius], fill=color)
    draw.polygon(
        [
            (cx - radius * 0.706, head_y + radius * 0.706),
            (cx + radius * 0.706, head_y + radius * 0.706),
            (cx, tip_y),
        ],
        fill=color,
    )

    # The pin's hole, white: the palm is drawn over it. White and not
    # transparent, so the palm reads on the dark splash screen too.
    hole = radius * 0.66
    draw.ellipse(
        [cx - hole, head_y - hole, cx + hole, head_y + hole],
        fill=TRANSPARENT if color[:3] == (0, 0, 0) else WHITE,
    )

    # The palm is drawn on a separate layer and only then clipped by the hole,
    # so it never spills outside the pin.
    palm = Image.new("RGBA", (size, size), TRANSPARENT)
    draw_palm(palm, int(cx - hole * 0.07), int(head_y), int(hole * 1.02), leaf, trunk)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([cx - hole, head_y - hole, cx + hole, head_y + hole], fill=255)
    # Only what is inside the hole, drawn over the white.
    from PIL import ImageChops

    palm.putalpha(ImageChops.multiply(palm.getchannel("A"), mask))
    image.alpha_composite(palm)

    return image


SAND = (226, 186, 120, 255)
SAND_SHADE = (204, 164, 100, 255)
LEAF_DARK = (46, 125, 50, 255)
TRUNK_DARK = (105, 64, 28, 255)
COCONUT = (110, 72, 36, 255)
SEA_LIGHT = (92, 178, 184, 255)
WET_SAND = (176, 136, 82, 255)
SEA = (22, 132, 142, 255)
FOAM = (178, 228, 230, 255)


def island_layer(size: int, leaf=LEAF, trunk=TRUNK, sand=SAND, sea=SEA, wet=None) -> Image.Image:
    """
    The logo: a palm tree on a small sandy island, sitting in the sea.

    **Not a map pin, on purpose.** A pin with something inside read as the
    Google Maps logo (the author noticed); the island comes from the name —
    "Palm" — and from the map's "Island" palette, and is mistaken for nothing.
    """
    image = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(image)
    cx = size / 2
    wet = wet or WET_SAND

    # The island: half an ellipse of sand.
    mound_w, mound_h = size * 0.56, size * 0.20
    mound_y = size * 0.79

    # The sea the island sits in: a lens of water, wider than the island, only
    # the bottom half. It replaces the loose rows of waves underneath, which
    # seemed to hang in the void.
    water_w, water_h = mound_w * 1.34, mound_h * 0.95
    draw.pieslice(
        [cx - water_w / 2, mound_y - water_h / 2, cx + water_w / 2, mound_y + water_h / 2],
        0,
        180,
        fill=sea,
    )
    # First the wet sand, darker, where the island meets the water; then the dry
    # sand on top, a little narrower and taller, leaving a wet band around the
    # base. A small detail, and on purpose.
    draw.pieslice(
        [cx - mound_w / 2, mound_y - mound_h / 2, cx + mound_w / 2, mound_y + mound_h / 2],
        180,
        360,
        fill=wet,
    )
    lift = mound_h * 0.16
    dry_w = mound_w * 0.90
    draw.pieslice(
        [cx - dry_w / 2, mound_y - mound_h / 2, cx + dry_w / 2, mound_y + mound_h / 2 - 2 * lift],
        180,
        360,
        fill=sand,
    )
    # The wet band always keeps the same thickness at the bottom.
    draw.rectangle([cx - dry_w / 2, mound_y - lift, cx + dry_w / 2, mound_y], fill=wet)

    # The waves lapping the sand: light foam in scallops along the base, and a
    # few drops leaping at the ends. Not in the one-colour version — foam is
    # made of contrast, and in black it blended with the sand.
    if sea[:3] != (0, 0, 0):
        # The surf: scallops of foam along the waterline, from end to end of the
        # sea, licking the wet sand.
        foam_stroke = max(2, int(size * 0.016))
        n = 9
        span = water_w * 0.94
        w = span / n
        left0 = cx - span / 2
        for i in range(n):
            left = left0 + i * w
            draw.arc(
                [left, mound_y - w * 0.18, left + w, mound_y + w * 0.42],
                200,
                340,
                fill=FOAM,
                width=foam_stroke,
            )
        # A lighter swell in the water, as if the next wave were on its way.
        inner = water_w * 0.62
        draw.arc(
            [cx - inner / 2, mound_y + water_h * 0.08, cx + inner / 2, mound_y + water_h * 0.40],
            200,
            340,
            fill=SEA_LIGHT,
            width=max(2, int(size * 0.014)),
        )
        # Drops of foam leaping at both ends of the island.
        r = size * 0.009
        for dx, dy in ((-0.52, -0.05), (-0.47, -0.11), (0.50, -0.07), (0.45, -0.12)):
            x = cx + mound_w * dx
            y = mound_y + mound_h * dy * 2
            draw.ellipse([x - r, y - r, x + r, y + r], fill=FOAM)

    # The palm, with its trunk resting on the sand.
    p = size * 0.45
    # The trunk ends inside the sand, above the waterline.
    mono = leaf[:3] == (0, 0, 0)
    base_x = cx - p * 0.10
    # The palm's shadow on the sand, to ground it.
    if not mono:
        sw, sh = p * 0.42, mound_h * 0.16
        sy = mound_y - mound_h * 0.40
        draw.ellipse([base_x - sw * 0.25, sy - sh, base_x + sw, sy + sh], fill=SAND_SHADE)
    draw_palm(
        image,
        int(base_x),
        int(mound_y - mound_h * 0.55 - 0.66 * p),
        int(p),
        leaf,
        trunk,
        None if mono else {"leaf_dark": LEAF_DARK, "trunk_dark": TRUNK_DARK, "coconut": COCONUT},
    )
    return image


def save(image: Image.Image, path: str, size: int) -> None:
    image.resize((size, size), Image.LANCZOS).save(path)
    print(f"escrito {path}")


def main() -> None:
    big = SIZE * SCALE

    # Main icon: white rounded background with the logo on top.
    background = gradient_background(big).convert("RGBA")
    background.putalpha(rounded_mask(big))

    pin = island_layer(big)
    # In the full icon the logo is a little smaller, to breathe.
    inset = int(big * 0.16)
    pin_small = pin.resize((big - 2 * inset, big - 2 * inset), Image.LANCZOS)

    icon = background.copy()
    icon.alpha_composite(pin_small, (inset, inset))
    save(icon, "assets/icon.png", SIZE)
    save(icon, "assets/favicon.png", 48)

    # Android adaptive icon: background and foreground in separate files.
    # Android crops the edges, so the foreground sits well inside.
    plain = gradient_background(big).convert("RGBA")
    save(plain, "assets/android-icon-background.png", SIZE)

    foreground = Image.new("RGBA", (big, big), TRANSPARENT)
    fg_inset = int(big * 0.20)
    foreground.alpha_composite(
        pin.resize((big - 2 * fg_inset, big - 2 * fg_inset), Image.LANCZOS),
        (fg_inset, fg_inset),
    )
    save(foreground, "assets/android-icon-foreground.png", SIZE)

    # Monochrome version: Android paints it in the phone's theme colour.
    mono = Image.new("RGBA", (big, big), TRANSPARENT)
    mono.alpha_composite(
        island_layer(big, *([(0, 0, 0, 255)] * 5)).resize(
            (big - 2 * fg_inset, big - 2 * fg_inset), Image.LANCZOS
        ),
        (fg_inset, fg_inset),
    )
    save(mono, "assets/android-icon-monochrome.png", SIZE)

    # Splash screen image: just the logo, no background.
    splash = Image.new("RGBA", (big, big), TRANSPARENT)
    splash.alpha_composite(pin_small, (inset, inset))
    save(splash, "assets/splash-icon.png", SIZE)


if __name__ == "__main__":
    main()
