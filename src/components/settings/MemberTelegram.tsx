import React, { useState } from "react";
import { TelegramLogo, Copy, ShareNetwork, WhatsappLogo, X } from "@phosphor-icons/react";
import {
  callCreateMemberTelegramLink,
  callRevokeMemberTelegramLink,
  callUnlinkMemberTelegram,
  type TeamTelegramStatus,
} from "../../services/firebaseFunctions";
import { confirmDialog } from "../../lib/feedback";

/**
 * One member's Telegram, for an Owner or Admin: connected or not, and the
 * buttons to send them a "Connect Telegram" link, revoke it, or unlink them.
 * The link connects the bot as THAT member. It works once and does not
 * expire, so it is shown once here and can be revoked at any time.
 */

const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const errText = (e: any) => String(e?.message || "Something went wrong.").replace(/^.*?:\s*/, "");

export const MemberTelegram: React.FC<{
  orgId: string;
  memberUid: string;
  memberName: string;
  status?: TeamTelegramStatus[string];
  onChanged: () => void;
}> = ({ orgId, memberUid, memberName, status, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const make = () => run(async () => {
    if (status?.pendingSince && !(await confirmDialog({ title: "Make a new link?", body: `The link made on ${day(status.pendingSince)} will stop working.`, confirmLabel: "Make new link", cancelLabel: "Cancel" }))) return;
    const r = await callCreateMemberTelegramLink(orgId, memberUid);
    setLink(r.link);
    setCopied(false);
    onChanged();
  });
  const revoke = () => run(async () => {
    await callRevokeMemberTelegramLink(orgId, memberUid);
    setLink("");
    onChanged();
  });
  const unlink = () => run(async () => {
    if (!(await confirmDialog({ title: `Disconnect ${memberName}'s Telegram?`, body: "The bot stops working for them at once and they are told. You can send them a new link later.", confirmLabel: "Disconnect", cancelLabel: "Cancel" }))) return;
    await callUnlinkMemberTelegram(orgId, memberUid);
    setLink("");
    onChanged();
  });

  const message = `Hi ${memberName.split(" ")[0]}, tap this link and press Start to connect the Sitetru bot on Telegram. It is only for you, please don't forward it: ${link}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { window.prompt("Copy this link", link); }
  };
  const share = async () => {
    try { await (navigator as any).share({ title: "Connect Sitetru on Telegram", text: message }); } catch { /* cancelled */ }
  };

  const btn = "text-[11px] font-bold px-2.5 py-1 rounded-lg border border-divider hover:bg-surface-2 disabled:opacity-50 cursor-pointer";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {status?.linked ? (
          <>
            <span className="text-[11px] font-bold text-success flex items-center gap-1"><TelegramLogo weight="fill" className="w-3.5 h-3.5" />Connected{status.linkedAt ? ` ${day(status.linkedAt)}` : ""}</span>
            <button onClick={unlink} disabled={busy} className={`${btn} text-danger`}>Unlink</button>
          </>
        ) : status?.pendingSince && !link ? (
          <>
            <span className="text-[11px] text-ink-muted">Link sent {day(status.pendingSince)}, not used yet</span>
            <button onClick={make} disabled={busy} className={btn}>New link</button>
            <button onClick={revoke} disabled={busy} className={`${btn} text-danger`}>Revoke</button>
          </>
        ) : !link ? (
          <button onClick={make} disabled={busy} className={`${btn} flex items-center gap-1`}><TelegramLogo className="w-3.5 h-3.5" />Send Telegram link</button>
        ) : null}
      </div>
      {link && (
        <div className="text-left bg-surface-1 border border-divider rounded-xl p-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-ink-muted">Send this to <b className="text-ink">{memberName}</b> only. Whoever opens it first is connected as them. It works once and does not expire; revoke it if it went to the wrong person.</p>
            <button onClick={() => setLink("")} aria-label="Hide" className="p-0.5 cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-[11px] font-mono break-all">{link}</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={copy} className={`${btn} flex items-center gap-1`}><Copy className="w-3.5 h-3.5" />{copied ? "Copied" : "Copy"}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={`${btn} flex items-center gap-1`}><WhatsappLogo className="w-3.5 h-3.5" />WhatsApp</a>
            {typeof (navigator as any).share === "function" && <button onClick={share} className={`${btn} flex items-center gap-1`}><ShareNetwork className="w-3.5 h-3.5" />Share</button>}
            <button onClick={revoke} disabled={busy} className={`${btn} text-danger`}>Revoke</button>
          </div>
        </div>
      )}
      {error && <p className="text-[11px] font-bold text-danger">{error}</p>}
    </div>
  );
};
