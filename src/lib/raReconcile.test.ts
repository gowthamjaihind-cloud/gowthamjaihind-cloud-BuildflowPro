import { describe, it, expect } from "vitest";
import { billRecord, billsForDailyLog, reconcile, type BillLike, type LogLike } from "./raReconcile";

const isCO = (t: string) => t.startsWith("co-");
const log = (id: string, date: string, cost: number, taskId = "brick"): LogLike => ({ id: `${id}_xyz`, vendorId: "xyz", date, items: [{ taskId, cost }] });

describe("after an RA bill is certified", () => {
  const d1 = log("d1", "2026-11-20", 3600); // 4 masons x 900
  const d2 = log("d2", "2026-11-21", 2700);
  const rec = billRecord([d1, d2], [], false, isCO);
  const bill: BillLike = { id: "b1", billNumber: "RA-XYZ-0001", billDate: "2026-11-22", isChangeOrder: false, logIds: [d1.id, d2.id], ...rec };

  it("records what each log was billed at, and the work it covered", () => {
    expect(rec.logAmounts).toEqual({ d1_xyz: 3600, d2_xyz: 2700 });
    expect(rec.workKeys).toEqual(["xyz|brick|2026-11-20", "xyz|brick|2026-11-21"]);
  });

  it("nothing to settle when nothing changed; new work is billed", () => {
    const d3 = log("d3", "2026-11-23", 1800);
    const r = reconcile({ logs: [d1, d2, d3], bills: [bill], changeOrder: false, isCO });
    expect(r.adjustments).toEqual([]);
    expect(r.reentries).toEqual([]);
    expect(r.toBill.map((l) => l.id)).toEqual(["d3_xyz"]);
  });

  it("an edited billed log: the difference goes on the next bill", () => {
    const more = { ...d1, items: [{ taskId: "brick", cost: 4500 }] }; // a 5th mason added
    const r = reconcile({ logs: [more, d2], bills: [bill], changeOrder: false, isCO });
    expect(r.adjustments).toEqual([{ logId: "d1_xyz", billNumber: "RA-XYZ-0001", billed: 3600, now: 4500, diff: 900, deleted: false }]);
    expect(r.adjustmentTotal).toBe(900);
  });

  it("a deleted billed log comes off the next bill", () => {
    const r = reconcile({ logs: [d2], bills: [bill], changeOrder: false, isCO });
    expect(r.adjustments).toMatchObject([{ logId: "d1_xyz", diff: -3600, deleted: true }]);
  });

  it("deleting a billed log and entering the same day again is held back, not billed twice", () => {
    const again = log("d9", "2026-11-20", 3600);
    const r = reconcile({ logs: [again, d2], bills: [bill], changeOrder: false, isCO });
    expect(r.toBill).toEqual([]);
    expect(r.reentries).toEqual([{ logId: "d9_xyz", date: "2026-11-20", billNumber: "RA-XYZ-0001", amount: 3600 }]);
    // ...and the deleted original is still settled: -3600 on the next bill.
    expect(r.adjustmentTotal).toBe(-3600);
  });

  it("once settled on a later bill, an adjustment is not raised again", () => {
    const more = { ...d1, items: [{ taskId: "brick", cost: 4500 }] };
    const first = reconcile({ logs: [more, d2], bills: [bill], changeOrder: false, isCO });
    const bill2: BillLike = { id: "b2", billNumber: "RA-XYZ-0002", billDate: "2026-11-29", isChangeOrder: false, logIds: [], ...billRecord([], first.adjustments, false, isCO) };
    const second = reconcile({ logs: [more, d2], bills: [bill, bill2], changeOrder: false, isCO });
    expect(second.adjustments).toEqual([]);
  });

  it("old bills (no recorded amounts) still stop a re-entry while the billed log exists", () => {
    const legacy: BillLike = { id: "b0", billNumber: "RA-XYZ-OLD", logIds: [d1.id] };
    const again = log("d9", "2026-11-20", 3600);
    const r = reconcile({ logs: [d1, again], bills: [legacy], changeOrder: false, isCO });
    expect(r.reentries.map((x) => x.logId)).toEqual(["d9_xyz"]);
    expect(r.adjustments).toEqual([]);
  });

  it("base and change-order labour are kept apart", () => {
    const co = log("c1", "2026-11-20", 1000, "co-extra-room");
    const r = reconcile({ logs: [d1, d2, co], bills: [bill], changeOrder: true, isCO });
    expect(r.toBill.map((l) => l.id)).toEqual(["c1_xyz"]);
    expect(r.reentries).toEqual([]);
  });

  it("finds the bills a daily log is on", () => {
    expect(billsForDailyLog("d1", [bill]).map((b) => b.billNumber)).toEqual(["RA-XYZ-0001"]);
    expect(billsForDailyLog("d7", [bill])).toEqual([]);
  });
});
