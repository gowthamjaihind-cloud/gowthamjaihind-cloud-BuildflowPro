import { describe, it, expect } from "vitest";
import { buildActionPrompt, sanitizeAction, actionFor } from "./parse";
import type { PoContext } from "../command/po";

const ctx: PoContext = {
  today: "2026-11-17",
  vendors: [{ id: "v1", name: "VAIGAI TRADERS" }],
  materials: [{ id: "m1", name: "OPC 53 Cement", unit: "bag", rate: 380, hsn: "2523", gstRate: 28 }],
};

describe("actions: reading a request", () => {
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
    expect(sanitizeAction({ intent: "add_material", material: { name: "River sand", unit: "load", rate: 4500, hsn: "25-05", gstRate: 7 } }, ctx, "x").prepared)
      .toEqual({ kind: "material", name: "River sand", unit: "load", rate: 4500, hsn: "2505", gstRate: 0 });
    expect(sanitizeAction({ intent: "add_material", material: { name: "Sand", hsn: "123" } }, ctx, "x").prepared).toMatchObject({ hsn: "", unit: "nos" });
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
