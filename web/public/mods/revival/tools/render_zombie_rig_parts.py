# -*- coding: utf-8 -*-
# Extracts layered body-part PNGs for the rigged zombie example DIRECTLY from the
# source sprite sheet (Clint Bellanger zombie, CC-BY 3.0) so the rig matches the
# Revival battle example art direction 1:1 (grim, dark, desaturated pixel art).
# Also emits rig-spec.json (single source of truth for bones/slots/anchors).
#
# Source frame: row 0 (walk cycle), col 5, mirrored horizontally so the zombie
# faces +x (screen right) = battle direction 东南. Limbs are cut per segment with
# an explicit inverse affine sampler (no PIL rotate surprises) so every part
# hangs "down" from its bone pivot. Parts may overlap at joints: z-order hides it.
import os, json, math
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets', 'zombie', 'rig'))
os.makedirs(OUT, exist_ok=True)
DEG = math.pi / 180

SHEET = Image.open(os.path.normpath(os.path.join(HERE, '..', 'assets', 'zombie', 'zombie-original.png'))).convert('RGBA')
COLS, ROWS = 29, 8
FW, FH = SHEET.size[0] / COLS, SHEET.size[1] / ROWS
CELL = SHEET.crop((int(5 * FW), 0, int(6 * FW), int(FH))).transpose(Image.FLIP_LEFT_RIGHT)
SRC = np.array(CELL)  # [y, x, 4]

# ---- joints measured on the flipped cell (see qa/_arm_grid.png / _leg_grid.png) ----
NECK = (131, 57)
HIPX = 127
GROUND = 100
HIPY = 80

def seg_angle(p, q):
    return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))

def cut_limb(pivot, angle_deg, half_w, length, up=1, mask_r=3.5):
    """Sample CELL so the segment (pivot -> angle_deg, y-down) becomes vertical,
    pointing +y, with the pivot at top center. Only pixels within mask_r of the
    segment centerline are kept, so torso/background pixels beside the limb are
    dropped. Returns (image, anchor)."""
    w = int(2 * half_w); h = int(up + length)
    px = w // 2; py = int(up)
    phi = (90.0 - angle_deg) * DEG  # visual clockwise rotation to bring segment to +y
    c, s = math.cos(phi), math.sin(phi)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    for j in range(h):
        dy = j - py
        for i in range(w):
            dx = i - px
            if abs(dx) > mask_r:
                continue
            sx = pivot[0] + dx * c - dy * s
            sy = pivot[1] + dx * s + dy * c
            ix, iy = int(round(sx)), int(round(sy))
            if 0 <= ix < SRC.shape[1] and 0 <= iy < SRC.shape[0]:
                out[j, i] = SRC[iy, ix]
    img = Image.fromarray(out, 'RGBA')
    bbox = img.getbbox()
    if bbox is None: raise RuntimeError('empty limb cut')
    bx0, by0, bx1, by1 = bbox
    bx0 = min(bx0, px); by0 = min(by0, py)
    bx1 = max(bx1, px + 1); by1 = max(by1, py + 1)
    img = img.crop((bx0, by0, bx1, by1))
    anchor = [bx0 - px, by0 - py]
    return img, anchor

parts, anchors = {}, {}

hb = (123, 48, 141, 58)
parts['head_f'] = CELL.crop(hb); anchors['head_f'] = [hb[0] - NECK[0], hb[1] - NECK[1]]

# The source frame is a walk cycle with arms outstretched, so the torso rectangle
# also contains arm pixels. Erase both arm corridors (in CELL coords) from a copy
# of the cell before cropping the torso; the hanging arm parts (z1/z4) cover the
# shoulder notches in every animated pose.
CELL_T = CELL.copy()
d_erase = ImageDraw.Draw(CELL_T)
for (p, q) in [((124, 59), (143, 66)),   # near arm corridor (front)
               ((125, 54), (143, 60))]:  # far arm corridor (back)
    d_erase.line([p, q], fill=(0, 0, 0, 0), width=7)

tb = (117, 50, 136, 81)
parts['torso_f'] = CELL_T.crop(tb); anchors['torso_f'] = [tb[0] - HIPX, tb[1] - 80]

# near arm (front, z4): shoulder (133,61) -> cut (144,62) -> hand tip (158,64)
a, an = cut_limb((127, 62), seg_angle((127, 62), (140, 63)), 5.0, 14)
parts['uarm_L'] = a; anchors['uarm_L'] = an
a, an = cut_limb((134, 62), seg_angle((134, 62), (148, 64)), 5.0, 16)
parts['farm_L'] = a; anchors['farm_L'] = an

# far arm (back, z1): shoulder (135,56) -> cut (145,57) -> hand tip (157,57)
a, an = cut_limb((128, 58), 0.0, 5.0, 13)
parts['uarm_R'] = a; anchors['uarm_R'] = an
a, an = cut_limb((133, 58), 0.0, 5.0, 11)
parts['farm_R'] = a; anchors['farm_R'] = an

# near leg (front, z2.5): hip (134,81) -> knee (134,88) -> shoe tip (144,93)
a, an = cut_limb((130, 80), 90.0, 5.0, 11)
parts['thigh_L'] = a; anchors['thigh_L'] = an
a, an = cut_limb((130, 87), 90.0, 5.0, 13)
parts['shin_L'] = a; anchors['shin_L'] = an

# far leg (back, z1): hip (126,80) -> knee (120,87) -> shoe tip (111,94)
a, an = cut_limb((120, 79), seg_angle((120, 79), (114, 86)), 5.0, 11)
parts['thigh_R'] = a; anchors['thigh_R'] = an
a, an = cut_limb((114, 86), seg_angle((114, 86), (111, 92)), 5.0, 16)
parts['shin_R'] = a; anchors['shin_R'] = an

parts['head_b'] = parts['head_f']; anchors['head_b'] = anchors['head_f']
parts['torso_b'] = parts['torso_f']; anchors['torso_b'] = anchors['torso_f']

for name in sorted(parts):
    parts[name].save(os.path.join(OUT, name + '.png'))

LEG = GROUND - HIPY
THIGH_LEN = 7
SPEC = {
 'bones': [
  {'name': 'root'},
  {'name': 'torso', 'parent': 'root', 'x': 0, 'y': -LEG, 'rotation': 12},
  {'name': 'head', 'parent': 'torso', 'x': 0, 'y': -24, 'rotation': 8},
  {'name': 'uarm_L', 'parent': 'torso', 'x': -7, 'y': -22, 'rotation': -12},
  {'name': 'farm_L', 'parent': 'uarm_L', 'x': 0, 'y': 8, 'rotation': -8},
  {'name': 'uarm_R', 'parent': 'torso', 'x': 7, 'y': -22, 'rotation': 12},
  {'name': 'farm_R', 'parent': 'uarm_R', 'x': 0, 'y': 8, 'rotation': 8},
  {'name': 'thigh_L', 'parent': 'root', 'x': -3, 'y': -LEG, 'rotation': 0},
  {'name': 'shin_L', 'parent': 'thigh_L', 'x': 0, 'y': THIGH_LEN, 'rotation': -3},
  {'name': 'thigh_R', 'parent': 'root', 'x': 3, 'y': -LEG, 'rotation': 0},
  {'name': 'shin_R', 'parent': 'thigh_R', 'x': 0, 'y': THIGH_LEN, 'rotation': 3}
 ],
 'slots': [
  {'name': 'thigh_R', 'bone': 'thigh_R', 'part': 'thigh_R', 'z': 1},
  {'name': 'shin_R', 'bone': 'shin_R', 'part': 'shin_R', 'z': 1},
  {'name': 'uarm_R', 'bone': 'uarm_R', 'part': 'uarm_R', 'z': 1},
  {'name': 'farm_R', 'bone': 'farm_R', 'part': 'farm_R', 'z': 1},
  {'name': 'torso', 'bone': 'torso', 'part': 'torso_f', 'z': 2},
  {'name': 'thigh_L', 'bone': 'thigh_L', 'part': 'thigh_L', 'z': 2.5},
  {'name': 'shin_L', 'bone': 'shin_L', 'part': 'shin_L', 'z': 2.5},
  {'name': 'head', 'bone': 'head', 'part': 'head_f', 'z': 3},
  {'name': 'uarm_L', 'bone': 'uarm_L', 'part': 'uarm_L', 'z': 4},
  {'name': 'farm_L', 'bone': 'farm_L', 'part': 'farm_L', 'z': 4}
 ],
 'anchors': anchors,
 'parts': {k: list(v.size) for k, v in sorted(parts.items())}
}
with open(os.path.join(OUT, 'rig-spec.json'), 'w', encoding='utf-8') as f:
    json.dump(SPEC, f, ensure_ascii=False, indent=1)
print('spec ->', os.path.join(OUT, 'rig-spec.json'))
for k in sorted(parts): print(' ', k, parts[k].size, 'anchor', anchors[k])

# ---------------- QA plate ----------------
def mat_trs(x, y, rot):
    r = rot * DEG; c, s = math.cos(r), math.sin(r)
    return [c, s, -s, c, x, y]
def mat_mul(p, q):
    a, b, c, d, tx, ty = p; A, B, C, D, TX, TY = q
    return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * TX + c * TY + tx, b * TX + d * TY + ty]
def mat_pt(m, x, y):
    a, b, c, d, tx, ty = m
    return (a * x + c * y + tx, b * x + d * y + ty)

def world_mats():
    w = {}
    for b in SPEC['bones']:
        local = mat_trs(b.get('x', 0), b.get('y', 0), b.get('rotation', 0))
        w[b['name']] = mat_mul(w[b['parent']], local) if 'parent' in b else local
    return w

def assemble(back=False):
    Z = 5
    w = world_mats()
    img = Image.new('RGBA', (100 * Z, 100 * Z), (38, 42, 54, 255))
    for s in sorted(SPEC['slots'], key=lambda s: s['z']):
        part = s['part']
        if back and part in ('head_f', 'torso_f'): part = part[:-1] + 'b'
        ax, ay = SPEC['anchors'][part]
        m = w[s['bone']]
        px, py = mat_pt(m, ax, ay)
        tile = parts[part].resize((parts[part].width * Z, parts[part].height * Z), Image.NEAREST)
        ang = math.degrees(math.atan2(m[1], m[0]))
        tile = tile.rotate(-ang, expand=True, resample=Image.NEAREST)
        cx, cy = parts[part].width * Z / 2.0, parts[part].height * Z / 2.0
        dx, dy = -cx, -cy  # rotate about tile center; the pinned point is the top-left corner, placed at world(anchor), matching BattleDoll/authoring slot drawImage(im, a.x, a.y)
        r = ang * DEG
        nax = tile.width / 2.0 + math.cos(r) * dx - math.sin(r) * dy
        nay = tile.height / 2.0 + math.sin(r) * dx + math.cos(r) * dy
        img.alpha_composite(tile, (int(round(px * Z + 50 * Z - nax)), int(round(py * Z + 70 * Z - nay))))
    d = ImageDraw.Draw(img)
    d.line([0, 70 * Z, 100 * Z, 70 * Z], fill=(90, 96, 110), width=Z)
    return img

A1, A2 = assemble(False), assemble(True)
tiles = [(n, parts[n].resize((parts[n].width * 4, parts[n].height * 4), Image.NEAREST))
         for n in ['head_f', 'torso_f', 'uarm_L', 'farm_L', 'thigh_L', 'shin_L', 'uarm_R', 'thigh_R', 'shin_R']]
row_h = max(t.height for _, t in tiles)
pw = 20 + A1.width + 10 + A2.width + 10
ph = 30 + max(A1.height, A2.height) + 10 + row_h + 20
plate = Image.new('RGBA', (pw, ph), (28, 31, 40, 255))
d = ImageDraw.Draw(plate)
d.text((10, 8), 'rig rest pose front / back (parts cut from Bellanger sheet, facing +x = SE)', fill=(220, 224, 235))
plate.alpha_composite(A1, (10, 30)); plate.alpha_composite(A2, (20 + A1.width, 30))
x = 10; y0 = 30 + max(A1.height, A2.height) + 10
for n, t in tiles:
    plate.alpha_composite(t, (x, y0)); d.text((x, y0 - 12), n, fill=(220, 224, 235)); x += t.width + 8
plate.save(os.path.normpath(os.path.join(HERE, '..', 'qa', 'zombie-rig-parts-plate.png')))
print('plate ->', plate.size)

