import React, { useEffect, useState } from "react";
import { callListSupportReports } from "../../services/firebaseFunctions";

/**
 * Operator only: problems users sent from the help assistant's
 * "Something's not working?" check, newest first, with what the checks found.
 */
export const SupportReports: React.FC = () => {
  const [reports, setReports] = useState<any[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");

  const load = () => {
    setError("");
    callListSupportReports().then(setReports).catch((e) => { setReports([]); setError(String(e?.message || e)); });
  };
  useEffect(load, []);

  return (
    <section className="soft-card p-6 squircle-24 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-ink">Problem reports</h3>
        <button onClick={load} className="text-xs font-bold text-primary cursor-pointer">Refresh</button>
      </div>
      {reports === null && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {reports && reports.length === 0 && !error && <p className="text-sm text-ink-muted">No reports yet.</p>}
      <ul className="divide-y divide-divider">
        {(reports || []).map((r) => (
          <li key={r.id} className="py-3">
            <button onClick={() => setOpenId(openId === r.id ? "" : r.id)} className="w-full text-left cursor-pointer">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-bold truncate">{r.reportId} · {r.company || "(no workspace)"}</span>
                <span className="text-xs text-ink-muted shrink-0">{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <p className="text-xs text-ink-muted truncate">{r.email} · {r.description}</p>
            </button>
            {openId === r.id && (
              <div className="mt-2 text-xs space-y-1 bg-surface-1 rounded-xl p-3">
                <p className="whitespace-pre-wrap"><b>Said:</b> {r.description}</p>
                <p><b>Role:</b> {r.role || "?"} · <b>Screen:</b> {r.page || "?"}</p>
                <p><b>Device:</b> {r.device || "?"}</p>
                {(r.checks || []).map((c: any, i: number) => (
                  <p key={i}><b>[{c.status}] {c.label}:</b> {c.detail}</p>
                ))}
                {(r.errors || []).length > 0 && <p className="break-all"><b>Errors:</b> {r.errors.join(" | ")}</p>}
                {r.email && <a className="text-primary font-bold" href={`mailto:${r.email}?subject=${encodeURIComponent(`Your Sitetru report ${r.reportId}`)}`}>Reply by email</a>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
