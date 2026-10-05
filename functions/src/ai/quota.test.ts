import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aiQuotaFor } from "./quota";
import { PLANS } from "../plans";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The catalog sells AI scans PER PROJECT. A flat per-org number cannot express
 * that, and the one that was being enforced — 150 — was a leftover from when
 * Starter meant five projects for ₹999. A Starter customer running ten projects
 * at ₹99 each was getting the same allowance as one running a single project.
 */

describe("aiQuotaFor scales with the projects being paid for", () => {
  const starter = { aiScansPerProject: PLANS.starter.aiScansPerProject };
  const business = { aiScansPerProject: PLANS.business.aiScansPerProject };

  it("gives Starter 30 a project", () => {
    expect(aiQuotaFor(starter, 1)).toBe(30);
    expect(aiQuotaFor(starter, 10)).toBe(300);
  });

  it("gives Business 100 a project", () => {
    expect(aiQuotaFor(business, 20)).toBe(2000);
    expect(aiQuotaFor(business, 25)).toBe(2500);
  });

  it("floors at one project's worth", () => {
    // A workspace with no project yet must not sit at zero before it starts.
    expect(aiQuotaFor(starter, 0)).toBe(30);
    expect(aiQuotaFor(starter, -5)).toBe(30);
  });

  it("treats an explicit null as unlimited", () => {
    expect(aiQuotaFor({ aiScansPerProject: null }, 50)).toBeNull();
    expect(aiQuotaFor({ aiScansPerProject: PLANS.enterprise.aiScansPerProject }, 50)).toBeNull();
  });
});

describe("aiQuotaFor does not reduce an existing org's allowance", () => {
  it("keeps the legacy flat cap when no per-project rate was ever written", () => {
    // An org placed on a plan before this change has aiQuota and no
    // aiScansPerProject. Switching it to 30 would cut a customer mid-month.
    expect(aiQuotaFor({ aiQuota: 150 }, 10)).toBe(150);
    expect(aiQuotaFor({ aiQuota: 2000 }, 1)).toBe(2000);
  });

  it("still honours a legacy unlimited", () => {
    expect(aiQuotaFor({ aiQuota: null }, 3)).toBeNull();
  });

  it("falls back to the subscription lifecycle when neither field is set", () => {
    expect(aiQuotaFor({}, 5)).toBeNull();                                  // grandfathered
    expect(aiQuotaFor({ subscriptionStatus: "internal" }, 5)).toBeNull();
    expect(aiQuotaFor({ subscriptionStatus: "active" }, 5)).toBe(2000);
    expect(aiQuotaFor({ subscriptionStatus: "trialing" }, 5)).toBe(100);
    expect(aiQuotaFor({ subscriptionStatus: "expired" }, 5)).toBe(0);
    expect(aiQuotaFor({ subscriptionStatus: "free" }, 5)).toBe(0);
  });

  it("ignores a per-project rate that cannot be one", () => {
    for (const bad of [0, -1, "30", NaN]) {
      expect(aiQuotaFor({ aiScansPerProject: bad, aiQuota: 150 }, 10)).toBe(150);
    }
  });
});

describe("the charge path reads a real project count", () => {
  const src = readFileSync(join(HERE, "./usage.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function chargeAiUsage"));

  it("counts projects rather than assuming one", () => {
    expect(body).toMatch(/collection\("projects"\)\.count\(\)/);
    expect(body).toMatch(/aiQuotaFor\(orgData, projectCount\)/);
  });

  it("skips the count for a legacy org, where it changes nothing", () => {
    expect(body).toMatch(/aiScansPerProject == null/);
  });

  it("still enforces inside a transaction", () => {
    // Concurrent calls must not slip past the cap together.
    expect(body).toMatch(/runTransaction/);
  });
});

describe("the catalog and the enforcement agree", () => {
  it("sells what it enforces", () => {
    expect(PLANS.starter.aiScansPerProject).toBe(30);
    expect(PLANS.business.aiScansPerProject).toBe(100);
    expect(PLANS.enterprise.aiScansPerProject).toBeNull();
  });

  it("is reported by the operator view as the ENFORCED number", () => {
    const billing = readFileSync(join(HERE, "../billing.ts"), "utf8");
    expect(billing).toMatch(/aiQuota:\s*aiQuotaFor\(d, projectCount\)/);
  });
});
