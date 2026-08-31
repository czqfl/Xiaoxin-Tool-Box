# -*- coding: utf-8 -*-
import sys
def edit(path, pairs):
    with open(path, encoding="utf-8", newline="") as f:
        s = f.read()
    s = s.replace("\r\n", "\n")
    for old, new in pairs:
        if s.count(old) != 1:
            print(f"FAIL [{path}] count={s.count(old)}: {old[:50]!r}"); sys.exit(1)
        s = s.replace(old, new)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(s.replace("\n", "\r\n"))
    print("OK", path)

BASE = "D:/MyCustomTools/XiaoxinToolBox"

# 1) 录制通知卡：失败不再 6 秒自动消失（成功仍 6s），错误卡留到用户手动关闭
edit(f"{BASE}/src/modules/recorder/RecorderBar.tsx", [(
'''    if (phase === "done" || phase === "error") {
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {});
      }, 6000);
    }''',
'''    // 仅成功卡 6 秒自动消失；失败卡绝不自动关——错误信息看半眼就被收走
    // 等于没报错，必须留到用户点右下角「关闭」为止。
    if (phase === "done") {
      autoCloseRef.current = setTimeout(() => {
        void recDismiss().catch(() => {});
      }, 6000);
    }''',
)])

# 2) 录屏选区「启动失败」：3s → 10s，且点击可立即关掉
edit(f"{BASE}/src/modules/recorder/RecorderSelect.tsx", [
(
'''    // P1#5: 错误提示 3 秒后自动消失
    useEffect(() => {
      if (!error) return;
      const t = setTimeout(() => setError(""), 3000);
      return () => clearTimeout(t);
    }, [error]);''',
'''    // P1#5: 错误提示 10 秒后自动消失（3 秒根本来不及看完报错原因），
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
])
