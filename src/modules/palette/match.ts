/** 命令面板匹配打分：替代原先只有 includes() 的 hit()。
 *  多级字段择优（精确 > 前缀 > 子串 > 首字母别名 > 子序列），
 *  多词输入按 AND 语义取最弱 token（任一词完全不命中即淘汰）。
 *  无第三方依赖，纯函数。 */
import { KIND_RANK, type PaletteItem, type Scored } from "./types";
import type { PaletteStatEntry } from "../../types";

/** 单 token 对单条目取最高分（0 = 不相关） */
function tokenScore(tok: string, item: PaletteItem): number {
  const title = item.title.toLowerCase();
  if (title === tok) return 100;
  if (title.startsWith(tok)) return 90;
  if (title.includes(tok)) return 80;

  if (item.initials) {
    const inits = item.initials.split(/\s+/);
    if (inits.includes(tok)) return 75;
    if (inits.some((t) => t.startsWith(tok))) return 68;
  }
  if (item.keywords) {
    const kws = item.keywords.split(/\s+/);
    if (kws.includes(tok)) return 70;
    if (kws.some((t) => t.startsWith(tok))) return 62;
  }
  if (item.subtitle && item.subtitle.toLowerCase().includes(tok)) return 55;

  // 子序列兜底：允许跳字（"jtb" 命中 "jiantieban"、"kp" 命中 "端口" 的拼音别名）
  const ft = fuzzyScore(tok, title);
  if (ft > 0) return ft;
  const hay = [item.keywords ?? "", item.initials ?? ""].join(" ");
  if (hay) return Math.min(25, fuzzyScore(tok, hay));
  return 0;
}

/** 子序列匹配打分：连续段越长越像用户要打的词，散落越远惩罚越重 */
function fuzzyScore(tok: string, target: string): number {
  if (!tok || !target) return 0;
  let from = 0;
  let prev = -2;
  let consec = 0;
  let bestConsec = 0;
  let runs = 0;
  let gaps = 0;
  for (const c of tok) {
    const at = target.indexOf(c, from);
    if (at < 0) return 0;
    if (at === prev + 1) {
      consec++;
    } else {
      runs++;
      gaps += prev < 0 ? 0 : at - prev - 1;
      consec = 1;
    }
    bestConsec = Math.max(bestConsec, consec);
    prev = at;
    from = at + 1;
  }
  const spread = prev + 1 - tok.length;
  const raw =
    20 + bestConsec * 5 + (runs === 1 ? 6 : 0) - Math.floor(gaps / 2) - Math.floor(spread / 4);
  return Math.max(8, Math.min(40, raw));
}

/** 条目对整段输入的匹配分（0 = 不相关）。空输入一律 0，由组序/用量决定顺序 */
export function scoreItem(q: string, item: PaletteItem): number {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  let worst = Infinity;
  for (const t of tokens) {
    const s = tokenScore(t, item);
    if (s === 0) return 0;
    worst = Math.min(worst, s);
  }
  return worst;
}

/** 用量加权：高频最多 +14，24 小时内用过 +10，7 天内 +5 */
export function usageBonus(stat: PaletteStatEntry | undefined, now = Date.now()): number {
  if (!stat) return 0;
  let bonus = Math.min(14, Math.log2(1 + stat.count) * 3);
  const age = now - stat.last_used;
  if (age < 86_400_000) bonus += 10;
  else if (age < 7 * 86_400_000) bonus += 5;
  return bonus;
}

/** 统计定位符：跨会话稳定（不含会变的标题/序号） */
export function statKey(item: PaletteItem): string {
  return `${item.kind}:${item.id}`;
}

/** 排序：组优先级 → 分数 → 用量 → 同分保持各源原序（新→旧） */
export function compareScored(a: Scored, b: Scored): number {
  const rank = KIND_RANK[a.item.kind] - KIND_RANK[b.item.kind];
  if (rank !== 0) return rank;
  if (b.score !== a.score) return b.score - a.score;
  if (b.usage !== a.usage) return b.usage - a.usage;
  return 0;
}
