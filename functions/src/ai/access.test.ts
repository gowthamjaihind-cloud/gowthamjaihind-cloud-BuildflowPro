import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMember } from "./accessPolicy";

const src = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("AI access", () => {
  it("recognises members only from the org's members map", () => {
    expect(isMember({ alice: "Owner" }, "alice")).toBe(true);
    expect(isMember({ alice: "Owner" }, "mallory")).toBe(false);
    expect(isMember(undefined, "alice")).toBe(false);
    expect(isMember({ alice: "Owner" }, "")).toBe(false);
  });

  it("checks membership before any AI callable reads or meters an org", () => {
    // Without it the meter is skipped (no org) or charged to someone else's.
    expect(src("ai/invoiceReader.ts")).toMatch(/requireOrgMember\(request\.auth\.uid, orgId\)/);
    expect(src("ai/insights.ts")).toMatch(/requireOrgMember\(request\.auth\.uid/);
  });

  it("caps instances on everything that calls Gemini", () => {
    for (const f of ["ai/invoiceReader.ts", "ai/insights.ts", "telegram/index.ts", "whatsapp/index.ts"]) {
      expect(src(f), f).toMatch(/maxInstances:/);
    }
  });
});
