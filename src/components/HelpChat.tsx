import React, { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneRight } from "@phosphor-icons/react";
import { useAuthStore } from "../store";
import { callHelpChat, type HelpTurn } from "../services/firebaseFunctions";

/**
 * The in-app help assistant: questions about using Sitetru, the Telegram bot,
 * billing, and this workspace's own plan and usage. Answers come from
 * helpChat (functions/src/help), which knows the product and reads this
 * workspace's plan facts on the server. It cannot change anything.
 *
 * The conversation is kept for the browser tab only (sessionStorage).
 */

const STORE_KEY = "sitetru.help.v1";
const SUGGESTIONS = [
  "When does my plan renew?",
  "How do I add an extra project?",
  "How do I log work from Telegram?",
  "How do I share progress with my client?",
  "Why is a project read-only?",
];

const load = (): HelpTurn[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.slice(-30) : [];
  } catch {
    return [];
  }
};

/** **bold** and line breaks; everything else stays plain text (React escapes it). */
const Rich: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split("\n").map((line, i) => (
      <p key={i} className={line.trim() ? "" : "h-2"}>
        {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? <b key={j}>{part.slice(2, -2)}</b> : <React.Fragment key={j}>{part}</React.Fragment>,
        )}
      </p>
    ))}
  </>
);

export const HelpChat: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<HelpTurn[]>(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.slice(-30)));
    } catch {
      /* private mode: keep it in memory only */
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, open, busy]);

  if (!user) return null;

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const next = [...turns, { role: "user" as const, text }];
    setTurns(next);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const { answer } = await callHelpChat({ orgId: user.currentOrgId, messages: next.slice(-12) });
      setTurns([...next, { role: "assistant", text: answer }]);
    } catch (e: any) {
      setError(String(e?.message || "Something went wrong.").replace(/^.*?:\s*/, ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Help"
          className="fixed z-[65] left-4 bottom-24 md:left-auto md:right-6 md:bottom-6 w-12 h-12 rounded-full bg-surface-dark text-white shadow-xl flex items-center justify-center cursor-pointer"
        >
          <ChatCircleDots weight="fill" className="w-6 h-6" />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Help assistant"
          className="fixed z-[80] inset-x-0 bottom-0 h-[80vh] md:inset-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[560px] bg-panel text-ink border border-divider rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-divider">
            <div>
              <p className="text-sm font-black">Sitetru Help</p>
              <p className="text-[11px] text-ink-muted">App, billing and usage questions</p>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button onClick={() => { setTurns([]); setError(""); }} className="text-[11px] font-bold text-ink-muted px-2 py-1 rounded-lg hover:bg-surface-2 cursor-pointer">
                  New chat
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-ink-muted">Hi! Ask me how to do something in Sitetru, about your plan and billing, or about the Telegram bot.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="text-xs font-bold px-3 py-1.5 rounded-full border border-divider hover:bg-surface-2 text-left cursor-pointer">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 space-y-1 ${m.role === "user" ? "bg-primary text-on-primary" : "bg-surface-2 text-ink"}`}>
                  {m.role === "assistant" ? <Rich text={m.text} /> : m.text}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-ink-muted">Thinking…</p>}
            {error && <p className="text-xs font-bold text-danger">{error}</p>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-end gap-2 p-3 border-t border-divider pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              rows={1}
              maxLength={1000}
              placeholder="Ask a question…"
              className="flex-1 resize-none max-h-28 px-3 py-2 rounded-xl bg-surface-1 border border-divider text-base md:text-sm"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-50 cursor-pointer">
              <PaperPlaneRight weight="fill" className="w-5 h-5" />
            </button>
          </form>
          <p className="text-[10px] text-ink-muted text-center pb-2 -mt-1">AI answers can be wrong. It can't change your account.</p>
        </div>
      )}
    </>
  );
};
