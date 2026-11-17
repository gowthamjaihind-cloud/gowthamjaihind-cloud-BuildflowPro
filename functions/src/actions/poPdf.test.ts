import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// pdf-lib is installed only under functions/. The website deploy runs every
// test from the repo root without it, so there this suite is skipped; it runs
// with the functions tests.
const hasPdfLib = (() => {
  try {
    createRequire(__filename).resolve("pdf-lib");
    return true;
  } catch {
    return false;
  }
})();
const renderPoPdf = async (i: any) => (await import("./poPdf")).renderPoPdf(i);

describe.skipIf(!hasPdfLib)("PO PDF", () => {
  it("renders a draft and a numbered PO, including long and non-Latin text, without throwing", async () => {
    const input = {
      draft: true,
      orderDate: "2026-11-17",
      expectedDeliveryDate: "2026-11-20",
      notes: "Deliver to Block A — சிமெண்ட் ₹ note",
      company: { name: "Demo Builders", gstin: "33AAAAA0000A1Z5", addressLine1: "12 Main Road", city: "Madurai", state: "Tamil Nadu", poTerms: "Payment within 30 days." },
      vendor: { name: "VAIGAI TRADERS", gstin: "29BBBBB0000B1Z5", phone: "9876543210" },
      projectName: "Sample Villa",
      items: Array.from({ length: 40 }, (_, k) => ({ name: `OPC 53 Grade Cement, batch ${k} with a fairly long description to wrap`, hsn: "2523", unit: "bag", orderedQty: 100, rate: 380, gstRate: 28 })),
    };
    const draft = await renderPoPdf(input);
    expect(draft.subarray(0, 5).toString()).toBe("%PDF-");
    expect(draft.length).toBeGreaterThan(3000);
    const real = await renderPoPdf({ ...input, draft: false, poNumber: "PO-2026-0007", items: input.items.slice(0, 2) });
    expect(real.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
