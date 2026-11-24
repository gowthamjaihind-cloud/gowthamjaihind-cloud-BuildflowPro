import React, { useState } from "react";
import { motion } from "motion/react";
import { X, CaretDown, CaretRight } from "@phosphor-icons/react";
import type { vendorStatement, StatementLine } from "../lib/raReconcile";
import type { RABill, Vendor } from "../types";
import { DialogBehaviour } from "../lib/useDialog";

type Statement = ReturnType<typeof vendorStatement<RABill>>;

interface Props {
  vendor: Vendor;
  statement: Statement;
  /** Payments made to this contractor (vendor ledger debits). */
  paid: number;
  /** Lump sums for this contractor not yet on a bill. */
  openLumpSum: number;
  marginPct: number;
  onClose: () => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate = (d: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

const Lines: React.FC<{ lines: StatementLine[] }> = ({ lines }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-[10px] font-black uppercase tracking-widest text-ink-muted border-b border-divider">
          <th className="py-2 pr-3">Date</th>
          <th className="py-2 pr-3">Task</th>
          <th className="py-2 pr-3">Workers</th>
          <th className="py-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-divider/60">
        {lines.map((l) => (
          <tr key={`${l.logId}-${l.changeOrder}`} className={l.deleted ? "text-ink-muted" : "text-ink"}>
            <td className="py-2 pr-3 whitespace-nowrap font-mono">{l.deleted ? "—" : fmtDate(l.date)}</td>
            <td className="py-2 pr-3">
              {l.deleted ? <span className="italic">Daily log since deleted</span> : l.tasks}
              {l.changeOrder && !l.deleted && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary-strong text-[9px] font-black uppercase">CO</span>}
            </td>
            <td className="py-2 pr-3">{l.crew}</td>
            <td className="py-2 text-right font-mono font-bold whitespace-nowrap">{inr(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * One labour contractor's running account: what is certified (each RA bill
 * and the daily logs on it), what is paid, what is owed, and the work still
 * to be certified. Opened by clicking the contractor on RA Billing.
 */
export const RAVendorStatement: React.FC<Props> = ({ vendor, statement: s, paid, openLumpSum, marginPct, onClose }) => {
  const [open, setOpen] = useState<string | null>(s.certified[0]?.bill.id ?? null);
  const toCertify = s.unbilledTotal + s.adjustmentTotal + openLumpSum;
  const withMargin = toCertify * (1 + (marginPct || 0) / 100);

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center md:p-6">
      <DialogBehaviour onClose={onClose} />
      <div className="absolute inset-0 bg-surface-dark/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`RA statement: ${vendor.name}`}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative bg-surface w-full md:max-w-3xl max-h-[92vh] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 p-5 md:p-7 border-b border-divider">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">RA statement</p>
            <h2 className="text-xl md:text-2xl font-black text-ink tracking-tight">{vendor.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2.5 rounded-full bg-panel hover:bg-divider cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 md:p-7 space-y-7">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Certified", value: s.certifiedTotal, cls: "text-ink" },
              { label: "Paid", value: paid, cls: "text-success" },
              { label: "Owed now", value: vendor.outstandingBalance || 0, cls: "text-danger" },
              { label: "Yet to certify", value: withMargin, cls: "text-primary-strong" },
            ].map((c) => (
              <div key={c.label} className="bg-panel rounded-2xl p-4 border border-divider">
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted mb-1">{c.label}</p>
                <p className={`text-lg md:text-xl font-black font-mono ${c.cls}`}>{inr(c.value)}</p>
              </div>
            ))}
          </div>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-black text-ink uppercase tracking-widest">Yet to be certified</h3>
              <span className="text-xs font-bold text-ink-muted">{s.unbilled.length} daily log{s.unbilled.length === 1 ? "" : "s"}</span>
            </div>
            {s.unbilled.length === 0 && s.adjustments.length === 0 && openLumpSum === 0 ? (
              <p className="text-sm text-ink-muted font-semibold bg-panel rounded-xl p-4">Nothing waiting: every logged day is on a certified bill.</p>
            ) : (
              <div className="bg-surface border border-divider rounded-2xl p-4 space-y-3">
                {s.unbilled.length > 0 && <Lines lines={s.unbilled} />}
                {openLumpSum > 0 && <p className="text-xs font-bold text-ink">Lump sums not yet billed: {inr(openLumpSum)}</p>}
                {s.adjustments.length > 0 && (
                  <div className="text-xs font-semibold bg-warning/10 border border-warning/25 rounded-xl px-3 py-2">
                    <p className="font-black text-ink">Adjustments to earlier bills: {s.adjustmentTotal >= 0 ? "+" : "−"}{inr(Math.abs(s.adjustmentTotal))}</p>
                    <ul className="mt-1 space-y-0.5 text-ink-muted">
                      {s.adjustments.map((a) => (
                        <li key={`${a.logId}-${a.changeOrder}`}>
                          {a.billNumber}: log {a.deleted ? "deleted" : `changed from ${inr(a.billed)} to ${inr(a.now)}`} ({a.diff >= 0 ? "+" : "−"}{inr(Math.abs(a.diff))})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs font-bold text-ink border-t border-divider pt-3 flex flex-wrap justify-between gap-2">
                  <span>Wages {inr(toCertify)}{marginPct > 0 ? ` + contractor margin ${marginPct}%` : ""}</span>
                  <span className="font-black">{inr(withMargin)} to certify</span>
                </p>
              </div>
            )}
            {s.reentries.length > 0 && (
              <div className="text-xs font-semibold bg-danger/8 border border-danger/20 rounded-xl px-3 py-2">
                <p className="font-black text-danger">Held back: already paid on an earlier bill</p>
                <ul className="mt-1 space-y-0.5 text-ink-muted">
                  {s.reentries.map((r) => (
                    <li key={r.logId}>{fmtDate(r.date)}: {inr(r.amount)}, same task and day as {r.billNumber}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-black text-ink uppercase tracking-widest">Certified bills</h3>
              <span className="text-xs font-bold text-ink-muted">{s.certified.length}</span>
            </div>
            {s.certified.length === 0 ? (
              <p className="text-sm text-ink-muted font-semibold bg-panel rounded-xl p-4">No RA bill certified for {vendor.name} yet.</p>
            ) : (
              <div className="space-y-2">
                {s.certified.map(({ bill, lines }) => {
                  const isOpen = open === bill.id;
                  return (
                    <div key={bill.id} className="border border-divider rounded-2xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : bill.id)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-panel/60 hover:bg-panel text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {isOpen ? <CaretDown className="w-4 h-4 shrink-0" /> : <CaretRight className="w-4 h-4 shrink-0" />}
                          <span className="min-w-0">
                            <span className="block font-black text-primary text-sm">
                              {bill.billNumber}
                              {bill.isChangeOrder && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary-strong text-[9px] font-black uppercase">Change order</span>}
                            </span>
                            <span className="block text-[11px] font-bold text-ink-muted">
                              Certified {fmtDate(bill.billDate)}
                              {(bill.periodFrom || bill.periodTo) && ` · work ${fmtDate(bill.periodFrom || "") || "…"} to ${fmtDate(bill.periodTo || "") || "…"}`}
                              {` · ${lines.length} log${lines.length === 1 ? "" : "s"}`}
                            </span>
                          </span>
                        </span>
                        <span className="font-mono font-black text-ink whitespace-nowrap">{inr(bill.netAmount)}</span>
                      </button>
                      {isOpen && (
                        <div className="p-4 space-y-2">
                          {lines.length > 0 ? <Lines lines={lines} /> : <p className="text-xs text-ink-muted font-semibold">No daily logs on this bill (lump sums or adjustments only).</p>}
                          {(bill.lumpSumIds?.length || 0) > 0 && <p className="text-xs font-bold text-ink-muted">Includes {bill.lumpSumIds!.length} lump sum{bill.lumpSumIds!.length === 1 ? "" : "s"}.</p>}
                          {!!bill.adjustmentAmount && (
                            <p className="text-xs font-bold text-ink-muted">
                              Includes an adjustment of {bill.adjustmentAmount >= 0 ? "+" : "−"}{inr(Math.abs(bill.adjustmentAmount))} to earlier bills.
                            </p>
                          )}
                          {!!bill.marginAmount && <p className="text-xs font-bold text-ink-muted">Contractor margin {bill.marginPct}%: {inr(bill.marginAmount)}.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default RAVendorStatement;
