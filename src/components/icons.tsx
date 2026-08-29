/** 轻量内联 SVG 图标集（统一 stroke 风格，颜色继承 currentColor） */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const IconSearch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7" />
  </svg>
);

export const IconStar = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8Z" />
    </svg>
  );
};

export const IconPin = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M9 4h6l-1 7 3 2v2H7v-2l3-2-1-7ZM12 15v6" />
    </svg>
  );
};

export const IconClipboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4a2 2 0 0 1 6 0M9 10h6M9 14h6" />
  </svg>
);

export const IconFolder = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />  </svg>
);

export const IconFolderPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <path d="M12 11v6M9 14h6" />
  </svg>
);

export const IconLocate = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconSettings = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

export const IconKeyboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0M9 14h6" />
  </svg>
);

export const IconGrid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

/** 布局：垂直列表（三行「圆点 + 横线」，清晰表达列表语义） */
export const IconList = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="4.5" cy="6.5" r="1.2" />
    <path d="M8 6.5h12" />
    <circle cx="4.5" cy="12" r="1.2" />
    <path d="M8 12h12" />
    <circle cx="4.5" cy="17.5" r="1.2" />
    <path d="M8 17.5h12" />
  </svg>
);

/** 布局：水平多列并排（圆角外框 + 中间竖线分栏） */
export const IconListColumns = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M12 4v16" />
  </svg>
);

export const IconTree = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 3v18" />
    <path d="M5 7h5" />
    <path d="M5 13h9" />
    <path d="M5 19h4" />
  </svg>
);

export const IconTerminal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m4 17 6-5-6-5M12 19h8" />
  </svg>
);

/** 代码/编辑器（>_） */
export const IconCode = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 9l-4 3 4 3" />
    <path d="M16 9l4 3-4 3" />
    <path d="M13 6l-2 12" />
  </svg>
);

/** Git 分支 */
export const IconBranch = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="5" r="2" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="7" r="2" />
    <path d="M6 7v10" />
    <path d="M18 9c0 3-4 4-6 5" />
  </svg>
);

/** 转换/魔法棒（剪贴板智能转换入口） */
export const IconWand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 4V2" />
    <path d="M15 10V8" />
    <path d="M12 7h2" />
    <path d="M18 7h2" />
    <path d="M5 19l9-9" />
    <path d="M4 20h2" />
    <path d="M18 15l2 2" />
    <path d="M15 18l2 2" />
  </svg>
);

export const IconCopy = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const IconExternal = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
  </svg>
);

export const IconText = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7V5h16v2M12 5v14M9 19h6" />
  </svg>
);

export const IconImage = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-4-4-9 10" />
  </svg>
);

export const IconFiles = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);

/** 链接：断开的链环（文字内容为 URL 时用） */
export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

/** 富文本：带格式的段落（加粗 T + 下划线，与纯文本 IconText 区分） */
export const IconRichText = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7V5h16v2M12 5v14M9 19h6" />
    <path d="M4 16h5M4 12h3" strokeWidth="2.6" />
  </svg>
);

export const IconArrowUp = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const IconArrowDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconInfo = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8h0" />
  </svg>
);

export const IconPalette = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.5.6.2 2.7-2.5 2.7Z" />
    <circle cx="7.5" cy="11.5" r="1" />
    <circle cx="10.5" cy="7.5" r="1" />
    <circle cx="15" cy="8" r="1" />
  </svg>
);


export const IconKey = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="7.5" cy="15.5" r="4" />
    <path d="m10.5 12.5 8-8M16 3l3 3-2 2-3-3M18 5l2 2" />
  </svg>
);

/** 锁：账号密码 / 凭据（比钥匙更直观） */
export const IconLock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.6" />
  </svg>
);

/** 端口工具：雷达扫描（探测端口占用；圆环 + 扫针） */
export const IconPort = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 12l5-5" />
  </svg>
);

/** 常用语速贴：闪电（一键快速粘贴常用话术） */
export const IconSnippet = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13 2 4.8 13.2h5.7L9.2 22l8.2-11.2h-5.8L13 2Z" />
  </svg>
);

/** 截图：相机快门（经典截图工具图标） */
export const IconScreenshot = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

/** 屏幕录制：实心圆点（REC 录制通用符号） */
export const IconRecord = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconEye = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

export const IconEyeOff = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.1-.9" />
    <path d="m3 3 18 18M9.5 9.5a3 3 0 0 0 4.2 4.2" />
  </svg>
);

export const IconEdit = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** 勾（成功提示）：复制成功 / 完成状态用 */
export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
);

/** 翻译：左侧「文」字 + 右侧「A」（多语言互译，最经典的翻译图标） */
export const IconTranslate = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 8 6 6" />
    <path d="m4 14 6-6 2-3" />
    <path d="M2 5h12" />
    <path d="M7 2h1" />
    <path d="m22 22-5-10-5 10" />
    <path d="M14 18h6" />
  </svg>
);

/** 分组：不分组（单个文件平铺 = 未归类、无分组） */
export const IconGroupNone = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5h8.5L18.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z" />
    <path d="M14 3.5v4h4.5" />
    <path d="M8.5 13h7M8.5 16.5h5" />
  </svg>
);

/** 分组：按类型（标签 = 类别） */
export const IconGroupType = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.1 7.1a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0L3.6 13.4A2 2 0 0 1 3 12Z" />
    <path d="M8 8h0" />
  </svg>
);

/** 分组：按日期（日历） */
export const IconGroupDate = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
);

/** 排序：按创建时间（时钟） */
export const IconSortTime = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

/** 排序：按名称（大 A 小 a 字样 = 字母序），大小对比明显但不糊 */
export const IconSortName = (p: IconProps) => (
  <svg {...base(p)}>
    <text
      x="10"
      y="12"
      fontSize="16"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="central"
      fill="currentColor"
      stroke="none"
    >
      A
    </text>
    <text
      x="17.5"
      y="20.5"
      fontSize="11.5"
      fontWeight="600"
      textAnchor="middle"
      dominantBaseline="central"
      fill="currentColor"
      stroke="none"
    >
      a
    </text>
  </svg>
);

export const IconSquare = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" rx="1" />
  </svg>
);

export const IconCircleOutline = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8" />
  </svg>
);

export const IconArrowDiag = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19 19 5M11.5 5H19v7.5" />
  </svg>
);

export const IconLineDiag = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19 19 5" />
  </svg>
);

export const IconBrushTool = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m17 3 4 4-9.5 9.5-4.7 1.2L8 13l9-10Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

export const IconMosaicGrid = (p: IconProps) => (
  <svg {...base({ strokeWidth: 1.6, ...p })}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M9.3 4v16M14.6 4v16M4 9.3h16M4 14.6h16" />
  </svg>
);

export const IconNumBadge = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 8.5h1.6V15.2M8.4 15.2h4.8" />
  </svg>
);

export const IconUndoArrow = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 5 3 10l5 5" />
    <path d="M3 10h10a7 7 0 0 1 7 7v2" />
  </svg>
);

export const IconRedoArrow = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m16 5 5 5-5 5" />
    <path d="M21 10H11a7 7 0 0 0-7 7v2" />
  </svg>
);

export const IconSaveImage = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v11m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconCropSelect = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" rx="1" strokeDasharray="3 3" />
  </svg>
);

/** 便签（记事本/贴纸）：设置页"便签设置"与工具栏"便签"入口用 */
export const IconSticky = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12l-6 6H6a2 2 0 0 1-2-2V4Z" />
    <path d="M14 14v6l6-6" />
    <path d="M8 8h8M8 12h5" />
  </svg>
);
