import { describe, it, expect } from "vitest";
import { computePoTotals, hsnSummary, isValidGstin, isValidHsn, rupeesInWords, stateCodeOf, supplyKind, taxOn } from "./poTax";

describe("GST on a purchase order", () => {
  it("splits tax into equal CGST and SGST within a state", () => {
    const t = taxOn(10000, 18, false);
    expect(t).toMatchObject({ cgst: 900, sgst: 900, igst: 0, tax: 1800, total: 11800 });
  });

  it("charges the whole rate as IGST between states", () => {
    expect(taxOn(10000, 18, true)).toMatchObject({ cgst: 0, sgst: 0, igst: 1800, total: 11800 });
  });

  it("keeps CGST and SGST equal when the tax is an odd number of paise", () => {
    const t = taxOn(33.35, 5, false); // 1.6675 tax
    expect(t.cgst).toBe(t.sgst);
    expect(t.tax).toBe(t.cgst + t.sgst);
    expect(t.total).toBeCloseTo(33.35 + t.tax, 2);
  });

  it("decides the split from the two GSTINs' states", () => {
    expect(supplyKind("29ABCDE1234F1Z5", "29AAAAA0000A1Z5")).toEqual({ interState: false, stateKnown: true });
    expect(supplyKind("29ABCDE1234F1Z5", "33AAAAA0000A1Z5")).toEqual({ interState: true, stateKnown: true });
  });

  it("assumes the same state, and says so, when a GSTIN is missing", () => {
    expect(supplyKind("29ABCDE1234F1Z5", "")).toEqual({ interState: false, stateKnown: false });
    expect(supplyKind(undefined, "33AAAAA0000A1Z5")).toEqual({ interState: false, stateKnown: false });
  });

  it("totals lines at different rates, with taxed freight", () => {
    const t = computePoTotals(
      [{ orderedQty: 100, rate: 400, gstRate: 28 }, { orderedQty: 2, rate: 65000, gstRate: 18 }],
      { loading: 500, transport: 2500, other: 0 }, 18, false,
    );
    expect(t.subtotalTaxable).toBe(170000);
    expect(t.chargesTaxable).toBe(3000);
    // 40000 @28 = 11200; 130000 @18 = 23400; 3000 @18 = 540
    expect(t.totalTax).toBe(35140);
    expect(t.totalCGST).toBe(17570);
    expect(t.totalSGST).toBe(17570);
    expect(t.grandTotal).toBe(208140);
    expect(t.hasGst).toBe(true);
  });

  it("is an ordinary PO when no line carries a rate", () => {
    const t = computePoTotals([{ orderedQty: 10, rate: 50 }], { loading: 100 }, undefined, false);
    expect(t.totalTax).toBe(0);
    expect(t.grandTotal).toBe(600);
    expect(t.hasGst).toBe(false);
  });

  it("summarises tax by HSN code and rate", () => {
    const rows = hsnSummary([
      { hsn: "2523", ...taxOn(40000, 28, false) },
      { hsn: "2523", ...taxOn(10000, 28, false) },
      { hsn: "7214", ...taxOn(130000, 18, false) },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ hsn: "2523", gstRate: 28, taxableValue: 50000, tax: 14000 });
  });

  it("validates GSTINs and HSN codes", () => {
    expect(isValidGstin("29ABCDE1234F1Z5")).toBe(true);
    expect(isValidGstin("29ABCDE1234F1Z")).toBe(false);
    expect(isValidGstin("")).toBe(false);
    expect(stateCodeOf("33AAAAA0000A1Z5")).toBe("33");
    expect(isValidHsn("2523")).toBe(true);
    expect(isValidHsn("25232910")).toBe(true);
    expect(isValidHsn("")).toBe(true);
    expect(isValidHsn("252")).toBe(false);
    expect(isValidHsn("25A3")).toBe(false);
  });

  it("writes amounts in words the Indian way", () => {
    expect(rupeesInWords(208140)).toBe("Rupees Two Lakh Eight Thousand One Hundred Forty Only");
    expect(rupeesInWords(1500.5)).toBe("Rupees One Thousand Five Hundred and Fifty Paise Only");
    expect(rupeesInWords(12500000)).toBe("Rupees One Crore Twenty Five Lakh Only");
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
  });
});
