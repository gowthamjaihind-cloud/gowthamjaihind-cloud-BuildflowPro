import React, { useEffect, useState } from "react";
import { X, Copy, ArrowSquareOut, LinkBreak, Plus } from "@phosphor-icons/react";
import {
  callCreateClientShare,
  callListClientShares,
  callUpdateClientShare,
  type ClientShare,
  type ClientShareSections,
} from "../services/firebaseFunctions";

/**
 * Make and manage the links a client uses to follow a project
 * (sitetru.com/p/<token>). What each link shows is chosen per link; notes,
 * costs, materials and vendor details are never shown, whatever is chosen.
 */

const SECTION_LABELS: { key: keyof ClientShareSections; label: string; hint: string }[] = [
  { key: "progress", label: "Progress and schedule", hint: "Overall %, stages, milestones, expected completion" },
  { key: "photos", label: "Site photos", hint: "Photos attached to daily logs" },
  { key: "updates", label: "Daily work updates", hint: "Date, work item and progress. Never the notes" },
  { key: "payments", label: "Payment summary", hint: "Approved estimate total, paid so far, balance" },
];

const linkFor = (token: string) => `${window.location.origin}/p/${token}`;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "never");
const errText = (e: any) => String(e?.message || "Something went wrong.").replace(/^.*?:\s*/, "");

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-3 py-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="min-w-0">
      <span className="block text-sm font-bold text-ink">{label}</span>
      {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
    </span>
  </label>
);

export const ClientShareModal: React.FC<{ projectId: string; orgId?: string; projectName: string; onClose: () => void }> = ({ projectId, orgId, projectName, onClose }) => {
  const [shares, setShares] = useState<ClientShare[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [label, setLabel] = useState("");
  const [sections, setSections] = useState<ClientShareSections>({ progress: true, photos: true, updates: true, payments: false });
  const [showHeadcount, setShowHeadcount] = useState(false);

  useEffect(() => {
    callListClientShares({ orgId, projectId }).then(setShares).catch((e) => { setShares([]); setError(errText(e)); });
  }, [orgId, projectId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    const s = await callCreateClientShare({ orgId, projectId, label: label.trim(), sections, showHeadcount });
    setShares((cur) => [s, ...(cur || [])]);
    setLabel("");
  });

  const patch = (token: string, change: Partial<Pick<ClientShare, "sections" | "showHeadcount" | "revoked">>) => run(async () => {
    const s = await callUpdateClientShare({ token, ...change });
    setShares((cur) => (cur || []).map((x) => (x.token === token ? s : x)));
  });

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      window.prompt("Copy this link", linkFor(token));
    }
  };

  const active = (shares || []).filter((s) => !s.revoked);
  const off = (shares || []).filter((s) => s.revoked);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-panel text-ink w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Share with client">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-lg font-black">Share with client</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-ink-muted mb-4">
          Anyone with the link can see a live page for <b className="text-ink">{projectName}</b>, without signing in. It updates on its own as your team logs work.
          Notes, costs, rates, materials and vendor details are never shown.
        </p>

        <div className="border border-divider rounded-2xl p-4 mb-5">
          <h3 className="text-sm font-black mb-1">New link</h3>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Who is it for? e.g. Client, Architect"
            className="w-full mt-1 mb-2 px-3 py-2 rounded-xl bg-surface-1 border border-divider text-sm"
          />
          {SECTION_LABELS.map((s) => (
            <Toggle key={s.key} label={s.label} hint={s.hint} checked={sections[s.key]} onChange={(v) => setSections({ ...sections, [s.key]: v })} />
          ))}
          <Toggle label="Show number of workers" hint="In daily updates" checked={showHeadcount} disabled={!sections.updates} onChange={setShowHeadcount} />
          <button
            onClick={create}
            disabled={busy || !Object.values(sections).some(Boolean)}
            className="mt-2 w-full flex items-center justify-center gap-2 bg-primary text-on-primary font-bold text-sm rounded-xl py-2.5 disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create link
          </button>
        </div>

        {error && <p className="text-xs font-bold text-danger mb-3">{error}</p>}

        <h3 className="text-sm font-black mb-2">Active links</h3>
        {shares === null && <p className="text-xs text-ink-muted">Loading…</p>}
        {shares && active.length === 0 && <p className="text-xs text-ink-muted">No links yet.</p>}
        <div className="space-y-3">
          {active.map((s) => (
            <div key={s.token} className="border border-divider rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-bold text-sm truncate">{s.label || "Client link"}</p>
                <p className="text-[11px] text-ink-muted shrink-0">Opened {s.views} time{s.views === 1 ? "" : "s"} · last {when(s.lastViewedAt)}</p>
              </div>
              <p className="text-[11px] font-mono text-ink-muted truncate mb-2">{linkFor(s.token)}</p>
              <div className="grid grid-cols-2 gap-x-3">
                {SECTION_LABELS.map((x) => (
                  <Toggle key={x.key} label={x.label} checked={s.sections[x.key]} disabled={busy} onChange={(v) => patch(s.token, { sections: { ...s.sections, [x.key]: v } })} />
                ))}
                <Toggle label="Number of workers" checked={s.showHeadcount} disabled={busy || !s.sections.updates} onChange={(v) => patch(s.token, { showHeadcount: v })} />
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => copy(s.token)} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-on-primary cursor-pointer">
                  <Copy className="w-4 h-4" /> {copied === s.token ? "Copied" : "Copy link"}
                </button>
                <a href={linkFor(s.token)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-surface-2 text-ink">
                  <ArrowSquareOut className="w-4 h-4" /> Open
                </a>
                <button
                  onClick={() => window.confirm("Switch this link off? Anyone using it will no longer see the project. This cannot be undone; you can make a new link.") && patch(s.token, { revoked: true })}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-danger hover:bg-surface-2 cursor-pointer ml-auto"
                >
                  <LinkBreak className="w-4 h-4" /> Switch off
                </button>
              </div>
            </div>
          ))}
        </div>
        {off.length > 0 && <p className="text-[11px] text-ink-muted mt-4">{off.length} link{off.length === 1 ? "" : "s"} switched off.</p>}
      </div>
    </div>
  );
};
