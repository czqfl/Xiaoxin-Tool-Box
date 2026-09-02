# 项目长期记忆（Xiaoxin-Tool-Box）

## 提交约定（2026-09-02 更新）
- **每次完成任务：git commit 并 push 到 GitHub**（origin=git@github.com:czqfl/Xiaoxin-Tool-Box.git，
  main 分支）。旧约定「commit only, no push」已作废——主人自定义指令明确要求推送。
- push 走非沙箱 Bash。若 push 失败先 `git fetch` 查分叉，勿盲目 force push。

## 关键环境事实：Edit/Write/Read/沙箱Bash 落在「覆盖层」，不是真实 D: 盘
**【2026-09-02 修正】** 该结论**不再成立**：本会话实测 Write/Edit/Read 直落真实 D:
（探针文件对非沙箱 Bash 与 git 均可见，git diff 干净）。**但不同会话行为可能不同**，
稳妥流程：任务开始先写一个探针小文件 → 非沙箱 Bash 确认可见 → 可见则全程用
Edit/Write 工具；不可见再回退「非沙箱 Bash + 原生 Windows Python」。行尾一律保 CRLF。

本机 D: 经 `/d` 挂载即真实 D:（非幻影挂载）。历史上曾出现：
- Edit / Write / Read 工具与**沙箱 Bash** 操作**临时覆盖层（ephemeral overlay）**，
  写操作不落真实 D:；**只有 `dangerouslyDisableSandbox: true` 的 Bash** 才读写真实 D:。

**正确改文件流程（务必遵守）**：
1. 用「非沙箱 Bash + 原生 Windows Python」改文件，BASE 用盘符路径
   `D:/My-Custom-Tool/Xiaoxin-Tool-Box`（原生 python 不认 `/d/...` 这种 POSIX 路径，
   会 FileNotFoundError）。推荐 python：
   `C:/Users/18087/.workbuddy/binaries/python/versions/3.13.12/python3.exe`
2. 保留 CRLF：读用 `open(p, encoding="utf-8", newline="")`，把 `
`→`
` 做字符串匹配/替换，
   写用 `open(p, "w", encoding="utf-8", newline="")` 再把 `
`→`
`。否则整文件被改 LF，diff 爆炸。
3. git 操作（reset / rm / commit / status / grep）也走**非沙箱 Bash**（真实 D: 的 git）。
4. 想「查看」真实文件内容时，用非沙箱 Bash 的 python 打印，不要依赖 Read 工具的覆盖层缓存（可能陈旧）。

**惨痛教训**：曾因用覆盖层 Edit 而非非沙箱 Bash，git 把 4 个源文件「删除」而非「修改」，
生成错误提交（已用 `git reset --hard` 恢复到 fc91822 修复）。任何涉及真实改文件的任务，
最终落地一律走非沙箱 Bash + 原生 python。

## 架构取舍：独立窗口必须静态声明 + 启动效果管线（勿动态 new WebviewWindow）
Git 结果弹窗用户先后要过两种形态：面板内卡片（createPortal）与独立窗口+智能停靠。
以用户表达为准，两种都可行；但独立窗口若做，动态 new WebviewWindow 路线已三次证明
不可靠（白屏/关不掉/无内容）。铁律（commit 4dabd53 验证）：
1. 窗口静态声明进 tauri.conf.json（visible:false）+ 加入 apply_panel_acrylic 启动管线
   ——效果首次显示前就位，杜绝 webview 透明时序问题导致的"下半白屏"；
2. 固定逻辑高度，.panel 100vh 铺满、内容区 .panel-body 内滚动，勿用 ResizeObserver
   自适应窗口高度（尺寸漂移 → 露白）；
3. show 后 invoke panel_refresh_acrylic 补刷亚克力（z-order 变化 SWCA 可能失效）；
4. async 命令 + spawn_blocking 防主线程冻结；跨窗口首帧数据用 ready 握手回推；
5. 智能停靠：锚点=被操作卡片中心 X，左半靠左/右半靠右/放不下换侧/两侧不足覆盖
   居中于锚点，纵向与面板顶部对齐且夹在工作区内不压任务栏。

## cargo test 在本 crate 不可用（2026-09-02 实测）
- `cargo test --lib` 连空测试都在进程加载期崩（exit 0xc0000020），与被测代码无关，
  疑与 ort/原生依赖的测试链接有关。
- 要真机验证扫描/算法类逻辑：建临时 `src-tauri/src/bin/xxx.rs`（`#[path]` 引模块、
  不链接 lib），`cargo run --bin xxx`，验证完删除。
- PowerShell 工具拦截 COM 实例化（WScript.Shell 解析 .lnk 被拒）；解析 lnk 走 Rust
  IShellLink（apps_scan::resolve_lnk_target）。

## 本机应用扫描（apps.rs + apps_scan.rs，2026-09-02 定型）
- 四来源去重（同名 exe 留首条）：开始菜单.lnk → 卸载表(HKLM/HKCU×WOW64 32/64) →
  App Paths → 安装目录(下钻2层，只认"主 exe 与目录同名")。微信/企业微信/QQ 只在
  卸载表里有登记，旧版两来源必然漏。
- junk 短关键字（≤6 字符）只匹配"显示名/文件名"，严禁整条路径 contains 误伤。
- 缓存：data/app_cache.json（含图标约 1MB，CACHE_VERSION 不符即作废）；lib.rs setup
  里单开 "app-scan" 线程预热（主进程启动不等它）；list_installed_apps 命中缓存零等待，
  过期(24h)先交货、后台重扫。
- 命令面板 UI 同日重写：左分区导航（Tab 切换）+ 双行结果 + 每来源一色（KIND_COLOR），
  窗口 780×600；检索返回 QueryResult{items,counts}；空态常驻前 30 个本机应用。

## 贴图 OCR 独立窗(pin-ocr)生命周期（2026-09-02 三轮修复沉淀，1d737e4）
- pin/pin-ocr 系前端动态 new WebviewWindow 的成功实例——「勿动态建窗」铁律只针对
  带亚克力时序依赖的复杂窗，简单置顶窗动态建没问题。
- 独立子窗级联关闭必须下沉 Rust 统一出口：pin_close 命令 + lib.rs Destroyed 事件
  （staging 与 pin-<id> 分支）都调 pin::drop_ocr_window；前端 getByLabel 存在性
  安全网会被 staging「销毁即补建同 label 新窗」骗过，只当第二道闸。
- 独立小窗防超屏上限用 window.screen.availWidth 在 JS 算好注入，禁用 vw/vh
  （=窗自身视口，会把 560 面板 clamp 成 284「缩没」）。
- 两个 alwaysOnTop 窗重叠：后激活者在上，弹窗需 setAlwaysOnTop(true) 硬顶
  （250ms 节流防拖拽高频触发）。
## 低级键盘钩子修饰键状态需物理自愈（2026-09-02，4c1021b）
- 钩子自维护 ALT_HELD/WIN_HELD/CTRL_HELD/SHIFT_HELD；系统会在 Alt+Tab（吞 Alt keyup）、
  Win 菜单/贴附（吞 Win keyup）后不发 keyup → 标记残留 true → 裸功能键（F1~F12，要求
  全部修饰键未按住）被永久挡掉，但 Alt 组合键（只要 Alt down 即匹配）正常——症状
  "只在特定应用里裸键失效"（进该应用前常 Alt+Tab）。修复：hook_proc 每事件先调
  reconcile_modifiers()，以 GetAsyncKeyState 物理状态对账，只清残留绝不反向置位。
- 定位技巧：同钩子下"Alt+V 正常但 F1 无效"= 钩子已收到键，差异仅在裸键分支前置条件；
  查 diag.log 有无 `bare hotkey matched` vs `alt hotkey matched` 一锤定音。
