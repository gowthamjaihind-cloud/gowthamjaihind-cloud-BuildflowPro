import { describe, it, expect } from "vitest";
import { labourLineCost, lumpSums, contractorBill, marginPctOf, wageRate } from "./labourCost";

const vendors = [{ id: "muthu", contractorMarginPct: 10 }, { id: "plain" }];
const mason = { id: "r1", vendorId: "muthu", rate: 900, unit: "Shift", role: "Mason" };
const helper = { id: "r2", vendorId: "plain", rate: 650, unit: "Shift", role: "Helper" };
const lump = { id: "r3", vendorId: "muthu", rate: 50000, unit: "Lumpsum", role: "Footing shuttering", date: "2026-11-10" };

describe("labour cost", () => {
  it("adds the contractor's margin to wages; none when not set", () => {
    expect(labourLineCost(5, mason, vendors)).toBe(4950); // 5 x 900 = 4500 + 10%
    expect(labourLineCost(4, helper, vendors)).toBe(2600);
    expect(marginPctOf("plain", vendors)).toBe(0);
  });
  it("never costs a lump sum per head", () => {
    expect(wageRate(lump)).toBe(0);
    expect(labourLineCost(10, lump, vendors)).toBe(0);
    expect(lumpSums([mason, lump, helper], vendors)).toEqual([
      { id: "r3", vendorId: "muthu", description: "Footing shuttering", date: "2026-11-10", amount: 50000, cost: 55000 },
    ]);
  });
  it("builds a contractor bill: wages + lump sums + margin", () => {
    expect(contractorBill(45000, 0, 10)).toEqual({ wages: 45000, lumpSum: 0, marginPct: 10, margin: 4500, total: 49500 });
    expect(contractorBill(45000, 50000, 10).total).toBe(104500);
    expect(contractorBill(1000, 0, 0).total).toBe(1000);
  });
});

describe("variable lump sums (amount entered per daily log)", async () => {
  const { labourLineCost, labourLineWages, lumpSums, usableInDailyLog, isVariableLumpSum } = await import("./labourCost");
  const shuttering = { id: "ls1", vendorId: "xyz", role: "Footing shuttering", unit: "Lumpsum", variable: true };
  const oldFixed = { id: "ls0", vendorId: "xyz", role: "Plinth shuttering", unit: "Lumpsum", rate: 25000, date: "2026-03-01" };
  const mason = { id: "m", vendorId: "xyz", role: "Mason", unit: "Shift", rate: 900 };
  const xyz = [{ id: "xyz", contractorMarginPct: 10 }];

  it("a daily log line costs the amount entered that day, plus the contractor's margin", () => {
    expect(labourLineWages(0, shuttering, 18000)).toBe(18000);
    expect(labourLineCost(0, shuttering, xyz, 18000)).toBe(19800);
    expect(labourLineCost(0, shuttering, xyz, 7500)).toBe(8250);
  });
  it("the card itself costs nothing; old fixed lump sums still count once", () => {
    expect(lumpSums([shuttering, oldFixed, mason], xyz).map((l) => [l.id, l.cost])).toEqual([["ls0", 27500]]);
  });
  it("daily logs offer per-head cards and variable lump sums, not old fixed ones", () => {
    expect([mason, shuttering, oldFixed].filter(usableInDailyLog).map((c) => c.id)).toEqual(["m", "ls1"]);
    expect(isVariableLumpSum(oldFixed)).toBe(false);
  });
  it("per-head lines are unchanged, whatever amount is passed", () => {
    expect(labourLineCost(4, mason, xyz)).toBe(3960);
    expect(labourLineCost(4, mason, xyz, 99999)).toBe(3960);
    expect(labourLineCost(3, oldFixed, xyz, 5000)).toBe(0);
  });
});
