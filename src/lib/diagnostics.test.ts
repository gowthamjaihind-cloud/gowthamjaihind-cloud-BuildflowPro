import { describe, it, expect, vi } from "vitest";
vi.mock("../firebase", () => ({ db: {}, auth: {} }));
import { bundleOf, FIX_LABELS } from "./diagnostics";

describe("device diagnostics", () => {
  it("finds the release's main script in a page", () => {
    expect(bundleOf('<script type="module" crossorigin src="/assets/index-Ab12_cD.js"></script>')).toBe("/assets/index-Ab12_cD.js");
    expect(bundleOf("<html></html>")).toBe("");
  });
  it("labels every fix with the name the assistant is told to use", () => {
    expect(FIX_LABELS.update).toBe("Update the app");
    expect(FIX_LABELS.clearCache).toBe("Clear saved data");
    expect(FIX_LABELS.recheckBilling).toBe("Re-check payment");
  });
});

import { readFileSync } from "node:fs";
describe("fix buttons", () => {
  it("are named the same in the app and in the assistant's instructions", () => {
    const server = readFileSync(new URL("../../functions/src/help/knowledge.ts", import.meta.url), "utf8");
    for (const label of Object.values(FIX_LABELS)) {
      if (label === "Try again") continue; // the assistant is told to say "connect to the internet" instead
      expect(server).toContain(`"${label}"`);
    }
  });
});
