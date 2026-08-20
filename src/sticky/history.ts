import { listNotes, deleteNote, openNoteWindow, closeWindow, startDragging, getOpenNotes, setAcrylic, newNoteId, createNoteWindow, setNotePriority } from "./api";
import { getSettings, normalizeOpacity } from "./settings";
import { applyPanelBackground } from "./panel-bg";
import { applyGlassBlur, parseColorToRgbInt } from "./glass";
import type { NoteMeta, Settings } from "./types";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function mountHistoryApp() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="history-window">
      <div class="titlebar">
        <div class="titlebar-left">
          <span class="dot">\u25cf</span>
          <span class="title-text">历史便签</span>
        </div>
        <!-- 新建便签按钮：标题栏直接子元素，absolute 居中相对整个标题栏（非右侧容器） -->
        <button class="new-note-btn" id="btn-new" title="新建便签">
          <!-- SVG 加号：颜色跟随 currentColor（可被 CSS 控制）——之前的 \u2795
               是 emoji，自带颜色，CSS color 无效（用户反馈"没变绿"的根因） -->
          <span class="btn-plus">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10"/>
            </svg>
          </span>
          <span class="btn-label">新建便签</span>
        </button>
        <div class="titlebar-right">
          <button class="icon-btn close" id="btn-close" title="关闭">\u2715</button>
        </div>
      </div>
      <div class="history-list" id="history-list"></div>
    </div>
  `;

  const listEl = document.getElementById("history-list")!;
  const titlebar = document.querySelector(".titlebar")!;
  const btnClose = document.getElementById("btn-close")!;
  const btnNew = document.getElementById("btn-new")!;

  // 新建便签：生成新 id 并打开便签窗口（与便签页"＋"按钮同逻辑）。
  // 抽成公共函数：标题栏 + 按钮与空状态居中大按钮共用。
  async function createNewNote() {
    try {
      const id = await newNoteId();
      await createNoteWindow(id);
    } catch (err) {
      console.error("新建便签失败:", err);
    }
  }
  btnNew.addEventListener("click", () => void createNewNote());

  // 套用全局外观主题（浅色 / 深色），使历史窗口与便签配色一致。
  getSettings()
    .then((s) => {
      const root = document.documentElement;
      root.classList.remove("theme-dark");
      if (s.theme === "dark" || s.theme === "transparent") root.classList.add("theme-dark");
      // 套用与便签一致的背景效果（背景图+毛玻璃 / 透明主题原生亚克力）
      void applyHistoryBg(s);
      // 骨架已同步渲染、主题类已套上，此刻再显示窗口，消除打开瞬间白/透明闪
      getCurrentWindow().show().then(() => getCurrentWindow().setFocus()).catch(() => {});
    })
    .catch((e) => {
      console.error("读取主题失败:", e);
      // 即便主题读取失败，骨架也已渲染，仍需把窗口显示出来
      getCurrentWindow().show().catch(() => {});
    });

  // 设置变更时实时同步背景（与便签窗口一致）。
  // 【修复】此前监听 "xiaoxin-sticky-note-settings-changed"（原版便签“设置”窗口
  // 在自身窗口内派发的 CustomEvent，非 Tauri 跨窗口事件）——工具箱集成版保存
  // 设置走后端 save_settings 广播的是 "settings-changed"，事件名不匹配导致
  // 历史窗口背景/主题永远不实时刷新（用户反馈“历史便签弹窗里背景不生效”）。
  listen("settings-changed", () => {
    getSettings().then((s) => void applyHistoryBg(s)).catch(() => {});
  }).catch((e) => console.error("监听设置变更失败:", e));

  // ---- 状态刷新（三重保障，绝不展示过期信息）----
  // 1) 事件：后端统一广播 sticky://state-changed（打开/关闭/新建/保存/删除）
  // 2) 聚焦：窗口每次获得焦点主动刷新
  // 3) 轮询：窗口可见期间每 500ms 兜底刷新（事件偶发丢失也被覆盖，基本无感）
  // 【修复】三路来源统一收口到 requestRender：并发去重 + 交互中延后重建，
  // 彻底消除「轮询/事件同时触发 → 整表重建竞态 → 点击被吞 → 面板像卡死」的根因。
  let renderPending = false;
  let pointerActive = false;
  const requestRender = (): void => {
    if (renderPending) return;
    renderPending = true;
    // 用 setTimeout 而非 requestAnimationFrame：窗口隐藏时 rAF 不触发，
    // 会让 renderPending 卡死、重开后不再刷新。
    window.setTimeout(() => {
      renderPending = false;
      // 指针按下未松开时延后重建：防止重建把正在点的卡片换掉（点击丢失/误触）。
      // pointerup/pointercancel 会再触发一次 requestRender，此处只是兜底。
      if (pointerActive) {
        window.setTimeout(requestRender, 60);
        return;
      }
      void render();
    }, 0);
  };
  let pollTimer: number | undefined;
  const stopPoll = () => {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };
  const startPoll = () => {
    stopPoll();
    pollTimer = window.setInterval(requestRender, 500);
  };
  // 指针交互保护：按下期间禁止重建（捕获阶段，按钮点击同样生效）
  listEl.addEventListener("pointerdown", () => { pointerActive = true; }, true);
  window.addEventListener("pointerup", () => { pointerActive = false; requestRender(); }, true);
  window.addEventListener("pointercancel", () => { pointerActive = false; requestRender(); }, true);
  listen("sticky://state-changed", () => {
    // 诊断：确认历史窗口收到状态广播（若此日志缺失 → 事件未到达，需查后端 emit）
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("diag_log", { msg: "[history] state-changed received" }))
      .catch(() => {});
    requestRender();
  }).catch((e) => console.error("监听便签状态失败:", e));
  // 【修复】轮询不再随失焦停止——用户从历史打开便签后历史窗口失焦但仍可见，
  // 此前 stopPoll 导致事件偶发丢失时状态要等重新聚焦才刷新（“状态更新慢”根因）。
  // 轮询持续跑，render 内部有列表签名去重，开销极小。
  getCurrentWindow()
    .onFocusChanged(({ payload: focused }) => {
      if (focused) requestRender();
    })
    .catch((e) => console.error("监听窗口焦点失败:", e));
  startPoll(); // 窗口已可见：立即启动轮询

  // 套用与便签一致的背景效果（背景图+毛玻璃 或 透明主题原生亚克力）
  async function applyHistoryBg(s: Settings): Promise<void> {
    const root = document.querySelector(".history-window") as HTMLElement | null;
    if (!root) return;
    const transparent = s.theme === "transparent";
    if (transparent) {
      // 与便签窗口完全一致：透明主题走 DWM 原生亚克力（实时模糊背后桌面），
      // 不再退化成「静态壁纸图」——此前历史窗口为非透明窗体，只能塞一张压糊的
      // 壁纸图冒充模糊，正是用户反馈“背景是张图片而不是实时模糊”的根因。
      // 历史窗口现已 transparent(true)，WebView 默认透明，亚克力可直接透出。
      root.classList.remove("has-bg", "on-dark-bg", "glass", "transparent-clear");
      root.classList.add("bg-transparent");
      root.style.removeProperty("--note-bg-img");
      root.style.removeProperty("--note-bg-opacity");
      root.style.removeProperty("--glass-blur");
      document.documentElement.style.removeProperty("--trans-opacity");
      root.style.removeProperty("--trans-opacity");
      // 背景不透明度：<2% 完全透明（无模糊无面板）；≥2% 原生亚克力实时模糊 +
      // 主题色半透明面板（0.6 × 滑块值，上限 60%，始终透出磨砂感，不变成实心白板）。
      const o = normalizeOpacity(s.transparent_opacity);
      if (o < 2) {
        root.classList.add("transparent-clear");
        root.style.setProperty("--trans-opacity", "0");
        document.documentElement.style.setProperty("--trans-opacity", "0");
        setAcrylic(false, 0, 0).catch(() => {});
      } else {
        root.classList.remove("transparent-clear");
        const capped = Math.round(o * 0.6);
        root.style.setProperty("--trans-opacity", String(capped));
        document.documentElement.style.setProperty("--trans-opacity", String(capped));
        const tint = parseColorToRgbInt(getComputedStyle(root).getPropertyValue("--bg")) ?? 0;
        setAcrylic(true, 1, tint).catch((e) => console.error("应用实时模糊失败:", e));
      }
      applyGlassBlur({ target: root, strength: 0, enabled: false });
    } else {
      root.classList.remove("bg-transparent");
      document.documentElement.style.removeProperty("--trans-opacity");
      root.style.removeProperty("--trans-opacity");
      setAcrylic(false, 0, 0).catch(() => {});
      await applyPanelBackground(root, s);
      const hasBg = root.classList.contains("has-bg");
      const pct = s.glass_blur ?? 55;
      const enabled = s.glass_enabled !== false;
      applyGlassBlur({ target: root, strength: hasBg ? pct : 0, enabled: hasBg && enabled });
    }
  }

  // 拖拽：标题栏任意处按下拖动窗口，但图标按钮(.icon-btn)与新建便签按钮
  // (.new-note-btn) 要排除——否则原生 startDragging 会吞掉 click，导致按钮失灵。
  titlebar.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".icon-btn, .new-note-btn")) return;
    startDragging();
  });

  btnClose.addEventListener("click", () => {
    closeWindow().catch((e) => console.error("关闭失败:", e));
  });

  // 缩放：窗口为 resizable(true) + 无边框，Windows 提供隐形四边/四角拖拽
  // 热区（系统原生 resize），无需自定义手柄——上下左右均可自由调整大小。

  /** 上次渲染的列表签名：轮询/事件刷新时若无实质变化则跳过 DOM 重建，
   *  既省 IPC 后的渲染开销，也不打断用户的滚动/点击交互 */
  let lastSig = "";

  async function render() {
    // 列表 + 打开状态并行读取（两次 IPC 同时发出，比串行快近一倍）
    let items: NoteMeta[];
    let openSet = new Set<string>();
    try {
      const [notes, open] = await Promise.all([listNotes(), getOpenNotes().catch(() => [])]);
      items = notes;
      openSet = new Set(open);
    } catch (err) {
      console.error("加载列表失败:", err);
      listEl.innerHTML = `<div class="empty-state"><div class="empty-text">加载失败，请重试</div></div>`;
      return;
    }

    // 无实质变化（标题/摘要/时间/打开状态/置顶状态都一样）→ 跳过重建
    const sig = items
      .map(
        (i) =>
          `${i.id}|${i.updated}|${i.title}|${i.snippet}|${openSet.has(i.id) ? 1 : 0}|${
            i.top_priority ? 1 : 0
          }`,
      )
      .join("~");
    if (sig === lastSig) return;
    lastSig = sig;

    listEl.innerHTML = "";

    if (items.length === 0) {
      // 空状态：居中大号"新建便签"按钮（视觉重心 + 直接可点）
      listEl.innerHTML = `
        <div class="empty-state">
          <button class="new-note-cta" id="new-note-cta" title="新建便签">
            <span class="cta-icon">\u2795</span>
            <span class="cta-text">新建便签</span>
          </button>
        </div>
      `;
      document.getElementById("new-note-cta")?.addEventListener("click", () => void createNewNote());
      return;
    }

    try {
      items.forEach((item) => {
        const isOpen = openSet.has(item.id);
        const card = document.createElement("div");
        card.className = "history-card" + (isOpen ? " open-note" : "");
        // data-id：事件委托用（重建后仍能精确定位目标便签）
        card.dataset.id = item.id;
        const title = (item.title || "").trim();
        // 有标题：标题为主行、内容摘要为副行；无标题：直接以内容摘要为主行
        const primary = title || item.snippet;
        const secondary = title ? `<div class="card-snippet">${escapeHtml(item.snippet)}</div>` : "";
        const statusTag = isOpen ? `<div class="card-status">打开中</div>` : "";
        // 所有便签都显示删除按钮：后端 delete_note 会先向窗口发 note-deleted
        // （前端停止保存并关闭窗口），再删文件，故即使便签还开着也能安全删除、不会复活。
        const delBtnHtml = `<button class="card-delete" title="删除">\u2715</button>`;
        // 置顶优先级按钮（标准图钉图标，SVG 可被 CSS 着色）：全局唯一，快捷键优先操作
        const pinBtnHtml = `<button class="card-pin${item.top_priority ? " active" : ""}" title="${
          item.top_priority ? "已置顶（快捷键优先操作此便签）" : "设为置顶（快捷键优先操作此便签）"
        }"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></button>`;
        card.innerHTML = `
          <div class="card-info">
            <div class="card-title">${escapeHtml(primary)}</div>
            ${secondary}
            <div class="card-time">${escapeHtml(item.updatedStr)}</div>
            ${statusTag}
          </div>
          <div class="card-actions">
            ${pinBtnHtml}
            ${delBtnHtml}
          </div>
        `;
        listEl.appendChild(card);
      });
      // 【修复】事件委托：容器上注册一次监听，卡片无论重建多少次、何时重建，
      // 点击永远命中容器 → 不再因重建丢掉点击（“点击没反应/面板卡死”的根因之一）。
      if (!listEl.dataset.delegated) {
        listEl.dataset.delegated = "1";
        listEl.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          const card = target.closest(".history-card") as HTMLElement | null;
          if (!card || !card.dataset.id) return;
          const id = card.dataset.id;
          // 置顶按钮：设置该便签为唯一置顶（互斥，后端统一处理）
          if (target.closest(".card-pin")) {
            setNotePriority(id).catch((err) => console.error("设置置顶失败:", err));
            return;
          }
          // 删除按钮：两次点击确认（替代不可用的 confirm 弹窗；确认态存按钮自身）
          const delBtn = target.closest(".card-delete") as HTMLElement | null;
          if (delBtn) {
            if (delBtn.classList.contains("confirming")) {
              deleteNote(id)
                .then(() => requestRender())
                .catch((err) => {
                  console.error("删除失败:", err);
                  delBtn.classList.remove("confirming");
                  delBtn.textContent = "\u2715";
                });
            } else {
              delBtn.classList.add("confirming");
              delBtn.textContent = "确认?";
              window.setTimeout(() => {
                if (delBtn.isConnected) {
                  delBtn.classList.remove("confirming");
                  delBtn.textContent = "\u2715";
                }
              }, 3000);
            }
            return;
          }
          // 卡片主体 → 打开便签：无论显示状态如何，后端都会 show+聚焦+补发 summoned，
          // 保证重复点击同一条也能正确重新渲染并展示内容（见 sticky.rs open_note_window）。
          openNoteWindow(id).catch((err) => console.error("打开便签失败:", err));
        });
      }
    } catch (err) {
      console.error("渲染历史列表失败:", err);
    }
  }

  render();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
