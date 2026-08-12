/** 渲染错误兜底边界。
 * 设置窗口 hide/show 复用同一个 WebView，若渲染期间抛异常，React 会卸载整棵组件树
 * 导致白屏，且后续 show 也不会自动恢复（表现为"设置打不开、以后都打不开"）。
 * 捕获渲染错误后展示提示并自动刷新页面自愈。 */
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_DELAY_MS = 2500;

export class SettingsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  private timer: number | null = null;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("设置页面渲染出错:", error);
  }

  componentDidMount() {
    if (this.state.hasError) {
      this.scheduleReload();
    }
  }

  componentDidUpdate() {
    if (this.state.hasError && this.timer === null) {
      this.scheduleReload();
    }
  }

  componentWillUnmount() {
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private scheduleReload = () => {
    this.timer = window.setTimeout(() => {
      window.location.reload();
    }, RELOAD_DELAY_MS);
  };

  private reloadNow = () => {
    if (this.timer !== null) window.clearTimeout(this.timer);
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "var(--bg, #1e1e1e)",
          color: "var(--text, #eee)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div>设置页面渲染出错，正在自动重新加载…</div>
        <button
          onClick={this.reloadNow}
          style={{
            padding: "6px 18px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent, #4285f4)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          立即重新加载
        </button>
      </div>
    );
  }
}
