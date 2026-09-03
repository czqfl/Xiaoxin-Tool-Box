# 项目长期记忆（Xiaoxin-Tool-Box）

## 提交约定（2026-09-03 更新）
- 每次完成任务：git commit 并 push 到 GitHub（origin=git@github.com:czqfl/Xiaoxin-Tool-Box.git，
  main 分支）。旧约定「commit only, no push」作废——主人自定义指令明确要求推送。
- push 走非沙箱 Bash。失败先 `git fetch` 查分叉，勿盲目 force push。
- 【铁律 2026-09-03】git add / commit / push 严禁 `&&` 链式，必须分步单独执行：
  1) `git add <files>`（单独）；2) `git commit -m "..."`（单独）；3) `git log --oneline -1`
  + `git status` 复核确认已提交、工作区干净；4) 最后单独 `git push origin main`。
  链式末尾常误报「nothing to commit / ahead by N / up-to-date」——实为 commit 已成功、
  push 根本没跑。主人已点名「不长记性」，此条不再犯，今后每次交付都按四步走。

## 改文件铁律：非沙箱 Bash + 原生 Windows Python，保 CRLF
- 本机 D: 经 /d 挂载即真实 D:；但历史上 Edit/Write/Read/沙箱 Bash 曾操作「临时覆盖层」，
  写操作不落真实 D:，仅 dangerouslyDisableSandbox 的 Bash 读写真实 D:。不同会话行为可能不同。
- 稳妥流程：任务开始先写探针小文件 → 非沙箱 Bash 确认可见 → 可见则全程用 Edit/Write；
  不可见回退「非沙箱 Bash + 原生 Windows Python」。行尾一律保 CRLF。
- 原生 python 路径用盘符 D:/My-Custom-Tool/Xiaoxin-Tool-Box（不认 /d/ POSIX 路径）；
  推荐 C:/Users/18087/.workbuddy/binaries/python/versions/3.13.12/python3.exe。
- 保行尾：读/写都用 open(p, encoding="utf-8", newline="")，按需把换行符与 LF 互转，
  否则整文件被改 LF、diff 爆炸。记忆文件约定：MEMORY.md 用 CRLF；每日日志 YYYY-MM-DD.md 用 LF。
- git 操作一律非沙箱 Bash；查真实文件用 python 打印，勿依赖 Read 工具缓存（可能陈旧）。
- 惨痛教训：曾因覆盖层 Edit，git 把 4 个源文件「删除」而非「修改」，
  git reset --hard 回 fc91822 修复。真实改文件最终落地一律走非沙箱。

## 架构取舍：独立窗口静态声明 + 启动效果管线（勿动态 new WebviewWindow）
Git 结果弹窗先要面板内卡片、后要独立窗口+智能停靠，以用户表达为准；但独立窗动态
new WebviewWindow 三次证明不可靠（白屏/关不掉/无内容）。铁律（4dabd53）：
1. 窗口静态声明进 tauri.conf.json（visible:false）+ 加入 apply_panel_acrylic 启动管线；
2. 固定逻辑高度，.panel 100vh 铺满、.panel-body 内滚动，勿用 ResizeObserver 自适应；
3. show 后 invoke panel_refresh_acrylic 补刷亚克力；
4. async 命令 + spawn_blocking 防主线程冻结；跨窗口首帧数据用 ready 握手回推；
5. 智能停靠：锚点=被操作卡片中心 X，放不下换侧/两侧不足覆盖，纵向与面板顶部对齐不压任务栏。

## cargo test 在本 crate 不可用（2026-09-02 实测）
- `cargo test --lib` 连空测试都在进程加载期崩（0xc0000020），疑与 ort/原生依赖测试链接有关。
- 真机验证扫描/算法：建临时 src-tauri/src/bin/xxx.rs（#[path] 引模块、不链接 lib），
  `cargo run --bin xxx`，验证完删除。
- 系统 PowerShell 工具拦截 COM 实例化（WScript.Shell 解析 .lnk 被拒）；解析 lnk 走 Rust IShellLink
  （apps_scan::resolve_lnk_target）。

## 本机应用扫描（apps.rs + apps_scan.rs，2026-09-02 定型）
- 四来源去重（同名 exe 留首条）：开始菜单.lnk → 卸载表(HKLM/HKCU×WOW64 32/64) →
  App Paths → 安装目录(下钻2层，只认"主 exe 与目录同名")。微信/企业微信/QQ 只在
  卸载表里有登记，旧版两来源必然漏。
- junk 短关键字（≤6 字符）只匹配"显示名/文件名"，严禁整条路径 contains 误伤。
- 缓存：data/app_cache.json（含图标约 1MB，CACHE_VERSION 不符即作废）；lib.rs setup
  单开 "app-scan" 线程预热（主进程启动不等它）；list_installed_apps 命中缓存零等待，
  过期(24h)先交货、后台重扫。
- 命令面板 UI：左分区导航（Tab 切换）+ 双行结果 + 每来源一色（KIND_COLOR），窗口 780×600；
  检索返回 QueryResult{items,counts}；空态常驻前 30 个本机应用。

## 贴图 OCR 独立窗(pin-ocr)生命周期（2026-09-02 三轮修复沉淀，1d737e4）
- pin/pin-ocr 系前端动态 new WebviewWindow 的成功实例——「勿动态建窗」铁律只针对
  带亚克力时序依赖的复杂窗，简单置顶窗动态建没问题。
- 独立子窗级联关闭必须下沉 Rust 统一出口：pin_close 命令 + lib.rs Destroyed 事件
  （staging 与 pin-<id> 分支）都调 pin::drop_ocr_window；前端 getByLabel 存在性安全网
  会被 staging「销毁即补建同 label 新窗」骗过，只当第二道闸。
- 独立小窗防超屏上限用 window.screen.availWidth 在 JS 算好注入，禁用 vw/vh
  （=窗自身视口，会把 560 面板 clamp 成 284「缩没」）。
- 两个 alwaysOnTop 窗重叠：后激活者在上，弹窗需 setAlwaysOnTop(true) 硬顶
  （250ms 节流防拖拽高频触发）；且补顶要周期 watchdog——贴图交互的"最后一次激活"
  无事件通知，一次性补顶会被后续交互盖掉（ecd439b）。

## 低级键盘钩子修饰键状态需物理自愈（2026-09-02，4c1021b）
- 钩子自维护 ALT_HELD/WIN_HELD/CTRL_HELD/SHIFT_HELD；系统会在 Alt+Tab（吞 Alt keyup）、
  Win 菜单/贴附（吞 Win keyup）后不发 keyup → 标记残留 true → 裸功能键（F1~F12，要求
  全部修饰键未按住）被永久挡掉，但 Alt 组合键（只要 Alt down 即匹配）正常——症状
  "只在特定应用里裸键失效"（进该应用前常 Alt+Tab）。修复：hook_proc 每事件先调
  reconcile_modifiers()，以 GetAsyncKeyState 物理状态对账，只清残留绝不反向置位。
- 定位技巧：同钩子下"Alt+V 正常但 F1 无效"= 钩子已收到键，差异仅在裸键分支前置条件；
  查 diag.log 有无 `bare hotkey matched` vs `alt hotkey matched` 一锤定音。

## 翻译弹窗(translate-popup)交互要点
- 常驻窗口 show/hide 复用（组件只 mount 一次），呼出靠事件驱动：有选中 emit
  translate://start（store 先写原文防错过事件）；无选中仅 activate_popup、不清空内容。
- 呼出自动聚焦原文框（2ff9664）：focusSourceInput 聚焦并把光标置文本末尾；
  scheduleSourceFocus 双时序 60/240ms（240ms 抵消 activate_popup 后台 120ms 补焦的
  焦点重置）；无选中路径 Rust 补发轻量 translate://shown（不带内容、不清空既有内容）。
## UIPI 自提权铁律（2026-09-02，e69da69/0bd7c3b 定型）
- WorkBuddy 以管理员运行（High IL 12288），工具箱必须同级：main.rs 入口检测非管理员
  一律 runas 自动提权（--elevated 防递归、XIAOXIN_NO_ELEVATE=1 逃生口）；普通权限
  工具箱在 WorkBuddy 内截图/取词/快捷键被 UIPI 拦截——F1 失效即此根因。
- 禁止再引入「dev 豁免」跳过提权（4f924a0 教训已回滚）：dev 不提权 → WorkBuddy 内
  仍失效，主人明确 dev 也自动提权（WorkBuddy 可用 > dev 终端不断链）。
- 使用矩阵：普通终端 tauri dev 弹 UAC 选「是」→ 原 dev 退出、提权实例独立运行；
  要 dev 热更新 + 提权并存 = 管理员终端跑 tauri dev（已提权直行）；双击/自启 exe 照常提权。
