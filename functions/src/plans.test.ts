import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  slotPurchasePatch,
  activeSlots,
  effectiveProjectCap,
  MONTH_MS,
  OVERAGE_RATE,
  PLANS,
  planAmountPaise,
} from "./plans";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("slotPurchasePatch", () => {
  it("opens a 30-day window on a first purchase", () => {
    const p = slotPurchasePatch({ includedProjects: 5 }, 3, NOW);
    expect(p.purchasedSlots).toBe(3);
    expect(p.slotsExpireAt).toBe(NOW + MONTH_MS);
  });

  it("tops up the SAME window when bought again inside it", () => {
    const org = { purchasedSlots: 2, slotsExpireAt: NOW + 10 * DAY };
    const p = slotPurchasePatch(org, 3, NOW);
    expect(p.purchasedSlots).toBe(5);
    // Buying more must not extend the window, or a trickle of purchases would
    // keep pushing expiry out and the slots would never lapse.
    expect(p.slotsExpireAt).toBe(NOW + 10 * DAY);
  });

  it("starts a fresh window once the old one has passed", () => {
    const org = { purchasedSlots: 9, slotsExpireAt: NOW - DAY };
    const p = slotPurchasePatch(org, 2, NOW);
    expect(p.purchasedSlots).toBe(2); // the lapsed nine are not carried over
    expect(p.slotsExpireAt).toBe(NOW + MONTH_MS);
  });

  it("does not double-count a LEGACY org's slots", () => {
    // Before this scheme, payment did includedProjects += qty AND
    // purchasedSlots += qty. Those slots are already inside includedProjects
    // and there is no slotsExpireAt, so a new purchase must reset the count
    // rather than add to it -- otherwise the old three get granted twice.
    const legacy = { includedProjects: 8, purchasedSlots: 3 };
    const p = slotPurchasePatch(legacy, 2, NOW);
    expect(p.purchasedSlots).toBe(2);
    expect(effectiveProjectCap({ ...legacy, ...p }, NOW)).toBe(10); // 8 base + 2 new
  });

  it("ignores a nonsense quantity", () => {
    for (const bad of [0, -4, NaN, undefined, "x"]) {
      expect(slotPurchasePatch({}, bad as any, NOW).purchasedSlots).toBe(0);
    }
  });
});

describe("activeSlots", () => {
  it("counts slots inside the window and none after it", () => {
    expect(activeSlots({ purchasedSlots: 4, slotsExpireAt: NOW + DAY }, NOW)).toBe(4);
    expect(activeSlots({ purchasedSlots: 4, slotsExpireAt: NOW - DAY }, NOW)).toBe(0);
  });

  it("expires exactly at the boundary rather than a tick late", () => {
    expect(activeSlots({ purchasedSlots: 1, slotsExpireAt: NOW + 1 }, NOW)).toBe(1);
    expect(activeSlots({ purchasedSlots: 1, slotsExpireAt: NOW }, NOW)).toBe(0);
  });

  it("reads a legacy purchase as zero, since it is already in the base cap", () => {
    expect(activeSlots({ purchasedSlots: 3 }, NOW)).toBe(0);
    expect(activeSlots({ purchasedSlots: 3, slotsExpireAt: 0 }, NOW)).toBe(0);
  });

  it("survives junk", () => {
    for (const bad of [null, undefined, {}, { purchasedSlots: "x" }, { purchasedSlots: -2 }]) {
      expect(activeSlots(bad, NOW)).toBe(0);
    }
  });
});

describe("effectiveProjectCap", () => {
  it("is the plan cap plus live slots", () => {
    expect(effectiveProjectCap({ includedProjects: 5 }, NOW)).toBe(5);
    expect(effectiveProjectCap({ includedProjects: 5, purchasedSlots: 2, slotsExpireAt: NOW + DAY }, NOW)).toBe(7);
  });

  it("drops back to the plan cap when the window lapses", () => {
    const org = { includedProjects: 5, purchasedSlots: 3, slotsExpireAt: NOW + DAY };
    expect(effectiveProjectCap(org, NOW)).toBe(8);
    expect(effectiveProjectCap(org, NOW + 2 * DAY)).toBe(5);
  });

  it("keeps unlimited unlimited, and no-cap uncapped", () => {
    expect(effectiveProjectCap({ includedProjects: null }, NOW)).toBeNull();
    expect(effectiveProjectCap({}, NOW)).toBeUndefined();
    expect(effectiveProjectCap({ includedProjects: "5" }, NOW)).toBeUndefined();
  });
});

describe("the payment handler applies this", () => {
  const src = readFileSync(join(HERE, "./razorpay.ts"), "utf8");
  const slotBranch = src.slice(src.indexOf('if (o.kind === "slots")'), src.indexOf("const months ="));

  it("writes the slot patch instead of raising includedProjects forever", () => {
    // The whole bug in one line: `includedProjects: FieldValue.increment(qty)`
    // with nothing to reverse it. If that ever comes back, ₹99 buys a project
    // for good again.
    expect(slotBranch).toMatch(/slotPurchasePatch\(/);
    expect(slotBranch).not.toMatch(/includedProjects:\s*FieldValue\.increment/);
  });

  it("reads the org before topping up, so a live window is seen", () => {
    expect(slotBranch).toMatch(/runTransaction\(/);
  });
});

describe("client and server plan catalogs agree", () => {
  // Both files say "keep in sync with the other" and nothing checked that they
  // were. A drift here means the price shown is not the price charged.
  const server = readFileSync(join(HERE, "./plans.ts"), "utf8");
  const client = readFileSync(join(HERE, "../../src/lib/plans.ts"), "utf8");
  const SHARED = ["includedProjects", "userLimit", "aiQuota", "monthly", "annual"] as const;

  const read = (src: string, id: string) => {
    const line = src.split("\n").find((l) => new RegExp(`^\\s*${id}:\\s*\\{`).test(l));
    if (!line) throw new Error(`plan "${id}" not found`);
    const out: Record<string, string> = {};
    for (const key of SHARED) {
      const m = line.match(new RegExp(`\\b${key}:\\s*(null|-?\\d+)`));
      if (!m) throw new Error(`plan "${id}" has no ${key}`);
      out[key] = m[1];
    }
    return out;
  };

  it("has the same plan ids on both sides", () => {
    const ids = (src: string) => [...src.matchAll(/^\s{2}(\w+):\s*\{\s*(?:id:|includedProjects:)/gm)].map((m) => m[1]);
    expect(ids(client).sort()).toEqual(ids(server).sort());
  });

  for (const id of Object.keys(PLANS)) {
    it(`matches on ${id}`, () => {
      expect(read(client, id)).toEqual(read(server, id));
    });
  }

  it("charges the same overage rate on both sides", () => {
    const rate = (src: string) => src.match(/OVERAGE_RATE\s*=\s*(\d+)/)?.[1];
    expect(rate(client)).toBe(rate(server));
    expect(rate(server)).toBe(String(OVERAGE_RATE));
  });
});

describe("planAmountPaise", () => {
  it("prices a payable plan in paise", () => {
    expect(planAmountPaise("starter", "monthly")).toBe(99900);
    expect(planAmountPaise("starter", "annual")).toBe(999000);
  });

  it("has no amount for the free or custom plans", () => {
    expect(planAmountPaise("free", "monthly")).toBeNull();
    expect(planAmountPaise("enterprise", "monthly")).toBeNull();
  });

  it("gives annual at ten months, not twelve", () => {
    for (const id of ["starter", "growth", "business"] as const) {
      const p = PLANS[id];
      expect(p.annual).toBe(p.monthly! * 10);
    }
  });
});
