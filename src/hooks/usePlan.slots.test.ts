import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectCapState } from "../lib/plans";

describe("purchased project slots", () => {
  it("raise the project cap while they are live, and stop when they lapse", () => {
    const paid = { plan: "starter", includedProjects: 1, purchasedSlots: 1, slotsExpireAt: Date.now() + 86400000 };
    expect(projectCapState(paid, 1).atOrOver).toBe(false);
    expect(projectCapState({ ...paid, slotsExpireAt: Date.now() - 1 }, 1).atOrOver).toBe(true);
  });

  it("reach the cap check: usePlan passes both slot fields through", () => {
    // The cap is computed from usePlan()'s object. It used to drop these two
    // fields, so a paid slot never raised the cap in the app.
    const src = readFileSync(join(__dirname, "usePlan.ts"), "utf8");
    expect(src).toMatch(/purchasedSlots: Number\(d\.purchasedSlots\)/);
    expect(src).toMatch(/slotsExpireAt: Number\(d\.slotsExpireAt\)/);
  });
});
