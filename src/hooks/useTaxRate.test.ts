import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gstNote } from "./useTaxRate";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("gstNote", () => {
  it("says nothing at all when no GST is charged", () => {
    // The whole point: unregistered sellers charge the sticker, so the copy
    // must not imply a surcharge that never arrives.
    expect(gstNote(0)).toBe("");
  });

  it("treats any unusable rate as no tax, never as 18", () => {
    // A failed lookup must not invent a surcharge in the customer's head.
    for (const bad of [-1, NaN, Infinity, undefined, null, "18"]) {
      expect(gstNote(bad as any)).toBe("");
    }
  });

  it("names the actual rate once there is one", () => {
    expect(gstNote(18)).toContain("18%");
    expect(gstNote(18)).toMatch(/added at checkout/i);
    // A different configured rate must not render as 18.
    expect(gstNote(5)).toContain("5%");
    expect(gstNote(5)).not.toContain("18%");
  });
});

describe("no pricing surface hard-codes a GST claim", () => {
  // Five places quoted "exclusive of GST" unconditionally, which was wrong in
  // both directions: it promised a surcharge while none was charged, and would
  // have stayed silent on the day 18% switched on. They now all read the rate.
  const SURFACES: Array<[string, string]> = [
    ["AddCapacityModal", "../components/AddCapacityModal.tsx"],
    ["ManagePlanModal", "../components/ManagePlanModal.tsx"],
    ["LandingPage", "../pages/LandingPage.tsx"],
  ];

  for (const [name, rel] of SURFACES) {
    it(`${name} derives its GST line from the configured rate`, () => {
      const src = read(rel);
      expect(src).toMatch(/useTaxRate\(\)/);
      expect(src).toMatch(/gstNote\(/);
      // The literal claim must be gone -- that is the thing that could lie.
      expect(src).not.toMatch(/exclusive of GST/i);
    });
  }

  it("the shared strings carry no GST claim either", () => {
    const t = read("../i18n/translations.ts");
    expect(t).not.toMatch(/exclusive of GST/i);
  });

  it("the rate endpoint never returns the GSTIN", () => {
    // The rate is public; the registration number is not something a pricing
    // line needs, so it must not ride along.
    const rzp = read("../../functions/src/razorpay.ts");
    const block = rzp.slice(rzp.indexOf("export const getCheckoutTaxRate"));
    const body = block.slice(0, block.indexOf("export const setTaxConfig"));
    expect(body).toMatch(/ratePct/);
    expect(body).not.toMatch(/gstin/i);
  });
});
