# -*- coding: utf-8 -*-
import sys
p = "D:/MyCustomTools/XiaoxinToolBox/src/modules/quickfiles/QuickFilesPanel.tsx"
with open(p, encoding="utf-8", newline="") as f:
    s = f.read()
s = s.replace("\r\n", "\n")
pairs = [
(
'''  fsIndexRebuild,
  fsIndexSearch,''',
'''  fsIndexCancel,
  fsIndexRebuild,
  fsIndexSearch,''',
),
(
'''    onEvent<{ ok: boolean }>(EVT_FSINDEX_DONE, () => {
      setScanned(0);
      void refresh();
    }).then((u) => { if (dead) u(); else un2 = u; });''',
'''    onEvent<{ ok: boolean; cancelled?: boolean }>(EVT_FSINDEX_DONE, (p) => {
      setScanned(0);
      void refresh();
      if (p.cancelled) onToast("已取消建立索引", "success");
    }).then((u) => { if (dead) u(); else un2 = u; });''',
),
(
'''          {!building && (
            <button
              className="btn btn-sm"
              onClick={() => {
                fsIndexRebuild()
                  .then(() => setStatus((s) => (s ? { ...s, building: true } : s)))
                  .catch((e) => onToast(String(e), "error"));
              }}
            >
              {status && status.entries > 0 ? "更新索引" : "建立索引"}
            </button>
          )}''',
'''          {building ? (
            <button
              className="btn btn-sm"
              title="停止扫描；已扫描部分不会保留"
              onClick={() => {
                fsIndexCancel()
                  .then((ok) => { if (!ok) onToast("没有进行中的扫描", "error"); })
                  .catch((e) => onToast(String(e), "error"));
              }}
            >
              取消
            </button>
          ) : (
            <button
              className="btn btn-sm"
              onClick={() => {
                fsIndexRebuild()
                  .then(() => setStatus((s) => (s ? { ...s, building: true } : s)))
                  .catch((e) => onToast(String(e), "error"));
              }}
            >
              {status && status.entries > 0 ? "更新索引" : "建立索引"}
            </button>
          )}''',
),
]
for old, new in pairs:
    if s.count(old) != 1:
        print(f"FAIL count={s.count(old)}: {old[:60]!r}"); sys.exit(1)
    s = s.replace(old, new)
with open(p, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK", p)
