import { describe, it, expect } from "vitest";
import { fixSeller } from "./seller";

const me = { name: "B V Realty", gstin: "33AAAAA0000A1Z5" };

describe("the vendor on a bill is the seller", () => {
  it("swaps when the model read our own company as the vendor", () => {
    const { raw, swapped } = fixSeller({ vendorName: "B V REALTY", vendorGSTIN: "", buyerName: "ABC TRADERS", buyerGSTIN: "33BBBBB0000B1Z5" }, me);
    expect(swapped).toBe(true);
    expect(raw).toMatchObject({ vendorName: "ABC TRADERS", vendorGSTIN: "33BBBBB0000B1Z5", buyerName: "B V REALTY" });
  });
  it("matches our company by GSTIN too, and clears the vendor when there is no seller to swap in", () => {
    const { raw } = fixSeller({ vendorName: "Some name", vendorGSTIN: "33aaaaa0000a1z5" }, me);
    expect(raw.vendorName).toBe("");
  });
  it("leaves a correct read alone", () => {
    const r = { vendorName: "ABC TRADERS", buyerName: "B V Realty" };
    expect(fixSeller(r, me)).toEqual({ raw: r, swapped: false });
  });
});
