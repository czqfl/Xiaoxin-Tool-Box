/** 文件夹颜色标签预设：面板右键菜单与设置页共用 */
export const FOLDER_COLORS: Array<{ value: string; name: string }> = [
  { value: "#6366f1", name: "靛蓝" },
  { value: "#f59e0b", name: "琥珀" },
  { value: "#10b981", name: "翡翠" },
  { value: "#ef4444", name: "红色" },
  { value: "#06b6d4", name: "青色" },
  { value: "#ec4899", name: "粉红" },
];

export const FOLDER_COLOR_VALUES = FOLDER_COLORS.map((c) => c.value);

/** 颜色名查找（未知颜色回退显示色值） */
export function colorNameOf(value: string | null): string {
  if (!value) return "无颜色";
  return FOLDER_COLORS.find((c) => c.value === value)?.name ?? value;
}
