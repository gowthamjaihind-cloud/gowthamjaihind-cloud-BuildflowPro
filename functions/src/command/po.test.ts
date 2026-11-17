import { describe, it, expect } from "vitest";
import { buildCommandPrompt, sanitizeCommand, type PoContext } from "./po";

const ctx: PoContext = {
  today: "2026-11-17",
  vendors: [{ id: "v1", name: "VAIGAI TRADERS" }, { id: "v2", name: "Sri Murugan Steels" }],
  materials: [
    { id: "m1", name: "OPC 53 Cement", unit: "bag", rate: 380, hsn: "2523", gstRate: 28 },
    { id: "m2", name: "TMT 12mm", unit: "kg", rate: 62, hsn: "7214", gstRate: 18 },
  ],
};

describe("command chat: purchase orders", () => {
  it("builds a draft PO from a well-formed answer, with the usual rate where none was said", () => {
    const r = sanitizeCommand({ intent: "create_po", vendorId: "v1", items: [{ itemId: "m1", qty: 100, rate: null }, { itemId: "m2", qty: 500, rate: 60 }], expectedDeliveryDate: "2026-11-20", notes: "Deliver to Block A" }, ctx, "order cement");
    expect(r.kind).toBe("po");
    if (r.kind !== "po") return;
    expect(r.draft).toMatchObject({ vendorId: "v1", vendorName: "VAIGAI TRADERS", expectedDeliveryDate: "2026-11-20", notes: "Deliver to Block A" });
    expect(r.draft.items).toEqual([
      { itemId: "m1", materialId: "", name: "OPC 53 Cement", unit: "bag", orderedQty: 100, rate: 380, hsn: "2523", gstRate: 28, rateFromRequest: false },
      { itemId: "m2", materialId: "", name: "TMT 12mm", unit: "kg", orderedQty: 500, rate: 60, hsn: "7214", gstRate: 18, rateFromRequest: true },
    ]);
    expect(r.missingVendor).toBe(false);
  });

  it("drops invented vendors, materials and bad quantities, and past dates", () => {
    const r = sanitizeCommand({ intent: "create_po", vendorId: "ghost", items: [{ itemId: "zzz", qty: 5 }, { itemId: "m1", qty: -3 }, { itemId: "m1", qty: 10 }, { itemId: "m1", qty: 5 }], expectedDeliveryDate: "2026-11-01", unmatched: ["river sand"] }, ctx, "x");
    if (r.kind !== "po") throw new Error("expected po");
    expect(r.missingVendor).toBe(true);
    expect(r.draft.items).toHaveLength(1);
    expect(r.draft.items[0].orderedQty).toBe(15);
    expect(r.draft.expectedDeliveryDate).toBe("");
    expect(r.unmatched).toEqual(["river sand"]);
  });

  it("answers anything else with what it can do", () => {
    const r = sanitizeCommand({ intent: "other", reply: "" }, ctx, "what's the weather");
    expect(r.kind).toBe("other");
    if (r.kind === "other") expect(r.reply).toMatch(/purchase orders/);
  });

  it("uses the transcript for voice and the typed text otherwise", () => {
    expect(sanitizeCommand({ intent: "other", transcript: "spoken words" }, ctx, null).transcript).toBe("spoken words");
    expect(buildCommandPrompt(ctx, null)).toMatch(/attached audio/);
    expect(buildCommandPrompt(ctx, "order cement")).toContain("REQUEST: order cement");
    expect(buildCommandPrompt(ctx, "x")).toContain("v1 | VAIGAI TRADERS");
  });
});
