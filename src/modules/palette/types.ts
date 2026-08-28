/** 命令面板数据结构：条目形状与组优先级（各模块共用的类型叶子，无逻辑） */
import type { ComponentType } from "react";

type IconCmp = ComponentType<{ size?: number }>;

/** 条目来源类型：决定组优先级、排序加权与统计定位符前缀 */
export type PaletteKind =
  /** 内联工具行（算式/换算/编解码/翻译结果） */
  | "tool"
  /** 静态动作命令（打开面板、截图、换主题…） */
  | "command"
  | "snippet"
  | "clip"
  | "folder"
  | "qfile"
  | "app"
  | "credential"
  /** 兜底网页搜索行 */
  | "web";

/** 组优先级：数字越小越靠前（工具恒定置顶、网页搜索恒定置尾） */
export const KIND_RANK: Record<PaletteKind, number> = {
  tool: 0,
  command: 1,
  snippet: 2,
  clip: 3,
  folder: 4,
  qfile: 5,
  app: 6,
  credential: 7,
  web: 8,
};

export interface PaletteItem {
  /** 同类内唯一；统计定位符为 `${kind}:${id}` */
  id: string;
  kind: PaletteKind;
  title: string;
  subtitle?: string;
  /** 结果区段名：与 kind 一一对应（见 KIND_LABEL），保证排序后同段条目连续 */
  group: string;
  /** 行尾小标签：同一段内的细分门类（如命令的「面板 / 动作 / 外观」） */
  tag?: string;
  /** 额外搜索别名（英文/罗马音），空格分词 */
  keywords?: string;
  /** 拼音首字母别名（仅静态命令手工标注），空格分词 */
  initials?: string;
  icon: IconCmp;
  /** 本机应用图标（data URL），有则优先于线条图标渲染 */
  imageUrl?: string;
  /** 行尾热键徽标（取自 config.shortcuts） */
  hotkey?: string;
  /** Ctrl+Enter 要复制到剪贴板的文本（结果/路径/正文）；缺省则 Ctrl+Enter 等价 Enter */
  copy?: string;
  /** 异步工具行占位（结果未就绪） */
  loading?: boolean;
  perform: () => void | Promise<void>;
}

/** kind → 中文区段名（渲染组头） */
export const KIND_LABEL: Record<PaletteKind, string> = {
  tool: "工具",
  command: "命令",
  snippet: "语速贴",
  clip: "剪贴板",
  folder: "文件夹",
  qfile: "快速文件",
  app: "本机应用",
  credential: "账号密码",
  web: "网页搜索",
};

/** 带分数的条目（排序中间态） */
export interface Scored {
  item: PaletteItem;
  /** 匹配得分（0 表示不相关，仅靠用量/组序参与排序） */
  score: number;
  /** 用量加权（频次 + 最近使用） */
  usage: number;
}
