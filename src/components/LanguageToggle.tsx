import React from "react";
import { useUIStore } from "../store";

/**
 * Segmented EN / தமிழ் language switcher for the top bar. Reads and writes the
 * active language in the UI store (persisted to localStorage), so the whole app
 * re-renders in the chosen language instantly.
 */
export const LanguageToggle: React.FC = () => {
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);

  const options: { code: "en" | "ta"; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "ta", label: "த" },
  ];

  return (
    <div data-tour="lang"
      className="flex items-center bg-surface/40 border border-divider rounded-full p-0.5 shadow-sm shrink-0"
      role="group"
      aria-label="Language"
    >
      {options.map((opt) => (
        <button
          key={opt.code}
          onClick={() => setLanguage(opt.code)}
          aria-pressed={language === opt.code}
          title={opt.code === "en" ? "English" : "தமிழ்"}
          className={`inline-flex items-center justify-center min-h-[40px] min-w-[44px] sm:min-h-[32px] sm:min-w-[38px] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-black tracking-tight apple-transition active:scale-95 ${
            language === opt.code
              ? "bg-primary text-white shadow"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
