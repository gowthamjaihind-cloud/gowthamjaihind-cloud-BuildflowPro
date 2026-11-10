import { describe, it, expect } from "vitest";
import { isDailyLogIssue, standaloneIssues } from "./dailyLogIssues";

const log = {
  taskId: "t1", workDate: "2026-03-17",
  materials: [{ materialId: "STEEL-8", quantity: 202.1 }, { materialId: "CEMENT", quantity: 143 }],
};

describe("daily-log issues", () => {
  it("skips tagged records, as before", () => {
    expect(isDailyLogIssue({ remarks: "Daily Progress: t1", taskId: "t1" }, [])).toBe(true);
  });

  it("skips the old server's untagged record once the log carries its materials -- the duplicate", () => {
    const legacy = { taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8", quantity: 202.1 }] };
    expect(isDailyLogIssue(legacy, [log])).toBe(true);
    // ...even after the log's quantity was edited, which never rewrote the issue.
    expect(isDailyLogIssue(legacy, [{ ...log, materials: [{ materialId: "STEEL-8", quantity: 150 }] }])).toBe(true);
  });

  it("keeps it while the log has no materials yet, so legacy consumption is not lost", () => {
    const legacy = { taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] };
    expect(isDailyLogIssue(legacy, [{ ...log, materials: undefined }])).toBe(false);
  });

  it("keeps genuine issues: another task, another date, or a material the log does not mention", () => {
    const logs = [log];
    expect(isDailyLogIssue({ taskId: "t2", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] }, logs)).toBe(false);
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-18", items: [{ itemId: "STEEL-8" }] }, logs)).toBe(false);
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }, { itemId: "SAND" }] }, logs)).toBe(false);
    expect(standaloneIssues([{ taskId: "t9", issueDate: "2026-03-17", items: [{ itemId: "X" }] }], logs)).toHaveLength(1);
  });

  it("matches a legacy log whose workDate is a Timestamp", () => {
    const tsLog = { ...log, workDate: { seconds: Date.parse("2026-03-17T00:00:00Z") / 1000, nanoseconds: 0 } };
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "STEEL-8" }] }, [tsLog])).toBe(true);
  });

  it("matches by material name when the legacy item id differs from the log's", () => {
    const named = { taskId: "t1", workDate: "2026-03-17", materials: [{ materialId: "inv-abc", name: "STEEL-8mm" }] };
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "old-key", name: "STEEL-8mm" }] }, [named])).toBe(true);
    expect(isDailyLogIssue({ taskId: "t1", issueDate: "2026-03-17", items: [{ itemId: "old-key", name: "STEEL-10mm" }] }, [named])).toBe(false);
  });
});
