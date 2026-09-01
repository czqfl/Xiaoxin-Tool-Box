/** 文件夹快捷面板：固定/最常访问双分区、各自分页、搜索、右键菜单、拖拽添加与排序 */
import { useEffect, useMemo, useRef, useState } from "react";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { EditorInfo, FolderEntry, FolderLayout, GitRunResult } from "../../types";
import { GitRunSnapshot, GITRUN_W, GITRUN_H } from "./GitRunWindow";
import { hideCurrentWindow, usePanelCommon, withNativeDialog } from "../../core/usePanel";
import { EVT_FOLDER_CHANGED, onEvent } from "../../core/events";
import { useFolderStore, sortFolders } from "../../stores/folderStore";
import { useConfigStore } from "../../stores/configStore";
import * as api from "./api";
import { FolderCard } from "./FolderCard";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import {
  IconArrowUp,
  IconBranch,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCode,
  IconCopy,
  IconExternal,
  IconFolder,
  IconFolderPlus,
  IconGrid,
  IconList,
  IconPalette,
  IconPin,
  IconSearch,
  IconTerminal,
  IconTrash,
  IconTree,
} from "../../components/icons";
import { FOLDER_COLORS } from "./colors";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { ToastProvider, useToast } from "../../components/Toast";
import { useEscLayer } from "../../hooks/useEscLayered";
import "../../styles/panel.css";
import "./folder.css";

/** 常用 Git 命令模板（右键在默认终端中执行，仅 Git 仓库展示）。
 *  多命令用换行分隔，后端按当前 shell 拼成一行执行（cmd 用 &，PowerShell 用 ;）。 */
const GIT_COMMANDS: Array<{ label: string; cmd: string }> = [
  {
    label: "一键提交并推送",
    cmd: "git add .\ngit commit -m \"update\"\ngit push",
  },
  { label: "git status", cmd: "git status" },
  { label: "git add .", cmd: "git add ." },
  { label: "git commit -m \"update\"", cmd: "git commit -m \"update\"" },
  { label: "git push", cmd: "git push" },
  { label: "git pull", cmd: "git pull" },
  { label: "git log --oneline", cmd: "git log --oneline" },
  { label: "git stash", cmd: "git stash" },
];

/** Git 执行状态独立窗口标签（静态声明于 tauri.conf.json，启动即存在） */
const GITRUN_LABEL = "git-run";
/** 窗口与文件夹面板之间的间距（逻辑像素） */
const GITRUN_GAP = 12;

interface MenuState {
  x: number;
  y: number;
  folder: FolderEntry;
}

/** 路径统一为反斜杠形态并去掉尾部斜杠 */
function normPath(p: string): string {
  return p.replaceAll("/", "\\").replace(/\\+$/, "");
}

/** 父目录路径；根目录（如 D: / D:\）无父级返回 null */
function parentPathOf(p: string): string | null {
  const n = normPath(p);
  const idx = n.lastIndexOf("\\");
  if (idx <= 0) return null;
  return n.slice(0, idx);
}

/** 相对父目录的路径：多级子目录时显示完整相对路径（如 app-a\src） */
function relPathOf(p: string, parent: string): string {
  const n = normPath(p);
  const pn = normPath(parent);
  return n.startsWith(pn + "\\") ? n.slice(pn.length + 1) : n;
}

/** 按父目录分组构建目录树（组按路径排序，组内按名称排序） */
function buildTree(items: FolderEntry[]): Array<{ parent: string; items: FolderEntry[] }> {
  const groups = new Map<string, FolderEntry[]>();
  for (const f of items) {
    const parent = parentPathOf(f.path) ?? f.path;
    const list = groups.get(parent);
    if (list) list.push(f);
    else groups.set(parent, [f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([parent, list]) => ({
      parent,
      items: list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    }));
}

/** 单区分页器：仅多页时展示 */
function ZonePager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="zone-pager">
      <button
        className="pager-btn"
        title="上一页"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <IconChevronLeft size={12} />
      </button>
      <span className="zone-pager-info">
        {page}/{pages}
      </span>
      <button
        className="pager-btn"
        title="下一页"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        <IconChevronRight size={12} />
      </button>
    </div>
  );
}

export function FolderPanel() {
  return (
    <ToastProvider>
      <FolderPanelInner />
    </ToastProvider>
  );
}

function FolderPanelInner() {
  const { folders, loaded, refresh, add, remove, togglePin, moveToTop, reorder, setColor } =
    useFolderStore();
  const config = useConfigStore((s) => s.config);
  const updateConfig = useConfigStore((s) => s.update);
  const toast = useToast();
  // 置顶开启时面板常驻：失焦不再自动隐藏
  usePanelCommon(config.folder.always_on_top);
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [pinnedPage, setPinnedPage] = useState(1);
  const [frequentPage, setFrequentPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 最近一次右键的文件夹卡片中心 X（逻辑像素，相对面板窗口）——Git 结果窗
   *  停靠在面板哪一侧的判据。菜单项点击时读取，无需触发渲染，故用 ref 而非 state。 */
  const gitAnchorRef = useRef<number | null>(null);
  /** 文件夹 id → Git 当前分支（非仓库无条目） */
  const [branches, setBranches] = useState<Record<string, string>>({});
  /** 已安装编辑器列表（null = 尚未检测完成） */
  const [editors, setEditors] = useState<EditorInfo[] | null>(null);
  /** Git 命令执行结果快照（独立窗口渲染，null = 无执行） */
  const [gitRun, setGitRun] = useState<GitRunSnapshot | null>(null);
  /** 待删除确认的文件夹（null = 无确认弹窗） */
  const [deleteTarget, setDeleteTarget] = useState<FolderEntry | null>(null);

  /** 最新快照镜像：供窗口（重）挂载时的 ready 握手回推——
   *  监听器只在挂载时注册一次，闭包里直接读 state 会拿到注册那一刻的陈旧值 */
  const gitRunRef = useRef<GitRunSnapshot | null>(null);
  useEffect(() => {
    gitRunRef.current = gitRun;
  }, [gitRun]);

  /** 推送快照：面板 state 同步更新（Esc 层判定用）+ 定向发给独立窗口实时上屏 */
  const pushGitRun = (snap: GitRunSnapshot) => {
    gitRunRef.current = snap;
    setGitRun(snap);
    void emitTo(GITRUN_LABEL, "git-run-update", snap).catch(() => {});
  };


  /** 智能停靠：算出 Git 结果窗应显示的物理坐标（用户需求）——
   *  以被操作文件夹卡片的中心 X（逻辑像素）为锚点：
   *    · 锚点在面板左半 → 弹窗停靠面板左侧；右半 → 停靠面板右侧；
   *    · 首选侧在工作区内放不下 → 自动换到另一侧；
   *    · 两侧都放不下 → 覆盖面板、居中于锚点卡片（尽量少压面板）。
   *  纵向一律与面板顶部对齐，且始终夹在工作区内（不压任务栏、不出屏幕）。 */
  const placeGitRunWindow = async (anchorCx: number) => {
    try {
      const win = getCurrentWindow();
      const [pos, size, mon] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        currentMonitor(),
      ]);
      const sf = mon?.scaleFactor ?? 1;
      const w = Math.round(GITRUN_W * sf);
      const h = Math.round(GITRUN_H * sf);
      const gap = Math.round(GITRUN_GAP * sf);
      const panelLeft = pos.x;
      const panelRight = pos.x + size.width;
      const panelTop = pos.y;
      // 工作区＝显示器区域排除任务栏，窗口绝不许压到任务栏或被裁到屏幕外
      const wa = mon?.workArea;
      const waX = wa?.position?.x ?? 0;
      const waY = wa?.position?.y ?? 0;
      const waW = wa?.size?.width ?? mon?.size?.width ?? 1920;
      const waH = wa?.size?.height ?? mon?.size?.height ?? 1080;
      const waRight = waX + waW;
      const waBottom = waY + waH;
      const fits = (x: number) => x >= waX && x + w <= waRight;
      const atLeft = () => panelLeft - w - gap;
      const atRight = () => panelRight + gap;
      const preferLeft = anchorCx < size.width / sf / 2;
      let x: number;
      if (preferLeft && fits(atLeft())) x = atLeft();
      else if (!preferLeft && fits(atRight())) x = atRight();
      else if (fits(atRight())) x = atRight();
      else if (fits(atLeft())) x = atLeft();
      // 两侧都不够：覆盖面板，水平居中于锚点卡片（clamp 不出工作区）
      else x = Math.round(panelLeft + anchorCx * sf - w / 2);
      x = Math.min(Math.max(x, waX), Math.max(waX, waRight - w));
      const y = Math.min(Math.max(panelTop, waY), Math.max(waY, waBottom - h));
      return { pos: new PhysicalPosition(x, y), size: new PhysicalSize(w, h) };
    } catch {
      return null;
    }
  };

  /** 显示（或复用）Git 结果独立窗口。
   *  窗口在 tauri.conf.json 静态声明（visible:false），启动即存在且已走效果
   *  管线——无需动态创建。每次执行都按当前锚点重定位（用户期望弹窗出现在
   *  执行位置那一侧）；先显示后补刷亚克力（与面板 show→refresh_panel_acrylic
   *  同序：DWM 亚克力层在 z-order 变化后可能失效）。
   *  【返回值】窗口是否可用。不可用（取不到窗口）时调用方必须给出可见反馈。 */
  const openGitRunWindow = async (anchorCx: number): Promise<boolean> => {
    const win = await WebviewWindow.getByLabel(GITRUN_LABEL).catch(() => null);
    if (!win) return false;
    const geo = await placeGitRunWindow(anchorCx);
    if (geo) {
      await win.setSize(geo.size).catch(() => {});
      await win.setPosition(geo.pos).catch(() => {});
    }
    // 显示改走 Rust 可靠置前（show + force_foreground_robust + set_focus），
    // 与 tray/热键打开面板同款——修复"窗口可见但无焦点，点击不响应"
    await invoke("panel_show_foreground", { label: GITRUN_LABEL }).catch(() => {});
    return true;
  };

  // 独立窗口的握手 / 关闭通道。窗口挂载（开发模式下由隐藏转可见会整页重载，
  // 等同重新挂载）时发 git-run-ready 索取快照，此时把最新状态整体回推——
  // 首帧 emit 必然丢失，握手是唯一能保证"任何时刻挂载都看到全量结果"的通道。
  useEffect(() => {
    let a: (() => void) | undefined;
    let disposed = false;
    onEvent<boolean>("git-run-ready", () => {
      // 窗口 webview 已挂载：顺手把窗口效果再刷一遍（开发模式隐藏转可见会整页
      // 重载、效果随之丢失，这里是效果重刷的最稳兜底时机）
      invoke("panel_refresh_acrylic", { label: GITRUN_LABEL }).catch(() => {});
      void emitTo<GitRunSnapshot | null>(
        GITRUN_LABEL,
        "git-run-update",
        gitRunRef.current,
      ).catch(() => {});
    }).then((f) => (disposed ? f() : (a = f)));
    return () => {
      disposed = true;
      a?.();
    };
  }, []);

  // Esc：关闭面板。Git 结果窗口完全独立自治——它的开关由窗口自己管理，
  // 面板既不跟踪其状态，也不在自身关闭时连带操作它。
  useEscLayer(true, () => hideCurrentWindow());

  // 列表变化时批量读取 Git 分支（读 .git/HEAD，毫秒级）
  useEffect(() => {
    const paths = folders.map((f) => f.path);
    if (paths.length === 0) {
      setBranches({});
      return;
    }
    api.folderGitBranches(paths).then((list) => {
      const map: Record<string, string> = {};
      folders.forEach((f, i) => {
        const b = list[i];
        if (b) map[f.id] = b;
      });
      setBranches(map);
    });
  }, [folders]);

  useEffect(() => {
    refresh();
    refreshEditors();
    const cleanup: Array<() => void> = [];
    let disposed = false;

    // 记录失焦时刻，用于区分"真实打开"与"拖动面板导致的焦点短暂闪动"。
    // 拖动时 Windows 会让窗口瞬时失焦再夺回，若每次夺回都清空搜索框，
    // 用户刚输入的搜索内容就会消失——故仅当失焦超过阈值（真正被收起后重新呼出）
    // 才重置搜索，拖动造成的亚 300ms 焦点闪动不触发清空。
    let lastBlurAt = 0;
    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          lastBlurAt = Date.now();
          return;
        }
        if (Date.now() - lastBlurAt < 300) return;
        setQuery("");
        // 打开计数由后端完成，面板重新聚焦时拉取最新数据
        refresh();
        setTimeout(() => inputRef.current?.focus(), 0);
      })
      .then((un) => (disposed ? un() : cleanup.push(un)));

    // 从系统资源管理器拖入文件夹快速添加
    getCurrentWindow()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setExternalDrag(true);
        } else if (p.type === "leave") {
          setExternalDrag(false);
        } else if (p.type === "drop") {
          setExternalDrag(false);
          for (const path of p.paths) {
            void add(path).then((err) => {
              if (err) toast.show(err, "error");
            });
          }
        }
      })
      .then((un) => (disposed ? un() : cleanup.push(un)));

    // 资源管理器追踪新增/计数后拉取最新数据
    onEvent(EVT_FOLDER_CHANGED, () => refresh()).then((un) => (disposed ? un() : cleanup.push(un)));

    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [refresh, add]);

  // 面板置顶状态跟随配置生效（经后端命令切换，避免透明窗口纯色屏）
  const alwaysOnTop = config.folder.always_on_top;
  useEffect(() => {
    api.setPanelAlwaysOnTop(alwaysOnTop).catch(console.error);
  }, [alwaysOnTop]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [folders, query]);

  const { pinned, frequent } = useMemo(() => sortFolders(filtered), [filtered]);
  const layout = config.folder.layout;
  const split = config.folder.split;
  const showCount = config.folder.show_visit_count;
  const terminalLabel =
    config.folder.terminal_shell === "wt"
      ? "Windows Terminal"
      : config.folder.terminal_shell === "cmd"
        ? "命令提示符"
        : "PowerShell";
  const pageSize = Math.max(1, config.folder.page_size);

  // 分区各自分页，条目变化导致页码越界时自动收敛
  const pinnedPages = Math.max(1, Math.ceil(pinned.length / pageSize));
  const frequentPages = Math.max(1, Math.ceil(frequent.length / pageSize));
  const safePinnedPage = Math.min(pinnedPage, pinnedPages);
  const safeFrequentPage = Math.min(frequentPage, frequentPages);
  const pinnedView = pinned.slice(
    (safePinnedPage - 1) * pageSize,
    safePinnedPage * pageSize
  );
  const frequentView = frequent.slice(
    (safeFrequentPage - 1) * pageSize,
    safeFrequentPage * pageSize
  );

  const openFolderItem = async (folder: FolderEntry) => {
    // 访问计数由后端在打开时统一记录；成功后再收起面板，失败时保持可见可提示
    try {
      await api.openFolder(folder.path);
      hideCurrentWindow();
    } catch (err) {
      toast.show(String(err), "error");
    }
  };

  const handleAdd = async () => {
    try {
      // 调起系统资源管理器选择文件夹；弹窗期间面板保持可见
      const path = await withNativeDialog(() => api.pickFolder());
      if (!path) return;
      const err = await add(path);
      if (err) toast.show(err, "error");
    } catch (err) {
      toast.show(String(err), "error");
    }
  };

  /** 面板内直接切换卡片展示模式（网格 / 列表 / 目录树），头部三按钮并列高亮 */
  const setLayout = (next: FolderLayout) => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, layout: next },
    });
  };

  /** 切换面板置顶（持久化到配置） */
  const toggleAlwaysOnTop = () => {
    void updateConfig({
      ...config,
      folder: { ...config.folder, always_on_top: !alwaysOnTop },
    });
  };

  /** 固定区拖拽排序 */
  const handleReorderDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const ids = pinned.map((f) => f.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, draggingId);
    void reorder(ids);
    setDraggingId(null);
    setDragOverId(null);
  };

  /** 在指定终端中打开（wt / cmd / powershell） */
  const openInTerminal = (folder: FolderEntry, shell: "wt" | "cmd" | "powershell") => {
    api
      .openFolderInTerminalWith(folder.path, shell)
      .then(() => hideCurrentWindow())
      .catch((e) => toast.show(String(e), "error"));
  };

  /** 自动检测已安装的编辑器（毫秒级磁盘探测，菜单打开前刷新） */
  const refreshEditors = () => {
    api
      .detectEditors()
      .then(setEditors)
      .catch(() => setEditors([]));
  };

  /** 在指定编辑器中打开（code / qoder / qodercn / idea / webstorm）。
   *  VS Code 自动探测失败时引导用户手动选择 Code.exe，记住路径后自动重试一次。 */
  const openInEditor = async (folder: FolderEntry, editor: string) => {
    try {
      await api.openFolderInEditor(folder.path, editor);
      hideCurrentWindow();
    } catch (err) {
      const msg = String(err);
      if (editor === "code" && msg.includes("VSCodeNotFound")) {
        const exe = await withNativeDialog(() => api.pickVscodeExecutable());
        if (!exe) return;
        await api.setVscodePath(exe);
        try {
          await api.openFolderInEditor(folder.path, "code");
          hideCurrentWindow();
        } catch (e2) {
          toast.show(String(e2), "error");
        }
        return;
      }
      toast.show(msg, "error");
    }
  };

  /** 【流式】逐条串行执行 Git 命令，输出在弹窗里动态上屏——不是等全部跑完才
   *  一次性显示（add→commit→push 有顺序依赖必须串行 await；各命令在各自进程里
   *  于同一 .git 目录执行，状态互相可见）。
   *
   *  实现：Rust 侧 folder_git_run_stream 用 Channel 把每条命令的 stdout/stderr
   *  逐行实时推过来（line 事件）；前端先把所有命令建占位条目（首条 running），
   *  输出行到达即原地累积、30ms 节流合并推给独立窗口——命令还没结束时，它的
   *  输出就已经一行一行出现在弹窗里。既不再开终端（多条拼一行滚动太快只看得到
   *  末尾），也不再是面板内浮层（锁在同一 WebView 里，拖不动也挡住面板）。 */
  const execGitCommand = async (folder: FolderEntry, cmd: string) => {
    const commands = cmd
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const snap = (results: GitRunResult[], running: boolean): GitRunSnapshot => ({
      folder,
      results,
      running,
      total: commands.length,
      done: results.filter((r) => !r.running).length,
    });
    // 窗口先就位再执行：首条命令的输出要落在已经显示出来的窗口里。
    // 锚点缺失（非右键入口触发）时传 +∞，等价于"右侧优先"。
    const ready = await openGitRunWindow(
      gitAnchorRef.current ?? Number.POSITIVE_INFINITY,
    );
    if (!ready) {
      toast.show("Git 状态窗口创建失败，命令未执行", "error");
      return;
    }
    // 占位条目：所有命令先建好（首条 running），输出行逐条累积其上
    const results: GitRunResult[] = commands.map((command, i) => ({
      command,
      ok: false,
      stdout: "",
      stderr: "",
      code: null,
      running: i === 0,
    }));
    pushGitRun(snap(results, true));
    // 节流合并推送：line 事件可能高频（git 大输出），30ms 内只推一次快照
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      pushGitRun(snap(results, true));
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(flush, 30);
    };
    try {
      await api.gitRunStream(folder.path, commands, (ev) => {
        switch (ev.type) {
          case "start": {
            const r = results[ev.index];
            if (r) r.running = true;
            break;
          }
          case "line": {
            const r = results[ev.index];
            if (!r) break;
            if (ev.stream === "stdout") r.stdout += ev.text + "\n";
            else r.stderr += ev.text + "\n";
            break;
          }
          case "done": {
            const r = results[ev.index];
            if (r) {
              r.ok = ev.ok;
              r.code = ev.code;
              r.running = false;
            }
            break;
          }
          case "fail": {
            const r = results[ev.index];
            if (r) {
              r.ok = false;
              r.code = null;
              r.running = false;
              r.stderr = r.stderr ? `${r.stderr}\n${ev.message}` : ev.message;
            }
            break;
          }
          case "finished":
            break;
        }
        schedule();
      });
    } catch (e) {
      // invoke 整体失败（如文件夹已不存在）：把所有未结束的条目标失败
      for (const r of results) {
        if (r.running) {
          r.running = false;
          r.stderr = String(e);
        }
      }
    }
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    pushGitRun(snap(results, false));
  };

  const menuItems = (folder: FolderEntry): MenuItem[] => [
    {
      label: "打开",
      icon: <IconExternal size={14} />,
      onClick: () => void openFolderItem(folder),
    },
    {
      label: "在终端中打开",
      icon: <IconTerminal size={14} />,
      dividerAfter: true,
      children: [
        {
          label: "Windows Terminal",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "wt"),
        },
        {
          label: "命令提示符 (cmd)",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "cmd"),
        },
        {
          label: "PowerShell",
          icon: <IconTerminal size={13} />,
          onClick: () => openInTerminal(folder, "powershell"),
        },
      ],
    },
    {
      label: "用编辑器打开",
      icon: <IconCode size={14} />,
      children: (editors ?? []).length
        ? editors!.map((e) => ({
            label: e.label,
            icon: <IconCode size={13} />,
            onClick: () => openInEditor(folder, e.key),
          }))
        : [
            {
              label: editors === null ? "正在检测…" : "未检测到已安装的编辑器",
              icon: <IconCode size={13} />,
              onClick: () => refreshEditors(),
            },
          ],
    },
    ...(branches[folder.id]
      ? [
          {
            label: `Git 命令（${branches[folder.id]}）`,
            icon: <IconBranch size={14} />,
            children: GIT_COMMANDS.map(({ label, cmd }) => ({
              label,
              icon: <IconBranch size={13} />,
              onClick: () => void execGitCommand(folder, cmd),
            })),
          },
        ]
      : []),
    {
      label: "复制路径",
      icon: <IconCopy size={14} />,
      onClick: () => {
        api.copyFolderPath(folder.path).catch((e) => toast.show(String(e), "error"));
      },
    },
    {
      label: "设置颜色",
      icon: <IconPalette size={14} />,
      children: [
        {
          label: "无颜色",
          icon: <span className="menu-color-dot menu-color-none" />,
          onClick: () => void setColor(folder.id, null),
        },
        ...FOLDER_COLORS.map((c) => ({
          label: c.name,
          icon: <span className="menu-color-dot" style={{ background: c.value }} />,
          onClick: () => void setColor(folder.id, c.value),
        })),
      ],
    },
    {
      label: folder.pinned ? "取消固定" : "固定",
      icon: <IconPin size={14} />,
      onClick: () => void togglePin(folder.id),
    },
    {
      label: "置顶到最前",
      icon: <IconArrowUp size={14} />,
      onClick: () => void moveToTop(folder.id),
      dividerAfter: true,
    },
    {
      label: "删除",
      icon: <IconTrash size={14} />,
      danger: true,
      onClick: () => setDeleteTarget(folder),
    },
  ];

  const renderCard = (folder: FolderEntry, sortable: boolean) => (
    <FolderCard
      key={folder.id}
      folder={folder}
      layout={layout}
      showCount={showCount}
      terminalShell={config.folder.terminal_shell}
      branch={branches[folder.id]}
      draggable={sortable}
      dragging={draggingId === folder.id}
      dragOver={dragOverId === folder.id}
      onOpen={() => void openFolderItem(folder)}
      onOpenTerminal={() =>
        openInTerminal(folder, config.folder.terminal_shell)
      }
      onContextMenu={(e) => {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        gitAnchorRef.current = r.left + r.width / 2;
        refreshEditors();
        setMenu({ x: e.clientX, y: e.clientY, folder });
      }}
      onDragStart={() => setDraggingId(folder.id)}
      onDragOver={(e) => {
        if (draggingId && draggingId !== folder.id) {
          e.preventDefault();
          setDragOverId(folder.id);
        }
      }}
      onDrop={() => handleReorderDrop(folder.id)}
      onDragEnd={() => {
        setDraggingId(null);
        setDragOverId(null);
      }}
    />
  );

  const renderZone = (
    title: string,
    items: FolderEntry[],
    page: number,
    pages: number,
    onPage: (p: number) => void,
    sortable: boolean,
    emptyHint: string
  ) => (
    <section className="folder-zone">
      <div className="zone-header">
        <div className="section-label">{title}</div>
        <ZonePager page={page} pages={pages} onPage={onPage} />
      </div>
      <div className="zone-content">
        {items.length === 0 ? (
          <div className="zone-empty">{emptyHint}</div>
        ) : layout === "tree" ? (
          <div className="folder-tree">
            {buildTree(items).map((g) => (
              <div className="tree-group" key={g.parent}>
                <div className="tree-group-head" title={g.parent}>
                  <IconFolder size={13} />
                  <span className="tree-group-name">{g.parent}</span>
                </div>
                {g.items.map((f) => (
                  <div
                    className="tree-row"
                    key={f.id}
                    title={f.path}
                    onClick={() => void openFolderItem(f)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      gitAnchorRef.current = r.left + r.width / 2;
                      refreshEditors();
                      setMenu({ x: e.clientX, y: e.clientY, folder: f });
                    }}
                  >
                    <span
                      className="tree-dot"
                      style={{ background: f.color ?? "var(--accent)" }}
                    />
                    <span className="tree-name">{relPathOf(f.path, g.parent)}</span>
                    {branches[f.id] && (
                      <span className="badge git-branch">
                        <IconBranch size={10} />
                        {branches[f.id]}
                      </span>
                    )}
                    {showCount && f.visit_count > 0 && (
                      <span className="badge folder-count">{f.visit_count} 次</span>
                    )}
                    <button
                      className="icon-btn tree-term-btn"
                      title={`在${terminalLabel}中打开`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openInTerminal(f, config.folder.terminal_shell);
                      }}
                    >
                      <IconTerminal size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={layout === "grid" ? "folder-grid" : "folder-list"}>
            {items.map((f) => renderCard(f, sortable))}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="panel">
      <div className="panel-shell" style={{ position: "relative" }}>
        {externalDrag && <div className="folder-drop-hint">松开以添加文件夹</div>}

        <div className="panel-header" data-tauri-drag-region>
          <div className="panel-search" data-tauri-drag-region>
            <span className="search-icon">
              <IconSearch size={15} />
            </span>
            <input
              ref={inputRef}
              value={query}
              placeholder="搜索文件夹…"
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          <button className="icon-btn" title="添加文件夹" onClick={() => void handleAdd()}>
            <IconFolderPlus size={16} />
          </button>
          <div className="layout-switcher">
            <button
              className={`icon-btn ${layout === "grid" ? "active" : ""}`}
              title="网格视图"
              onClick={() => setLayout("grid")}
            >
              <IconGrid size={16} />
            </button>
            <button
              className={`icon-btn ${layout === "list" ? "active" : ""}`}
              title="列表视图"
              onClick={() => setLayout("list")}
            >
              <IconList size={16} />
            </button>
            <button
              className={`icon-btn ${layout === "tree" ? "active" : ""}`}
              title="目录树视图"
              onClick={() => setLayout("tree")}
            >
              <IconTree size={16} />
            </button>
          </div>
          <button
            className={`icon-btn ${alwaysOnTop ? "active" : ""}`}
            title={alwaysOnTop ? "取消面板置顶" : "面板置顶显示"}
            onClick={toggleAlwaysOnTop}
          >
            <IconPin size={16} filled={alwaysOnTop} />
          </button>
          <button className="icon-btn" title="关闭（Esc）" onClick={() => hideCurrentWindow()}>
            <IconClose size={16} />
          </button>
        </div>

        <div className="panel-body">
          {!loaded && <EmptyState icon={<Spinner size="lg" />} title="加载中…" />}
          {loaded && folders.length === 0 && (
            <EmptyState
              icon="📁"
              title="从资源管理器拖拽文件夹到此处"
              description="或点击右上角 + 添加"
            />
          )}
          {loaded && folders.length > 0 && filtered.length === 0 && (
            <EmptyState title="没有匹配的文件夹" />
          )}

          {loaded && filtered.length > 0 && (
            <div className={`folder-zones ${split === "rows" ? "rows" : "columns"}`}>
              {renderZone(
                "固定",
                pinnedView,
                safePinnedPage,
                pinnedPages,
                setPinnedPage,
                true,
                "暂无固定文件夹"
              )}
              {renderZone(
                "最常访问",
                frequentView,
                safeFrequentPage,
                frequentPages,
                setFrequentPage,
                false,
                "暂无访问记录"
              )}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <span>{folders.length} 个文件夹 · 单击打开 · 右键更多操作</span>
          <span>
            <span className="kbd">Esc</span> 关闭
          </span>
        </div>

        {menu && (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menuItems(menu.folder)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>

      {/* 删除二次确认（替代直接删除，防误触） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await remove(deleteTarget.id);
        }}
        title={`删除「${deleteTarget?.name ?? ""}」？`}
        message="仅从面板移除，不会删除磁盘上的文件夹。"
        danger
        confirmLabel="删除"
      />
    </div>
  );
}
