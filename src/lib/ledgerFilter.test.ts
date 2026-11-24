import { describe, it, expect } from "vitest";
import { activeFilterCount, EMPTY_FILTER, matchesFilter, periodBalances, presetOf, presetRange, type LedgerRow } from "./ledgerFilter";

const rows: LedgerRow[] = [
  { date: "2026-03-28", partyId: "abc", direction: "in", kind: "GRN", amount: 50000, text: "ABC Traders OPC 53 cement 130 bags" },
  { date: "2026-04-05", partyId: "abc", direction: "out", kind: "PAYMENT", amount: 30000, text: "ABC Traders payment NEFT" },
  { date: "2026-04-20", partyId: "steel", direction: "in", kind: "GRN", amount: 120000, text: "Sample Steel Supplier TMT bars 12mm" },
  { date: "2026-05-02T10:30:00.000Z", partyId: "abc", direction: "in", kind: "BILL", amount: 8000, text: "ABC Traders M-sand bill" },
  { date: "2026-05-15", partyId: "steel", direction: "out", kind: "PAYMENT", amount: 100000, text: "Sample Steel Supplier payment cheque" },
];

describe("date presets (Indian financial year)", () => {
  it("financial year runs April to March", () => {
    expect(presetRange("this-fy", "2026-11-24")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(presetRange("this-fy", "2027-02-10")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(presetRange("last-fy", "2026-11-24")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
  it("months, the last 30 days and quarters", () => {
    expect(presetRange("this-month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("last-month", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("last-30", "2026-11-24")).toEqual({ from: "2026-10-26", to: "2026-11-24" });
    expect(presetRange("this-quarter", "2026-11-24")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("this-quarter", "2026-02-10")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(presetRange("this-quarter", "2026-05-10")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });
  it("recognises a range that is a preset", () => {
    expect(presetOf({ from: "2026-04-01", to: "2027-03-31" }, "2026-11-24")).toBe("this-fy");
    expect(presetOf({ from: "2026-04-02", to: "2027-03-31" }, "2026-11-24")).toBe(null);
  });
});

describe("filtering rows", () => {
  const pick = (f: Partial<typeof EMPTY_FILTER>) => rows.filter((r) => matchesFilter(r, { ...EMPTY_FILTER, ...f })).map((r) => r.amount);
  it("by date range, inclusive, whatever the stored date format", () => {
    expect(pick({ from: "2026-04-01", to: "2026-05-02" })).toEqual([30000, 120000, 8000]);
  });
  it("by vendor, direction, kind and amount", () => {
    expect(pick({ parties: ["steel"] })).toEqual([120000, 100000]);
    expect(pick({ direction: "out" })).toEqual([30000, 100000]);
    expect(pick({ kinds: ["GRN", "BILL"] })).toEqual([50000, 120000, 8000]);
    expect(pick({ min: 10000, max: 60000 })).toEqual([50000, 30000]);
  });
  it("search needs every word, in any order", () => {
    expect(pick({ search: "abc payment" })).toEqual([30000]);
    expect(pick({ search: "TMT 12mm" })).toEqual([120000]);
    expect(pick({ search: "nothing like this" })).toEqual([]);
  });
  it("counts the filters that are on", () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, search: "x", from: "2026-04-01", parties: ["a"], direction: "in", kinds: ["GRN"], min: 1 })).toBe(6);
  });
});

describe("balances for a period", () => {
  it("opening adds everything before the period; closing adds the period", () => {
    const b = periodBalances(rows, { ...EMPTY_FILTER, from: "2026-04-01", to: "2026-04-30" }, 10000);
    expect(b.opening).toBe(10000 + 50000);
    expect(b.closing).toBe(60000 - 30000 + 120000);
    expect(b.totalIn).toBe(120000);
    expect(b.totalOut).toBe(30000);
  });
  it("one vendor's statement uses only that vendor's entries", () => {
    const b = periodBalances(rows, { ...EMPTY_FILTER, parties: ["abc"], from: "2026-04-01" }, 0);
    expect(b.opening).toBe(50000);
    expect(b.closing).toBe(50000 - 30000 + 8000);
  });
  it("type and search filters hide rows but do not change the balances", () => {
    const all = periodBalances(rows, { ...EMPTY_FILTER, from: "2026-04-01" }, 0);
    const pays = periodBalances(rows, { ...EMPTY_FILTER, from: "2026-04-01", direction: "out" }, 0);
    expect(pays.closing).toBe(all.closing);
    expect(pays.shown.map((r) => r.amount)).toEqual([30000, 100000]);
    expect(pays.totalIn).toBe(0);
  });
});
