import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { addGst, GST_RATE_PCT, PLANS, OVERAGE_RATE } from "./plans";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("addGst", () => {
  it("adds 18% to a net price", () => {
    // Starter: ₹99.00 net -> ₹17.82 GST -> ₹116.82 charged.
    expect(addGst(9900, 18)).toEqual({ netPaise: 9900, taxPaise: 1782, totalPaise: 11682, ratePct: 18 });
  });

  it("adds nothing when no rate is configured", () => {
    // The default before registration. Charging GST unregistered is collecting
    // tax you have no right to, so 0 must mean 0 -- never a silent fallback to
    // the standard rate.
    for (const bad of [0, -5, NaN, Infinity, undefined, null, "", "eighteen", {}]) {
      const r = addGst(9900, bad as any);
      expect(r.taxPaise).toBe(0);
      expect(r.totalPaise).toBe(9900);
      expect(r.ratePct).toBe(0);
    }
  });

  it("never lets net + tax disagree with total", () => {
    // Rounding the total instead of the tax can leave them a paisa apart, which
    // does not reconcile on a GST invoice.
    for (let net = 1; net < 5000; net += 7) {
      const r = addGst(net, 18);
      expect(r.netPaise + r.taxPaise).toBe(r.totalPaise);
    }
  });

  it("rounds to whole paise, because Razorpay takes integers", () => {
    // ₹0.01 at 18% is 0.18 paise -> 0; nothing fractional may reach the gateway.
    for (const net of [1, 7, 33, 99, 12345]) {
      const r = addGst(net, 18);
      expect(Number.isInteger(r.taxPaise)).toBe(true);
      expect(Number.isInteger(r.totalPaise)).toBe(true);
    }
  });

  it("treats a malformed net amount as zero rather than NaN", () => {
    // A NaN amount reaching placeRazorpayOrder would be a broken order, not a
    // refused one.
    for (const bad of [NaN, undefined, null, "abc", -500]) {
      const r = addGst(bad as any, 18);
      expect(r.netPaise).toBe(0);
      expect(r.totalPaise).toBe(0);
    }
  });

  it("prices the real catalog the way the pricing page promises", () => {
    // "Prices exclusive of GST" -- so the customer pays sticker + 18%.
    expect(addGst(PLANS.starter.monthly! * 100, GST_RATE_PCT).totalPaise).toBe(11682);
    expect(addGst(PLANS.business.monthly! * 100, GST_RATE_PCT).totalPaise).toBe(176882);
    expect(addGst(OVERAGE_RATE * 100, GST_RATE_PCT).totalPaise).toBe(11682);
  });

  it("is 18 by default", () => {
    expect(GST_RATE_PCT).toBe(18);
  });
});

describe("checkout actually charges the tax", () => {
  // A helper that exists but is never called is this repo's known failure mode
  // (userLimit was written, advertised, and read by nobody). Comments are
  // stripped first: a comment explaining the fix would otherwise satisfy the
  // match on its own.
  const src = readFileSync(join(HERE, "./razorpay.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const body = (start: string, end?: string) => {
    const from = src.indexOf(start);
    const to = end ? src.indexOf(end) : src.length;
    return src.slice(from, to > from ? to : src.length);
  };

  it("adds GST to the PRORATED plan amount, not the sticker", () => {
    const b = body("export const createRazorpayOrder", "export const createSlotOrder");
    expect(b).toMatch(/addGst\(\s*quote\.amountPaise/);
    // The charged figure must be the taxed total, never the bare net.
    expect(b).toMatch(/const amount = charge\.totalPaise/);
  });

  it("adds GST to slot purchases too", () => {
    const b = body("export const createSlotOrder", "async function activateOrgFromOrder");
    expect(b).toMatch(/addGst\(/);
    expect(b).toMatch(/const amount = charge\.totalPaise/);
  });

  it("reads the rate from config rather than hard-coding one at checkout", () => {
    // The rate has to stay 0 until a GSTIN exists, so neither path may inline it.
    for (const name of ["export const createRazorpayOrder", "export const createSlotOrder"]) {
      const b = body(name, "async function activateOrgFromOrder");
      expect(b).toMatch(/getTaxConfig\(\)/);
      expect(b).not.toMatch(/addGst\([^)]*,\s*18\s*\)/);
    }
  });

  it("records the breakdown on the order, so an invoice can be reconciled", () => {
    for (const field of ["netAmount", "taxAmount", "taxRatePct", "gstin"]) {
      expect(src).toContain(field);
    }
  });

  it("charges no GST until a GSTIN is configured", () => {
    const b = body("export async function getTaxConfig");
    expect(b).toMatch(/if \(!gstin\) return \{ gstin: "", ratePct: 0 \}/);
  });
});
