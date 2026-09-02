/** 快速文件设置页：保存位置、默认分组/排序、文件类型管理
 *  （每种类型单独配置扩展名 / 显示名 / 强调色 / 默认打开程序）。 */
import { useEffect, useState } from "react";
import { useConfigStore } from "../stores/configStore";
import {
  listInstalledApps,
  pickFolder,
  pickOpenerExecutable,
  quickfilesReveal,
} from "../core/tauri";
import type {
  FileTypeDef,
  FilesConfig,
  FilesGroupMode,
  FilesLayoutMode,
  FilesSortMode,
  InstalledApp,
} from "../types";
import { Segmented, SettingGroup, SettingRow } from "./components";
import { ShortcutRow } from "./ShortcutRow";
import { GlassSelect, type GlassOption } from "../components/GlassSelect";
import { IconFiles, IconPlus, IconTrash } from "../components/icons";

export function FilesPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  const files = config.files;

  // 本机已安装应用（开始菜单 + App Paths），供「默认打开方式」下拉选择
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listInstalledApps().then((list) => {
      if (alive) {
        setApps(list);
        setAppsLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const patch = (p: Partial<FilesConfig>) =>
    void update({ ...config, files: { ...files, ...p } });

  const chooseLocation = async () => {
    const dir = await pickFolder();
    if (dir) patch({ location: dir });
  };

  const openLocation = () => {
    if (files.location) quickfilesReveal(files.location).catch(() => undefined);
  };

  const updateType = (i: number, p: Partial<FileTypeDef>) => {
    const next = files.file_types.map((t, idx) => (idx === i ? { ...t, ...p } : t));
    patch({ file_types: next });
  };
  const removeType = (i: number) => {
    patch({ file_types: files.file_types.filter((_, idx) => idx !== i) });
  };
  const addType = () => {
    const used = new Set(files.file_types.map((t) => t.ext.toLowerCase()));
    let ext = "txt";
    let n = 1;
    while (used.has(ext)) {
      ext = `ext${n++}`;
    }
    const t: FileTypeDef = {
      ext,
      label: "新类型",
      color: "#8a94a6",
      opener: null,
    };
    patch({ file_types: [...files.file_types, t] });
  };

  /** 下拉框当前值：opener 在应用列表中 → 原值；否则（自定义/系统默认）特殊值 */
  const openerSelectValue = (opener: string | null | undefined): string => {
    if (!opener) return "";
    const hit = apps.some((a) => a.exe.toLowerCase() === opener.toLowerCase());
    return hit ? opener : "__custom__";
  };
  /** 下拉变更：系统默认 / 应用 / 浏览其他程序… */
  const handleOpenerChange = async (i: number, v: string) => {
    if (v === "") {
      updateType(i, { opener: null });
    } else if (v === "__browse__") {
      const exe = await pickOpenerExecutable();
      if (exe) updateType(i, { opener: exe });
    } else {
      updateType(i, { opener: v });
    }
  };

  /** 打开方式下拉选项：系统默认 → 常用编辑器（置顶）→ 浏览器 → 其他应用 → 更多。
   *  过滤由后端完成（安装器/更新器/系统组件等已被剔除），图标为 exe 提取的
   *  32×32 PNG data URL。 */
  const openerOptions = (opener: string | null | undefined): GlassOption[] => {
    const opts: GlassOption[] = [{ value: "", label: "系统默认" }];
    if (appsLoading) {
      opts.push({ value: "__loading__", label: "正在扫描本机应用…", disabled: true });
    }
    const groups: Record<string, string> = {
      editor: "常用编辑器",
      browser: "浏览器",
      other: "其他应用",
    };
    for (const k of ["editor", "browser", "other"] as const) {
      const list = apps.filter((a) => a.kind === k);
      if (list.length === 0) continue;
      for (const a of list) {
        opts.push({
          value: a.exe,
          label: a.name,
          icon: a.icon ?? undefined,
          group: groups[k],
        });
      }
    }
    // 当前 opener 不在扫描列表（用户通过「浏览其他程序…」选择的）→ 显示为禁用占位
    if (opener && !apps.some((a) => a.exe.toLowerCase() === opener.toLowerCase())) {
      opts.push({
        value: "__custom__",
        label: `自定义：${opener.split(/[\\/]/).pop()}`,
        disabled: true,
        group: "更多",
      });
    }
    opts.push({ value: "__browse__", label: "浏览其他程序…", group: "更多" });
    return opts;
  };

  // 早退放在所有 hooks 之后：条件 return 若出现在 useState/useEffect 之前，
  // config.files 缺失时 hooks 数量前后不一致，直接触发 React 崩溃
  if (!files) return null;

  return (
    <div className="settings-page">
      <h2>快速文件</h2>
      <p className="page-desc">
        在统一位置快速新建 / 打开 / 管理多种类型文件；可配置文件类型，并为每种类型单独指定默认打开程序
      </p>

      <div className="setting-group-title">功能</div>
      <SettingGroup>
        <ShortcutRow
          target="files"
          title="呼出快速文件面板"
          desc="点击快捷键后按下新组合，例如 Alt+Q（快速新建 / 管理各类文件）"
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="文件保存位置"
          desc="所有新建文件统一保存到此处，并按文件类型分子文件夹存放（每种类型一个文件夹）；留空则使用程序数据目录下的 quickfiles 文件夹"
        >
          <div className="files-loc-box">
            <code className="files-loc-path">{files.location || "（默认：数据目录 / quickfiles）"}</code>
            <div className="files-loc-btns">
              <button className="btn btn-sm" onClick={() => void chooseLocation()}>
                选择文件夹
              </button>
              {files.location && (
                <button className="btn btn-sm" onClick={openLocation}>
                  打开
                </button>
              )}
            </div>
          </div>
        </SettingRow>

        <SettingRow title="默认分组" desc="打开面板时按此方式分组展示">
          <Segmented
            value={files.default_group}
            options={[
              { value: "none", label: "不分组" },
              { value: "type", label: "按类型" },
              { value: "date", label: "按日期" },
            ]}
            onChange={(v) => patch({ default_group: v as FilesGroupMode })}
          />
        </SettingRow>

        <SettingRow title="默认排序" desc="列表排序方式（分组模式下组内同样按此排序）">
          <Segmented
            value={files.default_sort}
            options={[
              { value: "created", label: "创建时间" },
              { value: "name", label: "名称" },
            ]}
            onChange={(v) => patch({ default_sort: v as FilesSortMode })}
          />
        </SettingRow>

        <SettingRow title="分组布局" desc="分组展示方式：垂直列表或水平多列并排（面板控制条也可切换）">
          <Segmented
            value={files.default_layout}
            options={[
              { value: "vertical", label: "垂直列表" },
              { value: "horizontal", label: "水平多列" },
            ]}
            onChange={(v) => patch({ default_layout: v as FilesLayoutMode })}
          />
        </SettingRow>

        <SettingRow title="面板置顶" desc="置顶时常驻显示，失焦不自动隐藏">
          <Segmented
            value={files.always_on_top ? "on" : "off"}
            options={[
              { value: "on", label: "置顶" },
              { value: "off", label: "自动隐藏" },
            ]}
            onChange={(v) => patch({ always_on_top: v === "on" })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="文件类型"
          desc="面板「新建」时列出的类型；可增删、改名、改扩展名与强调色，并为每种类型单独配置默认打开程序"
          layout="block"
        >
          <div className="files-types">
            {files.file_types.map((t, i) => (
              <div className="files-type-row" key={i}>
                <input
                  type="color"
                  className="files-color"
                  value={t.color}
                  title="强调色"
                  onChange={(e) => updateType(i, { color: e.target.value })}
                />
                <input
                  className="files-label"
                  value={t.label}
                  placeholder="显示名"
                  onChange={(e) => updateType(i, { label: e.target.value })}
                />
                <div className="files-ext-wrap">
                  <span className="files-ext-dot">.</span>
                  <input
                    className="files-ext"
                    value={t.ext}
                    placeholder="ext"
                    onChange={(e) =>
                      updateType(i, { ext: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() })
                    }
                  />
                </div>
                <div className="files-opener">
                  <GlassSelect
                    title="默认打开方式（留空使用系统默认程序）"
                    value={openerSelectValue(t.opener)}
                    options={openerOptions(t.opener)}
                    onChange={(v) => void handleOpenerChange(i, v)}
                  />
                  {t.opener && (
                    <button
                      className="btn btn-xs"
                      title="清除默认打开方式（改用系统默认程序）"
                      onClick={() => updateType(i, { opener: null })}
                    >
                      清除
                    </button>
                  )}
                </div>
                <button
                  className="files-del"
                  title="删除该类型"
                  onClick={() => removeType(i)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
            <button className="files-add" onClick={addType}>
              <IconPlus size={13} /> 添加文件类型
            </button>
          </div>
        </SettingRow>
      </SettingGroup>

      <div className="shortcut-hint">
        <IconFiles size={13} /> 文件类型仅用于快速新建与面板内过滤展示；该位置下其他类型的文件不会出现在面板中。
      </div>
    </div>
  );
}
