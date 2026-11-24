// Filters for the vendor ledger (Procurement) and the cash book (Cost >
// Payments): search, a date range with presets, party, money in or out, entry
// type and amount. The ledger screens map their rows to LedgerRow once and
// share this logic, so a filter means the same thing on both.

export interface LedgerFilter {
  search: string;
  /** Inclusive, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Party (vendor) ids; empty = all. */
  parties: string[];
  /** "in" = credit / inward, "out" = debit / outward. */
  direction: "all" | "in" | "out";
  /** Entry kinds; empty = all. */
  kinds: string[];
  min?: number;
  max?: number;
}

export const EMPTY_FILTER: LedgerFilter = { search: "", parties: [], direction: "all", kinds: [] };

export interface LedgerRow {
  date: string;
  partyId?: string;
  direction: "in" | "out";
  kind: string;
  amount: number;
  /** Everything searchable: description, reference, party name, kind label. */
  text: string;
}

/** YYYY-MM-DD of any date-ish value (ISO string, Date, or YYYY-MM-DD). */
export function dayOf(d: unknown): string {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d as string);
  if (Number.isNaN(t.getTime())) return "";
  // Local calendar day, as the ledger shows it (toLocaleDateString).
  const y = t.getFullYear(), m = String(t.getMonth() + 1).padStart(2, "0"), dd = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const iso = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m, d));
  return t.toISOString().slice(0, 10);
};

export type DatePreset = "this-month" | "last-month" | "last-30" | "this-quarter" | "this-fy" | "last-fy";

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-30", label: "Last 30 days" },
  { id: "this-quarter", label: "This quarter" },
  { id: "this-fy", label: "This financial year" },
  { id: "last-fy", label: "Last financial year" },
];

/**
 * The date range of a preset, from `today` (YYYY-MM-DD). Quarters and the
 * financial year follow the Indian year, April to March.
 */
export function presetRange(p: DatePreset, today: string): { from: string; to: string } {
  const [y, m1, d] = today.split("-").map(Number);
  const m = m1 - 1; // 0-based
  const fyStart = m >= 3 ? y : y - 1; // FY starts 1 April
  switch (p) {
    case "this-month":
      return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "last-month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "last-30":
      return { from: iso(y, m, d - 29), to: today };
    case "this-quarter": {
      // Indian quarters: Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar.
      const qStart = Math.floor(((m + 9) % 12) / 3) * 3; // months since April, floored to quarter
      const startMonth = (qStart + 3) % 12;
      const startYear = startMonth > m ? y - 1 : y;
      return { from: iso(startYear, startMonth, 1), to: iso(startYear, startMonth + 3, 0) };
    }
    case "this-fy":
      return { from: iso(fyStart, 3, 1), to: iso(fyStart + 1, 2, 31) };
    case "last-fy":
      return { from: iso(fyStart - 1, 3, 1), to: iso(fyStart, 2, 31) };
  }
}

/** The preset a range matches, if any (to show it as selected). */
export function presetOf(f: Pick<LedgerFilter, "from" | "to">, today: string): DatePreset | null {
  if (!f.from || !f.to) return null;
  return DATE_PRESETS.find((p) => {
    const r = presetRange(p.id, today);
    return r.from === f.from && r.to === f.to;
  })?.id ?? null;
}

export function inDateRange(date: string, f: Pick<LedgerFilter, "from" | "to">): boolean {
  const d = dayOf(date);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

/** Does a row pass every filter (date included)? */
export function matchesFilter(r: LedgerRow, f: LedgerFilter): boolean {
  if (!inDateRange(r.date, f)) return false;
  if (f.parties.length && !(r.partyId && f.parties.includes(r.partyId))) return false;
  if (f.direction !== "all" && r.direction !== f.direction) return false;
  if (f.kinds.length && !f.kinds.includes(r.kind)) return false;
  const amt = Math.abs(Number(r.amount) || 0);
  if (f.min !== undefined && !Number.isNaN(f.min) && amt < f.min) return false;
  if (f.max !== undefined && !Number.isNaN(f.max) && amt > f.max) return false;
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = r.text.toLowerCase();
    // Every word must appear, in any order: "cement march" finds both.
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** How many filters are set (for the "Filters (3)" button). Search counts as one. */
export function activeFilterCount(f: LedgerFilter): number {
  return (
    (f.search.trim() ? 1 : 0) +
    (f.from || f.to ? 1 : 0) +
    (f.parties.length ? 1 : 0) +
    (f.direction !== "all" ? 1 : 0) +
    (f.kinds.length ? 1 : 0) +
    (f.min !== undefined || f.max !== undefined ? 1 : 0)
  );
}

/**
 * Totals and balances for a period. `net` of a row is +amount for "in" and
 * -amount for "out". `openingAll` is the balance before the first entry ever
 * (for the vendor ledger, what the vendor's outstanding implies). The period
 * opening adds everything before `from`; the closing adds the period too.
 * Rows outside the party filter are ignored here; the type, amount and search
 * filters only hide rows, they do not change a balance.
 */
export function periodBalances<T extends LedgerRow>(rows: T[], f: LedgerFilter, openingAll: number) {
  const scoped = rows.filter((r) => !f.parties.length || (r.partyId && f.parties.includes(r.partyId)));
  const net = (r: LedgerRow) => (r.direction === "in" ? 1 : -1) * (Number(r.amount) || 0);
  let opening = openingAll;
  let inPeriod = 0;
  for (const r of scoped) {
    const d = dayOf(r.date);
    if (f.from && d < f.from) opening += net(r);
    else if (!f.to || d <= f.to) inPeriod += net(r);
  }
  const shown = rows.filter((r) => matchesFilter(r, f));
  const totalIn = shown.filter((r) => r.direction === "in").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalOut = shown.filter((r) => r.direction === "out").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { opening, closing: opening + inPeriod, shown, totalIn, totalOut };
}
