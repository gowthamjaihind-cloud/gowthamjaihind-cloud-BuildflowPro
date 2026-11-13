import { describe, it, expect } from "vitest";
import { summaryProgress, summaryStatus } from "./rollup";

describe("summary task progress", () => {
  it("is the duration-weighted average of its children", () => {
    // 7-day task done, 12-day task at 40%, 1-day milestone not started.
    expect(summaryProgress([{ progress: 100, duration: 7 }, { progress: 40, duration: 12 }, { progress: 0, duration: 1 }])).toBe(59);
  });

  it("reaches 100 only when every child is complete", () => {
    expect(summaryProgress([{ progress: 100, duration: 3 }, { progress: 100, duration: 9 }])).toBe(100);
    expect(summaryProgress([{ progress: 100, duration: 3 }, { progress: 99, duration: 9 }])).toBeLessThan(100);
  });

  it("copes with missing durations and no children", () => {
    expect(summaryProgress([{ progress: 50 }, { progress: 100 }])).toBe(75);
    expect(summaryProgress([])).toBe(0);
  });

  it("derives a status without overriding a manual hold", () => {
    expect(summaryStatus(100, "Pending")).toBe("Completed");
    expect(summaryStatus(40, "Pending")).toBe("In Progress");
    expect(summaryStatus(40, "On Hold")).toBe("On Hold");
  });
});
