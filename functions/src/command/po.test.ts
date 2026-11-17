import { describe, it, expect } from "vitest";
import { buildCommandPrompt, sanitizeCommand, type PoContext } from "./po";

const ctx: PoContext = {
  today: "2026-11-17",
  vendors: [{ id: "v1", name: "ABC TRADERS" }, { id: "v2", name: "Sri Murugan Steels" }],
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
    expect(r.draft).toMatchObject({ vendorId: "v1", vendorName: "ABC TRADERS", expectedDeliveryDate: "2026-11-20", notes: "Deliver to Block A" });
    expect(r.draft.items).toEqual([
      // Saved at 28%; cement is 18% since 22 Sep 2025, so the checked list corrects it and says so.
      { itemId: "m1", materialId: "", name: "OPC 53 Cement", unit: "bag", orderedQty: 100, rate: 380, hsn: "2523", gstRate: 18, rateFromRequest: false, taxSource: "list", taxNote: "GST was 28%, current rate is 18% (Sitetru's checked list)" },
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
    expect(buildCommandPrompt(ctx, "x")).toContain("v1 | ABC TRADERS");
  });

  it("turns steel asked for by count into kg, and tells the vendor the count", () => {
    const r = sanitizeCommand({ intent: "create_po", vendorId: "v2", items: [{ itemId: "m2", nos: 150, qty: null }] }, ctx, "12mm 150 nos");
    if (r.kind !== "po") throw new Error("not a po");
    expect(r.draft.items[0]).toMatchObject({ orderedQty: 1600, unit: "kg", nos: 150, conversion: "12mm: 150 nos × 12 m × 0.889 kg/m = 1,600 kg" });
    expect(r.draft.notes).toContain("TMT 12mm: 150 nos (1600 kg)");
  });

  it("fills a missing HSN from the checked list, else takes the AI's suggestion marked for checking", () => {
    const c: PoContext = { ...ctx, materials: [
      { id: "s", name: "River sand", unit: "cft", rate: 60, hsn: "", gstRate: 18 },
      { id: "d", name: "Teak door frame", unit: "nos", rate: 5000, hsn: "", gstRate: 18 },
      { id: "x", name: "Granite slab", unit: "sqft", rate: 90, hsn: "", gstRate: 18 },
    ] };
    const r = sanitizeCommand({ intent: "create_po", vendorId: "v1", items: [
      { itemId: "s", qty: 400 }, { itemId: "d", qty: 2, hsn: "4418", gstRate: 18 }, { itemId: "x", qty: 10, hsn: "12", gstRate: 18 },
    ] }, c, "x");
    if (r.kind !== "po") throw new Error("not a po");
    expect(r.draft.items[0]).toMatchObject({ hsn: "2505", gstRate: 5, taxSource: "list" });
    expect(r.draft.items[1]).toMatchObject({ hsn: "4418", gstRate: 18, taxSource: "ai", taxNote: "AI suggestion, please check" });
    expect(r.draft.items[2].hsn).toBe(""); // a bad suggestion is dropped
    expect(r.draft.items[2].taxSource).toBeUndefined();
  });

  it("a material saved with GST but no HSN (CEMENT, 18%) gets the HSN, so the PO can be confirmed", async () => {
    const c: PoContext = { ...ctx, materials: [{ id: "c", name: "CEMENT", unit: "BAGS", rate: 0, hsn: "", gstRate: 18 }] };
    const r = sanitizeCommand({ intent: "create_po", vendorId: "v1", items: [{ itemId: "c", qty: 50, rate: 275.42 }] }, c, "x");
    if (r.kind !== "po") throw new Error("not a po");
    expect(r.draft.items[0]).toMatchObject({ hsn: "2523", gstRate: 18, taxSource: "list", taxNote: "HSN added (Sitetru's checked list)" });
    const { blockers } = await import("../actions/preview");
    expect(blockers({ kind: "po", ...r })).toEqual([]);
  });
});
