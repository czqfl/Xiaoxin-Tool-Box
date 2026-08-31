# -*- coding: utf-8 -*-
import sys
p = "D:/MyCustomTools/XiaoxinToolBox/src/modules/recorder/recorder.css"
with open(p, encoding="utf-8", newline="") as f:
    s = f.read()
s = s.replace("\r\n", "\n")

blocks = [
# 1) 面板标题栏（rec-panel-head/title/hint）
'''/* ---- 面板标题栏 ---- */
.rec-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.rec-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.rec-panel-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
}

''',
# 2) 配置字段行（rec-field/rec-label）
'''/* ---- 配置字段行 ---- */
.rec-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  white-space: nowrap;
}
.rec-label {
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}

''',
]
for old in blocks:
    if s.count(old) != 1:
        print(f"FAIL count={s.count(old)}"); sys.exit(1)
    s = s.replace(old, "")

# 3) 分段选择器整段：从注释起到 rec-seg button.active:hover 结束
i = s.find("/* ---- 分段选择器")
j = s.find("/* ---- 单行操作区")
if i < 0 or j < 0 or j <= i:
    print("FAIL seg range"); sys.exit(1)
s = s[:i] + s[j:]

# 4) recb-muted 两个块 + 注释
i = s.find("/* 静音：琥珀色")
j = s.find("/* 录音开关：")
if i < 0 or j <= i:
    print("FAIL muted range"); sys.exit(1)
s = s[:i] + s[j:]

# 5) :has 列表里去掉死的 .recb-muted 引用
s = s.replace(":not(.recb-stop):not(.recb-cancel):not(.recb-muted):not(.recb-rec-on)",
              ":not(.recb-stop):not(.recb-cancel):not(.recb-rec-on)")

with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK, lines now:", s.count("\n") + 1)
