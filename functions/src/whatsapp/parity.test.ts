import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The two channels must route the same taps.
 *
 * Telegram and WhatsApp now share every handler, and the only thing left
 * duplicated is the routing table -- the list of `callback_data` prefixes each
 * webhook switches on. That duplication is the dangerous kind: adding a button
 * to a handler and wiring it into the Telegram router only leaves WhatsApp
 * silently doing NOTHING when that button is tapped. No error, no log, no
 * failing build; the engineer just taps and the bot ignores them.
 *
 * This is the same shape of fault as the six triggers bound to the wrong
 * database and the recorder reading cut settings from a manifest nobody
 * rebuilt: code that deploys cleanly and does nothing. So it gets the same
 * treatment -- a source-level assertion, because there is no cheaper way to
 * see it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(HERE, p), "utf8");

/** Every callback id a router branches on. */
function routedIds(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/data === "([^"]+)"/g)) out.add(m[1]);
  for (const m of src.matchAll(/data\.startsWith\("([^"]+)"\)/g)) out.add(m[1]);
  return out;
}

/** Every slash/word command a router branches on. */
function routedCommands(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/text === "\/([a-z]+)"/g)) out.add(m[1]);
  for (const m of src.matchAll(/cmd === "([a-z]+)"/g)) out.add(m[1]);
  return out;
}

const telegram = read("../telegram/index.ts");
const whatsapp = read("./index.ts");

describe("channel parity", () => {
  it("routes every Telegram callback id on WhatsApp too", () => {
    const tg = routedIds(telegram);
    const wa = routedIds(whatsapp);
    const missing = [...tg].filter((id) => !wa.has(id));
    expect(
      missing,
      `these taps work on Telegram and do nothing on WhatsApp: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("finds a non-trivial number of ids, so the extractor cannot pass by matching nothing", () => {
    // A regex that stops matching would make the test above vacuously true.
    expect(routedIds(telegram).size).toBeGreaterThan(15);
    expect(routedIds(whatsapp).size).toBeGreaterThan(15);
  });

  it("keeps the log flow's text commands available on both", () => {
    const shared = ["log", "today", "projects", "cancel", "unlink", "language"];
    const tg = routedCommands(telegram);
    const wa = routedCommands(whatsapp);
    for (const c of shared) {
      expect(tg.has(c), `Telegram lost /${c}`).toBe(true);
      expect(wa.has(c), `WhatsApp is missing /${c}`).toBe(true);
    }
  });

  it("drives the shared handlers rather than reimplementing the flow", () => {
    // If the WhatsApp lane ever grows its own copy of the log flow, the two
    // will drift and this whole exercise was pointless. It must keep importing
    // the Telegram handlers.
    expect(whatsapp).toMatch(/from "\.\.\/telegram\/handlers\/log"/);
    expect(whatsapp).toMatch(/from "\.\.\/telegram\/session"/);
    // And the validation rules must come from the one extracted function.
    expect(whatsapp).toMatch(/handleStepText/);
    expect(telegram).toMatch(/handleStepText/);
  });

  it("verifies the webhook signature over the raw body", () => {
    // Verifying req.body instead of req.rawBody is the classic way this check
    // becomes decorative.
    expect(whatsapp).toMatch(/rawBody/);
    expect(whatsapp).not.toMatch(/verifySignature\(\s*req\.body/);
  });
});
