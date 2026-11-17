import { describe, it, expect } from "vitest";
import { previewLines, blockers, poTotals, type Pending } from "./preview";

const po = (over: any = {}): Extract<Pending, { kind: "po" }> => ({
  kind: "po",
  unmatched: [],
  missingVendor: false,
  draft: { vendorId: "v1", vendorName: "VAIGAI TRADERS", expectedDeliveryDate: "2026-11-20", notes: "", items: [{ itemId: "m1", materialId: "", name: "Cement", unit: "bag", orderedQty: 100, rate: 380, hsn: "2523", gstRate: 28, rateFromRequest: false }] },
  ...over,
});

describe("action previews", () => {
  it("shows a PO with GST worked out as the form does", () => {
    const lines = previewLines(po(), "Sample Villa", { buyerGstin: "33AAAAA0000A1Z5", vendorGstin: "33BBBBB0000B1Z5" });
    expect(lines.join("\n")).toContain("Cement: 100 bag × ₹380 (usual rate) + GST 28% = ₹48,640");
    expect(lines.join("\n")).toContain("Value ₹38,000 + GST ₹10,640 (CGST+SGST) = Total ₹48,640");
    expect(poTotals(po(), "33AAAAA0000A1Z5", "29BBBBB0000B1Z5").interState).toBe(true);
  });
  it("blocks a PO without a vendor, a rate or an HSN for a taxed line", () => {
    expect(blockers(po())).toEqual([]);
    const bad = po({ missingVendor: true, draft: { ...po().draft, items: [{ ...po().draft.items[0], rate: 0, hsn: "" }] } });
    expect(blockers(bad).join(" ")).toMatch(/No vendor.*no rate.*no HSN/);
  });
  it("shows payments, vendors and materials plainly", () => {
    expect(previewLines({ kind: "payment", amount: 150000, date: "2026-11-17", method: "UPI", reference: "4471", description: "2nd instalment" }, "P")).toContain("Amount: ₹1,50,000");
    expect(previewLines({ kind: "vendor", name: "Sri Murugan Steels", type: "Material", phone: "", gstin: "", contactPerson: "", address: "" }, "P").join(" ")).toMatch(/GSTIN: not given/);
    expect(blockers({ kind: "material", name: "Sand", unit: "load", rate: 0, hsn: "", gstRate: 0 })).toEqual([]);
  });
});
