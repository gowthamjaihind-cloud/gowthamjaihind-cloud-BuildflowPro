import { useUIStore, type Language } from "../store/uiStore";
import { translations } from "./translations";

export type { Language };

/**
 * Look up a translation key for a given language, with English fallback and
 * finally the key itself so nothing ever renders blank. Supports {placeholder}
 * interpolation, e.g. t("greeting", { name }) against "Hello {name}".
 */
export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = translations[lang] || translations.en;
  let value = dict[key];
  if (value === undefined) value = translations.en[key];
  if (value === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

/**
 * React hook. Subscribes to the active language so any component using t()
 * re-renders instantly when the language toggle flips.
 */
export function useTranslation() {
  const language = useUIStore((s) => s.language);
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(language, key, params);
  return { t, language };
}
