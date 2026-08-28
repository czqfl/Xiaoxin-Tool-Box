/** 命令面板内联计算：表达式求值 + 进制/存储/温度换算。
 *  手写递归下降解析器（不用 eval / new Function：任意输入进 eval 是注入面，
 *  且 JS 会把 "1e3" 之类形态悄悄改写）。纯函数，无依赖。 */

/** 一行工具结果：label = 主标题（结果本体），value = 要复制的文本，hint = 副标题 */
export interface ToolResult {
  label: string;
  value: string;
  hint?: string;
}

/** 全角标点归一：中文输入法下打出的 （） ％ ＋ 等直接可用 */
function normalize(input: string): string {
  return input
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[＋]/g, "+")
    .replace(/[－]/g, "-")
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[＝]/g, "=")
    .replace(/[，]/g, ",")
    .replace(/[．]/g, ".")
    .replace(/[％]/g, "%")
    .replace(/[＿]/g, "_")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

type Token =
  | { t: "num"; v: number }
  | { t: "ident"; v: string }
  | { t: "op"; v: string };

const FUNCTIONS = new Set([
  "abs", "sqrt", "cbrt", "round", "floor", "ceil", "sign",
  "pow", "min", "max", "log", "log2", "log10", "exp",
  "sin", "cos", "tan",
]);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

/** 词法：数字后缀 `8%`（后不接数字/小数点）视作百分数即 0.08，
 *  `10%3`、`10 % 3` 视作取模运算符。 */
function tokenize(src: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      // 科学计数法 1e3 / 2.5e-4
      if (j < src.length && /[eE]/.test(src[j])) {
        let k = j + 1;
        if (k < src.length && /[+-]/.test(src[k])) k++;
        if (k < src.length && /[0-9]/.test(src[k])) {
          while (k < src.length && /[0-9._]/.test(src[k])) k++;
          j = k;
        }
      }
      const raw = src.slice(i, j).replace(/_/g, "");
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      i = j;
      // 紧邻的 % 且后面不再接数字 → 百分数
      if (i < src.length && src[i] === "%" && !/[0-9.]/.test(src[i + 1] ?? "")) {
        i++;
        out.push({ t: "num", v: v / 100 });
      } else {
        out.push({ t: "num", v });
      }
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: "ident", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/%^(),!".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    return null; // 未知字符（中文等）→ 不是算式
  }
  return out;
}

/** 阶乘：仅非负整数，>170 溢出为 Infinity 由上层判错 */
function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  let acc = 1;
  for (let k = 2; k <= n; k++) acc *= k;
  return acc;
}

/** 递归下降求值；出错（语法不通、未知函数、非有限值）返回 NaN */
function parseExpr(tokens: Token[]): number {
  let pos = 0;
  const peek = () => tokens[pos];
  const eatOp = (...ops: string[]) => {
    const t = tokens[pos];
    if (t && t.t === "op" && ops.includes(t.v)) {
      pos++;
      return t.v;
    }
    return null;
  };
  const expect = (op: string): boolean => {
    const t = peek();
    if (t && t.t === "op" && t.v === op) {
      pos++;
      return true;
    }
    return false;
  };

  function callArgs(): number[] | null {
    if (!expect("(")) return null;
    const args: number[] = [];
    if (eatOp(")")) return args;
    for (;;) {
      const v = additive();
      if (!Number.isFinite(v)) return null;
      args.push(v);
      if (eatOp(",")) continue;
      if (expect(")")) return args;
      return null;
    }
  }

  function primary(): number {
    const t = peek();
    if (!t) return NaN;
    if (t.t === "num") {
      pos++;
      return t.v;
    }
    if (t.t === "ident") {
      pos++;
      if (t.v in CONSTANTS) return CONSTANTS[t.v];
      if (FUNCTIONS.has(t.v)) {
        const args = callArgs();
        if (!args) return NaN;
        switch (t.v) {
          case "abs": return Math.abs(args[0]);
          case "sqrt": return Math.sqrt(args[0]);
          case "cbrt": return Math.cbrt(args[0]);
          case "round": return args.length > 1 ? Number(args[0].toFixed(Math.trunc(args[1]))) : Math.round(args[0]);
          case "floor": return Math.floor(args[0]);
          case "ceil": return Math.ceil(args[0]);
          case "sign": return Math.sign(args[0]);
          case "pow": return Math.pow(args[0], args[1]);
          case "min": return Math.min(...args);
          case "max": return Math.max(...args);
          case "log": return Math.log(args[0]);
          case "log2": return Math.log2(args[0]);
          case "log10": return Math.log10(args[0]);
          case "exp": return Math.exp(args[0]);
          case "sin": return Math.sin(args[0]);
          case "cos": return Math.cos(args[0]);
          case "tan": return Math.tan(args[0]);
          default: return NaN;
        }
      }
      return NaN;
    }
    if (t.t === "op" && t.v === "(") {
      pos++;
      const v = additive();
      if (!expect(")")) return NaN;
      return v;
    }
    return NaN;
  }

  /** 后缀阶乘（5! = 120）挂在最小单元上 */
  function postfix(): number {
    let v = primary();
    while (eatOp("!")) v = factorial(v);
    return v;
  }

  function unary(): number {
    const op = eatOp("+", "-");
    if (op === "-") return -unary();
    if (op === "+") return unary();
    return postfix();
  }

  function power(): number {
    const base = unary();
    return eatOp("^") ? Math.pow(base, power()) : base;
  }

  function multiplicative(): number {
    let v = power();
    for (;;) {
      const op = eatOp("*", "/", "%");
      if (!op) {
        // 隐式乘法：3(4)、2pi 这类只在下一个单元以数字/左括号/标识符开头时成立
        const t = peek();
        if (t && (t.t === "num" || (t.t === "op" && t.v === "(") || t.t === "ident")) {
          const rhs = power();
          if (!Number.isFinite(rhs)) return NaN;
          v *= rhs;
          continue;
        }
        return v;
      }
      const rhs = power();
      if (!Number.isFinite(rhs)) return NaN;
      if (op === "*") v *= rhs;
      else if (op === "/") v /= rhs;
      else v %= rhs;
    }
  }

  function additive(): number {
    let v = multiplicative();
    for (;;) {
      const op = eatOp("+", "-");
      if (!op) return v;
      const rhs = multiplicative();
      if (!Number.isFinite(rhs)) return NaN;
      v = op === "+" ? v + rhs : v - rhs;
    }
  }

  const v = additive();
  if (pos !== tokens.length) return NaN;
  return v;
}

/** 数字显示：修剪浮点尾噪（0.1+0.2），整数加千分位 */
export function formatNumber(n: number, grouped = false): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.abs(n) < 1e15 ? Number(n.toPrecision(12)) : n;
  const plain = Object.is(rounded, -0) ? "0" : String(rounded);
  if (!grouped || !/^-?\d+$/.test(plain)) return plain;
  const [int, sign] = plain.startsWith("-") ? [plain.slice(1), "-"] : [plain, ""];
  return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 求值一条算式；非算式或语法不通返回 null */
export function tryMath(input: string): ToolResult | null {
  const src = normalize(input).trim();
  if (!/\d/.test(src) || /[><=]/.test(src)) return null;
  const tokens = tokenize(src);
  if (!tokens || !tokens.some((t) => t.t !== "num")) return null;
  // 纯数字串（"2" / "1755000000"）不是算式：交给进制与时间戳处理；
  // 但 "8%" 这类整体以百分号结尾的单值放行（词法已折成 0.08）
  if (tokens.length < 2 && !/%$/.test(src)) return null;
  const value = parseExpr(tokens);
  if (!Number.isFinite(value)) return null;
  const plain = formatNumber(value);
  return {
    label: formatNumber(value, true),
    value: plain,
    hint: `${src} =`,
  };
}

/* ---------------- 进制 ---------------- */

/** `0x1f` / `0b1010` / `hex ff` / `255->hex` → 四种进制表示（箭头右左仅决定行序） */
export function tryRadix(input: string): ToolResult[] | null {
  const src = normalize(input).trim().toLowerCase().replace(/\s+/g, " ");
  let value: number | null = null;
  let first: "hex" | "dec" | "bin" | "oct" = "hex";

  const pref = /^0(x[0-9a-f]+|b[01]+|o[0-7]+)$/.exec(src);
  if (pref) {
    const kind = pref[1][0];
    value = parseInt(pref[1].slice(1), kind === "x" ? 16 : kind === "b" ? 2 : 8);
  } else {
    const arrow = /^(\d+)\s*(?:->|=>|→|to)\s*(bin|hex|oct|dec|b|h|o|d|x)$/.exec(src);
    const named = /^(bin|oct|dec|hex)\s+([0-9a-f]+)$/.exec(src);
    if (arrow) {
      value = parseInt(arrow[1], 10);
      first = shortBase(arrow[2]);
    } else if (named) {
      const base = named[1] === "hex" ? 16 : named[1] === "bin" ? 2 : named[1] === "oct" ? 8 : 10;
      value = parseInt(named[2], base);
      first = shortBase(named[1]);
    }
  }
  if (value === null || !Number.isInteger(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    return null;
  }
  const dec = String(value);
  const rows: Record<string, ToolResult> = {
    hex: { label: `0x${value.toString(16)}`, value: value.toString(16), hint: `${src} · 十六进制 · 十进制 ${dec}` },
    dec: { label: dec, value: dec, hint: `${src} · 十进制` },
    bin: { label: `0b${value.toString(2)}`, value: value.toString(2), hint: `${src} · 二进制` },
    oct: { label: `0o${value.toString(8)}`, value: value.toString(8), hint: `${src} · 八进制` },
  };
  const order = ["hex", "dec", "bin", "oct"].filter((k) => k !== first);
  return [rows[first], ...order.map((k) => rows[k])];
}

function shortBase(name: string): "hex" | "dec" | "bin" | "oct" {
  if (name === "hex" || name === "h" || name === "x") return "hex";
  if (name === "bin" || name === "b") return "bin";
  if (name === "oct" || name === "o") return "oct";
  return "dec";
}

/* ---------------- 存储单位 ---------------- */

type UnitScale = { unit: string; bytes: number };

const DEC_UNITS: UnitScale[] = [
  { unit: "B", bytes: 1 },
  { unit: "KB", bytes: 1e3 },
  { unit: "MB", bytes: 1e6 },
  { unit: "GB", bytes: 1e9 },
  { unit: "TB", bytes: 1e12 },
  { unit: "PB", bytes: 1e15 },
];
const BIN_UNITS: UnitScale[] = [
  { unit: "KiB", bytes: 1024 ** 1 },
  { unit: "MiB", bytes: 1024 ** 2 },
  { unit: "GiB", bytes: 1024 ** 3 },
  { unit: "TiB", bytes: 1024 ** 4 },
  { unit: "PiB", bytes: 1024 ** 5 },
];

/** 选一个数量级最合适的单位展示（>=1 且最小）；与输入单位撞车时换档，
 *  优先升一档（0.5 GB 比 512,000 KB 好读），升上去不足 0.01 则退到降一档 */
function pickUnit(bytes: number, units: UnitScale[], avoid?: string): UnitScale | null {
  let idx = 0;
  units.forEach((u, i) => {
    if (bytes / u.bytes >= 1) idx = i;
  });
  if (units[idx].unit !== avoid) return units[idx];
  const up = idx + 1 < units.length ? idx + 1 : -1;
  if (up >= 0 && bytes / units[up].bytes >= 0.01) return units[up];
  return idx > 0 ? units[idx - 1] : null;
}

/** `500mb` / `1.5 GiB` / `2048 KB` → 十进制 / 二进制 / 字节三行 */
export function tryStorage(input: string): ToolResult[] | null {
  const src = normalize(input).trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*(kib|mib|gib|tib|pib|kb|mb|gb|tb|pb|b)\b$/.exec(src);
  if (!m) return null;
  const n = Number(m[1]);
  const suffix = m[2];
  const table = suffix.endsWith("ib") ? BIN_UNITS : DEC_UNITS;
  const unit = table.find((u) => u.unit.toLowerCase() === suffix);
  if (!unit) return null;
  const bytes = n * unit.bytes;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const src0 = input.trim();
  const out: ToolResult[] = [];
  for (const chain of [
    { units: DEC_UNITS, label: "十进制" },
    { units: BIN_UNITS, label: "二进制" },
  ]) {
    const u = pickUnit(bytes, chain.units, unit.unit);
    if (!u) continue;
    out.push({
      label: `${formatNumber(bytes / u.bytes, true)} ${u.unit}`,
      value: `${formatNumber(bytes / u.bytes)}${u.unit}`,
      hint: `${src0} · ${chain.label}`,
    });
  }
  if (unit.unit !== "B") {
    out.push({
      label: `${formatNumber(bytes, true)} B`,
      value: String(Math.round(bytes)),
      hint: `${src0} · 字节`,
    });
  }
  return out.length ? out : null;
}

/* ---------------- 温度 ---------------- */

/** `32f` / `32f->c` / `100摄氏度` → 其余两种温标 */
export function tryTemperature(input: string): ToolResult[] | null {
  const src = normalize(input)
    .trim()
    .toLowerCase()
    .replace(/[°º]/g, "")
    .replace(/(摄氏度|华氏度|绝对温度|开尔文)/g, (s) =>
      s === "华氏度" ? "f" : s === "摄氏度" ? "c" : "k"
    )
    // 目标温标可不写：一律一次给出其余两种
    .replace(/(\s*(->|=>|→|to)\s*[cfk]\s*)$/g, "")
    .replace(/\s+/g, "");
  const m = /^(-?\d+(?:\.\d+)?)(c|f|k)$/.exec(src);
  if (!m) return null;
  const n = Number(m[1]);
  const from = m[2];
  const celsius = from === "c" ? n : from === "f" ? ((n - 32) * 5) / 9 : n - 273.15;
  const rows: Array<[string, number]> = [
    ["c", celsius],
    ["f", (celsius * 9) / 5 + 32],
    ["k", celsius + 273.15],
  ];
  const src0 = input.trim();
  const out = rows
    .filter(([u]) => u !== from)
    .filter(([, v]) => Number.isFinite(v))
    .map<ToolResult>(([u, v]) => ({
      label: `${formatNumber(v)} °${u.toUpperCase()}`,
      value: formatNumber(v),
      hint: `${src0} → ${u === "c" ? "摄氏" : u === "f" ? "华氏" : "开尔文"}`,
    }));
  return out.length ? out : null;
}
