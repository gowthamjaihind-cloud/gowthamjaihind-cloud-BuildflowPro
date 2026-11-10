import { describe, it, expect } from "vitest";
import { byTime, newestLogFirst, timeKey } from "./timeKey";

describe("timeKey", () => {
  it("passes ISO strings through and normalises Timestamps, Dates and millis", () => {
    const iso = "2026-11-01T09:00:00.000Z";
    expect(timeKey(iso)).toBe(iso);
    expect(timeKey({ toDate: () => new Date(iso) })).toBe(iso);
    expect(timeKey({ seconds: Date.parse(iso) / 1000, nanoseconds: 0 })).toBe(iso);
    expect(timeKey({ _seconds: Date.parse(iso) / 1000, _nanoseconds: 0 })).toBe(iso);
    expect(timeKey(new Date(iso))).toBe(iso);
    expect(timeKey(Date.parse(iso))).toBe(iso);
    expect(timeKey(undefined)).toBe("");
    expect(timeKey({})).toBe("");
  });

  it("sorts a mix of string and Timestamp createdAt without throwing -- the Reports crash", () => {
    const logs = [
      { id: "a", workDate: "2026-11-01", createdAt: "2026-11-01T08:00:00.000Z" },
      { id: "b", workDate: "2026-11-01", createdAt: { seconds: Date.parse("2026-11-01T10:00:00Z") / 1000, nanoseconds: 0 } },
      { id: "c", workDate: "2026-11-02", createdAt: undefined },
    ];
    expect(() => logs.sort(newestLogFirst)).not.toThrow();
    expect(logs.map((l) => l.id)).toEqual(["c", "b", "a"]);
    expect(byTime("2026-01-01", "2026-02-01")).toBeLessThan(0);
  });
});
