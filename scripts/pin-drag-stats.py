#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""贴图拖动性能统计：从 diag.log 提取 [pin] drag 埋点并汇总。

用法：
    python scripts/pin-drag-stats.py                 # 读默认 dev 日志
    python scripts/pin-drag-stats.py <日志路径>       # 指定日志
    python scripts/pin-drag-stats.py -n 20           # 显示最近 20 条明细

埋点格式（PinWindow.tsx 松手时打出）：
    [pin] drag 42f avg=16.7ms p95=18.2ms max=33.1ms

判读：
    avg  ≈16.7ms  → 满帧（60fps），拖动流畅
    avg  >20ms    → 持续合成开销偏重（窗口面积大 / 特效重）
    max  突刺     → 撞上了别的重活（补建待命窗、OCR、GC）
    f(帧数) 偏少 → rAF 被压制，主线程有长任务
"""
import re
import sys
import os
import statistics

DEFAULT_LOG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src-tauri", "target", "debug", "data", "diag.log",
)

# [pin] drag 42f avg=16.7ms p95=18.2ms max=33.1ms
PAT = re.compile(
    r"\[pin\] drag\s+(\d+)f\s+avg=([\d.]+)ms\s+p95=([\d.]+)ms\s+max=([\d.]+)ms"
)


def main() -> int:
    args = [a for a in sys.argv[1:]]
    tail_n = 10
    if "-n" in args:
        i = args.index("-n")
        try:
            tail_n = int(args[i + 1])
        except (IndexError, ValueError):
            pass
        del args[i:i + 2]
    log = args[0] if args else DEFAULT_LOG

    if not os.path.isfile(log):
        print(f"日志不存在：{log}")
        print("提示：需先跑 tauri dev 并拖动贴图，埋点才会写入。")
        return 1

    rows = []
    with open(log, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            m = PAT.search(line)
            if m:
                ts = line.split(" [pin]", 1)[0].strip()
                rows.append({
                    "ts": ts,
                    "f": int(m.group(1)),
                    "avg": float(m.group(2)),
                    "p95": float(m.group(3)),
                    "max": float(m.group(4)),
                })

    if not rows:
        print(f"未在 {log} 中找到 [pin] drag 埋点。")
        print("提示：这是新加的埋点，需重新 tauri dev 编译后拖动贴图才会产生。")
        return 1

    avgs = [r["avg"] for r in rows]
    p95s = [r["p95"] for r in rows]
    maxs = [r["max"] for r in rows]
    frames = [r["f"] for r in rows]
    dropped = [r for r in rows if r["max"] > 32.0]

    print("=" * 58)
    print(f"贴图拖动统计  ({os.path.basename(log)})")
    print("=" * 58)
    print(f"拖动次数      : {len(rows)}")
    print(f"avg 帧耗时    : 平均 {statistics.mean(avgs):.1f}ms  中位 {statistics.median(avgs):.1f}ms  最差 {max(avgs):.1f}ms")
    print(f"p95 帧耗时    : 平均 {statistics.mean(p95s):.1f}ms  最差 {max(p95s):.1f}ms")
    print(f"max 帧耗时    : 平均 {statistics.mean(maxs):.1f}ms  最差 {max(maxs):.1f}ms")
    print(f"每次帧数      : 平均 {statistics.mean(frames):.0f}  最少 {min(frames)}  最多 {max(frames)}")
    print(f"掉帧次数      : {len(dropped)}  (max > 32ms)")

    verdict = "流畅（avg ≤ 18ms）"
    if statistics.mean(avgs) > 24:
        verdict = "明显卡顿：持续合成开销偏重，需再削窗口特效/面积"
    elif statistics.mean(avgs) > 18:
        verdict = "轻微掉帧：可接受但仍有优化空间"
    print(f"结论          : {verdict}")

    print("-" * 58)
    print(f"最近 {min(tail_n, len(rows))} 次拖动明细：")
    print(f"{'时间':<26}{'帧数':>6}{'avg':>10}{'p95':>10}{'max':>10}")
    for r in rows[-tail_n:]:
        ts = r["ts"][:25]
        print(f"{ts:<26}{r['f']:>6}{r['avg']:>9.1f}ms{r['p95']:>9.1f}ms{r['max']:>9.1f}ms")
    print("=" * 58)
    return 0


if __name__ == "__main__":
    sys.exit(main())
