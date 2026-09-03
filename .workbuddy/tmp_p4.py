# -*- coding: utf-8 -*-
p = r"D:/My-Custom-Tool/Xiaoxin-Tool-Box/src/settings/ScreenshotPage.tsx"
with open(p, encoding="utf-8", newline="") as f:
    L = f.read().split("\r\n")
for i in range(0, 10):
    print(f"{i+1:3d}| {L[i]}")
