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
  submitFeedback,
} from "../core/tauri";
import { IconClose } from "../components/icons";

/** 字节数人性化显示（KB/MB） */
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function UpdateSection() {
  const { status, newVersion, notes, downloaded, total, error, manualCheck, downloadAndInstall } =
    useUpdaterStore();

  const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

  return (
    <SettingGroup>
      <SettingRow
        title="软件更新"
        desc={
          status === "available"
            ? `发现新版本 v${newVersion}`
            : status === "downloading"
              ? "正在下载更新…"
              : status === "installing"
                ? "下载完成，即将重启安装…"
                : status === "latest"
                  ? "已是最新版本"
                  : status === "error"
                    ? "检查更新失败：服务器可能未就绪或网络不可用"
                    : "启动时自动检查，也可手动检查"
        }
      >
        {/* 下载中/安装中：进度条替代按钮；其余状态给检查或安装按钮 */}
        {status === "downloading" || status === "installing" ? (
          <div className="update-progress">
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: total > 0 ? `${pct}%` : "100%" }}
              />
            </div>
            <span className="update-progress-text">
              {status === "installing"
                ? "安装中…"
                : total > 0
                  ? `${pct}% · ${fmtBytes(downloaded)} / ${fmtBytes(total)}`
                  : fmtBytes(downloaded)}
            </span>
          </div>
        ) : status === "available" ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void downloadAndInstall()}
          >
            下载并安装
          </button>
        ) : status === "checking" ? (
          <button className="btn btn-sm" disabled>
            <Spinner size="sm" />
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => void manualCheck()}>
            检查更新
          </button>
        )}
      </SettingRow>

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
        setDeviceId(p.deviceId);
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
      setShot({ path: selected, dataUrl: preview.dataUrl, size: preview.size });
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

      <SettingGroup>
        <div className="about-hero">
          <div className="about-logo">⚡</div>
          <h3>小心工具箱</h3>
          <div className="about-version">版本 v{version}</div>
        </div>
      </SettingGroup>

      <UpdateSection />
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
