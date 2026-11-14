import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { MODELS } from "./geminiPolicy";

// gemini.ts imports firebase-functions, which is installed only under
// functions/. The website deploy runs every test from the repo root without
// it, so there this suite is skipped; it runs with the functions tests.
const hasFunctionsDeps = (() => {
  try {
    createRequire(__filename).resolve("firebase-functions/v2/https");
    return true;
  } catch {
    return false;
  }
})();
const load = async () => (await import("./gemini")).geminiText;

afterEach(() => vi.unstubAllGlobals());

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe.skipIf(!hasFunctionsDeps)("a Gemini request that stalls", () => {
  it("moves straight to the next model instead of retrying the stuck one", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url).split("/models/")[1].split(":")[0]);
      if (calls.length === 1) {
        const e = new Error("The operation was aborted due to timeout");
        e.name = "TimeoutError";
        throw e;
      }
      return ok('{"intent":"other"}');
    }));
    const geminiText = await load();
    const r = await geminiText({ contents: [] }, "k", 60_000, { perAttemptMs: 1_000 });
    expect(r.model).toBe(MODELS[1]);
    expect(calls).toEqual([MODELS[0], MODELS[1]]);
  });

  it("applies a per-model adjustment only to the model it names", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return ok("{}");
    }));
    const geminiText = await load();
    await geminiText({ generationConfig: { temperature: 0.2 } }, "k", 10_000, {
      forModel: (m, b) => (m.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : b),
    });
    expect(bodies[0].generationConfig).toEqual({ temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } });
  });
});
