import React, { useCallback, useEffect, useState } from "react";

/**
 * The page a client opens from a shared link: sitetru.com/p/<token>.
 *
 * Deliberately standalone. It loads no Firebase, needs no sign-in and reads
 * nothing but /api/client-share, which answers with the client view the
 * server built from an allow-list (functions/src/clientShare/build.ts). It
 * refreshes itself every minute, so a page left open stays current.
 */

type View = {
  company: { name: string; logo?: string; phone?: string; email?: string };
  project: { name: string; status: string; startDate: string; endDate: string; imageUrl?: string };
  sections: { progress: boolean; photos: boolean; updates: boolean; payments: boolean };
  asOf: string;
  progress?: {
    overall: number;
    phases: { name: string; start: string; end: string; progress: number; late: boolean }[];
    milestones: { name: string; date: string; done: boolean }[];
    lateCount: number;
    expectedCompletion: string;
    tasksDone: number;
    tasksTotal: number;
  };
  photos?: { url: string; date: string; task: string }[];
  updates?: { date: string; task: string; progress: number; workers?: number; photos: number }[];
  payments?: { contractValue: number; approvedEstimates: number; received: number; balance: number; history: { date: string; amount: number }[] };
};

const REFRESH_MS = 60_000;

const fmtDate = (d: string) => {
  if (!d) return "—";
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function tokenFromPath(path: string): string {
  const m = /^\/p\/([A-Za-z0-9_-]{24,64})\/?$/.exec(path);
  return m ? m[1] : "";
}

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="bg-panel border border-divider rounded-2xl p-4 sm:p-5">
    <h2 className="text-[11px] font-black uppercase tracking-widest text-ink-muted mb-3">{title}</h2>
    {children}
  </section>
);

const Bar: React.FC<{ pct: number; late?: boolean }> = ({ pct, late }) => (
  <div className="h-2 bg-surface-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full ${late ? "bg-warning" : pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
  </div>
);

export default function ClientDashboardPage() {
  const token = tokenFromPath(window.location.pathname);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string>("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("This link is not complete. Please check it with your builder.");
      return;
    }
    try {
      const r = await fetch(`/api/client-share?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A link switched off stays off; a passing server error keeps the last view.
        if (r.status === 404) setView(null);
        setError(body?.error || "The dashboard could not be loaded just now.");
        return;
      }
      setView(body);
      setError("");
      setLoadedAt(new Date());
    } catch {
      setError("No connection. The page will try again shortly.");
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (view) document.title = `${view.project.name} · Progress`;
  }, [view]);

  if (!view) {
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center px-4">
        <p className="text-sm text-ink-muted text-center max-w-sm">{error || "Loading the project dashboard…"}</p>
      </div>
    );
  }

  const { company, project, progress, photos, updates, payments } = view;
  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="bg-panel border-b border-divider">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          {company.logo && <img src={company.logo} alt="" className="h-10 w-10 object-contain rounded-lg" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink-muted truncate">{company.name}</p>
            <h1 className="text-lg sm:text-xl font-black truncate">{project.name}</h1>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-2 text-ink shrink-0">{project.status}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {error && <p className="text-xs font-bold text-warning">{error}</p>}

        {progress && (
          <Card title="Progress">
            <div className="flex items-end justify-between gap-4 mb-3">
              <div>
                <p className="text-4xl font-black font-mono text-primary leading-none">{progress.overall}%</p>
                <p className="text-xs text-ink-muted mt-1">{progress.tasksDone} of {progress.tasksTotal} work items finished</p>
              </div>
              <div className="text-right text-xs text-ink-muted">
                <p>Started {fmtDate(project.startDate)}</p>
                <p>Expected completion <b className="text-ink">{fmtDate(progress.expectedCompletion)}</b></p>
              </div>
            </div>
            <Bar pct={progress.overall} />
            {progress.lateCount > 0 && (
              <p className="text-xs font-bold text-warning mt-2">{progress.lateCount} work item{progress.lateCount === 1 ? " is" : "s are"} behind schedule.</p>
            )}

            {progress.phases.length > 0 && (
              <div className="mt-5 space-y-3">
                <h3 className="text-xs font-black text-ink">Stages</h3>
                {progress.phases.map((ph, i) => (
                  <div key={i}>
                    <div className="flex justify-between gap-3 text-xs mb-1">
                      <span className="font-bold truncate">{ph.name}</span>
                      <span className="font-mono text-ink-muted shrink-0">{ph.progress}%{ph.late ? " · late" : ""}</span>
                    </div>
                    <Bar pct={ph.progress} late={ph.late} />
                    <p className="text-[11px] text-ink-muted mt-1">{fmtDate(ph.start)} – {fmtDate(ph.end)}</p>
                  </div>
                ))}
              </div>
            )}

            {progress.milestones.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-black text-ink mb-2">Milestones</h3>
                <ul className="space-y-1.5">
                  {progress.milestones.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate"><span className={m.done ? "text-success" : "text-ink-muted"}>{m.done ? "✓" : "○"}</span> {m.name}</span>
                      <span className="text-ink-muted shrink-0">{fmtDate(m.date)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {payments && (
          <Card title="Payments">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[11px] text-ink-muted">Agreed value</p><p className="text-sm sm:text-lg font-black font-mono">{inr(payments.contractValue)}</p></div>
              <div><p className="text-[11px] text-ink-muted">Paid so far</p><p className="text-sm sm:text-lg font-black font-mono text-success">{inr(payments.received)}</p></div>
              <div><p className="text-[11px] text-ink-muted">Balance</p><p className="text-sm sm:text-lg font-black font-mono">{inr(payments.balance)}</p></div>
            </div>
            {payments.history.length > 0 && (
              <ul className="mt-4 divide-y divide-divider text-xs">
                {payments.history.map((p, i) => (
                  <li key={i} className="flex justify-between py-2"><span className="text-ink-muted">{fmtDate(p.date)}</span><span className="font-mono font-bold">{inr(p.amount)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {photos && photos.length > 0 && (
          <Card title="Site photos">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((ph, i) => (
                <button key={i} onClick={() => setPhoto(ph.url)} className="aspect-square rounded-lg overflow-hidden bg-surface-2 cursor-pointer" aria-label={`${ph.task}, ${fmtDate(ph.date)}`}>
                  <img src={ph.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </Card>
        )}

        {updates && updates.length > 0 && (
          <Card title="Daily work updates">
            <ul className="divide-y divide-divider">
              {updates.map((u, i) => (
                <li key={i} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{u.task}</p>
                    <p className="text-ink-muted">
                      {fmtDate(u.date)}
                      {typeof u.workers === "number" && u.workers > 0 ? ` · ${u.workers} workers` : ""}
                      {u.photos > 0 ? ` · ${u.photos} photo${u.photos === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <span className="font-mono font-bold shrink-0">{u.progress}%</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <footer className="text-center text-[11px] text-ink-muted pt-2 pb-8 space-y-1">
          {(company.phone || company.email) && (
            <p>
              Questions? Contact {company.name}
              {company.phone && <> · <a className="underline" href={`tel:${company.phone}`}>{company.phone}</a></>}
              {company.email && <> · <a className="underline" href={`mailto:${company.email}`}>{company.email}</a></>}
            </p>
          )}
          <p>Updated {loadedAt ? loadedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""} · refreshes every minute</p>
        </footer>
      </main>

      {photo && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={() => setPhoto(null)} role="dialog" aria-label="Photo">
          <img src={photo} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
