"""从用户提供的 PNG/JPG 提取贴图矢量 path，复刻原图形状。
策略: 原图分辨率已足够高 (1745x1920)，不上采样；轻微闭运算平滑 jpg 噪点。
"""
from PIL import Image, ImageFilter
import numpy as np
import potrace
import re

src = r"C:\Users\18087\.workbuddy\clipboard-images\clipboard-2026-08-27T09-10-39-243Z-c64525a0.jpg"
img = Image.open(src).convert("L")
arr = np.array(img)
# jpg 没 alpha: 背景白(~255), 前景深灰(~70-100)
mask = arr < 230
print(f"image shape: {mask.shape}, fg pixels: {mask.sum()}")

# 用 PIL 轻微闭运算 (Close = dilate then erode) 让 jpg 抗锯齿边缘平滑
mask_pil = Image.fromarray((mask * 255).astype(np.uint8))
mask_smooth = mask_pil.filter(ImageFilter.MinFilter(3))  # 类似 erosion，去除孤立噪点
mask_smooth = mask_smooth.filter(ImageFilter.MaxFilter(3))  # 类似 dilation，恢复主体
mask = np.array(mask_smooth) > 128
print(f"after smooth: fg pixels: {mask.sum()}")

bmp = potrace.Bitmap(mask)
path = bmp.trace(turdsize=20, alphamax=1.3, opttolerance=0.6)
curves = list(path)
print(f"curves total: {len(curves)}")

def fmt(v):
    return f"{v:.2f}"

# potrace 第一个曲线通常是画布外框（bbox=整张图）。过滤它
def bbox(c):
    xs = [c.start_point.x]
    ys = [c.start_point.y]
    for seg in c.segments:
        xs.append(seg.end_point.x)
        ys.append(seg.end_point.y)
    return min(xs), min(ys), max(xs), max(ys)

img_h, img_w = mask.shape
canvas_area = img_w * img_h
real_curves = []
for c in curves:
    x0, y0, x1, y1 = bbox(c)
    area = (x1 - x0) * (y1 - y0)
    if area < canvas_area * 0.9:
        real_curves.append(c)
print(f"real curves (skipping canvas frame): {len(real_curves)}")
curves = real_curves

parts = []
for curve in curves:
    sx, sy = curve.start_point.x, curve.start_point.y
    parts.append(f"M{fmt(sx)} {fmt(sy)}")
    for seg in curve.segments:
        if seg.is_corner:
            cx, cy = seg.c.x, seg.c.y
            ex, ey = seg.end_point.x, seg.end_point.y
            parts.append(f"L{fmt(cx)} {fmt(cy)} L{fmt(ex)} {fmt(ey)}")
        else:
            c1x, c1y = seg.c1.x, seg.c1.y
            c2x, c2y = seg.c2.x, seg.c2.y
            ex, ey = seg.end_point.x, seg.end_point.y
            parts.append(f"C{fmt(c1x)} {fmt(c1y)} {fmt(c2x)} {fmt(c2y)} {fmt(ex)} {fmt(ey)}")
    parts.append("Z")
d = " ".join(parts)
print(f"raw d length: {len(d)} chars")

# 缩放到 viewBox 24，留 2px 边距
nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", d)]
xs = nums[0::2]
ys = nums[1::2]
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)
cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2
bw = max_x - min_x
bh = max_y - min_y
print(f"bbox: ({min_x:.1f},{min_y:.1f}) - ({max_x:.1f},{max_y:.1f})  size {bw:.1f}x{bh:.1f}")

target = 20.0
scale = target / max(bw, bh)
print(f"scale: {scale:.5f}")

tokens = []
for m in re.finditer(r"[MLC]|-?\d+\.?\d*", d):
    tokens.append(m.group(0))
out = []
num_buf = []
def commit():
    for k in range(0, len(num_buf), 2):
        x = float(num_buf[k])
        y = float(num_buf[k+1])
        nx = (x - cx) * scale + 12
        ny = (y - cy) * scale + 12
        out.append(f"{fmt(nx)} {fmt(ny)}")
    num_buf.clear()
for tok in tokens:
    if tok in ("M", "L", "C"):
        commit()
        out.append(tok)
    else:
        num_buf.append(tok)
commit()
d_final = " ".join(out)
print(f"\nfinal d ({len(d_final)} chars)")
print(d_final[:500])
with open(r"D:\My-Custom-Tool\Xiaoxin-Tool-Box\pin-path.txt", "w", encoding="utf-8") as f:
    f.write(d_final)
print("\nsaved to pin-path.txt")
