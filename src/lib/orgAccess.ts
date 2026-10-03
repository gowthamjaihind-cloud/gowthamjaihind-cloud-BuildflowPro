/**
 * Who may use the app right now — the gate on everything.
 *
 * Pure, and in `lib/` rather than beside the hook, because `useOrgAccess.ts`
 * imports the zustand store, which reads `localStorage` at module load. In a
 * node test environment that throws before a single test is collected, which is
 * why this rule had no coverage at all despite gating the whole product.
 * `seats.ts` and `bot/channel.ts` were split out for the same reason.
 *
 * This is the half of the subscription lifecycle a customer feels. The server
 * (functions/src/subscription.ts) decides WHEN an org becomes past_due and then
 * expired; this decides what each of those states still permits.
 */
import type { SubscriptionStatus } from "../types";

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long a lapsed subscription keeps working.
 *
 * Must match GRACE_MS in functions/src/subscription.ts — a drift means the app
 * blocks a customer the server considers fine, or admits one it has cut off.
 * functions/src/subscription.test.ts asserts the two agree.
 */
export const GRACE_MS = 7 * DAY;

export interface OrgAccessState {
  allowed: boolean;              // may the org use the app right now?
  status?: SubscriptionStatus;   // undefined = grandfathered
  isTrial: boolean;
  daysLeft: number;              // days remaining in trial (0 if not trialing)
  reason?: "trial_expired" | "past_due" | "canceled" | "expired";
  companyName?: string;
  /** True while a lapsed subscription is inside its grace week — still usable. */
  inGrace: boolean;
  /** Days of grace left, for the "renew by X" notice. 0 when not in grace. */
  graceDaysLeft: number;
}

/**
 * Orgs with no `subscriptionStatus` are grandfathered and always allowed, so
 * the operator org and anything predating billing is never locked out.
 */
export function computeOrgAccess(data: any, now = Date.now()): OrgAccessState {
  const status: SubscriptionStatus | undefined = data?.subscriptionStatus;
  const companyName = data?.companyName;
  const base = { isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0, companyName };

  // Grandfathered, paid, operator, and permanent-free orgs all have access —
  // the free tier is never paywalled, just capacity-limited.
  //
  // `active` is allowed even once currentPeriodEnd has passed. That is
  // deliberate: moving an org out of `active` is the daily lifecycle job's
  // decision, and it sends a notice as it does so. Blocking on the timestamp
  // here as well would cut a customer off hours before any email reached them.
  if (!status || status === "active" || status === "internal" || status === "free") {
    return { ...base, allowed: true, status };
  }

  if (status === "trialing") {
    const ends = Number(data?.trialEndsAt) || 0;
    if (now < ends) {
      return { ...base, allowed: true, status, isTrial: true, daysLeft: Math.ceil((ends - now) / DAY) };
    }
    return { ...base, allowed: false, status, isTrial: true, reason: "trial_expired" };
  }

  // past_due means the paid period lapsed. Access CONTINUES through a grace
  // week: cutting a contractor off from today's site logs the moment a card
  // expires loses the customer outright, and most lapses are a failed renewal
  // rather than a decision to leave. Only once grace is up is it a hard stop.
  if (status === "past_due") {
    const graceEnds = Number(data?.graceEndsAt) || (Number(data?.currentPeriodEnd) || 0) + GRACE_MS;
    // `> GRACE_MS` means a real date was found: with neither field present the
    // fallback is exactly GRACE_MS, and that must fail closed rather than
    // granting a week of access from the epoch.
    if (graceEnds > GRACE_MS && now < graceEnds) {
      return { ...base, allowed: true, status, inGrace: true, graceDaysLeft: Math.ceil((graceEnds - now) / DAY) };
    }
    return { ...base, allowed: false, status, reason: "past_due" };
  }

  // canceled | expired
  return { ...base, allowed: false, status, reason: status as any };
}
