import { describe, it, expect } from "vitest";
import { stockFacts, orderFacts } from "./facts";

describe("question facts", () => {
  it("works out stock on hand like the Inventory screen, flagging low stock", () => {
    const f = stockFacts([
      { id: "a", name: "Cement", quantity: 500, consumed: 460.5, unit: "bag", minThreshold: 50 },
      { id: "b", name: "Sand", quantity: 10, consumed: 12, unit: "load" },
    ]);
    expect(f[0]).toEqual({ material: "Cement", onHand: 39.5, unit: "bag", received: 500, used: 460.5, low: true, minimum: 50 });
    expect(f[1].onHand).toBe(0);
    expect(stockFacts([{ id: "a", name: "Cement" }, { id: "b", name: "Sand" }], ["b"]).map((x) => x.material)).toEqual(["Sand"]);
  });
  it("lists open orders newest first with what is still to come", () => {
    const f = orderFacts([
      { poNumber: "PO-2026-0001", status: "Closed", orderDate: "2026-10-01" },
      { poNumber: "PO-2026-0002", vendorName: "Vaigai", status: "Partially Received", orderDate: "2026-11-02", totalAmount: 1000, lineItems: [{ name: "Cement", orderedQty: 100, receivedQty: 60, unit: "bag" }, { name: "Steel", orderedQty: 5, receivedQty: 5, unit: "MT" }] },
      { poNumber: "PO-2026-0003", status: "Draft", orderDate: "2026-11-10", lineItems: [] },
    ]);
    expect(f.map((x) => x.po)).toEqual(["PO-2026-0003", "PO-2026-0002"]);
    expect(f[1].pending).toEqual([{ item: "Cement", left: 40, unit: "bag" }]);
  });
});
