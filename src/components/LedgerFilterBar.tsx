import React, { useMemo, useState } from "react";
import { MagnifyingGlass, Funnel, X } from "@phosphor-icons/react";
import {
  activeFilterCount, DATE_PRESETS, EMPTY_FILTER, presetOf, presetRange,
  type DatePreset, type LedgerFilter,
} from "../lib/ledgerFilter";

interface Props {
  value: LedgerFilter;
  onChange: (f: LedgerFilter) => void;
  /** Vendors / parties to pick from; omit to hide the party filter. */
  parties?: { id: string; name: string }[];
  partyLabel?: string;
  kinds: { id: string; label: string }[];
  /** What "in" and "out" mean on this ledger. */
  directionLabels: { in: string; out: string };
  /** "Showing 12 of 48 entries" line, rendered under the bar. */
  summary?: React.ReactNode;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

const chip = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
    on ? "bg-surface-dark text-white border-surface-dark" : "bg-surface text-ink-muted border-divider hover:text-ink"
  }`;
const fieldCls =
  "w-full bg-surface px-3 py-2.5 rounded-xl border border-divider text-sm font-bold text-ink outline-none focus:ring-2 focus:ring-primary";
const labelCls = "text-[10px] font-black text-ink-muted uppercase tracking-widest";

/**
 * Search, a date range with presets, and (under "Filters") party, money in or
 * out, entry type and amount. Shared by the vendor ledger and the cash book.
 */
export const LedgerFilterBar: React.FC<Props> = ({ value: f, onChange, parties, partyLabel = "Vendor", kinds, directionLabels, summary }) => {
  const [open, setOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");
  const now = today();
  const preset = presetOf(f, now);
  const count = activeFilterCount(f);
  const set = (patch: Partial<LedgerFilter>) => onChange({ ...f, ...patch });
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const num = (v: string) => (v === "" ? undefined : Math.max(0, parseFloat(v)));

  const shownParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    const list = [...(parties || [])].sort((a, b) => a.name.localeCompare(b.name));
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [parties, partySearch]);

  return (
    <div className="bg-surface rounded-2xl border border-divider/60 shadow-sm p-3 md:p-4 space-y-3">
      <div className="flex flex-col md:flex-row gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search the ledger</span>
          <MagnifyingGlass className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={f.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search description, reference, vendor…"
            className={`${fieldCls} pl-9`}
          />
        </label>
        <div className="flex gap-2">
          <label className="flex-1 md:w-52">
            <span className="sr-only">Period</span>
            <select
              value={preset ?? (f.from || f.to ? "custom" : "")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") set({ from: undefined, to: undefined });
                else if (v === "custom") setOpen(true);
                else set(presetRange(v as DatePreset, now));
              }}
              className={fieldCls}
            >
              <option value="">All dates</option>
              {DATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="custom">Custom range…</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold border flex items-center gap-2 cursor-pointer transition-colors ${
              open || count > 0 ? "bg-surface-dark text-white border-surface-dark" : "bg-surface text-ink border-divider hover:bg-panel"
            }`}
          >
            <Funnel className="w-4 h-4" />
            Filters{count > 0 ? ` (${count})` : ""}
          </button>
        </div>
      </div>

      {open && (
        <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-divider/60">
          <div className="space-y-1.5">
            <span className={labelCls}>Date range</span>
            <div className="flex items-center gap-2">
              <input type="date" aria-label="From date" value={f.from || ""} max={f.to || undefined} onChange={(e) => set({ from: e.target.value || undefined })} className={`${fieldCls} font-mono`} />
              <span className="text-ink-muted text-xs font-bold">to</span>
              <input type="date" aria-label="To date" value={f.to || ""} min={f.from || undefined} onChange={(e) => set({ to: e.target.value || undefined })} className={`${fieldCls} font-mono`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className={labelCls}>Amount (₹)</span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} inputMode="decimal" aria-label="Minimum amount" placeholder="Min" value={f.min ?? ""} onChange={(e) => set({ min: num(e.target.value) })} className={`${fieldCls} font-mono`} />
              <span className="text-ink-muted text-xs font-bold">to</span>
              <input type="number" min={0} inputMode="decimal" aria-label="Maximum amount" placeholder="Max" value={f.max ?? ""} onChange={(e) => set({ max: num(e.target.value) })} className={`${fieldCls} font-mono`} />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className={labelCls}>Money</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Money in or out">
              {([["all", "All"], ["in", directionLabels.in], ["out", directionLabels.out]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={f.direction === k} onClick={() => set({ direction: k })} className={chip(f.direction === k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className={labelCls}>Entry type</span>
            <div className="flex flex-wrap gap-1.5">
              {kinds.map((k) => (
                <button key={k.id} type="button" aria-pressed={f.kinds.includes(k.id)} onClick={() => set({ kinds: toggle(f.kinds, k.id) })} className={chip(f.kinds.includes(k.id))}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {parties && parties.length > 0 && (
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className={labelCls}>
                  {partyLabel}
                  {f.parties.length ? ` · ${f.parties.length} selected` : ""}
                </span>
                {f.parties.length > 0 && (
                  <button type="button" onClick={() => set({ parties: [] })} className="text-[11px] font-bold text-primary-strong hover:underline cursor-pointer">
                    All {partyLabel.toLowerCase()}s
                  </button>
                )}
              </div>
              {parties.length > 8 && (
                <input type="search" value={partySearch} onChange={(e) => setPartySearch(e.target.value)} placeholder={`Find a ${partyLabel.toLowerCase()}…`} className={fieldCls} />
              )}
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {shownParties.map((p) => (
                  <button key={p.id} type="button" aria-pressed={f.parties.includes(p.id)} onClick={() => set({ parties: toggle(f.parties, p.id) })} className={chip(f.parties.includes(p.id))}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(summary || count > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-ink-muted">
          <span>{summary}</span>
          {count > 0 && (
            <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="flex items-center gap-1 text-primary-strong hover:underline cursor-pointer">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LedgerFilterBar;
