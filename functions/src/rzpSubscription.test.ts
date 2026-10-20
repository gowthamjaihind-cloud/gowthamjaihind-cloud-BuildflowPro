import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { subscriptionPatch, toMillis, planCacheKey, rzpPeriod, totalCycles } from "./rzpSubscription";

const HERE = dirname(fileURLToPath(import.meta.url));

const sub = (over: any = {}) => ({
  id: "sub_ABC123",
  status: "active",
  current_start: 1_767_225_600, // unix SECONDS
  current_end: 1_769_904_000,
  ...over,
});

describe("toMillis", () => {
  it("converts Razorpay's unix seconds to milliseconds", () => {
    expect(toMillis(1_767_225_600)).toBe(1_767_225_600_000);
  });

  it("rejects anything that is not a usable timestamp", () => {
    // A zero or missing current_end written through as 0 would read as "a date
    // long past" and expire a customer who had just paid.
    for (const bad of [0, -1, NaN, Infinity, null, undefined, "", "soon", {}]) {
      expect(toMillis(bad as any)).toBeNull();
    }
  });
});

describe("subscriptionPatch", () => {
  it("grants the period RAZORPAY reports, not one computed here", () => {
    const p = subscriptionPatch("subscription.charged", sub())!;
    expect(p.subscriptionStatus).toBe("active");
    expect(p.currentPeriodStart).toBe(1_767_225_600_000);
    expect(p.currentPeriodEnd).toBe(1_769_904_000_000);
    expect(p.razorpaySubscriptionId).toBe("sub_ABC123");
  });

  it("treats activation like a charge", () => {
    expect(subscriptionPatch("subscription.activated", sub())?.subscriptionStatus).toBe("active");
  });

  it("does NOT change access while Razorpay is still retrying", () => {
    // subscription.pending means a charge failed and retries continue. Moving
    // to past_due here starts a grace clock a successful retry must then undo,
    // and tells a customer who has lost nothing that their account is overdue.
    expect(subscriptionPatch("subscription.pending", sub({ status: "pending" }))).toBeNull();
  });

  it("moves to past_due only once the retries are exhausted", () => {
    const p = subscriptionPatch("subscription.halted", sub({ status: "halted" }))!;
    expect(p.subscriptionStatus).toBe("past_due");
    // past_due is the existing dunning path: grace week and notices already
    // hang off it, so halted must map onto it rather than invent a state.
    expect(p.reason).toMatch(/halted/i);
  });

  it("cancels on cancellation and on a completed schedule", () => {
    expect(subscriptionPatch("subscription.cancelled", sub({ status: "cancelled" }))?.subscriptionStatus).toBe("canceled");
    expect(subscriptionPatch("subscription.completed", sub({ status: "completed" }))?.subscriptionStatus).toBe("canceled");
  });

  it("grants nothing before the first successful charge", () => {
    // An authorised mandate has collected no money. Handing over the product
    // here gives it away to anyone who starts checkout and abandons it.
    for (const e of ["subscription.created", "subscription.authenticated"]) {
      expect(subscriptionPatch(e, sub({ status: "created" }))).toBeNull();
    }
  });

  it("ignores events it does not understand, rather than guessing", () => {
    expect(subscriptionPatch("subscription.updated", sub())).toBeNull();
    expect(subscriptionPatch("payment.captured", sub())).toBeNull();
    expect(subscriptionPatch("", sub())).toBeNull();
  });

  it("omits dates it cannot trust instead of writing junk", () => {
    // A patch carrying currentPeriodEnd: 0 or NaN is worse than one carrying
    // no date at all: the lifecycle reads it and expires a paying org.
    const p = subscriptionPatch("subscription.charged", sub({ current_start: null, current_end: "nope" }))!;
    expect(p.subscriptionStatus).toBe("active");
    expect(p).not.toHaveProperty("currentPeriodEnd");
    expect(p).not.toHaveProperty("currentPeriodStart");
  });

  it("survives a malformed entity", () => {
    expect(() => subscriptionPatch("subscription.charged", null)).not.toThrow();
    expect(() => subscriptionPatch("subscription.charged", undefined)).not.toThrow();
    expect(subscriptionPatch("subscription.charged", {})?.subscriptionStatus).toBe("active");
  });
});

describe("planCacheKey", () => {
  it("separates plans whose amounts differ by tax", () => {
    // Razorpay plans are immutable. Reusing a 0% plan after a GSTIN is set
    // would keep charging the tax-free amount forever, silently.
    expect(planCacheKey("starter", "monthly", 0)).not.toBe(planCacheKey("starter", "monthly", 18));
  });

  it("separates tier and period", () => {
    const keys = new Set([
      planCacheKey("starter", "monthly", 18),
      planCacheKey("starter", "annual", 18),
      planCacheKey("business", "monthly", 18),
      planCacheKey("business", "annual", 18),
    ]);
    expect(keys.size).toBe(4);
  });

  it("treats an unusable rate as 0, matching what gets charged", () => {
    for (const bad of [NaN, -5, Infinity, undefined, null, "x"]) {
      expect(planCacheKey("starter", "monthly", bad as any)).toBe(planCacheKey("starter", "monthly", 0));
    }
  });
});

describe("period mapping", () => {
  it("speaks Razorpay's vocabulary", () => {
    expect(rzpPeriod("annual")).toBe("yearly");
    expect(rzpPeriod("monthly")).toBe("monthly");
  });

  it("schedules about ten years either way", () => {
    expect(totalCycles("monthly")).toBe(120);
    expect(totalCycles("annual")).toBe(10);
  });
});

// ---- the lifecycle must not fight Razorpay -------------------------------
import { nextLifecycleState, WEBHOOK_TOLERANCE_MS, GRACE_MS } from "./subscription";

describe("the nightly lifecycle and a live subscription", () => {
  const NOW = 1_800_000_000_000;
  const ended = NOW - 60_000; // period ended a minute ago

  it("leaves a subscribed org alone while the charge webhook is still in flight", () => {
    // Razorpay charges on its own clock. Moving this org to past_due would show
    // a grace banner and send dunning email to someone who is about to be, or
    // has already been, charged.
    const org = { subscriptionStatus: "active", currentPeriodEnd: ended, razorpaySubscriptionId: "sub_1" };
    expect(nextLifecycleState(org, NOW)).toBeNull();
  });

  it("still dunning a subscribed org once the webhook plainly is not coming", () => {
    const org = { subscriptionStatus: "active", currentPeriodEnd: ended, razorpaySubscriptionId: "sub_1" };
    const late = NOW + WEBHOOK_TOLERANCE_MS;
    expect(nextLifecycleState(org, late)?.to).toBe("past_due");
  });

  it("does not wait at all for an org with no subscription", () => {
    // Nothing is coming for these: they pay by one-off order, so the period
    // ending IS the event. The tolerance must not delay their dunning.
    const org = { subscriptionStatus: "active", currentPeriodEnd: ended };
    expect(nextLifecycleState(org, NOW)?.to).toBe("past_due");
  });

  it("does not wait when the customer already asked to cancel", () => {
    // No charge is coming, so there is nothing to wait for, and holding them in
    // active past their period would bill nobody while granting access.
    const org = {
      subscriptionStatus: "active",
      currentPeriodEnd: ended,
      razorpaySubscriptionId: "sub_1",
      cancelAtPeriodEnd: true,
    };
    expect(nextLifecycleState(org, NOW)?.to).toBe("canceled");
  });

  it("keeps the tolerance well inside the grace week", () => {
    // If the tolerance ever exceeded grace, a failed subscription would lose
    // access before it was ever marked past_due -- no banner, no warning email.
    expect(WEBHOOK_TOLERANCE_MS).toBeLessThan(GRACE_MS);
  });
});

// ---- cancelling must stop the money, not just the flag -------------------
describe("cancellation reaches Razorpay", () => {
  const src = readFileSync(join(HERE, "./planChange.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const body = src.slice(src.indexOf("export const cancelSubscription"), src.indexOf("export const resumeSubscription"));

  it("calls Razorpay before writing the local flag", () => {
    // With a live mandate the local flag stops nothing: the customer cancels in
    // the app and is still debited next month.
    expect(body).toMatch(/cancelRazorpaySubscription\(/);
    expect(body.indexOf("cancelRazorpaySubscription")).toBeLessThan(body.indexOf("cancelAtPeriodEnd: true"));
  });

  it("refuses to claim a cancellation it could not enforce", () => {
    expect(body).toMatch(/throw new HttpsError\(\s*"unavailable"/);
  });
});

// ---- metered Starter billing --------------------------------------------
import { desiredQuantity, quantityChange, isQuantityBilled } from "./rzpSubscription";
import { PLANS, OVERAGE_RATE } from "./plans";

describe("quantity-billed Starter", () => {
  it("bills Starter per project and nothing else", () => {
    expect(isQuantityBilled("starter")).toBe(true);
    // Business includes 20 for a flat ₹1,499, so quantity would have to mean
    // something different there; it stays at 1 until that is built.
    for (const p of ["business", "enterprise", "free", "", "trial"]) {
      expect(isQuantityBilled(p)).toBe(false);
    }
  });

  it("charges ₹99 per project, which is exactly Starter's price", () => {
    // The whole reason quantity works here: Starter IS ₹99 per project, so
    // quantity x plan amount is the right bill at every count.
    expect(PLANS.starter.monthly).toBe(OVERAGE_RATE);
    expect(PLANS.starter.includedProjects).toBe(1);
  });

  it("never drops below 1, because Starter includes a project", () => {
    // A customer between projects still has a plan, and Razorpay will not
    // accept quantity 0 anyway.
    for (const n of [0, -3, NaN, undefined, null, "x"]) {
      expect(desiredQuantity("starter", n as any)).toBe(1);
    }
  });

  it("tracks the project count upward", () => {
    expect(desiredQuantity("starter", 1)).toBe(1);
    expect(desiredQuantity("starter", 3)).toBe(3);
    expect(desiredQuantity("starter", 20)).toBe(20);
  });

  it("leaves non-quantity plans at 1 whatever they have", () => {
    expect(desiredQuantity("business", 17)).toBe(1);
    expect(desiredQuantity("enterprise", 400)).toBe(1);
  });
});

describe("quantityChange", () => {
  it("does nothing when nothing moved", () => {
    expect(quantityChange(3, 3)).toEqual({ kind: "none" });
  });

  it("raises immediately, because the project is usable immediately", () => {
    expect(quantityChange(1, 2)).toEqual({ kind: "increase", quantity: 2, scheduleAt: "now" });
  });

  it("lowers only at cycle end, never refunding mid-period", () => {
    // Matches the downgrade policy everywhere else: you keep what you paid for
    // until the period runs out. Applying it now would hand back money for
    // days already used.
    expect(quantityChange(4, 2)).toEqual({ kind: "decrease", quantity: 2, scheduleAt: "cycle_end" });
  });

  it("treats a missing current quantity as an increase, not a crash", () => {
    // An org subscribed before this existed has no billedQuantity.
    for (const bad of [undefined, null, NaN, "", "two"]) {
      expect(quantityChange(bad as any, 2)).toEqual({ kind: "increase", quantity: 2, scheduleAt: "now" });
    }
  });

  it("refuses to target below 1", () => {
    expect(quantityChange(5, 0).kind).toBe("decrease");
    expect((quantityChange(5, 0) as any).quantity).toBe(1);
  });
});

describe("the quantity sync is not something a client can dictate", () => {
  const src = readFileSync(join(HERE, "./razorpay.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const body = src.slice(src.indexOf("export const syncSubscriptionQuantity"), src.indexOf("export async function cancelRazorpaySubscription"));

  it("counts projects on the server rather than trusting the caller", () => {
    // Taking a quantity from request.data would let anyone set their own bill.
    expect(body).toMatch(/\.count\(\)/);
    expect(body).not.toMatch(/request\.data\?\.quantity/);
  });

  it("only an Owner or Admin may move the bill", () => {
    expect(body).toMatch(/permission-denied/);
  });

  it("does not lower capacity until the decrease actually applies", () => {
    // includedProjects may only be raised on an immediate increase; a cycle-end
    // decrease must leave capacity alone or the customer loses a project they
    // have already paid for.
    expect(body).toMatch(/kind === "increase"\) patch\.includedProjects/);
  });

  it("makes no API call when nothing needs to move", () => {
    expect(body).toMatch(/kind === "none"\) return \{ changed: false/);
  });
});
