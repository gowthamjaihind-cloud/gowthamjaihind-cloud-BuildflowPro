import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lifecycleSummary,
  nextLifecycleState,
  renewalNoticeDue,
  noticeSentPatch,
  slotNoticeDue,
  slotNoticeSentPatch,
  SLOT_NOTICE_DAYS,
  GRACE_MS,
  NOTICE_DAYS,
  DAY_MS,
} from "./subscription";

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = 1_700_000_000_000;

describe("nextLifecycleState", () => {
  it("moves a lapsed paid period to past_due, with a grace deadline", () => {
    const end = NOW - DAY_MS;
    const move = nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: end }, NOW);
    expect(move).toEqual({ to: "past_due", graceEndsAt: end + GRACE_MS, reason: "paid period ended" });
  });

  it("leaves an active subscription alone while it is still paid up", () => {
    expect(nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: NOW + DAY_MS }, NOW)).toBeNull();
  });

  it("acts the moment the period ends, not a day later", () => {
    expect(nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: NOW }, NOW)).not.toBeNull();
    expect(nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: NOW + 1 }, NOW)).toBeNull();
  });

  it("expires past_due only once grace is up", () => {
    const org = { subscriptionStatus: "past_due", graceEndsAt: NOW + DAY_MS };
    expect(nextLifecycleState(org, NOW)).toBeNull();
    expect(nextLifecycleState(org, NOW + 2 * DAY_MS)).toEqual({ to: "expired", reason: "grace period ended" });
  });

  it("derives grace from the period end when graceEndsAt is missing", () => {
    // An org could reach past_due before graceEndsAt existed as a field. Without
    // this it would sit in past_due forever, never expiring and never charged.
    const org = { subscriptionStatus: "past_due", currentPeriodEnd: NOW - 2 * DAY_MS };
    expect(nextLifecycleState(org, NOW)).toBeNull(); // still inside the derived week
    expect(nextLifecycleState(org, NOW + GRACE_MS)).toEqual({ to: "expired", reason: "grace period ended" });
  });

  it("NEVER touches a grandfathered org", () => {
    // These predate billing. Expiring them would be a self-inflicted outage for
    // customers who never agreed to a subscription in the first place.
    expect(nextLifecycleState({}, NOW)).toBeNull();
    expect(nextLifecycleState({ currentPeriodEnd: NOW - 10 * DAY_MS }, NOW)).toBeNull();
    expect(nextLifecycleState(null, NOW)).toBeNull();
  });

  it("never touches the statuses that are not its business", () => {
    for (const subscriptionStatus of ["internal", "free", "trialing", "canceled", "expired"]) {
      expect(nextLifecycleState({ subscriptionStatus, currentPeriodEnd: NOW - 10 * DAY_MS }, NOW)).toBeNull();
    }
  });

  it("does nothing for an active org with no period recorded", () => {
    // setSubscription's `internal` action and some manual paths leave no
    // currentPeriodEnd. With nothing to compare against, do nothing.
    expect(nextLifecycleState({ subscriptionStatus: "active" }, NOW)).toBeNull();
    expect(nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: 0 }, NOW)).toBeNull();
  });

  it("does not expire a past_due org with no usable dates", () => {
    expect(nextLifecycleState({ subscriptionStatus: "past_due" }, NOW)).toBeNull();
  });

  it("survives junk timestamps rather than expiring on them", () => {
    for (const bad of ["soon", NaN, null, {}, -1]) {
      expect(nextLifecycleState({ subscriptionStatus: "active", currentPeriodEnd: bad }, NOW)).toBeNull();
    }
  });
});

describe("renewalNoticeDue", () => {
  const active = (daysToEnd: number, sent?: { days: number; periodEnd: number }) => ({
    subscriptionStatus: "active",
    currentPeriodEnd: NOW + daysToEnd * DAY_MS,
    ...(sent ? { renewalNoticeSent: sent } : {}),
  });

  it("warns at the 7-day mark and again at 1 day", () => {
    expect(renewalNoticeDue(active(7), NOW)).toBe(7);
    const afterSeven = { days: 7, periodEnd: NOW + 1 * DAY_MS }; // same period as active(1)
    expect(renewalNoticeDue(active(1, afterSeven), NOW)).toBe(1);
  });

  it("says nothing while the renewal is far off", () => {
    expect(renewalNoticeDue(active(20), NOW)).toBeNull();
    expect(renewalNoticeDue(active(8), NOW)).toBeNull();
  });

  it("does not repeat a notice it already sent for this period", () => {
    const end = NOW + 5 * DAY_MS;
    const org = { subscriptionStatus: "active", currentPeriodEnd: end, renewalNoticeSent: { days: 7, periodEnd: end } };
    expect(renewalNoticeDue(org, NOW)).toBeNull();
  });

  it("warns again after a renewal, because the marker is scoped to a period", () => {
    // Without the periodEnd stamp the new cycle inherits the old marker and the
    // customer is warned once, ever.
    const lastPeriod = NOW - 30 * DAY_MS;
    const org = {
      subscriptionStatus: "active",
      currentPeriodEnd: NOW + 6 * DAY_MS,
      renewalNoticeSent: { days: 1, periodEnd: lastPeriod },
    };
    expect(renewalNoticeDue(org, NOW)).toBe(7);
  });

  it("goes quiet once the period has already lapsed", () => {
    // Past the end it is the lifecycle transition's job to mail, not this.
    expect(renewalNoticeDue(active(-1), NOW)).toBeNull();
    expect(renewalNoticeDue(active(0), NOW)).toBeNull();
  });

  it("ignores anything that is not an active subscription", () => {
    for (const subscriptionStatus of ["trialing", "past_due", "free", "internal", "expired", "canceled"]) {
      expect(renewalNoticeDue({ subscriptionStatus, currentPeriodEnd: NOW + DAY_MS }, NOW)).toBeNull();
    }
  });

  it("sends the 1-day notice, not a stale 7-day one, when the job missed a week", () => {
    // A job that did not run for a week must not stay silent.
    expect(renewalNoticeDue(active(0.5), NOW)).toBe(1);
  });
});

describe("noticeSentPatch", () => {
  it("stamps the period it warned about", () => {
    const end = NOW + 3 * DAY_MS;
    const p = noticeSentPatch({ currentPeriodEnd: end }, 7);
    expect(p.renewalNoticeSent.days).toBe(7);
    expect(p.renewalNoticeSent.periodEnd).toBe(end);
  });
});

describe("constants", () => {
  it("gives a week of grace, warning twice before", () => {
    expect(GRACE_MS).toBe(7 * DAY_MS);
    expect([...NOTICE_DAYS]).toEqual([7, 1]);
  });

  it("agrees with the client's grace window", () => {
    // The server decides when an org becomes past_due and expired; the client
    // decides what past_due still permits. A drift means the app blocks a
    // customer the server thinks is fine, or lets one in the server has cut off.
    const client = readFileSync(join(HERE, "../../src/lib/orgAccess.ts"), "utf8");
    const m = client.match(/GRACE_MS\s*=\s*(\d+)\s*\*\s*DAY/);
    if (!m) throw new Error("client GRACE_MS not found in src/lib/orgAccess.ts");
    expect(Number(m[1]) * DAY_MS).toBe(GRACE_MS);
  });
});

describe("the job applies these rules", () => {
  const src = readFileSync(join(HERE, "./billing.ts"), "utf8");
  const job = src.slice(src.indexOf("export const runSubscriptionLifecycle"));

  it("exists and runs on a schedule", () => {
    expect(job).toMatch(/onSchedule\(/);
    expect(job).toMatch(/schedule:\s*"/);
  });

  it("only ever queries the two movable statuses", () => {
    // The query is the safety boundary: a grandfathered or internal org must
    // never be fetched by this job at all.
    expect(job).toMatch(/"subscriptionStatus",\s*"in",\s*\[\s*"active",\s*"past_due"\s*\]/);
  });

  it("decides with nextLifecycleState rather than inline date maths", () => {
    expect(job).toMatch(/nextLifecycleState\(/);
    expect(job).toMatch(/renewalNoticeDue\(/);
  });

  it("records a notice only when the send succeeded", () => {
    // Recording a failed send would swallow the only warning the customer gets.
    expect(job).toMatch(/if\s*\(sent\.sent\)/);
  });

  it("keeps going when one org throws", () => {
    expect(job).toMatch(/captureError\(/);
  });
});

describe("slotNoticeDue", () => {
  const DAY = DAY_MS;
  const withSlots = (qty: number, expireAt: number, marker?: any) => ({
    purchasedSlots: qty,
    slotsExpireAt: expireAt,
    ...(marker ? { slotNoticeSent: marker } : {}),
  });

  it("warns three days before the window closes", () => {
    expect(slotNoticeDue(withSlots(3, NOW + 3 * DAY), NOW)).toBe("expiring");
    expect(slotNoticeDue(withSlots(3, NOW + 2 * DAY), NOW)).toBe("expiring");
  });

  it("stays quiet while the window has plenty left", () => {
    expect(slotNoticeDue(withSlots(3, NOW + 10 * DAY), NOW)).toBeNull();
    expect(slotNoticeDue(withSlots(3, NOW + SLOT_NOTICE_DAYS * DAY + 1000), NOW)).toBeNull();
  });

  it("says lapsed once the window has closed", () => {
    expect(slotNoticeDue(withSlots(3, NOW - 1), NOW)).toBe("lapsed");
    expect(slotNoticeDue(withSlots(3, NOW), NOW)).toBe("lapsed");
  });

  it("sends lapsed even after expiring was already sent — they say different things", () => {
    const expiringSent = { kind: "expiring", expireAt: NOW - 1 };
    expect(slotNoticeDue(withSlots(3, NOW - 1, expiringSent), NOW)).toBe("lapsed");
  });

  it("does not repeat either notice for the same window", () => {
    const at = NOW + 2 * DAY;
    expect(slotNoticeDue(withSlots(3, at, { kind: "expiring", expireAt: at }), NOW)).toBeNull();
    expect(slotNoticeDue(withSlots(3, NOW - 1, { kind: "lapsed", expireAt: NOW - 1 }), NOW)).toBeNull();
  });

  it("warns again for a NEW window, because the marker is scoped to one", () => {
    // Buy again next month and the warning has to come again. Without the
    // expireAt stamp the old marker silences every future window.
    const newWindow = NOW + 2 * DAY;
    const oldMarker = { kind: "lapsed", expireAt: NOW - 30 * DAY };
    expect(slotNoticeDue(withSlots(3, newWindow, oldMarker), NOW)).toBe("expiring");
  });

  it("NEVER warns about legacy slots, which really are permanent", () => {
    // Pre-expiry purchases are already inside includedProjects and have no
    // slotsExpireAt. Telling someone those are about to lapse would be a lie.
    expect(slotNoticeDue({ purchasedSlots: 3 }, NOW)).toBeNull();
    expect(slotNoticeDue({ purchasedSlots: 3, slotsExpireAt: 0 }, NOW)).toBeNull();
  });

  it("says nothing when there are no slots", () => {
    expect(slotNoticeDue({ purchasedSlots: 0, slotsExpireAt: NOW + DAY }, NOW)).toBeNull();
    expect(slotNoticeDue({}, NOW)).toBeNull();
    expect(slotNoticeDue(null, NOW)).toBeNull();
  });

  it("survives junk", () => {
    for (const bad of [{ purchasedSlots: "x", slotsExpireAt: NOW + DAY }, { purchasedSlots: 3, slotsExpireAt: "soon" }]) {
      expect(slotNoticeDue(bad, NOW)).toBeNull();
    }
  });
});

describe("slotNoticeSentPatch", () => {
  it("stamps the window it warned about", () => {
    const p = slotNoticeSentPatch({ slotsExpireAt: 1234 }, "expiring");
    expect(p.slotNoticeSent).toMatchObject({ kind: "expiring", expireAt: 1234 });
  });
});

describe("the slot notice job", () => {
  const src = readFileSync(join(HERE, "./billing.ts"), "utf8");
  const job = src.slice(src.indexOf("export const runSlotNotices"));

  it("exists, on its own schedule", () => {
    expect(job).toMatch(/onSchedule\(/);
  });

  it("queries by slot count, NOT by subscription status", () => {
    // A trialing org can hold slots, and runSubscriptionLifecycle deliberately
    // never fetches those. Reusing that query would miss them silently.
    expect(job).toMatch(/"purchasedSlots",\s*">",\s*0/);
    expect(job).not.toMatch(/subscriptionStatus/);
  });

  it("decides with slotNoticeDue and records only a successful send", () => {
    expect(job).toMatch(/slotNoticeDue\(/);
    expect(job).toMatch(/if\s*\(sent\.sent\)/);
  });

  it("keeps going when one org throws", () => {
    expect(job).toMatch(/captureError\(/);
  });
});

describe("lifecycleSummary (the operator's one line)", () => {
  const DAY = DAY_MS;

  it("flags a grandfathered org, because nothing will ever expire it", () => {
    const s = lifecycleSummary({}, NOW);
    expect(s.status).toBeNull();
    expect(s.label).toMatch(/grandfathered/i);
    expect(s.attention).toBe(true);
  });

  it("is calm about internal and free orgs", () => {
    expect(lifecycleSummary({ subscriptionStatus: "internal" }, NOW).attention).toBe(false);
    expect(lifecycleSummary({ subscriptionStatus: "free" }, NOW).attention).toBe(false);
  });

  it("counts a trial down and gets anxious near the end", () => {
    const far = lifecycleSummary({ subscriptionStatus: "trialing", trialEndsAt: NOW + 10 * DAY }, NOW);
    expect(far.label).toMatch(/10 days left/);
    expect(far.attention).toBe(false);
    expect(lifecycleSummary({ subscriptionStatus: "trialing", trialEndsAt: NOW + 2 * DAY }, NOW).attention).toBe(true);
  });

  it("says a trial has expired", () => {
    const s = lifecycleSummary({ subscriptionStatus: "trialing", trialEndsAt: NOW - DAY }, NOW);
    expect(s.label).toMatch(/expired/i);
    expect(s.attention).toBe(true);
  });

  it("reports a healthy active subscription without alarm", () => {
    const s = lifecycleSummary({ subscriptionStatus: "active", currentPeriodEnd: NOW + 12 * DAY }, NOW);
    expect(s.label).toMatch(/renews in 12 days/);
    expect(s.attention).toBe(false);
    expect(s.daysLeft).toBe(12);
  });

  it("flags the gap between a period ending and the job running", () => {
    // An org sits here for up to a day. It is still allowed in, which is
    // deliberate, but an operator looking at it should know why.
    const s = lifecycleSummary({ subscriptionStatus: "active", currentPeriodEnd: NOW - 1 }, NOW);
    expect(s.label).toMatch(/past due at the next run/i);
    expect(s.attention).toBe(true);
  });

  it("flags an active org with no period, which can never expire", () => {
    const s = lifecycleSummary({ subscriptionStatus: "active" }, NOW);
    expect(s.label).toMatch(/nothing will ever expire it/i);
    expect(s.attention).toBe(true);
  });

  it("shows the grace deadline on a past_due org, and that it still works", () => {
    const s = lifecycleSummary({ subscriptionStatus: "past_due", graceEndsAt: NOW + 3 * DAY }, NOW);
    expect(s.label).toMatch(/still working/i);
    expect(s.label).toMatch(/grace ends in 3 days/);
    expect(s.attention).toBe(true);
  });

  it("derives the grace deadline from the period end when the field is absent", () => {
    const s = lifecycleSummary({ subscriptionStatus: "past_due", currentPeriodEnd: NOW - 2 * DAY }, NOW);
    expect(s.endsAt).toBe(NOW - 2 * DAY + GRACE_MS);
    expect(s.label).toMatch(/grace ends/);
  });

  it("says grace is over once it is", () => {
    expect(lifecycleSummary({ subscriptionStatus: "past_due", graceEndsAt: NOW - 1 }, NOW).label)
      .toMatch(/grace over/i);
  });

  it("blocks and flags expired and canceled", () => {
    for (const [status, word] of [["expired", /Expired/], ["canceled", /Canceled/]] as const) {
      const s = lifecycleSummary({ subscriptionStatus: status }, NOW);
      expect(s.label).toMatch(word);
      expect(s.attention).toBe(true);
    }
  });

  it("uses the singular for one day", () => {
    expect(lifecycleSummary({ subscriptionStatus: "active", currentPeriodEnd: NOW + 1 }, NOW).label)
      .toMatch(/1 day\b/);
  });

  it("never throws on junk", () => {
    for (const bad of [null, undefined, { subscriptionStatus: 7 }, { subscriptionStatus: "active", currentPeriodEnd: "x" }]) {
      expect(() => lifecycleSummary(bad, NOW)).not.toThrow();
    }
  });
});

describe("the operator view reports what is now enforced", () => {
  const usage = readFileSync(join(HERE, "./billing.ts"), "utf8");
  const block = usage.slice(usage.indexOf("export const getOrgUsage"));
  const panel = readFileSync(join(HERE, "../../src/components/settings/OperatorPanel.tsx"), "utf8");

  it("returns the lifecycle, seats and slot window", () => {
    // Each of these was enforced in code while being invisible to the operator,
    // which is how a support call becomes unanswerable.
    for (const field of ["lifecycle:", "seatsUsed:", "userLimit:", "activeSlots:", "slotsExpireAt:"]) {
      expect(block).toContain(field);
    }
  });

  it("reports whether the customer was actually warned", () => {
    expect(block).toContain("renewalNoticeSent:");
    expect(block).toContain("slotNoticeSent:");
  });

  it("reports the wrong-plan and soft-cap flags", () => {
    // Both are sales signals the operator cannot derive by eye from a project
    // count, so if they stop being returned the panel silently goes quiet.
    expect(block).toMatch(/advice:\s*planAdvice\(/);
    expect(block).toContain("businessSoftCap:");
  });

  it("composes the pure modules rather than re-deriving the rules", () => {
    expect(block).toMatch(/lifecycleSummary\(/);
    expect(block).toMatch(/seatState\(/);
    expect(block).toMatch(/activeSlots\(/);
  });

  it("the panel shows the lifecycle label, not just plan-or-status", () => {
    expect(panel).toMatch(/usage\.lifecycle\.label/);
    expect(panel).toMatch(/usage\.seatsUsed/);
    expect(panel).toMatch(/usage\.activeSlots/);
  });
});

describe("cancelling takes effect at the end of what was paid for", () => {
  const DAY = DAY_MS;

  it("does nothing while the period is still running", () => {
    const org = { subscriptionStatus: "active", currentPeriodEnd: NOW + 5 * DAY, cancelAtPeriodEnd: true };
    expect(nextLifecycleState(org, NOW)).toBeNull();
  });

  it("goes to canceled, not past_due, once the period ends", () => {
    // A customer who asked to leave must not then be chased through a grace
    // week of dunning email for money they already said they would not spend.
    const org = { subscriptionStatus: "active", currentPeriodEnd: NOW - 1, cancelAtPeriodEnd: true };
    expect(nextLifecycleState(org, NOW)).toMatchObject({ to: "canceled" });
  });

  it("still goes to past_due when no cancellation was asked for", () => {
    const org = { subscriptionStatus: "active", currentPeriodEnd: NOW - 1 };
    expect(nextLifecycleState(org, NOW)).toMatchObject({ to: "past_due" });
  });

  it("only honours an explicit true", () => {
    for (const flag of [false, "true", 1, null, undefined]) {
      const org = { subscriptionStatus: "active", currentPeriodEnd: NOW - 1, cancelAtPeriodEnd: flag };
      expect(nextLifecycleState(org, NOW), `flag ${String(flag)}`).toMatchObject({ to: "past_due" });
    }
  });

  it("tells the operator a cancellation is coming, and flags it", () => {
    const org = { subscriptionStatus: "active", currentPeriodEnd: NOW + 9 * DAY, cancelAtPeriodEnd: true };
    const s = lifecycleSummary(org, NOW);
    expect(s.label).toMatch(/Cancelling — ends in 9 days/);
    expect(s.attention, "worth a human asking why, while there is still time").toBe(true);
  });

  it("leaves a normal renewal unflagged", () => {
    const s = lifecycleSummary({ subscriptionStatus: "active", currentPeriodEnd: NOW + 9 * DAY }, NOW);
    expect(s.label).toMatch(/renews in 9 days/);
    expect(s.attention).toBe(false);
  });
});

describe("the cancel path exists and is reversible", () => {
  const src = readFileSync(join(HERE, "./planChange.ts"), "utf8");

  it("offers both cancelling and undoing it", () => {
    expect(src).toMatch(/export const cancelSubscription = onCall\(/);
    expect(src).toMatch(/export const resumeSubscription = onCall\(/);
  });

  it("sets a flag rather than cutting access off immediately", () => {
    const body = src.slice(src.indexOf("export const cancelSubscription"), src.indexOf("export const resumeSubscription"));
    expect(body).toMatch(/cancelAtPeriodEnd: true/);
    expect(body, "must not expire the org on the spot").not.toMatch(/subscriptionStatus:\s*"(canceled|expired)"/);
  });

  it("clears the flag once the job has acted on it", () => {
    // Otherwise a customer who comes back is cancelled again at the end of
    // their first new period.
    const billing = readFileSync(join(HERE, "./billing.ts"), "utf8");
    expect(billing).toMatch(/move\.to === "canceled"[\s\S]{0,120}cancelAtPeriodEnd/);
  });
});

describe("billing history", () => {
  const src = readFileSync(join(HERE, "./billing.ts"), "utf8");
  const body = src.slice(src.indexOf("export const getBillingHistory"));

  it("is scoped to the caller's org and to Owner/Admin", () => {
    expect(body).toMatch(/"orgId",\s*"==",\s*orgId/);
    expect(body).toMatch(/\["Owner", "Admin"\]/);
  });

  it("lists only payments that actually happened", () => {
    // An abandoned checkout is not a charge; showing one as if it were is worse
    // than showing nothing.
    expect(body).toMatch(/"status",\s*"==",\s*"paid"/);
  });

  it("reports rupees, not paise", () => {
    expect(body).toMatch(/\/ 100/);
  });
});
