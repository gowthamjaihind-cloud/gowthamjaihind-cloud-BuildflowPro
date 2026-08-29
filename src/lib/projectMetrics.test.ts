import { describe, expect, it } from "vitest";
import { globalProgress, tasksAtRisk } from "./projectMetrics";

// These exist so the dashboard and Project Insights cannot drift apart. If a
// change here alters a number, it alters it on both screens — which is the
// point, and why the definitions are pinned.

const task = (o: Record<string, unknown> = {}) => ({
  type: "Task",
  duration: 1,
  progress: 0,
  ...o,
});

describe("globalProgress", () => {
  it("is zero when there is nothing to build", () => {
    expect(globalProgress([])).toBe(0);
  });

  it("weights by duration, so a long task counts for more", () => {
    // A 90-day task at 100% and a 10-day task at 0% is 90% built, not 50%.
    expect(
      globalProgress([
        task({ duration: 90, progress: 100 }),
        task({ duration: 10, progress: 0 }),
      ]),
    ).toBe(90);
  });

  it("ignores summary rows and system-generated tasks", () => {
    expect(
      globalProgress([
        task({ progress: 100 }),
        task({ type: "Summary", progress: 0 }),
        task({ isSystemGenerated: true, progress: 0 }),
      ]),
    ).toBe(100);
  });

  it("treats a missing duration as one day rather than dividing by zero", () => {
    expect(
      globalProgress([task({ duration: undefined, progress: 50 })]),
    ).toBe(50);
  });

  it("reads numeric strings, which is what Firestore sometimes holds", () => {
    expect(
      globalProgress([task({ duration: "10", progress: "40" })]),
    ).toBe(40);
  });
});

describe("tasksAtRisk", () => {
  const past = "2000-01-01";
  const future = "2999-01-01";

  it("counts an unfinished task past its end date", () => {
    expect(tasksAtRisk([{ endDate: past, status: "In Progress" }]).count).toBe(1);
  });

  it("does not count a completed task, however late", () => {
    expect(tasksAtRisk([{ endDate: past, status: "Completed" }]).count).toBe(0);
  });

  it("counts anything explicitly marked Delayed, even if not yet due", () => {
    expect(tasksAtRisk([{ endDate: future, status: "Delayed" }]).count).toBe(1);
  });

  it("reports how many of those are on the critical path", () => {
    const r = tasksAtRisk([
      { endDate: past, status: "In Progress", isCritical: true },
      { endDate: past, status: "In Progress" },
    ]);
    expect(r.count).toBe(2);
    expect(r.criticalCount).toBe(1);
  });

  it("ignores system-generated tasks", () => {
    expect(
      tasksAtRisk([{ endDate: past, status: "Delayed", isSystemGenerated: true }])
        .count,
    ).toBe(0);
  });
});
