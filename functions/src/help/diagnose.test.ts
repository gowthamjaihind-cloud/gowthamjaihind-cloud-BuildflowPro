import { describe, it, expect } from "vitest";
import { workspaceChecks, cleanChecks } from "./diagnose";

describe("workspace checks", () => {
  it("explains a paused workspace and offers billing", () => {
    const c = workspaceChecks({ status: "expired" });
    expect(c[0]).toMatchObject({ id: "plan", status: "fail", fix: "openBilling" });
    expect(c[0].detail).toMatch(/Nothing has been deleted/);
  });
  it("names read-only projects, an exhausted AI allowance, and an unlinked bot", () => {
    const c = workspaceChecks({ status: "active", paidUntil: "1 Dec 2026", lockedProjects: ["Sample Villa"], aiAllowance: 30, aiUsedThisMonth: 30, telegramLinked: false });
    expect(c.find((x) => x.id === "locked")?.detail).toContain("Sample Villa is read-only");
    expect(c.find((x) => x.id === "ai")?.status).toBe("warn");
    expect(c.find((x) => x.id === "telegram")).toMatchObject({ status: "info", fix: "openTelegram" });
  });
  it("offers a billing re-check when a renewal is past due", () => {
    expect(workspaceChecks({ status: "past_due", graceEndsAt: "20 Nov 2026" })[0]).toMatchObject({ status: "warn", fix: "recheckBilling" });
  });
  it("cleans device checks from the browser", () => {
    const c = cleanChecks([{ id: "net", label: "Internet", status: "ok", detail: "x".repeat(900) }, { label: "bad", status: "boom" }, "junk"]);
    expect(c).toHaveLength(1);
    expect(c[0].detail.length).toBe(300);
  });
});
