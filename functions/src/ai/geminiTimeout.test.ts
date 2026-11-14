import { describe, it, expect, vi, afterEach } from "vitest";
import { geminiText } from "./gemini";
import { MODELS } from "./geminiPolicy";

afterEach(() => vi.unstubAllGlobals());

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("a Gemini request that stalls", () => {
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
    await geminiText({ generationConfig: { temperature: 0.2 } }, "k", 10_000, {
      forModel: (m, b) => (m.startsWith("gemini-2.5") ? { ...b, generationConfig: { ...b.generationConfig, thinkingConfig: { thinkingBudget: 0 } } } : b),
    });
    expect(bodies[0].generationConfig).toEqual({ temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } });
  });
});
