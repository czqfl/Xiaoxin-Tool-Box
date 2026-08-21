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
  FilesSortMode,
  InstalledApp,
} from "../types";
import { Segmented, SettingGroup, SettingRow } from "./components";
import { IconFiles, IconPlus, IconTrash } from "../components/icons";

export function FilesPage() {
  const config = useConfigStore((s) => s.config);
  const update = useConfigStore((s) => s.update);

  if (!config.files) return null;
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

  return (
    <div className="settings-page">
      <h2>快速文件</h2>
      <p className="page-desc">
        在统一位置快速新建 / 打开 / 管理多种类型文件；可配置文件类型，并为每种类型单独指定默认打开程序
      </p>

      <SettingGroup>
        <SettingRow
          title="文件保存位置"
          desc="所有新建文件统一保存到此处；留空则使用程序数据目录下的 quickfiles 文件夹"
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
                  <select
                    className="files-opener-select"
                    title="默认打开方式（留空使用系统默认程序）"
                    value={openerSelectValue(t.opener)}
                    onChange={(e) => void handleOpenerChange(i, e.target.value)}
                  >
                    <option value="">系统默认</option>
                    {appsLoading && (
                      <option value="" disabled>
                        正在扫描本机应用…
                      </option>
                    )}
                    {apps.map((a) => (
                      <option key={a.exe} value={a.exe}>
                        {a.name}
                      </option>
                    ))}
                    {t.opener && openerSelectValue(t.opener) === "__custom__" && (
                      <option value="__custom__" disabled>
                        自定义：{t.opener.split(/[\\/]/).pop()}
                      </option>
                    )}
                    <option value="__browse__">浏览其他程序…</option>
                  </select>
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
