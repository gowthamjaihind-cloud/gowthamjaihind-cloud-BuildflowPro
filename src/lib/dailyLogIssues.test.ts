import { describe, it, expect } from "vitest";
import { isDailyLogIssue, nameKey, standaloneIssues } from "./dailyLogIssues";

const log = {
  taskId: "t1", workDate: "2026-03-17",
  materials: [
    { materialId: "STEEL-8", name: "STEEL-8mm", quantity: 202.1 },
    { materialId: "CEMENT", name: "CEMENT", quantity: 143 },
  ],
};

describe("daily-log issues", () => {
  it("skips tagged records, as before", () => {
    expect(isDailyLogIssue({ remarks: "Daily Progress: t1", taskId: "t1" }, [])).toBe(true);
  });

  it("drops the old server's untagged record once the log carries its materials", () => {
    const legacy = { taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8", quantity: 202.1 }] };
    expect(standaloneIssues([legacy], [log])).toHaveLength(0);
    // ...even after the log's quantity was edited, which never rewrote the issue.
    expect(standaloneIssues([legacy], [{ ...log, materials: [{ materialId: "STEEL-8", quantity: 150 }] }])).toHaveLength(0);
  });

  it("drops matching LINES even when another line in the same issue does not match -- the surviving duplicate", () => {
    const legacy = {
      taskId: "t1", issueDate: "2026-03-17", totalCost: 14187 + 999,
      items: [
        { itemId: "old-key", name: "Steel 8 mm", quantity: 202.1, totalPrice: 14187 },
        { itemId: "SAND", name: "River sand", quantity: 1, totalPrice: 999 },
      ],
    };
    const out = standaloneIssues([legacy], [log]) as any[];
    expect(out).toHaveLength(1);
    expect(out[0].items.map((m: any) => m.name)).toEqual(["River sand"]);
    expect(out[0].totalCost).toBe(999);
  });

  it("matches a legacy log whose workDate is a Timestamp", () => {
    const tsLog = { ...log, workDate: { seconds: Date.parse("2026-03-17T00:00:00Z") / 1000, nanoseconds: 0 } };
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] }, [tsLog])).toBe(true);
  });

  it("matches names ignoring case, spacing and punctuation", () => {
    expect(nameKey({ name: "STEEL-8mm" })).toBe(nameKey({ name: "steel 8 mm" }));
    expect(nameKey({ name: "STEEL-8mm" })).not.toBe(nameKey({ name: "STEEL-10mm" }));
  });

  it("keeps the record while the log has no materials yet, so legacy consumption is not lost", () => {
    const legacy = { taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] };
    expect(standaloneIssues([legacy], [{ ...log, materials: undefined }])).toHaveLength(1);
  });

  it("keeps genuine issues: another task, another date, or a material no log mentions", () => {
    const logs = [log];
    expect(standaloneIssues([{ taskId: "t2", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] }], logs)).toHaveLength(1);
    expect(standaloneIssues([{ taskId: "t1", issueDate: "2026-03-18", items: [{ itemId: "STEEL-8" }] }], logs)).toHaveLength(1);
    expect(standaloneIssues([{ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "X", name: "Bricks" }] }], logs)).toHaveLength(1);
  });
});
