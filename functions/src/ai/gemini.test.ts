import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BACKOFF_MS, BUSY_MESSAGE, classifyGeminiStatus, MODELS, RETRY_BUDGET_MS } from "./geminiPolicy";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");

describe("Gemini error handling", () => {
  it("retries an overload instead of failing the scan -- the 503 a customer hit", () => {
    expect(classifyGeminiStatus(503)).toBe("retry");
    expect(classifyGeminiStatus(429)).toBe("retry");
    expect(classifyGeminiStatus(500)).toBe("retry");
  });

  it("moves to the next model on 404 and stops on a request or key problem", () => {
    expect(classifyGeminiStatus(404)).toBe("next");
    expect(classifyGeminiStatus(400)).toBe("fatal");
    expect(classifyGeminiStatus(403)).toBe("fatal");
  });

  it("has more than one model to fall back to, and stops retrying well inside the 120s timeout", () => {
    expect(MODELS.length).toBeGreaterThan(1);
    expect(RETRY_BUDGET_MS + BACKOFF_MS[BACKOFF_MS.length - 1]).toBeLessThan(120_000);
  });

  it("tells the customer in plain words, not the service's raw JSON", () => {
    expect(BUSY_MESSAGE).not.toMatch(/[{}"]/);
    for (const f of ["invoiceReader.ts", "insights.ts", "gemini.ts"]) {
      expect(src(f), f).not.toMatch(/AI service error \(\$\{/);
    }
  });

  it("gives back the allowance a failed AI call was charged", () => {
    expect(src("invoiceReader.ts")).toMatch(/refundAiUsage\(orgId, "invoice_scan"\)/);
    expect(src("insights.ts")).toMatch(/refundAiUsage\(orgId, "insights"\)/);
  });
});
