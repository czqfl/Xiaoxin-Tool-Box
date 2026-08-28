"""用 svglib + reportlab 渲染 pin-path.txt，看效果。"""
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
from io import BytesIO

with open(r"D:\My-Custom-Tool\Xiaoxin-Tool-Box\pin-path.txt", "r", encoding="utf-8") as f:
    d = f.read().strip()
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240">
<path d="{d}" fill="#595959" fill-rule="evenodd"/>
</svg>'''
drawing = svg2rlg(BytesIO(svg.encode("utf-8")))
renderPM.drawToFile(drawing, r"D:\My-Custom-Tool\Xiaoxin-Tool-Box\pin-rendered.png", fmt="PNG")
print("rendered to pin-rendered.png")
