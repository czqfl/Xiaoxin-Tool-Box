# -*- coding: utf-8 -*-
import sys
def edit(path, pairs):
    with open(path, encoding="utf-8", newline="") as f:
        s = f.read()
    s = s.replace("\r\n", "\n")
    for old, new in pairs:
        if s.count(old) != 1:
            print(f"FAIL [{path}] count={s.count(old)}: {old[:60]!r}"); sys.exit(1)
        s = s.replace(old, new)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(s.replace("\n", "\r\n"))
    print("OK", path)

BASE = "D:/MyCustomTools/XiaoxinToolBox"

# 1) md-style.ts：默认 accent 抽成常量 + 替换函数
edit(f"{BASE}/src/sticky/md-style.ts", [
(
'''/** 默认（暖色）预览排版，对应原先 styles.css 里 .md-preview 的作用域规则。 */
export const DEFAULT_MD_CSS = `
:root {
  --bg: #fffefb;
  --bg-bar: #f7f4ee;
  --border: #ebe5da;
  --text: #3a3a3a;
  --text-sub: #a39c90;
  --accent: #6b9fd9;
}''',
'''/**
 * 默认排版的 accent 字面量：iframe 是独立文档、不加载 theme.css，只能写死兜底值。
 * 注入前由 note.ts 调 applyAccent() 换成工具箱主题色（syncToolboxTheme 已把
 * 窗口上的 --accent 解析为具体色值）——mint/skyblue/red/orange 因此能进预览区。
 */
export const MD_ACCENT_LIGHT = "#6b9fd9";
export const MD_ACCENT_DARK = "#7fb0e6";

/** 把默认排版里的 accent 字面量替换为主题色（仅 default 主题的两份 CSS 使用） */
export function applyAccent(css: string, accent: string): string {
  return css
    .replaceAll(`--accent: ${MD_ACCENT_LIGHT}`, `--accent: ${accent}`)
    .replaceAll(`--accent: ${MD_ACCENT_DARK}`, `--accent: ${accent}`);
}

/** 默认（暖色）预览排版，对应原先 styles.css 里 .md-preview 的作用域规则。 */
export const DEFAULT_MD_CSS = `
:root {
  --bg: #fffefb;
  --bg-bar: #f7f4ee;
  --border: #ebe5da;
  --text: #3a3a3a;
  --text-sub: #a39c90;
  --accent: ${MD_ACCENT_LIGHT};
}''',
),
(
'''export const DEFAULT_MD_CSS_DARK = `
:root {
  --bg: #23232a;
  --bg-bar: #2d2d35;
  --border: #3c3c45;
  --text: #e6e4df;
  --text-sub: #9a948b;
  --accent: #7fb0e6;
}''',
'''export const DEFAULT_MD_CSS_DARK = `
:root {
  --bg: #23232a;
  --bg-bar: #2d2d35;
  --border: #3c3c45;
  --text: #e6e4df;
  --text-sub: #9a948b;
  --accent: ${MD_ACCENT_DARK};
}''',
),
])

# 2) note.ts：注入前应用主题色
edit(f"{BASE}/src/sticky/note.ts", [
(
'''import { DEFAULT_MD_CSS, DEFAULT_MD_CSS_DARK, getThemeCss, MD_BG_CSS } from "./md-style";''',
'''import {
  DEFAULT_MD_CSS, DEFAULT_MD_CSS_DARK, getThemeCss, MD_BG_CSS, applyAccent,
} from "./md-style";''',
),
(
'''    // 默认预览在“便签整体深色”时自动转深，避免亮底预览嵌在暗窗里的割裂感
    const baseCss = theme === "default" && noteDark ? DEFAULT_MD_CSS_DARK : DEFAULT_MD_CSS;''',
'''    // 默认预览在“便签整体深色”时自动转深，避免亮底预览嵌在暗窗里的割裂感；
    // accent 用窗口上已解析的工具箱主题色（syncToolboxTheme 写入的具体值），
    // 让 mint/skyblue/red/orange 等主题色进入预览区（iframe 读不到 theme.css）
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent").trim();
    const baseCss = applyAccent(
      theme === "default" && noteDark ? DEFAULT_MD_CSS_DARK : DEFAULT_MD_CSS,
      accent || "",
    );''',
),
])
