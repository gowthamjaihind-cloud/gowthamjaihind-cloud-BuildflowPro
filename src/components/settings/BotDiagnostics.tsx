import React, { useState } from "react";
import { CheckCircle, WarningCircle, ArrowsClockwise, PlugsConnected } from "@phosphor-icons/react";
import { callTelegramDiagnostics, callTelegramReconnect, type TelegramDiagnostics } from "../../services/firebaseFunctions";

/**
 * Operator-only: what Telegram itself says about the bot's connection.
 *
 * A bot that has stopped replying looks the same from a phone whatever the
 * cause. This shows the cause (no webhook, wrong address, a rejected secret,
 * a bad token) and offers the one fix that covers most of them: registering
 * this app's webhook again with the current secret.
 */
export const BotDiagnostics: React.FC = () => {
  const [d, setD] = useState<TelegramDiagnostics | null>(null);
  const [busy, setBusy] = useState<"check" | "fix" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (mode: "check" | "fix") => {
    setBusy(mode);
    setErr(null);
    try {
      setD(mode === "check" ? await callTelegramDiagnostics() : await callTelegramReconnect());
    } catch (e: any) {
      setErr(e?.message || "Couldn't reach the bot service. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const Row: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
    <div className="flex items-start gap-2 text-sm text-ink">
      {ok ? <CheckCircle weight="fill" className="w-4 h-4 text-success shrink-0 mt-0.5" /> : <WarningCircle weight="fill" className="w-4 h-4 text-danger shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  );

  return (
    <section className="soft-card p-8 squircle-24">
      <h3 className="text-xl font-bold text-ink mb-1">{"Bot connection check"}</h3>
      <p className="text-ink-muted text-sm mb-5">
        {"Operator only. If the bot has stopped replying, check here what Telegram reports, then reconnect."}
      </p>
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <button onClick={() => run("check")} disabled={!!busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50">
          <ArrowsClockwise className="w-4 h-4" /> {busy === "check" ? "Checking…" : "Check connection"}
        </button>
        <button onClick={() => run("fix")} disabled={!!busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary-deep apple-transition disabled:opacity-50">
          <PlugsConnected className="w-4 h-4" /> {busy === "fix" ? "Reconnecting…" : "Reconnect bot"}
        </button>
      </div>
      {err && <p className="text-sm text-danger mb-3">{err}</p>}
      {d && (
        <div className="space-y-2">
          <Row ok={d.tokenOk}>{d.tokenOk ? `Bot token accepted${d.botUsername ? ` (@${d.botUsername})` : ""}` : "Telegram does not accept the bot token"}</Row>
          <Row ok={d.urlMatches}>{d.urlMatches ? "Telegram is sending messages to this app" : d.webhookUrl ? "Telegram is sending messages to a different address" : "Telegram is not sending messages anywhere (no webhook set)"}</Row>
          <Row ok={d.secretConfigured}>{d.secretConfigured ? "Webhook secret is configured" : "No webhook secret is configured"}</Row>
          <Row ok={!d.lastErrorMessage}>
            {d.lastErrorMessage ? `Last delivery failed${d.lastErrorAt ? ` on ${when(d.lastErrorAt)}` : ""}: ${d.lastErrorMessage}` : "No delivery errors reported"}
          </Row>
          <Row ok={d.pendingUpdates === 0}>{d.pendingUpdates === 0 ? "No messages waiting" : `${d.pendingUpdates} message${d.pendingUpdates === 1 ? "" : "s"} waiting to be delivered`}</Row>
          {(d.recentErrors || []).length > 0 && (
            <div className="pt-3 mt-2 border-t border-divider">
              <p className="text-sm font-bold text-ink mb-1">{"Recent AI read failures"}</p>
              {(d.recentErrors || []).map((e, i) => (
                <p key={i} className="text-xs text-ink-muted font-mono break-words">
                  {`${when(e.at)} · ${e.kind === "aiText" ? "typed report" : e.kind === "invoice" ? "invoice photo" : e.kind}${e.code ? ` · ${e.code}` : ""}: ${e.reason}`}
                </p>
              ))}
            </div>
          )}
          {d.problems.length === 0 ? (
            <p className="text-sm text-success font-semibold pt-2">{"Everything looks connected. Send the bot /help to confirm."}</p>
          ) : (
            <p className="text-sm text-ink-muted pt-2">
              {d.urlMatches && !d.lastErrorMessage
                ? "Reconnect if the bot still does not reply."
                : "Press Reconnect bot, then check again. A past delivery error stays listed until the next message gets through."}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default BotDiagnostics;
