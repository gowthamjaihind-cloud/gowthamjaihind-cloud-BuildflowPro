import { describe, it, expect } from "vitest";
import { intake } from "./stock";

const base = { openingQty: undefined, currentQuantity: 0, consumed: 0, unitCost: 0, acceptedQty: 0, acceptedSpend: 0, acceptedBefore: 0 };

describe("stock intake", () => {
  it("keeps opening stock when the first goods receipt arrives -- it used to be erased", () => {
    const r = intake({ ...base, openingQty: 1000, unitCost: 70, acceptedQty: 300, acceptedSpend: 300 * 68 });
    expect(r.quantity).toBe(1300);
    expect(r.avgUnitCost).toBeCloseTo((1000 * 70 + 300 * 68) / 1300, 6);
  });

  it("infers opening stock for an older item on its first receipt, undoing the browser-side deductions", () => {
    // Entered 200, logs consumed 50 (quantity was decremented to 150), first receipt of 95.
    const r = intake({ ...base, currentQuantity: 150, consumed: 50, unitCost: 400, acceptedQty: 95, acceptedSpend: 95 * 395 });
    expect(r.openingQty).toBe(200);
    expect(r.quantity).toBe(295);
  });

  it("does not invent opening stock once an earlier receipt has already overwritten it", () => {
    const r = intake({ ...base, currentQuantity: 300, consumed: 100, acceptedQty: 500, acceptedSpend: 500 * 68, acceptedBefore: 300 });
    expect(r.openingQty).toBe(0);
    expect(r.quantity).toBe(500);
    expect(r.avgUnitCost).toBe(68);
  });

  it("does not zero the average cost when nothing was accepted", () => {
    expect(intake({ ...base, openingQty: 1000, unitCost: 70 }).avgUnitCost).toBe(70);
  });
});
