import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nextLifecycleState,
  renewalNoticeDue,
  noticeSentPatch,
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
