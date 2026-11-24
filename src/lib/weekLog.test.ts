import { describe, it, expect } from "vitest";
import { buildWeekLogs, cellKey, isSunday, mondayOf, spreadProgress, weekDates, weekMaterialTotals, type WeekDay } from "./weekLog";

const days = (start: string, worked: (d: string) => boolean = (d) => !isSunday(d)): WeekDay[] =>
  weekDates(start).map((date) => ({ date, worked: worked(date), qty: {} }));

const base = {
  projectId: "p1",
  taskId: "t1",
  fromProgress: 20,
  toProgress: 50,
  markComplete: false,
  materials: [{ materialId: "cement", name: "OPC 53 Grade Cement", quantity: 10, unit: "bag" }],
  labour: [
    { roleId: "mason", roleName: "Mason", headcount: 4 },
    { roleId: "helper", roleName: "Helper", headcount: 6 },
  ],
  equipment: [{ equipmentId: "mixer", name: "Mixer", unit: "hours" as const, quantity: 4 }],
  equipmentRates: { mixer: { hourlyRate: 300, dailyRate: 2000 } },
  note: "Brickwork, first floor",
};

describe("dates", () => {
  it("gives seven days from the start, across a month end", () => {
    expect(weekDates("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-11-24")).toBe("2026-11-23"); // Tuesday
    expect(mondayOf("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // Sunday
  });
  it("knows Sunday", () => {
    expect(isSunday("2026-11-29")).toBe(true);
    expect(isSunday("2026-11-28")).toBe(false);
  });
});

describe("progress across the week", () => {
  it("rises evenly and ends exactly on the target", () => {
    expect(spreadProgress(20, 50, 6)).toEqual([25, 30, 35, 40, 45, 50]);
    expect(spreadProgress(0, 100, 3)).toEqual([33, 67, 100]);
  });
  it("never goes backwards, and stays within 0-100", () => {
    expect(spreadProgress(60, 40, 3)).toEqual([60, 60, 60]);
    expect(spreadProgress(-5, 140, 2)).toEqual([50, 100]);
    expect(spreadProgress(10, 20, 0)).toEqual([]);
  });
});

describe("one log per worked day", () => {
  it("saves Monday to Saturday with the 'each day' amounts and the spread progress", () => {
    const logs = buildWeekLogs({ ...base, days: days("2026-11-16") });
    expect(logs.map((l) => l.workDate)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(logs.map((l) => l.progressPercent)).toEqual([25, 30, 35, 40, 45, 50]);
    expect(logs[0].labour).toEqual(base.labour);
    expect(logs[0].materials[0].quantity).toBe(10);
    expect(logs[0].equipment).toEqual([{ ...base.equipment[0], rate: 300, cost: 1200 }]);
    expect(logs.every((l) => l.note === base.note && !l.markComplete)).toBe(true);
  });

  it("uses a day's own figures where typed, and drops lines that are zero that day", () => {
    const d = days("2026-11-16");
    d[2].qty[cellKey("m", 0)] = 25; // pour day: more cement
    d[3].qty[cellKey("l", 1)] = 0; // no helpers on Thursday
    d[3].progress = 42;
    const logs = buildWeekLogs({ ...base, days: d });
    expect(logs[2].materials[0].quantity).toBe(25);
    expect(logs[3].labour.map((l) => l.roleId)).toEqual(["mason"]);
    expect(logs[3].progressPercent).toBe(42);
    expect(weekMaterialTotals(logs).get("cement")).toBe(10 * 5 + 25);
  });

  it("marks only the last worked day complete, at 100%", () => {
    const logs = buildWeekLogs({ ...base, markComplete: true, days: days("2026-11-16", (x) => x <= "2026-11-18") });
    expect(logs).toHaveLength(3);
    expect(logs.map((l) => [l.progressPercent, l.markComplete])).toEqual([[47, false], [73, false], [100, true]]);
  });

  it("saves nothing for days not worked", () => {
    expect(buildWeekLogs({ ...base, days: days("2026-11-16", () => false) })).toEqual([]);
  });

  it("prices equipment by the unit used, as a single log does", () => {
    const logs = buildWeekLogs({ ...base, equipment: [{ ...base.equipment[0], unit: "days", quantity: 1 }], days: days("2026-11-16", (x) => x === "2026-11-16") });
    expect(logs[0].equipment?.[0]).toMatchObject({ rate: 2000, cost: 2000 });
  });
});

describe("moving between weeks", async () => {
  const { shiftWeek } = await import("./weekLog");
  it("steps a week back or forward from any day of it", () => {
    expect(shiftWeek("2026-11-25", -1)).toBe("2026-11-16");
    expect(shiftWeek("2026-11-23", 1)).toBe("2026-11-30");
  });
});
