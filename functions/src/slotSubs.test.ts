import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assignProjectSlots, cancellableSlotSubs, recurringSlots, SLOT_GRACE_MS, slotSubAfterEvent, slotSummary } from "./slotSubs";
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
  // The webhook and confirmSubscription share one handler.
  const hook = src.slice(src.indexOf("async function applySubscriptionEvent"));

  it("routes a slot subscription's events to the slot bookkeeping, never to the plan's status", () => {
    // A slot subscription being cancelled must not mark the whole workspace
    // cancelled -- that would lock out a customer whose plan is paid up.
    expect(hook).toMatch(/kind === "slots"/);
    expect(hook.indexOf('kind === "slots"')).toBeLessThan(hook.indexOf("subscriptionPatch(name, entity)"));
  });

  it("ignores bad news about a subscription the workspace is not running on", () => {
    // Cancelling a duplicate must not cancel the workspace's real plan.
    expect(hook).toMatch(/org\.razorpaySubscriptionId !== subId/);
    expect(src.slice(src.indexOf("export const razorpayWebhook"))).toMatch(/applySubscriptionEvent\(name,/);
  });
});

describe("which project each subscription pays for", () => {
  const now = 1_800_000_000_000;
  const DAY = 86400000;
  const P = (id: string, n: number) => ({ id, created: `2026-01-0${n}` });
  const live = (extra: any = {}) => ({ qty: 1, until: now + 20 * DAY, status: "active", ...extra });
  const dead = (extra: any = {}) => ({ qty: 1, until: now - DAY, status: "cancelled", ...extra });

  it("leaves the plan's own projects alone and ties the next one to the subscription", () => {
    const r = assignProjectSlots({ includedProjects: 1, slotSubs: { s1: live() } }, [P("a", 1), P("b", 2)], now);
    expect(r.slotSubs.s1.projectIds).toEqual(["b"]);
    expect(r.locked).toEqual([]);
  });

  it("locks exactly the project whose subscription ended, not the others", () => {
    const org = { includedProjects: 1, slotSubs: { s1: dead({ projectIds: ["b"] }), s2: live({ projectIds: ["c"] }) } };
    const r = assignProjectSlots(org, [P("a", 1), P("b", 2), P("c", 3)], now);
    expect(r.locked).toEqual(["b"]);
    expect(r.slotSubs.s2.projectIds).toEqual(["c"]);
  });

  it("does not lock during the grace days of a failed payment", () => {
    const org = { includedProjects: 1, slotSubs: { s1: { qty: 1, until: now - DAY, status: "halted", projectIds: ["b"] } } };
    expect(assignProjectSlots(org, [P("a", 1), P("b", 2)], now).locked).toEqual([]);
  });

  it("releases a locked project into the plan when the plan has room again", () => {
    // The plan's own project was deleted: the plan has a free place.
    const org = { includedProjects: 1, slotSubs: { s1: dead({ projectIds: ["b"] }) } };
    const r = assignProjectSlots(org, [P("b", 2)], now);
    expect(r.locked).toEqual([]);
    expect(r.slotSubs.s1.projectIds).toEqual([]);
  });

  it("a re-subscribe for a locked project moves it to the new subscription", () => {
    const org = { includedProjects: 1, slotSubs: { s1: dead({ projectIds: ["b"] }), s2: live({ projectIds: ["b"] }) } };
    const r = assignProjectSlots(org, [P("a", 1), P("b", 2)], now);
    expect(r.locked).toEqual([]);
    expect(r.slotSubs.s2.projectIds).toEqual(["b"]);
    expect(r.slotSubs.s1.projectIds).toEqual([]);
  });

  it("frees a subscription when its project is deleted, for the next project", () => {
    const org = { includedProjects: 1, slotSubs: { s1: live({ projectIds: ["gone"] }) } };
    const r = assignProjectSlots(org, [P("a", 1), P("n", 5)], now);
    expect(r.slotSubs.s1.projectIds).toEqual(["n"]);
  });

  it("after a downgrade, keeps the oldest projects and locks the newest", () => {
    const r = assignProjectSlots({ includedProjects: 1, subscriptionStatus: "active" }, [P("c", 3), P("a", 1), P("b", 2)], now);
    expect(r.locked).toEqual(["b", "c"]);
  });

  it("a subscription the customer still holds keeps one of those open", () => {
    const org = { includedProjects: 1, subscriptionStatus: "active", slotSubs: { s1: live() } };
    const r = assignProjectSlots(org, [P("a", 1), P("b", 2), P("c", 3)], now);
    expect(r.slotSubs.s1.projectIds).toEqual(["b"]);
    expect(r.locked).toEqual(["c"]);
  });

  it("never locks in a workspace that is not on a billed plan", () => {
    const three = [P("a", 1), P("b", 2), P("c", 3)];
    expect(assignProjectSlots({ includedProjects: 1 }, three, now).locked).toEqual([]);
    expect(assignProjectSlots({ includedProjects: 1, subscriptionStatus: "internal" }, three, now).locked).toEqual([]);
    expect(assignProjectSlots({ includedProjects: 1, subscriptionStatus: "free" }, three, now).locked).toEqual([]);
  });

  it("after an upgrade, flags subscriptions the bigger plan has made unnecessary", () => {
    const org = { includedProjects: 20, subscriptionStatus: "active", slotSubs: { s1: live({ projectIds: ["b"] }), s2: { ...live(), status: "cancelling" } } };
    const r = assignProjectSlots(org, [P("a", 1), P("b", 2)], now);
    // b moves into the plan, which now has room; s1 pays for nothing.
    expect(r.slotSubs.s1.projectIds).toEqual([]);
    expect(r.unneeded).toEqual(["s1"]);
    expect(r.locked).toEqual([]);
  });

  it("does not flag a slot just bought on a full plan and not used yet", () => {
    const org = { includedProjects: 1, subscriptionStatus: "active", slotSubs: { s1: live() } };
    expect(assignProjectSlots(org, [P("a", 1)], now).unneeded).toEqual([]);
  });

  it("an uncapped plan locks nothing", () => {
    const org = { includedProjects: null, slotSubs: { s1: dead({ projectIds: ["b"] }) } };
    expect(assignProjectSlots(org, [P("a", 1), P("b", 2)], now).locked).toEqual([]);
  });

  it("a renewal keeps the project the subscription pays for", () => {
    const next = slotSubAfterEvent("subscription.charged", { quantity: 1, current_end: (now + 30 * DAY) / 1000 }, live({ projectIds: ["b"] }) as any, 1);
    expect(next?.projectIds).toEqual(["b"]);
  });
});
