/** 关于页：品牌信息、版本、自动更新与问题反馈 */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { SettingGroup, SettingRow, Segmented } from "./components";
import { useUpdaterStore } from "../core/updater";
import { Spinner } from "../components/Spinner";
import {
  feedbackProfile,
  feedbackReadImage,
  feedbackSaveContact,
  feedbackListReplies,
  feedbackPollRepliesNow,
  feedbackMarkRepliesRead,
  submitFeedback,
  type FeedbackReply,
} from "../core/tauri";
import { EVT_FEEDBACK_REPLIES, onEvent } from "../core/events";
import { IconClose, IconRefresh } from "../components/icons";

/** 字节数人性化显示（KB/MB） */
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function UpdateSection({ version }: { version: string }) {
  const {
    status,
    newVersion,
    notes,
    downloaded,
    total,
    savedPath,
    error,
    manualCheck,
    download,
    installSaved,
    postpone,
  } = useUpdaterStore();

  const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

  return (
    <SettingGroup>
      <SettingRow
        title="软件更新"
        desc={
          status === "available"
            ? `发现新版本 v${newVersion}（当前 v${version}）`
            : status === "downloading"
              ? `正在下载 v${newVersion}…`
              : status === "downloaded"
                ? `v${newVersion} 已下载完成，是否立即安装？`
                : status === "saved"
                  ? `v${newVersion} 安装包已保存，可随时安装`
                  : status === "installing"
                    ? "正在安装，应用即将重启…"
                    : status === "latest"
                      ? `已是最新版本 v${version}`
                      : status === "error"
                        ? "检查更新失败：服务器可能未就绪或网络不可用"
                        : `当前版本 v${version}，启动时自动检查，也可手动检查`
        }
      >
        {/* 下载中：进度条；已下载/已保存：立即/稍后；其余按状态给动作按钮 */}
        {status === "downloading" ? (
          <div className="update-progress">
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: total > 0 ? `${pct}%` : "100%" }}
              />
            </div>
            <span className="update-progress-text">
              {total > 0
                ? `${pct}% · ${fmtBytes(downloaded)} / ${fmtBytes(total)}`
                : fmtBytes(downloaded)}
            </span>
          </div>
        ) : status === "downloaded" ? (
          <div className="update-actions">
            <button className="btn btn-primary btn-sm" onClick={() => void installSaved()}>
              立即安装
            </button>
            <button className="btn btn-sm" onClick={postpone}>
              稍后
            </button>
          </div>
        ) : status === "available" ? (
          <button className="btn btn-primary btn-sm" onClick={() => void download()}>
            下载更新
          </button>
        ) : status === "saved" ? (
          <button className="btn btn-primary btn-sm" onClick={() => void installSaved()}>
            立即安装
          </button>
        ) : status === "checking" ? (
          <button className="btn btn-sm" disabled>
            <Spinner size="sm" />
          </button>
        ) : status === "installing" ? (
          <button className="btn btn-sm" disabled>
            <Spinner size="sm" />
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => void manualCheck()}>
            检查更新
          </button>
        )}
      </SettingRow>

      {/* 已下载安装包的落盘位置（downloaded/saved 都展示，方便用户日后找到文件） */}
      {(status === "downloaded" || status === "saved") && savedPath && (
        <div className="update-saved-path">
          {status === "downloaded"
            ? `安装包已保存至：${savedPath}（选择"稍后"可随时双击该文件安装）`
            : `安装包已保存至：${savedPath}。随时可双击该文件安装；安装过程会自动处理正在运行的应用。`}
        </div>
      )}

      {/* 新版说明 + 错误详情：占整行的次级信息 */}
      {status === "available" && notes && (
        <div className="update-notes">
          <div className="update-notes-title">更新内容（v{newVersion}）</div>
          <pre className="update-notes-body">{notes}</pre>
        </div>
      )}
      {status === "error" && error && <div className="update-error-detail">{error}</div>}
    </SettingGroup>
  );
}

/* ==== 开发者回复 ==== */

/** 服务器时间串截短展示："2026-09-04T15:30:00.000Z" → "2026-09-04 15:30" */
function fmtReplyTime(s: string): string {
  return s ? s.slice(0, 19).replace("T", " ") : "";
}

function RepliesSection() {
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState(false);

  useEffect(() => {
    let disposed = false;
    const cleanup: Array<() => void> = [];
    const load = () => {
      feedbackListReplies()
        .then((s) => {
          if (!disposed) setReplies(s.replies);
        })
        .catch(() => {});
    };
    load();
    // 打开关于页即全部标记已读（侧栏红点熄灭），标记后再拉一次保证列表最新
    feedbackMarkRepliesRead()
      .then(load)
      .catch(load);
    // 用户正停在关于页时轮询到新回复：实时刷新列表
    onEvent<number>(EVT_FEEDBACK_REPLIES, load).then((un) =>
      disposed ? un() : cleanup.push(un)
    );
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, []);

  /** 手动拉取一次（不等 7 分钟轮询）：拉完直接以返回值刷新列表 */
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshErr(false);
    try {
      const s = await feedbackPollRepliesNow();
      setReplies(s.replies);
    } catch {
      setRefreshErr(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingGroup>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">开发者回复</div>
          <div className="setting-desc">
            {refreshErr
              ? "刷新失败：服务器可能未就绪或网络不可用"
              : replies.length === 0
                ? "暂无回复；你提交的反馈有新进展时会在这里展示（也会以系统通知提醒）"
                : "你提交的反馈有新的处理进展（回复也会以系统通知提醒）"}
          </div>
        </div>
        <button
          className="icon-btn"
          title="立即检查新回复"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? <Spinner size="sm" /> : <IconRefresh size={14} />}
        </button>
      </div>
      {replies.length > 0 && (
        <div className="feedback-replies">
          {replies.map((r) => (
            <div key={r.id} className="feedback-reply-item">
              <div className="feedback-reply-msg">{r.message}</div>
              {r.created_at && (
                <div className="feedback-reply-time">{fmtReplyTime(r.created_at)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingGroup>
  );
}

/* ==== 问题反馈 ==== */

type FeedbackCategory = "bug" | "suggestion" | "other";
type SubmitState = "idle" | "sending" | "success" | "error";

/** 已选截图（路径 + 预览 data URL） */
interface PickedShot {
  path: string;
  dataUrl: string;
  size: number;
}

function FeedbackSection() {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [shot, setShot] = useState<PickedShot | null>(null);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  // 初始化：设备码展示 + 姓名/联系方式预填（上次提交记住的）
  useEffect(() => {
    feedbackProfile()
      .then((p) => {
        setDeviceId(p.device_id);
        setName(p.name);
        setContact(p.contact);
      })
      .catch(() => {});
  }, []);

  const pickScreenshot = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "选择截图（PNG/JPG/BMP/GIF/WEBP，8MB 以内）",
      filters: [
        { name: "图片", extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp"] },
      ],
    });
    if (typeof selected !== "string") return;
    try {
      const preview = await feedbackReadImage(selected);
      setShot({ path: selected, dataUrl: preview.data_url, size: preview.size });
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  const submit = async () => {
    if (!text.trim()) {
      setError("请填写问题描述");
      setState("error");
      return;
    }
    setState("sending");
    setError("");
    try {
      await submitFeedback(category, text, name, contact, shot?.path ?? null);
      // 记住联系人（下次自动带出），失败不打扰
      void feedbackSaveContact(name, contact).catch(() => {});
      setState("success");
      setText("");
      setShot(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setState("error");
    }
  };

  return (
    <SettingGroup>
      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-title">问题反馈</div>
          <div className="setting-desc">
            使用中遇到 BUG 或有功能建议，欢迎告诉我们；问题修复后会通过应用内消息通知你。
          </div>
        </div>
      </div>

      <div className="feedback-form">
        {/* 反馈类型 + 描述 */}
        <Segmented
          value={category}
          onChange={(v) => setCategory(v)}
          options={[
            { value: "bug", label: "BUG 反馈" },
            { value: "suggestion", label: "功能建议" },
            { value: "other", label: "其他" },
          ]}
        />
        <textarea
          className="feedback-textarea"
          placeholder="请描述遇到的问题（做了什么操作、期望什么结果、实际发生了什么）…"
          value={text}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            if (state !== "sending") setState("idle");
          }}
        />

        {/* 截图：选择 → 缩略预览 → 可移除 */}
        {shot ? (
          <div className="feedback-shot">
            <img src={shot.dataUrl} alt="反馈截图预览" className="feedback-shot-img" />
            <div className="feedback-shot-meta">
              <span>{fmtBytes(shot.size)}</span>
              <button className="icon-btn" title="移除截图" onClick={() => setShot(null)}>
                <IconClose size={13} />
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-sm feedback-shot-btn" onClick={() => void pickScreenshot()}>
            + 附截图（可选）
          </button>
        )}

        {/* 可选个人信息：预填记忆 */}
        <div className="feedback-contact">
          <input
            className="feedback-input"
            placeholder="怎么称呼你（可选）"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="feedback-input"
            placeholder="联系方式：QQ / 邮箱（可选）"
            value={contact}
            maxLength={100}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>

        {/* 提交行：按钮 + 结果反馈 */}
        <div className="feedback-submit">
          <button
            className="btn btn-primary btn-sm"
            disabled={state === "sending" || !text.trim()}
            onClick={() => void submit()}
          >
            {state === "sending" ? <Spinner size="sm" /> : "提交反馈"}
          </button>
          {state === "success" && <span className="feedback-ok">已提交，感谢反馈！</span>}
          {state === "error" && error && <span className="feedback-err">{error}</span>}
        </div>

        {/* 匿名设备码：告知标识用途，用户可引用它来追问进度 */}
        <div className="feedback-device-id">
          本机反馈标识：{deviceId ? deviceId.slice(0, 8) : "…"}（匿名设备码，仅用于问题修复后通知你）
        </div>
      </div>
    </SettingGroup>
  );
}

export function AboutPage() {
  const [version, setVersion] = useState("1.0.0");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch((err) => console.error("读取版本号失败", err));
  }, []);

  return (
    <div className="settings-page">
      <h2>关于</h2>
      <p className="page-desc">小心工具箱 · Windows 桌面快捷工具集</p>

      {/* 品牌卡不放版本号：版本信息统一由下方「软件更新」卡展示，
          避免检查后出现两张"版本卡片"的重复观感 */}
      <SettingGroup>
        <div className="about-hero">
          <div className="about-logo">⚡</div>
          <h3>小心工具箱</h3>
          <div className="about-tagline">Windows 桌面快捷工具集</div>
        </div>
      </SettingGroup>

      <UpdateSection version={version} />
      <RepliesSection />
      <FeedbackSection />

      <SettingGroup>
        <SettingRow title="剪贴板管理" desc="历史记录、收藏置顶、四种粘贴模式" />
        <SettingRow title="文件夹快捷访问" desc="智能排序、固定拖拽、一键终端打开" />
        <SettingRow title="全局快捷键" desc="冲突检测，随时呼出悬浮面板" />
        <SettingRow title="技术栈" desc="Tauri 2 · React 18 · TypeScript · Zustand" />
      </SettingGroup>

      <div className="shortcut-hint">
        适用于 Windows 10 1809+ / Windows 11
      </div>
    </div>
  );
}
