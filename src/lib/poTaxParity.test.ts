import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** The server builds POs from Telegram with its own copy of the GST maths; it must be the app's, word for word. */
describe("GST maths: app and server copies", () => {
  it("are identical", () => {
    const app = readFileSync(new URL("./poTax.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("../../functions/src/shared/poTax.ts", import.meta.url), "utf8").split("\n").slice(3).join("\n");
    expect(server).toBe(app);
  });
});
