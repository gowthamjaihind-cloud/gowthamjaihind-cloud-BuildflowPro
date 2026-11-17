import { describe, it, expect } from "vitest";
import { receiptFor } from "./billReceipt";

const po = { poNumber: "PO-2026-0008", lineItems: [
  { itemId: "cem", name: "CEMENT", orderedQty: 50, receivedQty: 20, unit: "BAGS", materialId: "M-CEM" },
  { itemId: "stl", name: "TMT 12mm", orderedQty: 1600, receivedQty: 0, unit: "kg" },
] };

describe("goods receipt from a scanned bill", () => {
  it("receives the linked lines at the bill's rate before tax", () => {
    const r = receiptFor({ lineItems: [{ name: "OPC cement", qty: 30, rate: 275.42, poLineRef: "cem" }, { name: "Unloading", qty: 1, rate: 500 }] }, po);
    expect(r.lines).toEqual([{ poLineRef: "cem", materialId: "M-CEM", name: "OPC cement", orderedQty: 50, receivedQty: 30, acceptedQty: 30, rejectedQty: 0, unit: "BAGS", rate: 275.42 }]);
    expect(r.over).toEqual([]);
    expect(r.notOnPo).toEqual(["Unloading"]);
  });

  it("refuses to receive more than is outstanding", () => {
    const r = receiptFor({ lineItems: [{ name: "OPC cement", qty: 40, rate: 275, poLineRef: "cem" }] }, po);
    expect(r.over).toEqual(["OPC cement: 40 but only 30 remain on PO-2026-0008."]);
  });
});
