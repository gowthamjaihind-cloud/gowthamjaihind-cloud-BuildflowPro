import { describe, it, expect } from "vitest";
import { sameDayLogs, whoSaved } from "./duplicateLog";

const logs = [
  { id: "a", taskId: "t1", workDate: "2026-11-14", progressPercent: 40, createdAt: "2026-11-14T05:00:00Z" },
  { id: "b", taskId: "t1", workDate: "2026-11-14", progressPercent: 45, createdAt: "2026-11-14T09:00:00Z" },
  { id: "c", taskId: "t1", workDate: "2026-11-13", progressPercent: 30 },
  { id: "d", taskId: "t2", workDate: "2026-11-14", progressPercent: 10 },
];

describe("sameDayLogs", () => {
  it("finds logs for the same task and day, newest first", () => {
    expect(sameDayLogs(logs, "t1", "2026-11-14").map((l) => l.id)).toEqual(["b", "a"]);
  });
  it("leaves out the log being edited or saved", () => {
    expect(sameDayLogs(logs, "t1", "2026-11-14", "b").map((l) => l.id)).toEqual(["a"]);
  });
  it("ignores other days and other tasks", () => {
    expect(sameDayLogs(logs, "t2", "2026-11-13")).toEqual([]);
    expect(sameDayLogs(logs, "", "2026-11-14")).toEqual([]);
  });
});

describe("whoSaved", () => {
  it("names the person and the channel", () => {
    expect(whoSaved({ createdByName: "ravi@example.com", createdVia: "telegram" })).toBe("ravi via Telegram");
    expect(whoSaved({ createdByName: "Telegram Bot", createdVia: "telegram" })).toBe("Telegram");
    expect(whoSaved({})).toBe("the app");
  });
});
