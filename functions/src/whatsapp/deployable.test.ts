import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * An unconfigured integration must not be able to block the deploy.
 *
 * Firebase refuses to deploy the ENTIRE functions codebase when any function
 * declares a `defineSecret` that has no value in Secret Manager:
 *
 *     Error: In non-interactive mode but have no value for the secret
 *     WHATSAPP_VERIFY_TOKEN
 *
 * So exporting the WhatsApp functions unconditionally took the Telegram bot,
 * the AI endpoints and every Firestore trigger down with them on the first
 * deploy to main. Nothing caught it beforehand, because the preview workflow
 * does not deploy functions at all.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(HERE, "../index.ts"), "utf8");

describe("whatsapp is opt-in at the deploy level", () => {
  it("is never exported unconditionally", () => {
    // `export * from "./whatsapp"` would load the module, and loading it runs
    // its defineSecret calls.
    expect(index).not.toMatch(/export\s+\*\s+from\s+["']\.\/whatsapp["']/);
  });

  it("loads only behind the configured flag", () => {
    expect(index).toMatch(/process\.env\.WHATSAPP_ENABLED === "true"/);
    // The require must sit INSIDE the conditional, not above it.
    const gate = index.indexOf('process.env.WHATSAPP_ENABLED === "true"');
    const req = index.indexOf('require("./whatsapp")');
    expect(gate).toBeGreaterThan(-1);
    expect(req).toBeGreaterThan(gate);
  });

  it("still exports Telegram unconditionally, which is configured", () => {
    expect(index).toMatch(/export\s+\*\s+from\s+["']\.\/telegram["']/);
  });

  it("names every secret an operator has to set before enabling it", () => {
    // If a new defineSecret is added to the lane, it belongs in the runbook
    // comment too, or the first person to flip the flag gets the same error.
    const wa = readFileSync(join(HERE, "./index.ts"), "utf8");
    const declared = [...wa.matchAll(/defineSecret\("([A-Z_]+)"\)/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    for (const secret of declared) {
      if (secret === "GEMINI_API_KEY") continue; // already set for the AI endpoints
      expect(index, `${secret} is not named in the enable instructions`).toContain(secret);
    }
  });
});
