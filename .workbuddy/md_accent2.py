# -*- coding: utf-8 -*-
import sys
p = "D:/MyCustomTools/XiaoxinToolBox/src/sticky/md-style.ts"
with open(p, encoding="utf-8", newline="") as f:
    s = f.read()
s = s.replace("\r\n", "\n")
old = '''/** 把默认排版里的 accent 字面量替换为主题色（仅 default 主题的两份 CSS 使用） */
export function applyAccent(css: string, accent: string): string {
  return css
    .replaceAll(`--accent: ${MD_ACCENT_LIGHT}`, `--accent: ${accent}`)
    .replaceAll(`--accent: ${MD_ACCENT_DARK}`, `--accent: ${accent}`);
}'''
new = '''/** 把默认排版里的 accent 字面量替换为主题色（仅 default 主题的两份 CSS 使用）。
 *  accent 为空（同步链路异常）时不替换，保留写死的兜底蓝——绝不能产出
 *  `--accent: ` 这种空值声明，否则 color-mix/var 全链失效。 */
export function applyAccent(css: string, accent: string): string {
  if (!accent) return css;
  return css
    .replaceAll(`--accent: ${MD_ACCENT_LIGHT}`, `--accent: ${accent}`)
    .replaceAll(`--accent: ${MD_ACCENT_DARK}`, `--accent: ${accent}`);
}'''
if s.count(old) != 1:
    print(f"FAIL count={s.count(old)}"); sys.exit(1)
s = s.replace(old, new)
with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK", p)
