import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SNAPSHOT_TIMEOUT_MS } from "./realtime";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const HOOKS: Array<[string, string]> = [
  ["usePlan", "../hooks/usePlan.ts"],
  ["useOrgAccess", "../hooks/useOrgAccess.ts"],
];

describe("SNAPSHOT_TIMEOUT_MS", () => {
  it("is long enough not to fire on a slow-but-working connection", () => {
    // Firestore's own "could not reach backend" warning lands at 10s. Firing
    // sooner would call a merely slow connection broken.
    expect(SNAPSHOT_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    // And short enough that nobody stares at a blank panel: the bug being
    // fixed was an indefinite wait.
    expect(SNAPSHOT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("every realtime hook gives up rather than waiting forever", () => {
  for (const [name, rel] of HOOKS) {
    const src = read(rel);

    it(`${name} arms a timeout`, () => {
      expect(src).toMatch(/SNAPSHOT_TIMEOUT_MS/);
      expect(src).toMatch(/setTimeout\(/);
    });

    it(`${name} clears it on data, on error, AND on unmount`, () => {
      // Three exits. Missing the unmount one leaks a timer that fires against
      // a dead component; missing either callback flips a healthy load to
      // "unavailable" ten seconds in.
      const clears = (src.match(/clearTimeout\(/g) || []).length;
      expect(clears, `${name} should clear its timer on all three exits`).toBeGreaterThanOrEqual(3);
      // The cleanup must actually be returned from the effect.
      expect(src).toMatch(/return \(\) => \{[\s\S]*clearTimeout\([\s\S]*unsub\(\)/);
    });

    it(`${name} only gives up while still loading`, () => {
      // Without the guard, a timer that outlived a successful snapshot would
      // blank a panel that had already filled in.
      expect(src).toMatch(/s\.loading\s*\?/);
    });

    it(`${name} reports the failure instead of looking like an answer`, () => {
      expect(src).toMatch(/unavailable: true/);
      // A successful snapshot must clear the flag -- the SDK keeps retrying,
      // so recovery has to show.
      expect(src).toMatch(/unavailable: false/);
    });
  }

  it("useOrgAccess fails OPEN, never locking a paying customer out", () => {
    const src = read("../hooks/useOrgAccess.ts");
    // Every giving-up path must still grant access; the server is the real gate.
    for (const m of src.matchAll(/unavailable: true[^}]*/g)) {
      expect(m[0], "a give-up path denies access on a network blip").toContain("allowed: true");
    }
  });

  it("the plan panel says something rather than rendering nothing", () => {
    // The whole point: PlanSummary returned null forever, so the billing
    // section vanished on the page you visit to fix a lapsed subscription.
    const src = read("../components/settings/PlanSummary.tsx");
    expect(src).toMatch(/plan\.unavailable/);
    const block = src.slice(src.indexOf("plan.unavailable"));
    expect(block).toMatch(/couldn't load your plan/i);
  });
});
