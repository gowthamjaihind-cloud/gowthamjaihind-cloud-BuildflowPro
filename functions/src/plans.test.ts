import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  slotPurchasePatch,
  activeSlots,
  effectiveProjectCap,
  prorateUpgrade,
  planPatch,
  planCapacityPatch,
  MIN_ORDER_PAISE,
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
    expect(planAmountPaise("starter", "monthly")).toBe(9900);
    expect(planAmountPaise("starter", "annual")).toBe(99000);
    expect(planAmountPaise("business", "monthly")).toBe(149900);
  });

  it("has no amount for the custom plan", () => {
    expect(planAmountPaise("enterprise", "monthly")).toBeNull();
    expect(planAmountPaise("enterprise", "annual")).toBeNull();
  });

  it("gives annual at ten months, not twelve", () => {
    for (const id of ["starter", "business"] as const) {
      const p = PLANS[id];
      expect(p.annual).toBe(p.monthly! * 10);
    }
  });
});

describe("prorateUpgrade", () => {
  const DAY = 24 * 60 * 60 * 1000;
  // Day 20 of a 30-day Starter period: ten days left of ₹999.
  const midStarter = {
    subscriptionStatus: "active",
    plan: "starter",
    currentPeriodStart: NOW - 20 * DAY,
    currentPeriodEnd: NOW + 10 * DAY,
    currentPeriodPaise: 9900,
  };

  it("credits the unused days when upgrading mid-cycle", () => {
    const q = prorateUpgrade(midStarter, "business", "monthly", NOW);
    expect(q.fullPaise).toBe(149900);
    // 10/30 of ₹99 = ₹33
    expect(q.creditPaise).toBe(3300);
    expect(q.amountPaise).toBe(149900 - 3300);
  });

  it("charges list price when there is nothing left to credit", () => {
    const atEnd = { ...midStarter, currentPeriodEnd: NOW };
    expect(prorateUpgrade(atEnd, "business", "monthly", NOW).amountPaise).toBe(149900);
  });

  it("charges list price for an org with no recorded period", () => {
    // Anything predating this, or activated by hand via setSubscription, has no
    // currentPeriodStart. Under-crediting is recoverable; over-crediting is not.
    for (const org of [
      { subscriptionStatus: "active" },
      { subscriptionStatus: "active", currentPeriodEnd: NOW + 10 * DAY },
      { ...midStarter, currentPeriodPaise: 0 },
      { ...midStarter, currentPeriodStart: 0 },
    ]) {
      expect(prorateUpgrade(org, "business", "monthly", NOW).creditPaise).toBe(0);
    }
  });

  it("gives no credit to a trial, a free org or a lapsed one", () => {
    for (const subscriptionStatus of ["trialing", "free", "past_due", "expired", "internal"]) {
      expect(prorateUpgrade({ ...midStarter, subscriptionStatus }, "business", "monthly", NOW).creditPaise).toBe(0);
    }
  });

  it("credits a monthly period against an annual upgrade", () => {
    const q = prorateUpgrade(midStarter, "business", "annual", NOW);
    expect(q.fullPaise).toBe(1499000);
    expect(q.creditPaise).toBe(3300);
  });

  it("never charges less than ₹1, which Razorpay would reject", () => {
    // A credit larger than the target price — e.g. annual plan, cheap upgrade.
    const richCredit = {
      subscriptionStatus: "active",
      plan: "business",
      currentPeriodStart: NOW - DAY,
      currentPeriodEnd: NOW + 364 * DAY,
      currentPeriodPaise: 1499000,
    };
    const q = prorateUpgrade(richCredit, "starter", "monthly", NOW);
    expect(q.amountPaise).toBeGreaterThanOrEqual(MIN_ORDER_PAISE);
    expect(q.creditPaise).toBeLessThanOrEqual(q.fullPaise - MIN_ORDER_PAISE);
  });

  it("never credits more than was paid", () => {
    const q = prorateUpgrade(midStarter, "business", "monthly", NOW);
    expect(q.creditPaise).toBeLessThanOrEqual(midStarter.currentPeriodPaise);
  });

  it("refuses to credit against a period that has not started", () => {
    const future = { ...midStarter, currentPeriodStart: NOW + DAY, currentPeriodEnd: NOW + 31 * DAY };
    expect(prorateUpgrade(future, "business", "monthly", NOW).creditPaise).toBe(0);
  });

  it("survives junk without crediting on it", () => {
    for (const bad of [null, undefined, {}, { currentPeriodPaise: "lots" }]) {
      const q = prorateUpgrade(bad, "business", "monthly", NOW);
      expect(q.creditPaise).toBe(0);
      expect(q.amountPaise).toBe(149900);
    }
  });
});

describe("planPatch records what the period cost", () => {
  it("writes both bounds and the amount, so an upgrade can be prorated", () => {
    const p: any = planPatch("starter", 1);
    expect(p.currentPeriodStart).toBeGreaterThan(0);
    expect(p.currentPeriodEnd).toBeGreaterThan(p.currentPeriodStart);
    expect(p.currentPeriodPaise).toBe(9900);
  });

  it("records the annual amount for a yearly period", () => {
    expect((planPatch("business", 12) as any).currentPeriodPaise).toBe(1499000);
  });

  it("records zero paid for Enterprise, which is not priced here", () => {
    // Hand-sold, so there is no list price to prorate against. Zero means
    // prorateUpgrade gives no credit rather than crediting an invented amount.
    const p: any = planPatch("enterprise", 1);
    expect(p.subscriptionStatus).toBe("active");
    expect(p.currentPeriodPaise).toBe(0);
  });
});

describe("planCapacityPatch", () => {
  it("grants capacity without touching the subscription", () => {
    // This is what a downgrade applies. If it set a status or a period it would
    // be handing out a paid month nobody paid for.
    const p: any = planCapacityPatch("starter");
    expect(p).toMatchObject({ plan: "starter", includedProjects: 1, userLimit: 20, purchasedSlots: 0 });
    expect(p.subscriptionStatus).toBeUndefined();
    expect(p.currentPeriodEnd).toBeUndefined();
  });
});

describe("the no-free-month and no-clobber fixes hold", () => {
  // Comments are stripped before matching: these assertions are about what the
  // code DOES, and a comment explaining the old bug would otherwise fail them.
  const codeOf = (file: string) =>
    readFileSync(join(HERE, file), "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
  const change = codeOf("./planChange.ts");
  const bill = codeOf("./billing.ts");

  it("a downgrade applies capacity only, never a fresh paid period", () => {
    expect(change).toMatch(/planCapacityPatch\(target/);
    expect(change).not.toMatch(/planPatch\(target[^)]*,\s*1\s*\)/);
  });

  it("setSubscription no longer writes a plan that isPlanId rejects", () => {
    // `plan: "paid"` locked every hand-activated org out of self-serve changes.
    expect(bill).not.toMatch(/plan:\s*"paid"/);
    expect(bill).not.toMatch(/plan:\s*"internal"/);
  });

  it("checkout prices the upgrade through prorateUpgrade", () => {
    const rzp = codeOf("./razorpay.ts");
    const block = rzp.slice(rzp.indexOf("export const createRazorpayOrder"), rzp.indexOf("createSlotOrder"));
    expect(block).toMatch(/prorateUpgrade\(/);
    expect(block).toMatch(/amount\s*=\s*quote\.amountPaise/);
  });
});
