/** 翻译设置页：仅 API 凭据等关键信息（服务商、key）。
 *  源语言/目标语言在翻译面板中直接选择（类网页版翻译布局）。 */
import { useState } from "react";
import { useConfigStore } from "../stores/configStore";
import type { TranslateProvider } from "../types";
import { translateText } from "../core/tauri";
import { SettingGroup, SettingRow, Segmented } from "./components";

export function TranslationPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);
  const t = config.translator;
  const [testText, setTestText] = useState("");
  const [testOut, setTestOut] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const patch = (p: Partial<typeof t>) => {
    void update({ ...config, translator: { ...t, ...p } });
  };

  const doTest = async () => {
    if (!testText.trim()) return;
    setTestErr(null);
    setTestOut(null);
    try {
      const r = await translateText(testText.trim());
      setTestOut(r.translation);
    } catch (err) {
      setTestErr(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="settings-page">
      <h2>翻译设置</h2>
      <p className="page-desc">
        选中文本按快捷键（默认 Ctrl+Alt+T）即译；源/目标语言在翻译面板中直接选择
      </p>

      <SettingGroup>
        <SettingRow title="翻译服务商" desc="需要先在对应开放平台申请免费 Key">
          <Segmented<TranslateProvider>
            value={t.provider}
            options={[
              { value: "youdao", label: "有道智云" },
              { value: "baidu", label: "百度翻译" },
            ]}
            onChange={(v) => patch({ provider: v })}
          />
        </SettingRow>

        {t.provider === "youdao" ? (
          <>
            <SettingRow
              title="有道 APP Key"
              desc="有道智云 AI 开放平台 → 自然语言翻译服务 → 应用管理"
            >
              <input
                className="text-input"
                type="text"
                value={t.youdao_key}
                placeholder="申请的 Key"
                onChange={(e) => patch({ youdao_key: e.target.value })}
              />
            </SettingRow>
            <SettingRow title="有道 APP Secret" desc="与 Key 配对，用于接口签名">
              <input
                className="text-input"
                type="password"
                value={t.youdao_secret}
                placeholder="申请的 Secret"
                onChange={(e) => patch({ youdao_secret: e.target.value })}
              />
            </SettingRow>
          </>
        ) : (
          <>
            <SettingRow
              title="百度 APPID"
              desc="百度翻译开放平台 → 管理控制台 → 开发者信息"
            >
              <input
                className="text-input"
                type="text"
                value={t.baidu_appid}
                placeholder="APPID"
                onChange={(e) => patch({ baidu_appid: e.target.value })}
              />
            </SettingRow>
            <SettingRow title="百度密钥" desc="与 APPID 配对，用于接口签名">
              <input
                className="text-input"
                type="password"
                value={t.baidu_secret}
                placeholder="密钥"
                onChange={(e) => patch({ baidu_secret: e.target.value })}
              />
            </SettingRow>
          </>
        )}
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="测试翻译"
          desc="填好凭据后输入文本验证是否可用（配置改动自动保存，无需手动保存）"
        >
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <input
              className="text-input"
              type="text"
              style={{ flex: 1 }}
              value={testText}
              placeholder="hello world"
              onChange={(e) => setTestText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doTest();
              }}
            />
            <button className="btn" onClick={() => void doTest()}>
              翻译
            </button>
          </div>
        </SettingRow>
        {testOut && (
          <div className="shortcut-hint ok">
            <span className="hint-icon">✓</span>
            {testOut}
          </div>
        )}
        {testErr && (
          <div className="shortcut-hint error">
            <span className="hint-icon">✕</span>
            {testErr}
          </div>
        )}
      </SettingGroup>
    </div>
  );
}
