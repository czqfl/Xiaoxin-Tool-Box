/** 便签设置页：完整嵌入原版便签设置面板。
 *  用 iframe 加载 index.html?view=sticky-settings（原版 settings.ts 面板，
 *  standalone 模式铺满），功能与便签原「设置」弹窗完全一致：
 *  外观主题 / 背景图与沉浸 / 透明毛玻璃 / 关闭动画粒子 / 快捷键 /
 *  Markdown 样式 / 大模型整理 / 存储目录。iframe 天然隔离便签样式，
 *  与工具箱设置页互不污染。 */
export function StickyNotePage() {
  return (
    <div className="settings-page">
      <h2>便签设置</h2>
      <p className="page-desc">
        完整保留原版便签设置面板：外观 / 背景 / 毛玻璃 / 关闭动画 / 快捷键 / Markdown 样式 / 大模型整理 / 存储目录
      </p>
      <div className="sticky-settings-frame-wrap">
        <iframe
          src="index.html?view=sticky-settings"
          title="便签设置"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
