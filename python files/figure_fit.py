"""Nudge a model's figure box so its edges never cut through a label.

Vision models place boxes a few pixels off: an edge lands inside "Equator" or
cuts the value off an angle. Pixels fix that better than prompting. Each edge
moves outward while there is ink on or just beyond it, until it reaches a clear
gap. Blank margins are then trimmed to PAD around the ink. Edges move out by
at most MAX_GROW of the image, so a box around the wrong thing stays visibly
wrong for the reviewer rather than swallowing the page. Fitting is idempotent.
"""

from PIL import Image

INK = 200          # grey level below which a pixel is ink (crops are black on white)
TOUCH = 4          # ink this close beyond an edge counts as cut off (px)
GAP_X = 10         # clear columns that end a label sideways (wider than a word space)
GAP_Y = 6          # clear rows that end a label up or down
PAD = 6            # blank margin added after fitting (px), only into blank space
MAX_GROW = 0.25    # an edge moves at most this fraction of the image


def ink_mask(image):
    return image.convert("L").point(lambda v: 255 if v < INK else 0)


def _has_ink(mask, x0, y0, x1, y1):
    if x1 <= x0 or y1 <= y0:
        return None
    return mask.crop((x0, y0, x1, y1)).getbbox()


def _grow(mask, box, side, limit):
    """Move one edge outward past any ink it touches; return the new box."""
    x0, y0, x1, y1 = box
    W, H = mask.size
    if side == "left":
        edge, gap = x0, GAP_X
        while edge > limit:
            probe = TOUCH if edge == x0 else gap
            bb = _has_ink(mask, max(limit, edge - probe), y0, edge, y1)
            if not bb:
                break
            edge = max(limit, edge - probe) + bb[0]
        return (edge, y0, x1, y1)
    if side == "right":
        edge, gap = x1, GAP_X
        while edge < limit:
            probe = TOUCH if edge == x1 else gap
            bb = _has_ink(mask, edge, y0, min(limit, edge + probe), y1)
            if not bb:
                break
            edge = edge + bb[2]
        return (x0, y0, edge, y1)
    if side == "top":
        edge, gap = y0, GAP_Y
        while edge > limit:
            probe = TOUCH if edge == y0 else gap
            bb = _has_ink(mask, x0, max(limit, edge - probe), x1, edge)
            if not bb:
                break
            edge = max(limit, edge - probe) + bb[1]
        return (x0, edge, x1, y1)
    edge, gap = y1, GAP_Y
    while edge < limit:
        probe = TOUCH if edge == y1 else gap
        bb = _has_ink(mask, x0, edge, x1, min(limit, edge + probe))
        if not bb:
            break
        edge = edge + bb[3]
    return (x0, y0, x1, edge)


def _pad(mask, box):
    """Margin of PAD px around the ink inside the box, never within TOUCH of outside ink.

    Measured from the ink rather than the old edge, so fitting a fitted box
    changes nothing.
    """
    x0, y0, x1, y1 = box
    W, H = mask.size
    tight = _has_ink(mask, x0, y0, x1, y1)
    if not tight:
        return box
    tx0, ty0, tx1, ty1 = x0 + tight[0], y0 + tight[1], x0 + tight[2], y0 + tight[3]
    reach = PAD + TOUCH + 1
    left = _has_ink(mask, max(0, tx0 - reach), ty0, tx0, ty1)
    nx0 = max(0, tx0 - PAD) if not left else max(max(0, tx0 - reach) + left[2] + TOUCH + 1, tx0 - PAD)
    right = _has_ink(mask, tx1, ty0, min(W, tx1 + reach), ty1)
    nx1 = min(W, tx1 + PAD) if not right else min(tx1 + right[0] - TOUCH - 1, tx1 + PAD)
    top = _has_ink(mask, nx0, max(0, ty0 - reach), nx1, ty0)
    ny0 = max(0, ty0 - PAD) if not top else max(max(0, ty0 - reach) + top[3] + TOUCH + 1, ty0 - PAD)
    bottom = _has_ink(mask, nx0, ty1, nx1, min(H, ty1 + reach))
    ny1 = min(H, ty1 + PAD) if not bottom else min(ty1 + bottom[1] - TOUCH - 1, ty1 + PAD)
    return (min(nx0, tx0), min(ny0, ty0), max(nx1, tx1), max(ny1, ty1))


def fit_box_px(mask, box):
    W, H = mask.size
    x0, y0, x1, y1 = (int(round(n)) for n in box)
    x0, x1 = max(0, min(x0, x1)), min(W, max(x0, x1))
    y0, y1 = max(0, min(y0, y1)), min(H, max(y0, y1))
    limits = {
        "left": max(0, x0 - int(W * MAX_GROW)),
        "right": min(W, x1 + int(W * MAX_GROW)),
        "top": max(0, y0 - int(H * MAX_GROW)),
        "bottom": min(H, y1 + int(H * MAX_GROW)),
    }
    fitted = (x0, y0, x1, y1)
    # Growing one edge widens the span the others check, so repeat until stable.
    for _ in range(8):
        before = fitted
        for side in ("left", "right", "top", "bottom"):
            fitted = _grow(mask, fitted, side, limits[side])
        fitted = _pad(mask, fitted)
        if fitted == before:
            break
    return fitted


def fit_box(image_path, box):
    """Fit a fractional [x0, y0, x1, y1] box on an image; returns fractions."""
    with Image.open(image_path) as im:
        mask = ink_mask(im)
    W, H = mask.size
    px = fit_box_px(mask, (box[0] * W, box[1] * H, box[2] * W, box[3] * H))
    return [round(px[0] / W, 4), round(px[1] / H, 4), round(px[2] / W, 4), round(px[3] / H, 4)]
