import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The deployed runtime must stay on a major Google still accepts.
 *
 * Google decommissions Cloud Functions runtimes on a published date, and after
 * it they refuse to create OR UPDATE any function on that runtime. So the
 * failure mode is not a warning on an old deploy -- it is that the next deploy
 * of ANY function is rejected outright, including the one carrying the fix you
 * needed to ship. Node 20 was decommissioned on 2026-10-30 after a deprecation
 * warning that had been printing in the deploy log, unenforced, for six months.
 *
 * Two numbers have to agree and nothing made them:
 *
 *   - functions/package.json `engines.node` is the runtime that actually runs
 *   - the deploy workflow's `node-version` is only the compiler
 *
 * Drift between them means tsc type-checks against one major's libs while the
 * deployed function runs on another, which passes CI and fails in production.
 *
 * This is a source assertion rather than a behavioural one because there is no
 * runtime behaviour to observe: the pin is deploy configuration, and the only
 * thing that can go wrong with it is that someone bumps one place and not the
 * other, or lets both rot until a deploy is refused.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(HERE, "../package.json"), "utf8"));
const workflow = readFileSync(
  join(HERE, "../../.github/workflows/firebase-functions-deploy.yml"),
  "utf8",
);

/** The oldest major Google still accepts for 2nd gen. Node 22 runs to 2027-10-31. */
const OLDEST_SUPPORTED = 22;

describe("functions runtime pin", () => {
  it("declares a node major at or past the oldest supported runtime", () => {
    const major = Number(String(pkg.engines?.node).match(/\d+/)?.[0]);
    expect(Number.isFinite(major)).toBe(true);
    expect(major).toBeGreaterThanOrEqual(OLDEST_SUPPORTED);
  });

  it("builds in CI on the same major it deploys to", () => {
    // Comments in the workflow mention other majors by way of explanation, so
    // match the key itself rather than any digits that happen to appear.
    const ci = workflow.match(/^\s*node-version:\s*["']?(\d+)/m)?.[1];
    const runtime = String(pkg.engines?.node).match(/\d+/)?.[0];
    expect(ci).toBeDefined();
    expect(ci).toBe(runtime);
  });

  it("pins an exact major, not a range", () => {
    // A range such as ">=22" lets Firebase pick the runtime, so the deployed
    // major could change under you on an unrelated deploy.
    expect(String(pkg.engines?.node)).toMatch(/^\d+$/);
  });
});
