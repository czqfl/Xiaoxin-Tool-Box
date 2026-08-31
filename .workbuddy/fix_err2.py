# -*- coding: utf-8 -*-
import sys
p = "D:/MyCustomTools/XiaoxinToolBox/src/modules/recorder/RecorderSelect.tsx"
with open(p, encoding="utf-8", newline="") as f:
    s = f.read()
s = s.replace("\r\n", "\n")
pairs = [
(
'''  // P1#5: 错误提示 3 秒后自动消失
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(t);
  }, [error]);''',
'''  // P1#5: 错误提示 10 秒后自动消失（3 秒根本来不及看完报错原因），
  // 点击提示条可立即清除。
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 10000);
    return () => clearTimeout(t);
  }, [error]);''',
),
(
'''      {error && <div className="rec-hint rec-hint-error">启动失败：{error}</div>}''',
'''      {error && (
        <div
          className="rec-hint rec-hint-error"
          style={{ cursor: "pointer" }}
          title="点击关闭"
          onClick={() => setError("")}
        >
          启动失败：{error}
        </div>
      )}''',
),
]
for old, new in pairs:
    if s.count(old) != 1:
        print(f"FAIL count={s.count(old)}: {old[:50]!r}"); sys.exit(1)
    s = s.replace(old, new)
with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK", p)
