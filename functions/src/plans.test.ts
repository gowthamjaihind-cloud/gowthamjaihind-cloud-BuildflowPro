import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  slotPurchasePatch,
  activeSlots,
  effectiveProjectCap,
  prorateUpgrade,
  planAdvice,
  monthlyCostOf,
  BUSINESS_SOFT_CAP,
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
    // The charge is now the PRORATED amount plus GST, so it is no longer a bare
    // `amount = quote.amountPaise`. What still has to hold is that the money
    // starts from the prorated figure: taxing quote.fullPaise would reinstate
    // the double-charge this test exists to prevent, and charge GST on days the
    // customer is being credited for.
    expect(block).toMatch(/addGst\(\s*quote\.amountPaise/);
    expect(block).not.toMatch(/addGst\(\s*quote\.fullPaise/);
    // And the figure sent to the gateway is the taxed total, not the net.
    expect(block).toMatch(/amount\s*=\s*charge\.totalPaise/);
  });
});

// The twin implementations must agree. The catalog parity test above compares
// the PLANS tables field by field; this compares the FUNCTIONS, by importing both
// and running them over the same inputs — a drift here would mean the price the
// customer is advised of is not the price the server would charge.
import * as client from "../../src/lib/plans";

describe("planAdvice", () => {
  it("says nothing while Starter is genuinely the cheapest", () => {
    for (const n of [1, 5, 10, 14, 15]) {
      const a = planAdvice("starter", n);
      expect(a.cheaper, `at ${n} projects`).toBeNull();
      expect(a.savings).toBe(0);
    }
  });

  it("flags Business the moment it actually costs less", () => {
    // 15 → Starter ₹1,485 vs Business ₹1,499, so stay. 16 → ₹1,584 vs ₹1,499.
    expect(planAdvice("starter", 15).cheaper).toBeNull();
    const a = planAdvice("starter", 16);
    expect(a.cheaper).toBe("business");
    expect(a.currentCost).toBe(1584);
    expect(a.cheaperCost).toBe(1499);
    expect(a.savings).toBe(85);
  });

  it("grows the saving to 20 projects, then PLATEAUS at ₹481", () => {
    // Past 20 both plans add ₹99 for each further project, so the gap stops
    // widening: it is fixed at Starter's 20-project price minus Business's base.
    // That is the most a Starter customer can ever overpay, which is worth
    // knowing before writing scary copy about it.
    expect(planAdvice("starter", 16).savings).toBe(85);
    expect(planAdvice("starter", 20).savings).toBe(1980 - 1499); // 481
    for (const n of [21, 30, 50, 120]) {
      expect(planAdvice("starter", n).savings, `at ${n} projects`).toBe(481);
    }
  });

  it("never advises a Business org to move down to Starter", () => {
    // Starter is cheaper below 16, but a Business customer is there for seats and
    // AI volume as well as projects — telling them to downgrade on price alone
    // would be advice against their own setup.
    for (const n of [1, 5, 20, 40]) {
      const a = planAdvice("business", n);
      if (a.cheaper !== null) expect(a.cheaperCost).toBeLessThan(a.currentCost);
    }
    // At a low count Starter IS cheaper and the flag is honest about that.
    expect(planAdvice("business", 5).cheaper).toBe("starter");
  });

  it("flags the Business soft cap without blocking anything", () => {
    expect(planAdvice("business", BUSINESS_SOFT_CAP).overSoftCap).toBe(false);
    expect(planAdvice("business", BUSINESS_SOFT_CAP + 1).overSoftCap).toBe(true);
    // The cost keeps being charged past the cap — the flag is a sales signal.
    expect(planAdvice("business", 60).currentCost).toBe(1499 + 40 * 99);
  });

  it("applies the soft cap to Business only", () => {
    expect(planAdvice("starter", 100).overSoftCap).toBe(false);
    expect(planAdvice("enterprise", 100).overSoftCap).toBe(false);
  });

  it("gives no advice on Enterprise, which is priced by hand", () => {
    const a = planAdvice("enterprise", 50);
    expect(a.cheaper).toBeNull();
    expect(a.currentCost).toBe(0);
  });

  it("survives an unknown or missing plan", () => {
    for (const bad of [null, undefined, "", "growth", "free", 7 as any]) {
      expect(() => planAdvice(bad as any, 10)).not.toThrow();
      expect(planAdvice(bad as any, 10).cheaper).toBeNull();
    }
  });

  it("never recommends a plan that saves nothing", () => {
    // A recommendation with zero or negative saving is worse than silence: it
    // tells a customer to move and then charges them the same or more. No tie is
    // possible at today's prices (99n = 1499 has no integer solution), so this
    // guards the rule for whenever the prices change.
    for (const plan of ["starter", "business", "enterprise"] as const) {
      for (let n = 0; n <= 120; n++) {
        const a = planAdvice(plan, n);
        if (a.cheaper !== null) {
          expect(a.savings, `${plan} at ${n} projects`).toBeGreaterThan(0);
          expect(a.cheaperCost).toBeLessThan(a.currentCost);
        } else {
          expect(a.savings).toBe(0);
        }
      }
    }
  });

  it("survives a junk project count", () => {
    for (const bad of [NaN, -5, "x" as any, null as any]) {
      expect(planAdvice("starter", bad).currentCost).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("monthlyCostOf", () => {
  it("prices Starter as exactly ₹99 per project", () => {
    for (const n of [1, 2, 7, 23]) expect(monthlyCostOf("starter", n)).toBe(99 * n);
  });

  it("prices Business as the base plus overage past 20", () => {
    expect(monthlyCostOf("business", 20)).toBe(1499);
    expect(monthlyCostOf("business", 25)).toBe(1499 + 5 * 99);
    expect(monthlyCostOf("business", 3)).toBe(1499); // base still applies below the cap
  });

  it("has no price for Enterprise", () => {
    expect(monthlyCostOf("enterprise", 10)).toBeNull();
  });
});

describe("client and server agree on the advice, not just the catalog", () => {
  it("returns the same costs and the same recommendation at every count", () => {
    for (const plan of ["starter", "business", "enterprise"] as const) {
      for (let n = 0; n <= 60; n++) {
        expect(client.monthlyCostOf(plan, n), `monthlyCostOf(${plan}, ${n})`).toBe(monthlyCostOf(plan, n));
        expect(client.planAdvice(plan, n), `planAdvice(${plan}, ${n})`).toEqual(planAdvice(plan, n));
      }
    }
  });

  it("keeps the same soft cap on both sides", () => {
    expect(client.BUSINESS_SOFT_CAP).toBe(BUSINESS_SOFT_CAP);
  });
});
