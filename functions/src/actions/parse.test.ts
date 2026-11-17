import { describe, it, expect } from "vitest";
import { buildActionPrompt, sanitizeAction, actionFor } from "./parse";
import type { PoContext } from "../command/po";

const ctx: PoContext = {
  today: "2026-11-17",
  vendors: [{ id: "v1", name: "ABC TRADERS" }],
  materials: [{ id: "m1", name: "OPC 53 Cement", unit: "bag", rate: 380, hsn: "2523", gstRate: 28 }],
};

describe("actions: reading a request", () => {
  it("records a payment MADE to a vendor (not a client payment), day-first date", () => {
    // "Payment made to abc traders on 4/11/2026 amount is rs.144970"
    const r = sanitizeAction({ intent: "vendor_payment", vendorId: "v1", amount: 144970, date: "2026-11-04", method: "" }, ctx, "x");
    expect(r.prepared).toEqual({ kind: "vendorPayment", vendorId: "v1", vendorName: "ABC TRADERS", amount: 144970, date: "2026-11-04", method: "Bank Transfer", reference: "", description: "" });
    expect(actionFor(r.prepared)).toBe("vendorpay.create");
    // An unknown vendor is asked about, not guessed.
    expect(sanitizeAction({ intent: "vendor_payment", vendorId: "zz", amount: 5000 }, ctx, "x").prepared.kind).toBe("other");
  });
  it("prepares a PO through the PO checks", () => {
    const r = sanitizeAction({ intent: "create_po", vendorId: "v1", items: [{ itemId: "m1", qty: 50 }] }, ctx, "order cement");
    expect(r.prepared).toMatchObject({ kind: "po", missingVendor: false });
    expect(actionFor(r.prepared)).toBe("po.create");
  });
  it("prepares a client payment, never dated in the future, with a known method", () => {
    const r = sanitizeAction({ intent: "client_payment", amount: "150000", date: "2026-12-30", method: "Crypto", reference: "UTR 4471" }, ctx, "x");
    expect(r.prepared).toEqual({ kind: "payment", amount: 150000, date: "2026-11-17", method: "Bank Transfer", reference: "UTR 4471", description: "Client payment" });
    expect(sanitizeAction({ intent: "client_payment", amount: 0 }, ctx, "x").prepared.kind).toBe("other");
  });
  it("prepares a vendor and a material, cleaning bad GSTIN, HSN and GST rate", () => {
    expect(sanitizeAction({ intent: "add_vendor", vendor: { name: "Sri Murugan Steels", type: "Labour", gstin: "33abcde1234f1z5", phone: "+91 98765-43210" } }, ctx, "x").prepared)
      .toEqual({ kind: "vendor", name: "Sri Murugan Steels", type: "Material", phone: "+91 9876543210", gstin: "33ABCDE1234F1Z5", contactPerson: "", address: "" });
    // Not on the checked list: the model's values, cleaned and marked for checking.
    expect(sanitizeAction({ intent: "add_material", material: { name: "Teak door frame", unit: "nos", rate: 4500, hsn: "44-18", gstRate: 7 } }, ctx, "x").prepared)
      .toEqual({ kind: "material", name: "Teak door frame", unit: "nos", rate: 4500, hsn: "4418", gstRate: 0, taxNote: "AI suggestion, please check" });
    expect(sanitizeAction({ intent: "add_material", material: { name: "Door handle", hsn: "123" } }, ctx, "x").prepared).toMatchObject({ hsn: "", unit: "nos" });
    // On the list: the checked HSN and rate win over the model's.
    expect(sanitizeAction({ intent: "add_material", material: { name: "River sand", unit: "load", rate: 4500, hsn: "2517", gstRate: 18 } }, ctx, "x").prepared)
      .toEqual({ kind: "material", name: "River sand", unit: "load", rate: 4500, hsn: "2505", gstRate: 5, taxNote: "from Sitetru's checked list" });
  });
  it("hands daily work reports to the daily-log reader", () => {
    expect(sanitizeAction({ intent: "daily_log" }, ctx, "footing 50% done").prepared).toEqual({ kind: "log" });
  });
  it("keeps only known materials in a question, and treats payment and order questions as money", () => {
    const q = sanitizeAction({ intent: "question", topic: "stock", materialIds: ["m1", "zzz"], question: "cement left?" }, ctx, "x").prepared;
    expect(q).toEqual({ kind: "question", topic: "stock", materialIds: ["m1"], question: "cement left?" });
    expect(actionFor(q)).toBe("ask.site");
    expect(actionFor({ kind: "question", topic: "payments", materialIds: [], question: "" })).toBe("ask.money");
  });
  it("says what it can do for anything else", () => {
    const r = sanitizeAction({ intent: "weather" }, ctx, "x").prepared;
    expect(r.kind).toBe("other");
    expect(actionFor(r)).toBeNull();
    expect(buildActionPrompt(ctx, null)).toMatch(/attached audio/);
  });
});
