import { describe, it, expect } from "vitest";
import { stockCard } from "./stockCard";

const cement = { id: "cem", quantity: 300, consumed: 120 };
const grn = (id: string, no: string, date: string, qty: number, challan = "", vendor = "ABC TRADERS", extra: any = {}) => ({
  id, grnNumber: no, poNumber: "PO-2026-0008", vendorName: vendor, receiptDate: date, challanNumber: challan, createdByName: "Ravi",
  lineItems: [{ poLineRef: "cem", acceptedQty: qty, rate: 275.42 }, { poLineRef: "steel", acceptedQty: 900 }], ...extra,
});

describe("stock card", () => {
  it("lists receipts and uses with who, when and a running balance", () => {
    const c = stockCard(cement, [grn("g1", "GRN-2026-0001", "2026-11-02", 100, "212"), grn("g2", "GRN-2026-0004", "2026-11-09", 150, "245")],
      [{ id: "d1", workDate: "2026-11-05", taskId: "t1", createdByName: "Site", materials: [{ materialId: "cem", quantity: 120 }] }], () => "Footing");
    expect(c.rows.map((r) => [r.kind, r.date, r.qty, r.balance])).toEqual([
      ["opening", "", 50, 50],
      ["in", "2026-11-02", 100, 150],
      ["out", "2026-11-05", 120, 30],
      ["in", "2026-11-09", 150, 180],
    ]);
    expect(c.rows[1]).toMatchObject({ party: "ABC TRADERS", ref: "GRN-2026-0001 · PO-2026-0008 · Challan/Inv 212", by: "Ravi", via: "Goods receipt" });
    expect(c.rows[2].party).toBe("Footing");
    expect(c).toMatchObject({ received: 250, opening: 50, used: 120, inStock: 180, duplicates: 0 });
  });

  it("flags the same challan twice, or the same quantity within 3 days, from one vendor", () => {
    const sameChallan = stockCard(cement, [grn("g1", "GRN-1", "2026-11-02", 100, "212"), grn("g2", "GRN-2", "2026-11-20", 80, "212")], []);
    expect(sameChallan.duplicates).toBe(2);
    expect(sameChallan.rows.find((r) => r.grnId === "g2")?.duplicateOf).toBe("GRN-1");
    const sameQty = stockCard(cement, [grn("g1", "GRN-1", "2026-11-02", 100), grn("g2", "GRN-2", "2026-11-04", 100, "", "ABC TRADERS", { billId: "b1", createdVia: "telegram" })], []);
    expect(sameQty.duplicates).toBe(2);
    expect(sameQty.rows.find((r) => r.grnId === "g2")?.via).toBe("Bill via bot");
    // Different vendors, or a week apart: not flagged.
    expect(stockCard(cement, [grn("g1", "GRN-1", "2026-11-02", 100), grn("g2", "GRN-2", "2026-11-03", 100, "", "XYZ")], []).duplicates).toBe(0);
    expect(stockCard(cement, [grn("g1", "GRN-1", "2026-11-02", 100), grn("g2", "GRN-2", "2026-11-12", 100)], []).duplicates).toBe(0);
  });

  it("says when receipts add up to more than the stock quantity", () => {
    expect(stockCard({ id: "cem", quantity: 80 }, [grn("g1", "GRN-1", "2026-11-02", 100)], []).mismatch).toBe(20);
  });

  it("shows consumption not itemised by daily logs as one line, so the balance ends at the stock", () => {
    const c = stockCard({ id: "cem", quantity: 300, consumed: 200 }, [], [{ id: "d1", workDate: "2026-11-05", materials: [{ materialId: "cem", quantity: 50 }] }]);
    expect(c.used).toBe(200);
    expect(c.rows.at(-1)).toMatchObject({ kind: "out", qty: 150, party: "Used, not from a daily log", balance: 100 });
    expect(c.inStock).toBe(100);
  });
});
