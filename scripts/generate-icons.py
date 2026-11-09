#!/usr/bin/env python3
"""
Gera os ícones do PalmMap para a pasta assets/.

O logo é uma palmeira — tronco castanho, folhas verdes — numa ilhota de areia
com duas ondas por baixo, sobre fundo branco. Foi um pin de mapa com a palmeira
lá dentro até novembro de 2026; parecia o do Google Maps, e o autor pediu outro.
O `pin_layer` fica no ficheiro, sem uso, caso se queira voltar a ele.

Correr a partir da raiz do projeto:

    pip install Pillow
    python3 scripts/generate-icons.py

Desenha-se tudo a 4x e reduz-se no fim, que é a forma simples de obter
contornos suaves sem depender de nada mais.
"""

from PIL import Image, ImageDraw

SCALE = 4
SIZE = 1024

# Fundo branco, com um degradê quase invisível para não parecer um buraco no
# ecrã do telemóvel.
BG_TOP = (255, 255, 255)
BG_BOTTOM = (241, 244, 238)
PIN = (46, 125, 50, 255)
LEAF = (67, 160, 71, 255)
TRUNK = (141, 90, 43, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)


def gradient_background(size: int) -> Image.Image:
    """Fundo branco, com um degradê muito suave de cima para baixo."""
    image = Image.new("RGB", (1, size))
    pixels = image.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        pixels[0, y] = tuple(
            round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)
        )
    return image.resize((size, size))


def rounded_mask(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Máscara de quadrado com cantos redondos, ao estilo dos ícones Android."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    return mask


def frond(length: int, droop: float, color) -> Image.Image:
    """
    Uma folha de palmeira, curvada para baixo na ponta.

    Desenha-se numa tela quadrada com a base no centro, apontada para a direita.
    Assim pode rodar-se à volta do centro sem a base sair do sítio.
    """
    # Com folga: a folha ocupa até à borda e, rodada, a ponta ficava cortada.
    canvas = int(length * 2.6)
    image = Image.new("RGBA", (canvas, canvas), TRANSPARENT)
    draw = ImageDraw.Draw(image)

    ox = oy = canvas / 2
    steps = 48
    top, bottom = [], []

    for i in range(steps + 1):
        t = i / steps
        # Espinha da folha: segue para a direita e vai caindo.
        x = t * length
        y = droop * length * t * t
        # Largura: estreita na base, mais cheia a meio, afilada na ponta.
        w = length * 0.27 * (t**0.40) * (1 - t) ** 0.50
        # Inclinação da espinha, para a largura ficar perpendicular a ela.
        slope = 2 * droop * length * t / max(length, 1)
        norm = (1 + slope * slope) ** 0.5
        nx, ny = -slope / norm, 1 / norm
        top.append((ox + x - nx * w, oy + y - ny * w))
        bottom.append((ox + x + nx * w, oy + y + ny * w))

    draw.polygon(top + bottom[::-1], fill=color)
    return image


def draw_palm(base: Image.Image, cx: int, cy: int, size: int, color, trunk_color=None) -> None:
    """Desenha uma palmeira centrada no ponto dado."""
    draw = ImageDraw.Draw(base)

    # Tronco: sobe a partir de baixo, curvando ligeiramente para a direita e
    # afinando à medida que sobe.
    trunk_bottom = cy + size * 0.66
    trunk_top = cy - size * 0.12
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        y = trunk_bottom + (trunk_top - trunk_bottom) * t
        x = cx + size * 0.13 * (t**2)
        r = size * 0.085 * (1 - 0.4 * t)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=trunk_color or color)

    crown_x = cx + size * 0.13
    crown_y = trunk_top
    length = int(size * 0.60)

    # Cinco folhas em leque por cima do tronco. As das pontas caem mais.
    for angle, droop in ((12, 0.34), (58, 0.30), (100, 0.24), (140, 0.30), (172, 0.34)):
        leaf_image = frond(length, droop, color).rotate(angle, resample=Image.BICUBIC)
        base.alpha_composite(
            leaf_image,
            (int(crown_x - leaf_image.width / 2), int(crown_y - leaf_image.height / 2)),
        )

    # Fecha o ponto onde as folhas se encontram.
    r = size * 0.10
    draw.ellipse([crown_x - r, crown_y - r, crown_x + r, crown_y + r], fill=color)


def pin_layer(size: int, color=PIN, leaf=LEAF, trunk=TRUNK) -> Image.Image:
    """O pin de mapa, com a palmeira no buraco."""
    image = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(image)

    cx = size / 2
    head_y = size * 0.42
    radius = size * 0.27
    tip_y = size * 0.90

    # Cabeça redonda mais bico em baixo, o formato clássico de gota.
    draw.ellipse([cx - radius, head_y - radius, cx + radius, head_y + radius], fill=color)
    draw.polygon(
        [
            (cx - radius * 0.706, head_y + radius * 0.706),
            (cx + radius * 0.706, head_y + radius * 0.706),
            (cx, tip_y),
        ],
        fill=color,
    )

    # O buraco do pin, branco: a palmeira desenha-se por cima dele. Branco e não
    # transparente, para a palmeira se ler também no ecrã de arranque escuro.
    hole = radius * 0.66
    draw.ellipse(
        [cx - hole, head_y - hole, cx + hole, head_y + hole],
        fill=TRANSPARENT if color[:3] == (0, 0, 0) else WHITE,
    )

    # A palmeira desenha-se numa camada à parte e só depois se recorta pelo
    # buraco, para nunca transbordar para fora do pin.
    palm = Image.new("RGBA", (size, size), TRANSPARENT)
    draw_palm(palm, int(cx - hole * 0.07), int(head_y), int(hole * 1.02), leaf, trunk)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([cx - hole, head_y - hole, cx + hole, head_y + hole], fill=255)
    # Só o que fica dentro do buraco, desenhado por cima do branco.
    from PIL import ImageChops

    palm.putalpha(ImageChops.multiply(palm.getchannel("A"), mask))
    image.alpha_composite(palm)

    return image


SAND = (226, 186, 120, 255)
SEA = (22, 132, 142, 255)


def island_layer(size: int, leaf=LEAF, trunk=TRUNK, sand=SAND, sea=SEA) -> Image.Image:
    """
    O logo: uma palmeira numa ilhota de areia, com duas ondas por baixo.

    **Não é um pin de mapa, de propósito.** O pin com uma coisa lá dentro
    lia-se como o logo do Google Maps (o autor reparou); a ilha é do nome —
    "Palm" — e da paleta "Ilha" do mapa, e não se confunde com nada.
    """
    image = Image.new("RGBA", (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(image)
    cx = size / 2

    # As ondas: dois arcos de cada vez, lado a lado, por baixo da ilha.
    stroke = max(2, int(size * 0.035))
    for row, (y, half) in enumerate(((0.82, 0.30), (0.905, 0.20))):
        yy = size * y
        n = 3 if row == 0 else 2
        width = size * half * 2 / n
        x0 = cx - size * half
        for i in range(n):
            left = x0 + i * width
            draw.arc(
                [left, yy - width * 0.35, left + width, yy + width * 0.35],
                200,
                340,
                fill=sea,
                width=stroke,
            )

    # A ilhota: meia elipse de areia.
    mound_w, mound_h = size * 0.56, size * 0.20
    mound_y = size * 0.76
    draw.pieslice(
        [cx - mound_w / 2, mound_y - mound_h / 2, cx + mound_w / 2, mound_y + mound_h / 2],
        180,
        360,
        fill=sand,
    )

    # A palmeira, com o tronco a assentar na areia.
    p = size * 0.45
    # O tronco acaba dentro da areia, acima da linha da água.
    draw_palm(image, int(cx - p * 0.10), int(mound_y - mound_h * 0.55 - 0.66 * p), int(p), leaf, trunk)
    return image


def save(image: Image.Image, path: str, size: int) -> None:
    image.resize((size, size), Image.LANCZOS).save(path)
    print(f"escrito {path}")


def main() -> None:
    big = SIZE * SCALE

    # Ícone principal: fundo branco com cantos redondos e o pin por cima.
    background = gradient_background(big).convert("RGBA")
    background.putalpha(rounded_mask(big))

    pin = island_layer(big)
    # No ícone completo o pin fica um pouco mais pequeno, para respirar.
    inset = int(big * 0.16)
    pin_small = pin.resize((big - 2 * inset, big - 2 * inset), Image.LANCZOS)

    icon = background.copy()
    icon.alpha_composite(pin_small, (inset, inset))
    save(icon, "assets/icon.png", SIZE)
    save(icon, "assets/favicon.png", 48)

    # Ícone adaptativo do Android: fundo e frente em ficheiros separados.
    # O Android corta as bordas, por isso a frente fica bem mais recolhida.
    plain = gradient_background(big).convert("RGBA")
    save(plain, "assets/android-icon-background.png", SIZE)

    foreground = Image.new("RGBA", (big, big), TRANSPARENT)
    fg_inset = int(big * 0.20)
    foreground.alpha_composite(
        pin.resize((big - 2 * fg_inset, big - 2 * fg_inset), Image.LANCZOS),
        (fg_inset, fg_inset),
    )
    save(foreground, "assets/android-icon-foreground.png", SIZE)

    # Versão monocromática: o Android pinta-a com a cor do tema do telemóvel.
    mono = Image.new("RGBA", (big, big), TRANSPARENT)
    mono.alpha_composite(
        island_layer(big, *([(0, 0, 0, 255)] * 4)).resize(
            (big - 2 * fg_inset, big - 2 * fg_inset), Image.LANCZOS
        ),
        (fg_inset, fg_inset),
    )
    save(mono, "assets/android-icon-monochrome.png", SIZE)

    # Imagem do ecrã de arranque: só o pin, sem fundo.
    splash = Image.new("RGBA", (big, big), TRANSPARENT)
    splash.alpha_composite(pin_small, (inset, inset))
    save(splash, "assets/splash-icon.png", SIZE)


if __name__ == "__main__":
    main()
