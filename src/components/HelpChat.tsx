import React, { useEffect, useRef, useState } from "react";
import { ChatCircleDots, X, PaperPlaneRight, Wrench, CheckCircle, WarningCircle, XCircle, Info, Microphone, Stop, Lightning } from "@phosphor-icons/react";
import { useAuthStore, useUIStore, useProjectStore } from "../store";
import {
  callHelpChat,
  callHelpDiagnose,
  callReportProblem,
  callConfirmSubscription,
  callActionPrepare,
  callActionConfirm,
  callActionCancel,
  callPoApprove,
  type HelpTurn,
  type HelpCheck,
  type CommandPoDraft,
} from "../services/firebaseFunctions";
import { useVoiceNote, voiceSupported } from "../hooks/useVoiceNote";
import { PurchaseOrderForm } from "./purchase/PurchaseOrderForm";
import { runDeviceChecks, deviceSummary, fixUpdate, fixReconnect, fixClearCache, FIX_LABELS, type FixId } from "../lib/diagnostics";
import { recentErrors } from "../lib/errorLog";

/**
 * The in-app help assistant.
 *
 * Ask: questions about using Sitetru, the Telegram bot, billing, and this
 * workspace's own plan and usage (helpChat, functions/src/help).
 *
 * "Something's not working?": runs checks on this device (internet, app
 * version, sign-in, data connection, unsent changes; lib/diagnostics.ts) and
 * on the workspace (plan, read-only projects, AI allowance, Telegram;
 * helpDiagnose), shows them with one-tap fixes, has the assistant explain
 * them, and can send the lot to support (reportProblem).
 *
 * Do: a typed or spoken request (actionPrepare, functions/src/actions; the
 * same engine the Telegram bot uses): a purchase order, a client payment, a
 * new vendor or material, today's work, or a question about the project's
 * stock, orders, payments or progress. The server checks the person's role
 * and project access, shows a preview, and saves only on Confirm (checking
 * again). A PO can instead be opened in the form to edit before creating.
 *
 * The conversation is kept for the browser tab only (sessionStorage).
 */

type Turn = HelpTurn & {
  checks?: HelpCheck[];
  /** A prepared action waiting for Confirm (pending_actions/{id}). */
  action?: { id: string; state: "pending" | "done" | "cancelled"; canConfirm: boolean; po?: CommandPoDraft };
  /** Draft POs waiting for approval, each with an Approve button. */
  approvals?: { id: string; poNumber: string; done?: boolean }[];
};

const STORE_KEY = "sitetru.help.v2";
const SUGGESTIONS = [
  "When does my plan renew?",
  "How do I add an extra project?",
  "How do I log work from Telegram?",
  "How do I share progress with my client?",
];

const load = (): Turn[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(v) ? v.slice(-30) : [];
  } catch {
    return [];
  }
};

const errText = (e: any) => String(e?.message || "Something went wrong.").replace(/^.*?:\s*/, "");

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

const STATUS_ICON = {
  ok: <CheckCircle weight="fill" className="w-4 h-4 text-success shrink-0" />,
  warn: <WarningCircle weight="fill" className="w-4 h-4 text-warning shrink-0" />,
  fail: <XCircle weight="fill" className="w-4 h-4 text-danger shrink-0" />,
  info: <Info weight="fill" className="w-4 h-4 text-ink-muted shrink-0" />,
};

export const HelpChat: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const openSettingsTab = useUIStore((s) => s.openSettingsTab);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(load);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [diagMode, setDiagMode] = useState(false);
  const [lastProblem, setLastProblem] = useState<{ text: string; checks: HelpCheck[] } | null>(null);
  const [reportId, setReportId] = useState("");
  const [mode, setMode] = useState<"ask" | "do">("ask");
  const [poDraft, setPoDraft] = useState<CommandPoDraft | null>(null);
  const activeProject = useProjectStore((s) => s.activeProject);
  const voice = useVoiceNote((audio) => runCommand({ audio }));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.slice(-30)));
    } catch {
      /* private mode: keep it in memory only */
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, open, busy, note, reportId]);

  if (!user) return null;
  const orgId = user.currentOrgId;
  const plain = (ts: Turn[]): HelpTurn[] => ts.map(({ role, text }) => ({ role, text })).slice(-12);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    if (diagMode) return diagnose(text);
    const next: Turn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setInput("");
    setError("");
    setBusy("Thinking…");
    try {
      const { answer } = await callHelpChat({ orgId, messages: plain(next) });
      setTurns([...next, { role: "assistant", text: answer }]);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };

  const diagnose = async (problem: string) => {
    const text = problem.trim() || "Something's not working in the app.";
    setDiagMode(false);
    setInput("");
    setError("");
    setNote("");
    setReportId("");
    const withQ: Turn[] = [...turns, { role: "user", text }];
    setTurns(withQ);
    setBusy("Running checks…");
    try {
      const [device, server] = await Promise.all([
        runDeviceChecks(),
        // The workspace half, bounded: a slow or unreachable server must not
        // leave the user looking at "Running checks..." -- that is a finding.
        Promise.race([
          callHelpDiagnose({ orgId }).then((r) => r.checks),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15_000)),
        ]).catch((): HelpCheck[] => [
          { id: "server", label: "Sitetru server", status: "warn", detail: "The workspace checks could not reach Sitetru's server in time. If this keeps happening, send this to support." },
        ]),
      ]);
      const checks = [...device, ...server] as HelpCheck[];
      const bad = checks.filter((c) => c.status === "fail" || c.status === "warn").length;
      const withChecks: Turn[] = [...withQ, { role: "assistant", text: bad ? `I checked ${checks.length} things; ${bad} need attention:` : `I checked ${checks.length} things and found no problem:`, checks }];
      setTurns(withChecks);
      setLastProblem({ text, checks });
      setBusy("Thinking…");
      try {
        const { answer } = await callHelpChat({ orgId, messages: plain(withChecks), checks });
        setTurns([...withChecks, { role: "assistant", text: answer }]);
      } catch (e) {
        setError(errText(e));
      }
    } finally {
      setBusy("");
    }
  };

  const runFix = async (fix: string) => {
    setNote("");
    setError("");
    try {
      switch (fix as FixId) {
        case "update":
          setBusy("Updating…");
          await fixUpdate();
          return;
        case "reconnect": {
          setBusy("Signing in again…");
          const r = await fixReconnect();
          setNote(r === "ok" ? "Sign-in refreshed. Try what you were doing again." : "Signed out. Please sign in again.");
          return;
        }
        case "clearCache": {
          if (!window.confirm("Clear the data saved on this device and load it fresh from the server? Nothing on the server is deleted.")) return;
          setBusy("Clearing…");
          const r = await fixClearCache();
          if (r === "refused") setNote("Not cleared: some changes on this device are not uploaded yet. Connect to the internet, keep the app open for a minute, then try again.");
          return;
        }
        case "recheckBilling":
          setBusy("Checking payment…");
          await callConfirmSubscription({ orgId });
          setNote("Payment status re-checked with Razorpay. If it still looks wrong, send this to support.");
          return;
        case "openBilling":
          setActiveProject(null);
          openSettingsTab("billing");
          setOpen(false);
          return;
        case "openTelegram":
          setActiveProject(null);
          openSettingsTab("telegram");
          setOpen(false);
          return;
        case "goOnline":
          if (lastProblem) await diagnose(lastProblem.text);
          return;
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };

  const sendReport = async () => {
    if (!lastProblem || busy) return;
    setBusy("Sending to support…");
    setError("");
    try {
      const { reportId } = await callReportProblem({
        orgId,
        description: lastProblem.text,
        checks: lastProblem.checks.filter((c) => !["plan", "locked", "ai", "telegram"].includes(c.id)),
        errors: recentErrors(),
        device: deviceSummary(),
        page: activeTab,
      });
      setReportId(reportId);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };


  /** "Do": turn a typed or spoken request into a prepared action. */
  const runCommand = async ({ text, audio }: { text?: string; audio?: { base64: string; mimeType: string } }) => {
    if (busy) return;
    if (!activeProject) {
      setError("Open a project first, then ask (everything here belongs to a project).");
      return;
    }
    const said = text?.trim();
    if (!said && !audio) return;
    setError("");
    setNote("");
    setInput("");
    let next: Turn[] = said ? [...turns, { role: "user", text: said }] : [...turns];
    if (said) setTurns(next);
    setBusy(audio ? "Listening to your voice note…" : "Working on it…");
    try {
      const r = await callActionPrepare({ orgId, projectId: activeProject.id, ...(said ? { text: said } : { audioBase64: audio!.base64, mimeType: audio!.mimeType }) });
      if (!said) next = [...turns, { role: "user", text: `🎤 ${r.transcript || "(voice note)"}` }];
      if (r.type === "approvals") {
        const inrs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        setTurns([...next, r.pos.length
          ? { role: "assistant", text: ["**Waiting for approval:**", ...r.pos.map((p) => `• **${p.poNumber}** · ${p.vendorName} · ${inrs(p.total)}${p.createdByName ? ` · by ${p.createdByName}` : ""}`)].join("\n"), approvals: r.pos.map((p) => ({ id: p.id, poNumber: p.poNumber })) }
          : { role: "assistant", text: "No purchase orders are waiting for approval in this project." }]);
        return;
      }
      if (r.type !== "pending") {
        const msg = "message" in r ? r.message : "That looks like a work report. Log it from the Daily log screen or the Telegram bot.";
        setTurns([...next, { role: "assistant", text: r.type === "denied" ? `🔒 ${msg}` : msg }]);
        return;
      }
      const lines = [
        "**Check this before I save it:**",
        ...r.lines,
        ...(r.blockers.length ? ["", ...r.blockers.map((b) => `⚠️ ${b}`)] : []),
      ];
      setTurns([...next, {
        role: "assistant",
        text: lines.join("\n"),
        action: { id: r.id, state: "pending", canConfirm: !r.blockers.length, po: r.pending.kind === "po" ? (r.pending as any).draft : undefined },
      }]);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };

  const approvePoNow = async (poId: string) => {
    if (busy || !activeProject) return;
    setError("");
    setBusy("Approving…");
    try {
      const r = await callPoApprove(orgId, activeProject.id, poId);
      setTurns((ts) => [...ts.map((t) => (t.approvals ? { ...t, approvals: t.approvals.map((a) => (a.id === poId ? { ...a, done: true } : a)) } : t)),
        { role: "assistant", text: `✅ **${r.poNumber}** approved. It can now be sent to the vendor, and bills and goods received against it.` }]);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };

  const setActionState = (id: string, state: "done" | "cancelled") =>
    setTurns((ts) => ts.map((t) => (t.action?.id === id ? { ...t, action: { ...t.action, state } } : t)));

  const confirmAction = async (id: string) => {
    if (busy) return;
    setError("");
    setBusy("Saving…");
    try {
      const r = await callActionConfirm(id);
      setActionState(id, "done");
      setTurns((ts) => [...ts, { role: "assistant", text: `✅ ${r.message}${r.poNumber ? "\nIt's in **Procurement → Purchase orders**, where you can print it or send it to the vendor." : ""}` }]);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy("");
    }
  };

  const cancelAction = async (id: string) => {
    setActionState(id, "cancelled");
    callActionCancel(id).catch(() => {});
  };

  /** Edit a prepared PO in the full form instead; the prepared one is dropped. */
  const editPo = (id: string, po: CommandPoDraft) => {
    cancelAction(id);
    setPoDraft(po);
    setOpen(false);
  };

  const startDiagnosis = () => {
    setDiagMode(true);
    setError("");
    setNote("");
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
          className="fixed z-[80] inset-x-0 bottom-0 h-[80vh] md:inset-auto md:right-6 md:bottom-6 md:w-[400px] md:h-[600px] bg-panel text-ink border border-divider rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-divider">
            <div>
              <p className="text-sm font-black">Sitetru Help</p>
              <p className="text-[11px] text-ink-muted">Questions, billing, and fixing problems</p>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button onClick={() => { setTurns([]); setError(""); setNote(""); setLastProblem(null); setReportId(""); setDiagMode(false); }} className="text-[11px] font-bold text-ink-muted px-2 py-1 rounded-lg hover:bg-surface-2 cursor-pointer">
                  New chat
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex gap-1 px-4 pt-2" role="tablist">
            {(["ask", "do"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                onClick={() => { setMode(k); setDiagMode(false); setError(""); }}
                className={`flex-1 text-xs font-bold py-1.5 rounded-lg cursor-pointer ${mode === k ? "bg-surface-dark text-white" : "text-ink-muted hover:bg-surface-2"}`}
              >
                {k === "ask" ? "Ask" : "Do it for me"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {mode === "do" && turns.length === 0 && (
              <div className="space-y-2 text-ink-muted">
                <p className="flex items-center gap-2 text-ink font-bold"><Lightning weight="fill" className="w-4 h-4 text-primary" />Type or say what you want done.</p>
                <p>In the open project{activeProject ? <> (<b className="text-ink">{activeProject.name}</b>)</> : ""} I can prepare <b className="text-ink">purchase orders</b>, record <b className="text-ink">client payments</b>, add <b className="text-ink">vendors</b> and <b className="text-ink">materials</b>, log <b className="text-ink">today's work</b>, and answer questions about stock, orders, payments and progress. You see a preview first; nothing is saved until you press Confirm. What you can do depends on your role.</p>
                <p className="italic">"Order 100 bags of cement from ABC Traders, deliver on Friday"</p>
                <p className="italic">"Client paid 2 lakh by UPI today"</p>
                <p className="italic">"How much 12mm steel is left?"</p>
                {!activeProject && <p className="text-warning font-bold">Open a project first.</p>}
              </div>
            )}
            {mode === "ask" && turns.length === 0 && !diagMode && (
              <div className="space-y-3">
                <p className="text-ink-muted">Hi! Ask me how to do something in Sitetru, about your plan and billing, or about the Telegram bot.</p>
                <button onClick={startDiagnosis} className="w-full flex items-center gap-2 text-left text-sm font-bold px-3 py-2.5 rounded-xl border border-divider hover:bg-surface-2 cursor-pointer">
                  <Wrench weight="bold" className="w-5 h-5 text-primary shrink-0" /> Something's not working? Check and fix it
                </button>
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
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 space-y-1 ${m.role === "user" ? "bg-primary text-on-primary" : "bg-surface-2 text-ink"}`}>
                  {m.role === "assistant" ? <Rich text={m.text} /> : m.text}
                  {m.action && m.action.state === "pending" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.action.canConfirm && (
                        <button onClick={() => confirmAction(m.action!.id)} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-50 cursor-pointer">
                          Confirm
                        </button>
                      )}
                      {m.action.po && (
                        <button onClick={() => editPo(m.action!.id, m.action!.po!)} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-divider bg-surface-1 disabled:opacity-50 cursor-pointer">
                          Edit in form
                        </button>
                      )}
                      <button onClick={() => cancelAction(m.action!.id)} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-divider bg-surface-1 disabled:opacity-50 cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  )}
                  {m.action?.state === "done" && <p className="text-xs font-bold text-success">Saved</p>}
                  {m.approvals && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.approvals.map((a) => (a.done
                        ? <span key={a.id} className="text-xs font-bold text-success">{a.poNumber} approved</span>
                        : <button key={a.id} onClick={() => approvePoNow(a.id)} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary disabled:opacity-50 cursor-pointer">Approve {a.poNumber}</button>))}
                    </div>
                  )}
                  {m.action?.state === "cancelled" && <p className="text-xs text-ink-muted">Cancelled, nothing saved</p>}
                  {m.checks && (
                    <ul className="mt-2 space-y-2">
                      {m.checks.map((c, j) => (
                        <li key={j} className="flex gap-2">
                          {STATUS_ICON[c.status]}
                          <div className="min-w-0">
                            <p className="font-bold text-xs">{c.label}</p>
                            <p className="text-xs text-ink-muted">{c.detail}</p>
                            {c.fix && c.status !== "ok" && FIX_LABELS[c.fix as FixId] && (
                              <button onClick={() => runFix(c.fix!)} disabled={!!busy} className="mt-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-on-primary disabled:opacity-50 cursor-pointer">
                                {FIX_LABELS[c.fix as FixId]}
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {diagMode && (
              <div className="bg-surface-2 rounded-2xl px-3 py-2 space-y-2">
                <p>Tell me briefly what's going wrong (for example "photos don't load" or "can't save a log"), then press send. Or run the checks straight away.</p>
                <button onClick={() => diagnose(input)} disabled={!!busy} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary cursor-pointer">Run the checks</button>
              </div>
            )}
            {lastProblem && !busy && !reportId && turns.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={sendReport} className="text-xs font-bold px-3 py-1.5 rounded-full border border-divider hover:bg-surface-2 cursor-pointer">Still not fixed? Send to support</button>
                <button onClick={() => diagnose(lastProblem.text)} className="text-xs font-bold px-3 py-1.5 rounded-full border border-divider hover:bg-surface-2 cursor-pointer">Check again</button>
              </div>
            )}
            {reportId && <p className="text-xs font-bold text-success">Sent to support. Your reference is {reportId}. You'll get a reply by email.</p>}
            {busy && <p className="text-xs text-ink-muted">{busy}</p>}
            {note && <p className="text-xs font-bold text-ink">{note}</p>}
            {error && <p className="text-xs font-bold text-danger">{error}</p>}
            {voice.error && <p className="text-xs font-bold text-danger">{voice.error}</p>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); ask(input || (diagMode ? " " : "")); }}
            className="flex items-end gap-2 p-3 border-t border-divider pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            {mode === "do" && voiceSupported() && (
              <button
                type="button"
                onClick={() => (voice.recording ? voice.stop() : voice.start())}
                disabled={!!busy && !voice.recording}
                aria-label={voice.recording ? "Stop recording" : "Record a voice note"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer shrink-0 ${voice.recording ? "bg-danger text-on-danger" : "border border-divider hover:bg-surface-2"}`}
              >
                {voice.recording ? <Stop weight="fill" className="w-5 h-5" /> : <Microphone weight="bold" className="w-5 h-5 text-primary" />}
              </button>
            )}
            {mode === "ask" && !diagMode && turns.length > 0 && (
              <button type="button" onClick={startDiagnosis} aria-label="Something's not working" title="Something's not working?" className="w-10 h-10 rounded-xl border border-divider flex items-center justify-center hover:bg-surface-2 cursor-pointer shrink-0">
                <Wrench weight="bold" className="w-5 h-5 text-primary" />
              </button>
            )}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mode === "do" ? runCommand({ text: input }) : diagMode ? diagnose(input) : ask(input); } }}
              rows={1}
              maxLength={1000}
              placeholder={voice.recording ? `Recording… ${voice.seconds}s (tap ■ to send)` : mode === "do" ? "e.g. Client paid 2 lakh by UPI…" : diagMode ? "What's going wrong?" : "Ask a question…"}
              disabled={voice.recording}
              className="flex-1 resize-none max-h-28 px-3 py-2 rounded-xl bg-surface-1 border border-divider text-base md:text-sm"
            />
            <button
              type="button"
              onClick={() => (mode === "do" ? runCommand({ text: input }) : diagMode ? diagnose(input) : ask(input))}
              disabled={!!busy || voice.recording || (!diagMode && !input.trim())}
              aria-label="Send"
              className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center disabled:opacity-50 cursor-pointer shrink-0"
            >
              <PaperPlaneRight weight="fill" className="w-5 h-5" />
            </button>
          </form>
          <p className="text-[10px] text-ink-muted text-center pb-2 -mt-1">AI answers can be wrong. Fixes never delete anything on the server.</p>
        </div>
      )}
      {poDraft && activeProject && (
        <PurchaseOrderForm
          projectId={activeProject.id}
          draft={poDraft}
          onClose={() => {
            setPoDraft(null);
            setNote("If you pressed Create, the order is in Procurement → Purchase orders as a Draft.");
            setOpen(true);
          }}
        />
      )}
    </>
  );
};
