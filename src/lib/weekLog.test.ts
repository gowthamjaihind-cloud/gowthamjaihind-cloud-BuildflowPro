import { describe, it, expect } from "vitest";
import {
  buildWeekLogs, copyDayTo, emptyLines, isSunday, labourSummary, mondayOf, shiftWeek, spreadProgress, weekDates, weekMaterialTotals, type WeekDay,
} from "./weekLog";

const mason = (n: number) => ({ roleId: "mason", roleName: "Mason", headcount: n });
const helper = (n: number) => ({ roleId: "helper", roleName: "Helper", headcount: n });
const shuttering = (amt: number) => ({ roleId: "shut", roleName: "Footing shuttering", headcount: 0, amount: amt });
const cement = (q: number) => ({ materialId: "cement", name: "OPC 53 Grade Cement", quantity: q, unit: "bag" });
const mixer = (h: number) => ({ equipmentId: "mixer", name: "Mixer", unit: "hours" as const, quantity: h });

const week = (start = "2026-11-16"): WeekDay[] =>
  weekDates(start).map((date) => ({ date, worked: !isSunday(date), ...emptyLines() }));

const base = {
  projectId: "p1", taskId: "t1", fromProgress: 20, toProgress: 50, markComplete: false,
  equipmentRates: { mixer: { hourlyRate: 300, dailyRate: 2000 } }, note: "Brickwork, first floor",
};

describe("dates", () => {
  it("gives seven days from the start, across a month end", () => {
    expect(weekDates("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });
  it("finds the Monday of a week and steps between weeks", () => {
    expect(mondayOf("2026-11-24")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(shiftWeek("2026-11-25", -1)).toBe("2026-11-16");
    expect(shiftWeek("2026-11-23", 1)).toBe("2026-11-30");
  });
});

describe("progress across the week", () => {
  it("rises evenly, never backwards, and ends exactly on the target", () => {
    expect(spreadProgress(20, 50, 6)).toEqual([25, 30, 35, 40, 45, 50]);
    expect(spreadProgress(60, 40, 3)).toEqual([60, 60, 60]);
    expect(spreadProgress(10, 20, 0)).toEqual([]);
  });
});

describe("each day has its own labour, materials and equipment", () => {
  it("saves a different gang, materials and machines on different days", () => {
    const d = week();
    d[0] = { ...d[0], labour: [mason(4), helper(6)], materials: [cement(10)] };
    d[1] = { ...d[1], labour: [mason(2), shuttering(18000)], equipment: [mixer(4)] };
    d[2] = { ...d[2], labour: [helper(8)], materials: [cement(25)], equipment: [mixer(6)] };
    const logs = buildWeekLogs({ ...base, days: d });
    expect(logs.map((l) => l.workDate)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(logs[0].labour).toEqual([mason(4), helper(6)]);
    expect(logs[1].labour).toEqual([mason(2), shuttering(18000)]);
    expect(logs[2].labour).toEqual([helper(8)]);
    expect(logs[1].equipment).toEqual([{ ...mixer(4), rate: 300, cost: 1200 }]);
    expect(logs[3].labour).toEqual([]); // nothing entered for Thursday
    expect(weekMaterialTotals(logs).get("cement")).toBe(35);
    expect(logs.map((l) => l.progressPercent)).toEqual([25, 30, 35, 40, 45, 50]);
  });

  it("a lump sum's amount can be different every day", () => {
    const d = week();
    d[0] = { ...d[0], labour: [shuttering(18000)] };
    d[1] = { ...d[1], labour: [shuttering(7500)] };
    const logs = buildWeekLogs({ ...base, days: d });
    expect(logs.slice(0, 2).map((l) => l.labour[0].amount)).toEqual([18000, 7500]);
  });

  it("copies a day to the next day or to all days, as separate copies", () => {
    const d = week();
    d[0] = { ...d[0], labour: [mason(4), helper(6)] };
    const next = copyDayTo(d, 0, [1]);
    expect(next[1].labour).toEqual([mason(4), helper(6)]);
    expect(next[2].labour).toEqual([]);
    next[1].labour[0].headcount = 9; // editing the copy leaves Monday alone
    expect(next[0].labour[0].headcount).toBe(4);
    const all = copyDayTo(d, 0, [1, 2, 3, 4, 5]);
    expect(all.slice(0, 6).every((x) => x.labour.length === 2)).toBe(true);
    expect(all[6].labour).toEqual([]);
  });

  it("marks only the last worked day complete, and saves nothing for days off", () => {
    const d = week().map((x) => ({ ...x, worked: x.date <= "2026-11-18" }));
    const logs = buildWeekLogs({ ...base, markComplete: true, days: d });
    expect(logs.map((l) => [l.progressPercent, l.markComplete])).toEqual([[47, false], [73, false], [100, true]]);
    expect(buildWeekLogs({ ...base, days: week().map((x) => ({ ...x, worked: false })) })).toEqual([]);
  });

  it("summarises a day's crew for the overview", () => {
    expect(labourSummary([mason(4), helper(6), shuttering(18000)])).toBe("Mason × 4, Helper × 6, Footing shuttering ₹18,000");
  });
});
