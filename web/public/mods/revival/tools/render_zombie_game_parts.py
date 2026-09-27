# -*- coding: utf-8 -*-
"""Bake zombie-tinted parts from the game's own Bellanger doll atlases.

The game's battle sprites are weight maps: R=base,G=hi,B=main per pixel.
out = base*R + hi*G + main*B (same math as runtime tintCanvas).
"""
import json, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PUB = ROOT

DOLL = json.load(open(os.path.join(PUB, 'data', 'battle_doll.json'), encoding='utf-8'))
MANIFEST = json.load(open(os.path.join(PUB, 'assets', 'manifest.json'), encoding='utf-8'))

def atlas(part, type_):
    name = f'{part}{type_}.png'
    url = MANIFEST['images'][name][0]
    return Image.open(os.path.join(PUB, url)).convert('RGBA')

def crop(part, type_, dir_, frame=1):
    b = DOLL['spriteBoundaries'][part][str(type_)][str(dir_)][str(frame)]
    cell = DOLL['spriteDimensions'][part][str(type_)]
    im = atlas(part, type_)
    sx = (dir_ + (4 if frame > 80 else 0)) * cell['width'] + b['x']
    sy = ((frame - 81) if frame > 80 else (frame - 1)) * cell['height'] + b['y']
    return im.crop((sx, sy, sx + b['width'], sy + b['height'])), b

def tint(img, base, hi, main):
    """base/hi/main: (r,g,b). Same as runtime tintCanvas with bc=1."""
    px = img.load()
    out = Image.new('RGBA', img.size)
    po = out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                po[x, y] = (0, 0, 0, 0)
                continue
            R, G, B = r / 255, g / 255, b / 255
            nr = min(255, round(base[0] * R + hi[0] * G + main[0] * B))
            ng = min(255, round(base[1] * R + hi[1] * G + main[1] * B))
            nb = min(255, round(base[2] * R + hi[2] * G + main[2] * B))
            po[x, y] = (nr, ng, nb, a)
    return out

# zombie palette
SKIN = (158, 170, 148)
SKIN_HI = (188, 198, 176)
HAIR = (72, 68, 60)
RAGS = (96, 86, 74)     # shirt channel
RAGS_D = (64, 58, 52)   # jacket channel
PANTS = (76, 70, 64)
SHOES = (52, 48, 46)

def layer_colors(part, type_):
    """Mirror of runtime layerColors() for our fixed zombie appearance."""
    if part == 'Head':
        return SKIN, HAIR, (0, 0, 0)
    if part == 'Body':
        # bt 1-4, portraitShirt 0 -> hi = skin
        return SKIN, SKIN_HI, RAGS_D
    if part in ('LeftTopArm', 'RightTopArm'):
        return SKIN, SKIN_HI, RAGS_D
    if part in ('LeftForearm', 'RightForearm'):
        return SKIN, SKIN_HI, (0, 0, 0)
    if part == 'Legs':
        return SKIN, SHOES, PANTS
    return (255, 0, 0), (0, 255, 0), (0, 0, 255)

def cell_image(part, type_, dir_, scale=8, bg=(200, 200, 210)):
    img, b = crop(part, type_, dir_)
    base, hi, main = layer_colors(part, type_)
    t = tint(img, base, hi, main)
    canvas = Image.new('RGBA', (24 * scale // 2, 40 * scale // 2), bg + (255,))
    big = t.resize((t.width * scale, t.height * scale), Image.NEAREST)
    canvas.alpha_composite(big, (canvas.width // 2 - big.width // 2, canvas.height - big.height - 4))
    return canvas

if __name__ == '__main__':
    import sys
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    outdir = os.path.join(ROOT, 'mods', 'revival', 'qa')
    if which in ('all', 'body'):
        types = [1, 2, 3, 4, 5, 6, 7, 8]
        cells = [cell_image('Body', t, 1) for t in types]
        cells += [cell_image('Legs', t, 1) for t in (1, 2)]
        sheet = Image.new('RGBA', (sum(c.width for c in cells) + 10 * len(cells), cells[0].height + 20), (24, 26, 34, 255))
        x = 5
        for c in cells:
            sheet.alpha_composite(c, (x, 10)); x += c.width + 10
        sheet.save(os.path.join(outdir, '_gameparts_body.png'))
        print('body sheet saved', sheet.size)
    if which in ('all', 'limbs'):
        cells = []
        for part in ('LeftTopArm', 'LeftForearm', 'RightTopArm', 'RightForearm'):
            for t in sorted(DOLL['spriteBoundaries'][part].keys(), key=int):
                cells.append(cell_image(part, t, 1))
        for t in range(1, 12):
            cells.append(cell_image('Head', t, 1))
        cols = 7
        rows = (len(cells) + cols - 1) // cols
        w = cells[0].width
        sheet = Image.new('RGBA', (cols * (w + 8) + 8, rows * (cells[0].height + 8) + 8), (24, 26, 34, 255))
        for i, c in enumerate(cells):
            sheet.alpha_composite(c, (8 + (i % cols) * (w + 8), 8 + (i // cols) * (c.height + 8)))
        sheet.save(os.path.join(outdir, '_gameparts_limbs.png'))
        print('limbs sheet saved', sheet.size)
