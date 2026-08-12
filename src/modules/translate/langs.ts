/** 翻译语言选项（通用代码，后端按服务商映射） */
export const LANG_OPTIONS = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
  { value: "ja", label: "日文" },
  { value: "ko", label: "韩文" },
  { value: "fr", label: "法文" },
  { value: "de", label: "德文" },
  { value: "ru", label: "俄文" },
  { value: "es", label: "西文" },
];

/** 服务商返回的语言代码 -> 中文标签 */
export function langLabel(code: string): string {
  const map: Record<string, string> = {
    auto: "自动检测",
    zh: "中文",
    "zh-CHS": "中文",
    en: "英文",
    ja: "日文",
    jp: "日文",
    ko: "韩文",
    kor: "韩文",
    fr: "法文",
    fra: "法文",
    de: "德文",
    ru: "俄文",
    es: "西文",
    spa: "西文",
  };
  return map[code] ?? code;
}
