import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cancellableSlotSubs, recurringSlots, SLOT_GRACE_MS, slotSubAfterEvent, slotSummary } from "./slotSubs";
import { activeSlots, effectiveProjectCap } from "./plans";

const DAY = 86400000;
const now = 1_800_000_000_000;
const sec = (ms: number) => Math.round(ms / 1000);

describe("recurring slot subscriptions", () => {
  it("grant nothing for a mandate, and the slots once a charge lands", () => {
    expect(slotSubAfterEvent("subscription.authenticated", { quantity: 2 }, undefined, 2)).toBeNull();
    const s = slotSubAfterEvent("subscription.charged", { quantity: 2, current_end: sec(now + 30 * DAY) }, undefined, 2)!;
    expect(s).toEqual({ qty: 2, until: sec(now + 30 * DAY) * 1000, status: "active" });
    expect(recurringSlots({ slotSubs: { a: s } }, now)).toBe(2);
  });

  it("renew by moving `until` forward, never backward", () => {
    const first = { qty: 1, until: now + 30 * DAY, status: "active" as const };
    const renewed = slotSubAfterEvent("subscription.charged", { quantity: 1, current_end: sec(now + 60 * DAY) }, first, 1)!;
    expect(renewed.until).toBeGreaterThan(first.until);
    const stale = slotSubAfterEvent("subscription.charged", { quantity: 1, current_end: sec(now + 10 * DAY) }, renewed, 1)!;
    expect(stale.until).toBe(renewed.until);
  });

  it("change nothing while Razorpay is still retrying a failed charge", () => {
    const s = { qty: 1, until: now + DAY, status: "active" as const };
    expect(slotSubAfterEvent("subscription.pending", { quantity: 1 }, s, 1)).toBeNull();
  });

  it("keep a paid cycle after cancellation, then stop exactly at its end", () => {
    const s = slotSubAfterEvent("subscription.cancelled", { quantity: 1 }, { qty: 1, until: now + 5 * DAY, status: "active" }, 1)!;
    expect(s.status).toBe("cancelled");
    expect(recurringSlots({ slotSubs: { a: s } }, now)).toBe(1);
    expect(recurringSlots({ slotSubs: { a: s } }, now + 5 * DAY + 1)).toBe(0); // no grace: nothing is coming
  });

  it("give a missed renewal a short grace, not a free month", () => {
    const org = { slotSubs: { a: { qty: 3, until: now - DAY, status: "active" } } };
    expect(recurringSlots(org, now)).toBe(3);
    expect(recurringSlots(org, now - DAY + SLOT_GRACE_MS + 1)).toBe(0);
  });

  it("add each purchase separately, so an earlier mandate is untouched", () => {
    const org = { slotSubs: { a: { qty: 2, until: now + 20 * DAY, status: "active" }, b: { qty: 1, until: now + 3 * DAY, status: "cancelled" }, c: { qty: 5, until: now - 30 * DAY, status: "halted" } } };
    expect(recurringSlots(org, now)).toBe(3);
    const sum = slotSummary(org, now);
    expect(sum.recurringSlots).toBe(3);
    expect(sum.recurringSlotsUntil).toBe(now + 20 * DAY + SLOT_GRACE_MS); // the LATEST lapse
    expect(cancellableSlotSubs(org).sort()).toEqual(["a", "c"]);
  });

  it("count toward the project cap together with any one-off slots still running", () => {
    const org = { includedProjects: 1, purchasedSlots: 1, slotsExpireAt: now + DAY, slotSubs: { a: { qty: 2, until: now + DAY, status: "active" } } };
    expect(activeSlots(org, now)).toBe(3);
    expect(effectiveProjectCap(org, now)).toBe(4);
  });
});

describe("the webhook", () => {
  const src = readFileSync(join(__dirname, "razorpay.ts"), "utf8");
  const hook = src.slice(src.indexOf("export const razorpayWebhook"));

  it("routes a slot subscription's events to the slot bookkeeping, never to the plan's status", () => {
    // A slot subscription being cancelled must not mark the whole workspace
    // cancelled -- that would lock out a customer whose plan is paid up.
    expect(hook).toMatch(/kind === "slots"/);
    expect(hook.indexOf('kind === "slots"')).toBeLessThan(hook.indexOf("subscriptionPatch(name, entity)"));
  });
});
