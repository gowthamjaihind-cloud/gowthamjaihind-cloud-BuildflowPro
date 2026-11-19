import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, LITE_MODELS, FULL_MODELS } from "./geminiPolicy";

/**
 * Google retired the 1.5, 2.0 and 2.5 Flash families for this key in
 * November 2026 (404 "no longer available"). Lists across the backend still
 * named them first, and every bill scan spent its budget on dead names. One
 * list now lives in geminiPolicy; this keeps the dead names from coming back.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) out.push(p);
  }
  return out;
}

describe("Gemini model names", () => {
  it("puts the confirmed-fast lite models first", () => {
    expect(MODELS.slice(0, LITE_MODELS.length)).toEqual(LITE_MODELS);
    expect(MODELS).toEqual([...LITE_MODELS, ...FULL_MODELS]);
  });

  it("names no retired model anywhere in the backend", () => {
    const hits: string[] = [];
    for (const p of walk(join(HERE, ".."))) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/["'`](gemini-(?:1\.5|2\.0|2\.5)-[a-z-]+)["'`]/g)) hits.push(`${p.split("functions/src/")[1]}: ${m[1]}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("the bot's site-message reader", () => {
  it("tries gemini-flash-lite-latest first, then the rest, once each", async () => {
    const { BOT_LOG_MODELS } = await import("./geminiPolicy");
    expect(BOT_LOG_MODELS[0]).toBe("gemini-flash-lite-latest");
    expect(new Set(BOT_LOG_MODELS).size).toBe(BOT_LOG_MODELS.length);
    expect([...BOT_LOG_MODELS].sort()).toEqual([...MODELS].sort());
  });
});
