# -*- coding: utf-8 -*-
"""Game-art zombie rig pipeline v2.

Parts are cut from the CARAVANEER 2 doll atlases (Clint Bellanger art, the game's
own battle sprites) and baked with a zombie palette through the same weight-map
tint math the runtime uses (tintCanvas: out = base*R + hi*G + main*B).

The doll's own idle frame is an unarmed guard stance (fists up). Joints are
auto-found as near-contact centroids between adjacent part masks; every limb
segment is re-sampled (inverse affine corridor cut, proven in v1) so each hangs
straight down from its joint pivot; the rest pose is arms-down, rotations 0.

Side-view directions hide the far leg behind the near one (8-22 px sliver). The
far leg is synthesized from the paired opposite-facing direction's visible leg
(horizontal flip keeps shoe direction and shading correct for the target
facing), painted into the cell ground-aligned at the sliver's x.

Emits per-direction part PNGs + rig-spec.json (bones / slots / anchors in bone
space = pivot space, attachment drawn at bone origin + anchor).
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # mods/revival
PUB = os.path.dirname(os.path.dirname(ROOT))      # web/public
OUT = os.path.normpath(os.path.join(ROOT, 'assets', 'zombie', 'gamerig'))
os.makedirs(OUT, exist_ok=True)
DEG = math.pi / 180

DOLL = json.load(open(os.path.join(PUB, 'data', 'battle_doll.json'), encoding='utf-8'))
MANIFEST = json.load(open(os.path.join(PUB, 'assets', 'manifest.json'), encoding='utf-8'))

def atlas(part, type_):
    url = MANIFEST['images']['%s%d.png' % (part, type_)][0]
    return Image.open(os.path.join(PUB, url)).convert('RGBA')

def bounds(part, type_, d, frame=1):
    return DOLL['spriteBoundaries'][part][str(type_)][str(d)][str(frame)]

# ---------------- zombie palette + per-part tint mapping ----------------
SKIN     = (170, 180, 158)
SKIN_HI  = (206, 214, 192)
SKIN_DK  = (138, 150, 130)
RAGS     = (76, 104, 132)
RAGS_D   = (86, 66, 50)
PANTS    = (96, 82, 64)
SHOES    = (56, 46, 40)
HAIR     = (76, 58, 42)
HEAGEAR  = (60, 64, 56)

PART_TYPES = {'Body': 6, 'Legs': 1, 'LeftTopArm': 1, 'LeftForearm': 1,
              'RightTopArm': 1, 'RightForearm': 1, 'Head': 5, 'Shadows': 1}
PART_TINT = {
    'Body':         (SKIN, RAGS, RAGS_D),       # bt6: R=skin G=shirt B=jacket
    'Legs':         (SKIN, SHOES, PANTS),       # R=skin G=shoes B=pants
    'LeftTopArm':   (SKIN, SKIN_HI, RAGS),      # R=skin G=skin-hi B=sleeve
    'RightTopArm':  (SKIN, SKIN_HI, RAGS),
    'LeftForearm':  (SKIN, SKIN_HI, SKIN_DK),   # B channel -> shaded skin
    'RightForearm': (SKIN, SKIN_HI, SKIN_DK),
    'Head':         (SKIN, HAIR, HEAGEAR),      # R=skin G=hair B=headgear
    'Shadows':      ((120, 120, 120),) * 3,
}

def tint_array(img, base, hi, main):
    a = np.asarray(img).astype(np.float32)
    R, G, B = a[..., 0] / 255, a[..., 1] / 255, a[..., 2] / 255
    out = a.copy()
    for k in range(3):
        out[..., k] = np.minimum(255, np.round(base[k] * R + hi[k] * G + main[k] * B))
    out[..., 3] = a[..., 3]
    return out.astype(np.uint8)

BLOOD = (116, 30, 26)
def blotch(cell, cx, cy, r, alpha=150):
    yy, xx = np.mgrid[0:cell.shape[0], 0:cell.shape[1]]
    mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    a = cell[..., 3].astype(np.int32)
    inside = mask & (a > 0)
    for k in range(3):
        cell[..., k] = np.where(inside, (cell[..., k].astype(np.int32) * (255 - alpha) + BLOOD[k] * alpha) // 255, cell[..., k]).astype(np.uint8)

def add_blood(cell, d):
    hb = bounds('Head', PART_TYPES['Head'], d)
    tb = bounds('Body', PART_TYPES['Body'], d)
    blotch(cell, hb['x'] + 1, hb['y'] + hb['height'] * 0.5, 2, 170)          # temple
    blotch(cell, tb['x'] + tb['width'] // 2, tb['y'] + tb['height'] * 0.45, 3, 150)  # chest
    blotch(cell, tb['x'] + 1, tb['y'] + 3, 2, 120)                            # shoulder

def tinted_cell(d):
    """Recompose the chosen parts onto a 100x100 canvas, tinted, + blood."""
    cell = np.zeros((100, 100, 4), dtype=np.uint8)
    for part, t in PART_TYPES.items():
        b = bounds(part, t, d)
        im = atlas(part, t)
        sx = d * 100 + b['x']
        sy = b['y']  # frame 1
        crop = im.crop((sx, sy, sx + b['width'], sy + b['height']))
        ta = tint_array(crop, *PART_TINT[part])
        cell[b['y']:b['y']+b['height'], b['x']:b['x']+b['width']] = ta
    add_blood(cell, d)
    return cell

# ---------------- mask helpers + joint estimation ----------------
def part_mask(cell, part, d):
    b = bounds(part, PART_TYPES[part], d)
    m = np.zeros(cell.shape[:2], dtype=bool)
    m[b['y']:b['y']+b['height'], b['x']:b['x']+b['width']] = cell[b['y']:b['y']+b['height'], b['x']:b['x']+b['width'], 3] > 40
    return m

def dilate(m, r):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx or dy:
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out

def near_zone(m_self, m_other, r=2):
    return dilate(m_other, r) & m_self

def centroid(zone):
    ys, xs = np.nonzero(zone)
    if len(xs) == 0:
        raise RuntimeError('empty near-zone')
    return (float(xs.mean()), float(ys.mean()))

def joint(child_mask, parent_mask, r=2):
    """Joint point on child (pivot)."""
    for rr in range(r, 8):
        zc = near_zone(child_mask, parent_mask, rr)
        if zc.any():
            return centroid(zc)
    raise RuntimeError('no contact between parts')

def bbox_of(mask):
    ys, xs = np.nonzero(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

# ---------------- limb straightening (inverse affine corridor cut) ----------------
def corridor_axis(mask, x0, x1, y0, y1):
    region = mask[y0:y1, x0:x1]
    ys, xs = np.nonzero(region)
    if len(xs) < 3:
        return 90.0
    w = region[ys, xs].astype(np.float32)
    cx = (xs * w).sum() / w.sum()
    cy = (ys * w).sum() / w.sum()
    covxx = (((xs - cx) ** 2) * w).sum() / w.sum()
    covyy = (((ys - cy) ** 2) * w).sum() / w.sum()
    covxy = (((xs - cx) * (ys - cy)) * w).sum() / w.sum()
    return math.degrees(math.atan2(2 * covxy, covxx - covyy) / 2) % 180

def ang_diff(a, b):
    return abs((a - b + 180) % 360 - 180)

def axis_toward(mask, pivot, theta):
    ys, xs = np.nonzero(mask)
    alpha = math.degrees(math.atan2(ys.mean() - pivot[1], xs.mean() - pivot[0]))
    return theta if ang_diff(theta, alpha) <= ang_diff(theta + 180, alpha) else theta + 180

def straighten(src, pivot, angle_deg, half_w, length, up=2, mask_r=3.0):
    """Sample so the segment pivot->angle becomes vertical +y, pivot at top center."""
    w = int(2 * half_w); h = int(up + length)
    px = w // 2; py = int(up)
    phi = (90.0 - angle_deg) * DEG
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
            if 0 <= ix < src.shape[1] and 0 <= iy < src.shape[0]:
                out[j, i] = src[iy, ix]
    img = Image.fromarray(out, 'RGBA')
    bb = img.getbbox()
    if bb is None:
        raise RuntimeError('empty limb')
    bx0, by0, bx1, by1 = bb
    bx0 = min(bx0, px); by0 = min(by0, py)
    img = img.crop((bx0, by0, bx1, by1))
    anchor = (bx0 - px, by0 - py)   # top-left in bone space (pivot at origin)
    return img, anchor

def straighten_pt(pivot, angle_deg, p, half_w, up=2):
    px = int(2 * half_w) // 2; py = int(up)
    phi = (90.0 - angle_deg) * DEG
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = p[0] - pivot[0], p[1] - pivot[1]
    return (px + dx * c - dy * s, py + dx * s + dy * c)

def plain_part(src, crop_box, pivot):
    x0, y0, x1, y1 = crop_box
    img = Image.fromarray(src[y0:y1, x0:x1].copy(), 'RGBA')
    return img, (x0 - pivot[0], y0 - pivot[1])

# ---------------- pass 1: native cells, masks, leg split ----------------
def split_legs(mask, d):
    """Split the Legs mask into (left, right) halves at the deepest density valley."""
    b = bounds('Legs', PART_TYPES['Legs'], d)
    sub = mask[b['y']:b['y']+b['height'], b['x']:b['x']+b['width']]
    dens = sub.sum(axis=0)
    nz = np.nonzero(dens)[0]
    lo, hi = int(nz[0]), int(nz[-1])
    seg = dens[lo:hi + 1]
    inner = seg[2:-2] if hi - lo >= 8 else None
    if inner is not None and inner.size and int(inner.min()) <= 0.35 * int(seg.max()):
        split = lo + 2 + int(np.argmin(inner))
    else:
        split = (lo + hi) // 2
    if not dens[:split].any() or not dens[split:].any():
        split = (lo + hi) // 2
    mL = np.zeros_like(mask); mR = np.zeros_like(mask)
    mL[b['y']:b['y']+b['height'], b['x']:b['x']+split+1] = mask[b['y']:b['y']+b['height'], b['x']:b['x']+split+1]
    mR[b['y']:b['y']+b['height'], b['x']+split:b['x']+b['width']] = mask[b['y']:b['y']+b['height'], b['x']+split:b['x']+b['width']]
    return mL, mR, b['x'] + split

native, ms_nat, leg_big, leg_sliver = {}, {}, {}, {}
for d in range(4):
    cell = tinted_cell(d)
    native[d] = cell
    ms = {p: part_mask(cell, p, d) for p in PART_TYPES if p != 'Shadows'}
    mL, mR, split_x = split_legs(ms['Legs'], d)
    big, sliver = (mL, mR) if mL.sum() >= mR.sum() else (mR, mL)
    ms_nat[d] = ms
    leg_big[d], leg_sliver[d] = big, sliver

def ground_of(ms):
    allm = np.zeros(next(iter(ms.values())).shape, dtype=bool)
    for m in ms.values():
        allm |= m
    ys = np.nonzero(allm.any(axis=1))[0]
    return float(ys.max())

grounds = {d: ground_of(ms_nat[d]) for d in range(4)}

# far leg donor: paired opposite-facing direction (flip keeps shoe + shading right)
DONOR_PAIR = {1: 2, 2: 1, 3: 0}
SLIVER_MIN = 60   # px; below this the half is a hidden-leg sliver -> synthesize

cells, masks, joints_d, far_side_d = {}, {}, {}, {}
for d in range(4):
    cell = native[d].copy()
    ms = dict(ms_nat[d])
    body = ms['Body']
    bys, bxs = np.nonzero(body)
    bcx = bxs.mean()
    J = {}
    J['head'] = joint(ms['Head'], body)
    J['shL'] = joint(ms['LeftTopArm'], body)
    J['shR'] = joint(ms['RightTopArm'], body)
    J['elbL'] = joint(ms['LeftForearm'], ms['LeftTopArm'])
    J['elbR'] = joint(ms['RightForearm'], ms['RightTopArm'])
    gy = grounds[d]

    sliver = leg_sliver[d]
    if sliver.sum() >= SLIVER_MIN:
        # both legs natively visible (back-right view): keep the split halves
        mL, mR, _ = split_legs(ms['Legs'], d)
        ms['Legs_near'], ms['Legs_far'] = mL, mR
        near_hip = joint(mL if mL.sum() >= mR.sum() else mR, body)
        J['hipNear'] = joint(leg_big[d], body)
        J['hipFar'] = joint(sliver, body)
        sys_far = 'L' if sliver.sum() == mL.sum() else 'R'
    else:
        # near leg = whole visible mass; far leg = flipped donor from paired dir
        big = leg_big[d]
        sys_far = 'L' if centroid(sliver)[0] < bcx else 'R'
        cell[sliver] = 0
        ms['Legs_near'] = big
        src_d = DONOR_PAIR[d]
        src_mask = leg_big[src_d]
        sx0, sy0, sx1, sy1 = bbox_of(src_mask)
        px = native[src_d][sy0:sy1, sx0:sx1].copy()
        pm = src_mask[sy0:sy1, sx0:sx1]
        px = px * np.dstack([pm] * 4)
        px = np.ascontiguousarray(px[:, ::-1])          # horizontal flip
        pm = np.ascontiguousarray(pm[:, ::-1])
        h, w = pm.shape
        far_x = centroid(sliver)[0] if sliver.any() else (bxs.min() + 2 if sys_far == 'L' else bxs.max() - 2)
        x0 = int(round(far_x - w / 2.0))
        x0 = max(0, min(100 - w, x0))
        y0 = int(round(gy)) - h
        region = cell[y0:y0 + h, x0:x0 + w]
        paint = px[..., 3] > 0
        region[paint] = px[paint]
        far_mask = np.zeros(cell.shape[:2], dtype=bool)
        far_mask[y0:y0 + h, x0:x0 + w] = px[..., 3] > 40
        ms['Legs_far'] = far_mask
        J['hipNear'] = joint(big, body)
        J['hipFar'] = (x0 + w / 2.0, float(y0))
    cells[d], masks[d] = cell, ms
    far_side_d[d] = sys_far
    J['hip'] = ((J['hipNear'][0] + J['hipFar'][0]) / 2, (J['hipNear'][1] + J['hipFar'][1]) / 2)
    J['ground'] = gy
    joints_d[d] = J
    print('dir%d ground=%.0f far=%s hipNear=%s hipFar=%s neck=%s shL=%s shR=%s elbL=%s elbR=%s'
          % (d, gy, sys_far, tuple(round(v, 1) for v in J['hipNear']), tuple(round(v, 1) for v in J['hipFar']),
             tuple(round(v, 1) for v in J['head']), tuple(round(v, 1) for v in J['shL']),
             tuple(round(v, 1) for v in J['shR']), tuple(round(v, 1) for v in J['elbL']),
             tuple(round(v, 1) for v in J['elbR'])))

REF = 1
root_r = (joints_d[REF]['hip'][0], joints_d[REF]['ground'])

def U(p, d=REF):
    return (p[0] - root_r[0], p[1] - root_r[1])

JR = {'root': (0.0, 0.0), 'torso': U(joints_d[REF]['hip']), 'head': U(joints_d[REF]['head']),
      'uarm_L': U(joints_d[REF]['shL']), 'uarm_R': U(joints_d[REF]['shR']),
      'farm_L': U(joints_d[REF]['elbL']), 'farm_R': U(joints_d[REF]['elbR']),
      'thigh_near': U(joints_d[REF]['hipNear']), 'thigh_far': U(joints_d[REF]['hipFar'])}

BONE_OF = {'head': 'head', 'torso': 'torso', 'uarm_L': 'uarm_L', 'uarm_R': 'uarm_R',
           'farm_L': 'farm_L', 'farm_R': 'farm_R', 'thigh_near': 'thigh_near', 'thigh_far': 'thigh_far'}
PART_OF = {'head': 'Head', 'torso': 'Body', 'uarm_L': 'LeftTopArm', 'uarm_R': 'RightTopArm',
           'farm_L': 'LeftForearm', 'farm_R': 'RightForearm'}

parts, anchors = {}, {}
def save_part(name, d, img, anc, pivot_cell):
    key = '%s_%d' % (name, d)
    img.save(os.path.join(OUT, key + '.png'))
    parts[key] = list(img.size)
    b = BONE_OF[name]
    anchors[key] = [round(anc[0] + pivot_cell[0] - root_r[0] - JR[b][0], 2),
                    round(anc[1] + pivot_cell[1] - root_r[1] - JR[b][1], 2)]

farm_off = {}
for d in range(4):
    cell = cells[d]
    ms = masks[d]
    J = joints_d[d]
    for name in ('head', 'torso'):
        m = ms[PART_OF[name]]
        bb = bbox_of(m)
        piv = J['head'] if name == 'head' else J['hip']
        img, anc = plain_part(cell, bb, piv)
        save_part(name, d, img, anc, piv)
    for side, s in (('L', 'Left'), ('R', 'Right')):
        for seg, part in (('uarm', s + 'TopArm'), ('farm', s + 'Forearm')):
            m = ms[part]
            piv = J['sh' + side] if seg == 'uarm' else J['elb' + side]
            bb = bbox_of(m)
            pad = 1
            theta = corridor_axis(m, max(0, bb[0]-pad), min(100, bb[2]+pad), max(0, bb[1]-pad), min(100, bb[3]+pad))
            theta = axis_toward(m, piv, theta)
            img, anc = straighten(cell, piv, theta, half_w=4.5, length=24, up=2, mask_r=3.4)
            save_part(seg + '_' + side, d, img, anc, piv)
            if seg == 'uarm':
                ex, ey = straighten_pt(piv, theta, J['elb' + side], half_w=4.5, up=2)
                farm_off[(d, side)] = (round(ex - int(2*4.5)//2, 2), round(ey - 2, 2))
    for which in ('near', 'far'):
        m = ms['Legs_' + which]
        piv = J['hipNear'] if which == 'near' else J['hipFar']
        bb = bbox_of(m)
        gy = J['ground']
        region = (max(0, bb[0]), min(100, bb[2]), int(piv[1]) + 2, int(gy) - 8)
        theta = corridor_axis(m, *region)
        theta = axis_toward(m, piv, theta)
        length = gy - piv[1] + 2
        img, anc = straighten(cell, piv, theta, half_w=6.0, length=length, up=2, mask_r=5.4)
        save_part('thigh_' + which, d, img, anc, piv)

# ---------------- spec ----------------
def loc(parent_joint, child_joint):
    return [round(child_joint[0] - parent_joint[0], 2), round(child_joint[1] - parent_joint[1], 2)]

BONES = [
    {'name': 'root'},
    {'name': 'torso', 'parent': 'root', 'x': loc(JR['root'], JR['torso'])[0], 'y': loc(JR['root'], JR['torso'])[1]},
    {'name': 'head', 'parent': 'torso', 'x': loc(JR['torso'], JR['head'])[0], 'y': loc(JR['torso'], JR['head'])[1]},
    {'name': 'uarm_L', 'parent': 'torso', 'x': loc(JR['torso'], JR['uarm_L'])[0], 'y': loc(JR['torso'], JR['uarm_L'])[1]},
    {'name': 'farm_L', 'parent': 'uarm_L', 'x': farm_off[(REF, 'L')][0], 'y': farm_off[(REF, 'L')][1]},
    {'name': 'uarm_R', 'parent': 'torso', 'x': loc(JR['torso'], JR['uarm_R'])[0], 'y': loc(JR['torso'], JR['uarm_R'])[1]},
    {'name': 'farm_R', 'parent': 'uarm_R', 'x': farm_off[(REF, 'R')][0], 'y': farm_off[(REF, 'R')][1]},
    {'name': 'thigh_near', 'parent': 'root', 'x': JR['thigh_near'][0], 'y': JR['thigh_near'][1]},
    {'name': 'thigh_far', 'parent': 'root', 'x': JR['thigh_far'][0], 'y': JR['thigh_far'][1]},
]
NEAR_ARM = {0: 'R', 1: 'L', 2: 'L', 3: 'L'}
def z_arm(side, d):
    return 4 if side == NEAR_ARM[d] else 1
SLOT_NAMES = ['thigh_far', 'uarm_R', 'farm_R', 'thigh_near', 'torso', 'head', 'uarm_L', 'farm_L']
SLOTS = []
for n in SLOT_NAMES:
    z = 1.4 if n == 'thigh_far' else 1.6 if n == 'thigh_near' else 2 if n == 'torso' else 3 if n == 'head' else z_arm(n[-1], REF)
    SLOTS.append({'name': n, 'bone': BONE_OF[n], 'part': '%s_1' % n, 'z': z})
SPEC = {
    'bones': BONES,
    'slots': SLOTS,
    'anchors': anchors,
    'parts': parts,
    'meta': {'refDir': REF, 'root': root_r, 'nearArm': NEAR_ARM,
             'farLeg': {str(d): far_side_d[d] for d in range(4)},
             'joints': {str(d): {k: ([round(v[0], 2), round(v[1], 2)] if isinstance(v, tuple) else v)
                                  for k, v in joints_d[d].items()} for d in range(4)}},
}
with open(os.path.join(OUT, 'rig-spec.json'), 'w', encoding='utf-8') as f:
    json.dump(SPEC, f, ensure_ascii=False, indent=1)
print('spec ->', os.path.join(OUT, 'rig-spec.json'), '| parts:', len(parts))

# ---------------- debug plate: original vs assembled rest pose ----------------
Z = 5
tiles = []
jm = {'torso': 'hip', 'head': 'head', 'uarm_L': 'shL', 'uarm_R': 'shR', 'farm_L': 'elbL', 'farm_R': 'elbR',
      'thigh_near': 'hipNear', 'thigh_far': 'hipFar'}
for d in range(4):
    orig = Image.fromarray(native[d], 'RGBA').resize((100 * Z, 100 * Z), Image.NEAREST)
    asm = Image.new('RGBA', (100 * Z, 100 * Z), (38, 42, 54, 255))
    dr = ImageDraw.Draw(asm)
    gy = int(round((joints_d[d]['ground'] - root_r[1]) * Z))
    dr.line([(0, gy), (100 * Z, gy)], fill=(90, 96, 110), width=1)
    order = sorted(SLOTS, key=lambda s: (1.4 if s['name'] == 'thigh_far' else 1.6 if s['name'] == 'thigh_near'
                                          else 2 if s['name'] == 'torso' else 3 if s['name'] == 'head' else z_arm(s['name'][-1], d)))
    for s in order:
        key = '%s_%d' % (s['name'], d)
        im = Image.open(os.path.join(OUT, key + '.png'))
        ax, ay = anchors[key]
        piv = JR[s['bone']]
        ox = (piv[0] + root_r[0] + ax) * Z
        oy = (piv[1] + root_r[1] + ay) * Z
        asm.alpha_composite(im.resize((im.width * Z, im.height * Z), Image.NEAREST), (int(round(ox)), int(round(oy))))
    for b in BONES:
        j = JR[b['name']]
        x = (j[0] + root_r[0]) * Z; y = (j[1] + root_r[1]) * Z
        dr.ellipse([x-2, y-2, x+2, y+2], outline=(255, 70, 70))
    for b, jk in jm.items():
        p = joints_d[d][jk]
        dr.ellipse([p[0]*Z-2, p[1]*Z-2, p[0]*Z+2, p[1]*Z+2], outline=(80, 140, 255))
    tiles.append((orig, asm))
pad = 30
tile_w = 2 * (100 * Z) + pad
plate = Image.new('RGBA', (2 * tile_w + 60, 2 * (100 * Z + 46) + 40), (28, 31, 40, 255))
dtext = ImageDraw.Draw(plate)
for i, (orig, asm) in enumerate(tiles):
    cx = 20 + (i % 2) * (tile_w + 20)
    cy = 30 + (i // 2) * (100 * Z + 46)
    dtext.text((cx, cy - 20), 'dir%d original%s' % (i, ' (ref)' if i == REF else ''), fill=(220, 224, 235))
    dtext.text((cx + 100 * Z + pad, cy - 20), 'assembled', fill=(220, 224, 235))
    plate.alpha_composite(orig, (cx, cy))
    plate.alpha_composite(asm, (cx + 100 * Z + pad, cy))
plate.save(os.path.normpath(os.path.join(ROOT, 'qa', 'zombie-gamerig-plate.png')))
print('plate -> zombie-gamerig-plate.png', plate.size)
