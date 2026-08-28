"""调试版：列出每个 curve 的 bbox"""
from PIL import Image
import numpy as np
import potrace
from scipy import ndimage

src = r"C:\Users\18087\Desktop\企业微信截图_20260827164804.png"
img = Image.open(src).convert("L")
arr = np.array(img)
mask = arr < 128
mask_img = Image.fromarray((mask * 255).astype(np.uint8))
big = mask_img.resize((mask.shape[1]*8, mask.shape[0]*8), Image.NEAREST)
mask_big = np.array(big) > 128
mask_big = ndimage.binary_dilation(mask_big, iterations=1)
bmp = potrace.Bitmap(mask_big)
path = bmp.trace(turdsize=2, alphamax=1.0, opttolerance=0.2)
for i, c in enumerate(path):
    pts = [(c.start_point.x, c.start_point.y)]
    for s in c.segments:
        if s.is_corner:
            pts.append((s.c.x, s.c.y))
            pts.append((s.end_point.x, s.end_point.y))
        else:
            pts.append((s.end_point.x, s.end_point.y))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    print(f"curve {i}: segs={len(c.segments)} pts={len(pts)} bbox x=[{min(xs):.1f},{max(xs):.1f}] y=[{min(ys):.1f},{max(ys):.1f}]")