/** 剪贴板文本智能转换：内容类型检测 + 转换执行（纯函数，无副作用） */

export interface TransformAction {
  key: string;
  label: string;
  run: (text: string) => string;
}

/** 安全 Base64 解码（UTF-8 兼容，解码失败返回 null） */
function base64Decode(text: string): string | null {
  try {
    const bin = atob(text.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Base64 编码（UTF-8 安全，分块避免大文本展开栈溢出） */
function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** 时间戳（10 位秒 / 13 位毫秒）→ 本地时间字符串；非法返回 null */
function formatTimestamp(text: string): string | null {
  const t = text.trim();
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) return null;
  const ms = t.length === 10 ? v * 1000 : v;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 安全 URL 编码：孤立代理项（半个 emoji 等脏文本）会让 encodeURIComponent 抛
 *  URIError，先检测并替换为 U+FFFD 再编码 */
function safeEncodeURIComponent(text: string): string {
  if (!/\uD800-\uDFFF/.test(text)) return encodeURIComponent(text);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // 合法代理对，原样保留
        out += text[i] + text[i + 1];
        i++;
        continue;
      }
      out += "\uFFFD";
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += text[i];
    }
  }
  return encodeURIComponent(out);
}

/** 按内容类型检测可用的转换操作（文本过长跳过，避免卡顿） */
export function detectActions(text: string | null | undefined): TransformAction[] {
  if (!text || text.length === 0 || text.length > 200_000) return [];
  const t = text.trim();
  const actions: TransformAction[] = [];

  // JSON：以 { / [ 开头且能解析 → 格式化 / 压缩
  if (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(t);
      actions.push({
        key: "json-format",
        label: "JSON 格式化",
        run: () => JSON.stringify(parsed, null, 2),
      });
      actions.push({
        key: "json-minify",
        label: "JSON 压缩",
        run: () => JSON.stringify(parsed),
      });
    } catch {
      // 不是合法 JSON，跳过
    }
  }

  // 时间戳：纯数字且能转出合法日期
  if (/^\d{10}(\d{3})?$/.test(t) && formatTimestamp(t)) {
    actions.push({
      key: "ts-date",
      label: "时间戳转日期",
      run: () => formatTimestamp(t)!,
    });
  }

  // Base64：形态像且能解出可读 UTF-8 文本 → 解码
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length >= 8 && t.length % 4 === 0) {
    const decoded = base64Decode(t);
    if (
      decoded &&
      decoded.length > 0 &&
      /^[\x20-\x7E\u4e00-\u9fff\r\n\t]*$/.test(decoded)
    ) {
      actions.push({
        key: "b64-decode",
        label: "Base64 解码",
        run: () => decoded,
      });
    }
  }
  actions.push({ key: "b64-encode", label: "Base64 编码", run: () => base64Encode(t) });

  // URL 编码文本：含 %XX → 解码；含非 ASCII → 编码
  if (/%[0-9A-Fa-f]{2}/.test(t)) {
    try {
      const decoded = decodeURIComponent(t);
      if (decoded !== t) {
        actions.push({ key: "url-decode", label: "URL 解码", run: () => decoded });
      }
    } catch {
      // 非法转义序列，忽略
    }
  }
  if (/[^\x20-\x7E]/.test(t)) {
    actions.push({
      key: "url-encode",
      label: "URL 编码",
      run: () => safeEncodeURIComponent(t),
    });
  }

  // 路径：含分隔符 → 正/反斜杠互转
  if (/[\\/]/.test(t)) {
    if (t.includes("\\")) {
      actions.push({
        key: "path-fwd",
        label: "路径转正斜杠 /",
        run: () => t.replaceAll("\\", "/"),
      });
    }
    if (t.includes("/")) {
      actions.push({
        key: "path-back",
        label: "路径转反斜杠 \\",
        run: () => t.replaceAll("/", "\\"),
      });
    }
  }

  return actions;
}
