import { describe, it, expect } from "vitest";
import { acceptWorkDate, buildAiLogPrompt, looksLikeLogText, parseModelJson, sanitizeAiLog, sanitizeAiLogs, MAX_LOGS_PER_MESSAGE, type AiLogContext } from "./aiLog";

const ctx: AiLogContext = {
  tasks: [{ id: "t1", name: "Footing concrete", progress: 30 }, { id: "t2", name: "Plinth beam", progress: 0 }],
  materials: [{ id: "m1", name: "OPC 53 Cement", unit: "bag" }, { id: "m2", name: "Steel 8mm", unit: "kg" }],
  roles: [{ id: "r1", name: "Mason" }, { id: "r2", name: "Helper" }],
  equipment: [{ id: "e1", name: "Concrete mixer" }],
};

describe("plain-language daily log", () => {
  it("builds a draft from a well-formed answer", () => {
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: 45, materials: [{ materialId: "m1", quantity: 20 }], labour: [{ roleId: "r1", headcount: 4 }, { roleId: "r2", headcount: 6 }], equipment: [{ equipmentId: "e1", quantity: 3, unit: "hours" }], note: "Rain stopped work at 4 pm", unmatched: [] }, ctx);
    expect(r.kind).toBe("log");
    if (r.kind !== "log") return;
    expect(r.draft).toMatchObject({ taskId: "t1", taskName: "Footing concrete", currentProgress: 30, progressPercent: 45, progressGiven: true });
    expect(r.draft.materials).toEqual([{ materialId: "m1", name: "OPC 53 Cement", unit: "bag", quantity: 20 }]);
    expect(r.draft.labour).toEqual([{ roleId: "r1", roleName: "Mason", headcount: 4 }, { roleId: "r2", roleName: "Helper", headcount: 6 }]);
    expect(r.draft.equipment[0]).toMatchObject({ equipmentId: "e1", name: "Concrete mixer", quantity: 3, unit: "hours" });
  });

  it("drops anything that is not on the project's lists — an invented id can never be written", () => {
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: 40, materials: [{ materialId: "made-up", quantity: 5 }, { materialId: "m2", quantity: 100 }], labour: [{ roleId: "nobody", headcount: 3 }], equipment: [{ equipmentId: "ghost", quantity: 2 }] }, ctx);
    if (r.kind !== "log") throw new Error("expected a log");
    expect(r.draft.materials.map((m) => m.materialId)).toEqual(["m2"]);
    expect(r.draft.labour).toEqual([]);
    expect(r.draft.equipment).toEqual([]);
  });

  it("asks which task when the task is unknown, rather than guessing", () => {
    expect(sanitizeAiLog({ intent: "daily_log", taskId: "t9", unmatched: ["brick work"] }, ctx)).toEqual({ kind: "no_task", unmatched: ["brick work"] });
    expect(sanitizeAiLog({ intent: "daily_log", taskId: null }, ctx).kind).toBe("no_task");
  });

  it("never moves progress backwards, and caps it at 100", () => {
    const lower = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: 10 }, ctx);
    const over = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: 250 }, ctx);
    if (lower.kind !== "log" || over.kind !== "log") throw new Error("expected logs");
    expect(lower.draft.progressPercent).toBe(30);
    expect(over.draft.progressPercent).toBe(100);
  });

  it("keeps current progress, flagged, when none was mentioned", () => {
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: null }, ctx);
    if (r.kind !== "log") throw new Error("expected a log");
    expect(r.draft).toMatchObject({ progressPercent: 30, progressGiven: false });
  });

  it("rejects zero, negative and non-numeric quantities, and adds repeats together", () => {
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", materials: [{ materialId: "m1", quantity: 0 }, { materialId: "m1", quantity: -4 }, { materialId: "m1", quantity: "ten" }, { materialId: "m1", quantity: 5 }, { materialId: "m1", quantity: 7 }], labour: [{ roleId: "r1", headcount: 2.9 }] }, ctx);
    if (r.kind !== "log") throw new Error("expected a log");
    expect(r.draft.materials).toEqual([{ materialId: "m1", name: "OPC 53 Cement", unit: "bag", quantity: 12 }]);
    expect(r.draft.labour[0].headcount).toBe(2);
  });

  it("treats anything that is not a work report as not a log", () => {
    expect(sanitizeAiLog({ intent: "other" }, ctx).kind).toBe("other");
    expect(sanitizeAiLog(null, ctx).kind).toBe("other");
    expect(sanitizeAiLog("hello", ctx).kind).toBe("other");
  });

  it("only sends sentences to the model, not commands or button replies", () => {
    expect(looksLikeLogText("Footing concrete done 20 bags cement 4 masons")).toBe(true);
    expect(looksLikeLogText("/log")).toBe(false);
    expect(looksLikeLogText("45")).toBe(false);
    expect(looksLikeLogText("ok")).toBe(false);
  });

  it("puts the project's lists and the message into the prompt", () => {
    const p = buildAiLogPrompt("poured footing, 20 bags", ctx);
    expect(p).toContain("t1 | Footing concrete | 30");
    expect(p).toContain("m1 | OPC 53 Cement | bag");
    expect(p).toContain("poured footing, 20 bags");
  });

  it("tells the model the site shorthand engineers actually type", () => {
    const p = buildAiLogPrompt("Mason - 2 no. MC - 1 no. FC - 1 no", ctx);
    expect(p).toMatch(/"MC" = male coolie/);
    expect(p).toMatch(/"FC" = female coolie/);
    expect(p).toMatch(/"no\.", "nos"/);
  });

  it("reads the model's answer even when it is wrapped in a code fence or a sentence", () => {
    expect(parseModelJson('{"intent":"other"}')).toEqual({ intent: "other" });
    expect(parseModelJson('```json\n{"intent":"daily_log","taskId":"t1"}\n```')).toEqual({ intent: "daily_log", taskId: "t1" });
    expect(parseModelJson('Here you go: {"intent":"other"} hope that helps')).toEqual({ intent: "other" });
    expect(() => parseModelJson("sorry, I cannot")).toThrow();
  });

  it("uses a date the engineer gives, within the last week and never in the future", () => {
    expect(acceptWorkDate("2026-11-12", "2026-11-15")).toBe("2026-11-12");
    expect(acceptWorkDate("2026-11-15", "2026-11-15")).toBe("2026-11-15");
    expect(acceptWorkDate("2026-11-16", "2026-11-15")).toBeUndefined();
    expect(acceptWorkDate("2026-10-01", "2026-11-15")).toBeUndefined();
    expect(acceptWorkDate("2026-02-30", "2026-03-02")).toBeUndefined();
    expect(acceptWorkDate(null, "2026-11-15")).toBeUndefined();
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", workDate: "2026-11-12" }, { ...ctx, today: "2026-11-15" });
    if (r.kind !== "log") throw new Error("expected a log");
    expect(r.draft.workDate).toBe("2026-11-12");
  });

  it("splits one message into one log per task, each with its own labour", () => {
    const r = sanitizeAiLogs({ intent: "daily_log", workDate: "2026-11-12", logs: [
      { taskId: "t1", labour: [{ roleId: "r1", headcount: 1 }] },
      { taskId: "t2", progressPercent: 20, labour: [{ roleId: "r2", headcount: 2 }] },
    ] }, { ...ctx, today: "2026-11-15" });
    if (r.kind !== "logs") throw new Error("expected logs");
    expect(r.drafts.map((d) => d.taskName)).toEqual(["Footing concrete", "Plinth beam"]);
    expect(r.drafts[0].labour).toEqual([{ roleId: "r1", roleName: "Mason", headcount: 1 }]);
    expect(r.drafts[1].labour).toEqual([{ roleId: "r2", roleName: "Helper", headcount: 2 }]);
    expect(r.drafts.every((d) => d.workDate === "2026-11-12")).toBe(true);
  });

  it("drops an entry for a task that does not exist, keeping the rest", () => {
    const r = sanitizeAiLogs({ intent: "daily_log", logs: [{ taskId: "ghost" }, { taskId: "t2" }] }, ctx);
    if (r.kind !== "logs") throw new Error("expected logs");
    expect(r.drafts.map((d) => d.taskId)).toEqual(["t2"]);
  });

  it("merges two entries for the same task into one log", () => {
    const r = sanitizeAiLogs({ intent: "daily_log", logs: [
      { taskId: "t1", progressPercent: 40, materials: [{ materialId: "m1", quantity: 5 }], note: "south side" },
      { taskId: "t1", progressPercent: 45, materials: [{ materialId: "m1", quantity: 3 }], note: "north side" },
    ] }, ctx);
    if (r.kind !== "logs") throw new Error("expected logs");
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ progressPercent: 45, note: "south side; north side" });
    expect(r.drafts[0].materials[0].quantity).toBe(8);
  });

  it("still accepts the single-task answer shape", () => {
    const r = sanitizeAiLogs({ intent: "daily_log", taskId: "t1", labour: [{ roleId: "r1", headcount: 2 }] }, ctx);
    if (r.kind !== "logs") throw new Error("expected logs");
    expect(r.drafts).toHaveLength(1);
  });

  it("asks which task when no entry matches a task, and ignores non-reports", () => {
    expect(sanitizeAiLogs({ intent: "daily_log", logs: [{ taskId: "x" }], unmatched: ["painting"] }, ctx)).toEqual({ kind: "no_task", unmatched: ["painting"] });
    expect(sanitizeAiLogs({ intent: "other" }, ctx).kind).toBe("other");
  });

  it("caps how many logs one message can create", () => {
    const many = { ...ctx, tasks: Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, name: `Task ${i}`, progress: 0 })) };
    const r = sanitizeAiLogs({ intent: "daily_log", logs: many.tasks.map((t) => ({ taskId: t.id })) }, many);
    if (r.kind !== "logs") throw new Error("expected logs");
    expect(r.drafts).toHaveLength(MAX_LOGS_PER_MESSAGE);
  });

  it("asks the model for one entry per task", () => {
    const p = buildAiLogPrompt("excavation and bar bending", ctx);
    expect(p).toMatch(/one entry in "logs" per task/);
    expect(p).toMatch(/"logs":\[/);
  });
});

describe("progress the message did not move", () => {
  it("is reported as not given when the model echoes the current figure or answers 0", () => {
    for (const p of [0, 30]) {
      const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", progressPercent: p, labour: [{ roleId: "r1", headcount: 1 }] }, ctx);
      expect(r.kind === "log" && r.draft).toMatchObject({ progressPercent: 30, progressGiven: false });
    }
  });
});

describe("sectioned messages", () => {
  it("tells the model to put a heading with no task under the task it supports", () => {
    const prompt = buildAiLogPrompt("Earth work excavation\nMason 1\nBarbending work\nBarbender 2 no", ctx);
    expect(prompt).toMatch(/Everything under a heading belongs to THAT heading's task/);
    expect(prompt).toMatch(/bar bending for the reinforcement placed during excavation/);
  });

  it("reports where a heading with no task went, and only to a task in the answer", () => {
    const r = sanitizeAiLogs({
      intent: "daily_log",
      logs: [{ taskId: "t1", labour: [{ roleId: "r1", headcount: 1 }, { roleId: "r2", headcount: 2 }] }],
      placed: [{ heading: "Barbending work", taskId: "t1" }, { heading: "Ghost", taskId: "nope" }],
    }, ctx);
    expect(r.kind === "logs" && r.placed).toEqual([{ heading: "Barbending work", taskName: "Footing concrete" }]);
  });
});

