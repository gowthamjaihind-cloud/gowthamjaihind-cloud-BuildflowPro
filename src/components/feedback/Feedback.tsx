import React, { useEffect, useRef } from "react";
import {
  CheckCircle,
  Info,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useTranslation } from "../../i18n";
import { useFeedback } from "../../lib/feedback";

/**
 * Renders the toast stack and the confirmation dialog. Mounted once, near the
 * root, so anything in the app can raise either without prop-drilling.
 */

const TONE = {
  success: { icon: CheckCircle, cls: "text-success", bg: "bg-success/12" },
  error: { icon: WarningCircle, cls: "text-danger", bg: "bg-danger/12" },
  info: { icon: Info, cls: "text-info", bg: "bg-info/12" },
} as const;

const Toasts: React.FC = () => {
  const toasts = useFeedback((s) => s.toasts);
  const dismiss = useFeedback((s) => s.dismiss);
  const { t } = useTranslation();

  if (!toasts.length) return null;

  return (
    // Top of the screen: the foot of the page is already busy with the demo
    // banner, and a toast that covers the primary action is worse than none.
    <div
      className="fixed top-4 inset-x-0 z-[300] flex flex-col items-center gap-2 px-4 pointer-events-none sm:items-end sm:pr-6"
      role="region"
      aria-label={t("feedback.notifications")}
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.kind];
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto w-full sm:w-auto sm:max-w-md flex items-start gap-3 px-4 py-3 rounded-xl bg-panel border border-divider shadow-lg"
          >
            <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${tone.bg}`}>
              <Icon className={`w-4 h-4 ${tone.cls}`} weight="fill" />
            </span>
            <p className="flex-1 min-w-0 text-[13px] leading-snug text-ink">
              {toast.message}
            </p>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t("feedback.dismiss")}
              className="shrink-0 w-6 h-6 rounded-lg text-ink-muted hover:text-ink hover:bg-page apple-transition flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

const Confirm: React.FC = () => {
  const confirm = useFeedback((s) => s.confirm);
  const answer = useFeedback((s) => s.answer);
  const { t } = useTranslation();
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, answer]);

  if (!confirm) return null;

  // Several call sites pass one string with a blank line in it -- a question
  // followed by its consequences. Read as a single heading that is unwieldy,
  // so the first paragraph becomes the title and the rest the body. Doing it
  // here rather than at the call site keeps it working for the many messages
  // built from template literals.
  const [head, ...rest] = confirm.title.split(/\n\s*\n/);
  const title = head.trim();
  const body = [rest.join("\n\n").trim(), confirm.body?.trim()]
    .filter(Boolean)
    .join("\n\n");
  const destructive = confirm.destructive ?? true;
  // "Confirm" tells the user nothing. Where the question is a deletion -- most
  // of them are -- the button should name the act it performs.
  const affirm =
    confirm.confirmLabel ??
    (/\b(delete|remove|நீக்க)/i.test(confirm.title) ? t("feedback.delete") : t("feedback.confirm"));

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-surface-dark/55"
        onClick={() => answer(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md bg-panel rounded-2xl border border-divider shadow-2xl p-6"
      >
        <h2 className="text-lg font-black text-ink leading-tight">{title}</h2>
        {body ? (
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted whitespace-pre-line">
            {body}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={() => answer(false)}
            className="px-4 py-2.5 rounded-xl border border-divider text-ink text-xs font-bold hover:bg-page apple-transition"
          >
            {confirm.cancelLabel ?? t("feedback.cancel")}
          </button>
          <button
            ref={primary}
            onClick={() => answer(true)}
            className={`px-4 py-2.5 rounded-xl text-white text-xs font-black uppercase tracking-wider apple-transition ${
              destructive ? "bg-danger hover:brightness-110" : "bg-primary hover:bg-[#4434D4]"
            }`}
          >
            {affirm}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Feedback: React.FC = () => (
  <>
    <Toasts />
    <Confirm />
  </>
);
