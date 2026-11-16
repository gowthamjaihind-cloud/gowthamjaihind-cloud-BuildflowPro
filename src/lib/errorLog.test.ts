import { describe, it, expect } from "vitest";
import { scrubError, recordError, recentErrors } from "./errorLog";

describe("error log", () => {
  it("removes tokens and keys from messages", () => {
    const s = scrubError("GET https://x/o/a.jpg?alt=media&token=abc-123 failed; key AIzaSyA1234567890abcdefghijk; rzp_live_ABC123");
    expect(s).not.toMatch(/abc-123|AIzaSyA1234567890|rzp_live_ABC123/);
    expect(s).toContain("token=…");
  });
  it("keeps the last errors, skipping an immediate repeat", () => {
    recordError("boom");
    recordError("boom");
    recordError("other");
    expect(recentErrors().filter((e) => e.endsWith("boom")).length).toBe(1);
    expect(recentErrors().pop()).toMatch(/other$/);
  });
});
