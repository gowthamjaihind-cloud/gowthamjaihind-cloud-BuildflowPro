import { describe, it, expect } from "vitest";
import { computeOrgAccess, GRACE_MS } from "./orgAccess";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * This is the gate on the whole app, and it had no tests. It is also the half of
 * the subscription lifecycle the customer feels: the server decides when an org
 * becomes past_due, this decides what past_due still lets them do.
 */

describe("computeOrgAccess — who gets in", () => {
  it("lets a grandfathered org in, since it never agreed to a subscription", () => {
    expect(computeOrgAccess({}, NOW).allowed).toBe(true);
    expect(computeOrgAccess({ subscriptionStatus: undefined }, NOW).allowed).toBe(true);
  });

  it("lets active, internal and free orgs in", () => {
    for (const subscriptionStatus of ["active", "internal", "free"]) {
      expect(computeOrgAccess({ subscriptionStatus }, NOW).allowed).toBe(true);
    }
  });

  it("does NOT lock out an active org whose period has lapsed", () => {
    // Deliberate: moving it out of `active` is the lifecycle job's call, made
    // once a day with a notice attached. If this blocked on the timestamp too,
    // a customer would lose access hours before any email reached them.
    const org = { subscriptionStatus: "active", currentPeriodEnd: NOW - 5 * DAY };
    expect(computeOrgAccess(org, NOW).allowed).toBe(true);
  });

  it("blocks canceled and expired", () => {
    for (const subscriptionStatus of ["canceled", "expired"]) {
      const got = computeOrgAccess({ subscriptionStatus }, NOW);
      expect(got.allowed).toBe(false);
      expect(got.reason).toBe(subscriptionStatus);
    }
  });
});

describe("computeOrgAccess — trials", () => {
  it("allows a trial that has time left and counts the days", () => {
    const got = computeOrgAccess({ subscriptionStatus: "trialing", trialEndsAt: NOW + 3 * DAY }, NOW);
    expect(got).toMatchObject({ allowed: true, isTrial: true, daysLeft: 3 });
  });

  it("blocks a trial that has run out", () => {
    const got = computeOrgAccess({ subscriptionStatus: "trialing", trialEndsAt: NOW - 1 }, NOW);
    expect(got).toMatchObject({ allowed: false, isTrial: true, reason: "trial_expired" });
  });

  it("blocks a trial with no end date rather than granting an endless one", () => {
    expect(computeOrgAccess({ subscriptionStatus: "trialing" }, NOW).allowed).toBe(false);
  });
});

describe("computeOrgAccess — the grace week", () => {
  const pastDue = (graceEndsAt: number) => ({ subscriptionStatus: "past_due", graceEndsAt });

  it("keeps a lapsed org working through grace", () => {
    // The point of the whole design: a contractor whose card expired can still
    // log today's work from site. Locking them out loses the customer outright.
    const got = computeOrgAccess(pastDue(NOW + 3 * DAY), NOW);
    expect(got.allowed).toBe(true);
    expect(got.inGrace).toBe(true);
    expect(got.graceDaysLeft).toBe(3);
  });

  it("blocks once grace has run out", () => {
    const got = computeOrgAccess(pastDue(NOW - 1), NOW);
    expect(got.allowed).toBe(false);
    expect(got.inGrace).toBe(false);
    expect(got.reason).toBe("past_due");
  });

  it("closes exactly at the deadline", () => {
    expect(computeOrgAccess(pastDue(NOW + 1), NOW).allowed).toBe(true);
    expect(computeOrgAccess(pastDue(NOW), NOW).allowed).toBe(false);
  });

  it("derives the deadline from the period end when graceEndsAt is missing", () => {
    // An org that reached past_due before graceEndsAt existed still gets its
    // week, rather than being blocked the moment this ships.
    const org = { subscriptionStatus: "past_due", currentPeriodEnd: NOW - 2 * DAY };
    expect(computeOrgAccess(org, NOW).allowed).toBe(true);
    expect(computeOrgAccess(org, NOW + GRACE_MS).allowed).toBe(false);
  });

  it("blocks a past_due org with no dates at all", () => {
    // Nothing to grant grace against. This one has to fail closed, or
    // past_due would mean "allowed forever" whenever the dates went missing.
    expect(computeOrgAccess({ subscriptionStatus: "past_due" }, NOW).allowed).toBe(false);
  });

  it("reports no grace for everyone else", () => {
    for (const subscriptionStatus of ["active", "free", "internal", "expired", "trialing"]) {
      const got = computeOrgAccess({ subscriptionStatus }, NOW);
      expect(got.inGrace).toBe(false);
      expect(got.graceDaysLeft).toBe(0);
    }
  });
});

describe("computeOrgAccess — shape", () => {
  it("always returns every field, so callers never read undefined", () => {
    for (const data of [{}, null, { subscriptionStatus: "past_due" }, { subscriptionStatus: "expired" }]) {
      const got = computeOrgAccess(data, NOW);
      expect(got).toHaveProperty("allowed");
      expect(got).toHaveProperty("isTrial");
      expect(got).toHaveProperty("daysLeft");
      expect(got).toHaveProperty("inGrace");
      expect(got).toHaveProperty("graceDaysLeft");
    }
  });

  it("passes the company name through for the paywall heading", () => {
    expect(computeOrgAccess({ subscriptionStatus: "expired", companyName: "Acme Builders" }, NOW).companyName)
      .toBe("Acme Builders");
  });
});
