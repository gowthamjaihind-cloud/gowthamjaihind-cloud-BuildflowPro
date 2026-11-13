import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canEditLine, canEditTax } from "./estimateLock";

describe("approved estimates", () => {
  it("freeze base-contract lines and the tax rate, but still take change orders", () => {
    const approved = { status: "Approved" };
    expect(canEditLine(approved, { isChangeOrder: false })).toBe(false);
    expect(canEditLine(approved, {})).toBe(false);
    expect(canEditLine(approved, { isChangeOrder: true })).toBe(true);
    expect(canEditTax(approved)).toBe(false);
  });

  it("leave drafts and sent estimates fully editable", () => {
    for (const status of ["Draft", "Sent to Client", "Rejected"]) {
      expect(canEditLine({ status }, { isChangeOrder: false })).toBe(true);
      expect(canEditTax({ status })).toBe(true);
    }
  });

  it("are enforced by the estimate screen's edit paths", () => {
    const src = readFileSync(join(__dirname, "../components/EstimateTrackerView.tsx"), "utf8");
    expect(src.match(/canEditLine\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/canEditTax\(/);
  });
});
