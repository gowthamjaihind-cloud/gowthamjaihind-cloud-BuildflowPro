/**
 * The subscription lifecycle — what makes a paid period actually end.
 *
 * Until this existed, nothing did. `currentPeriodEnd` was written by planPatch
 * and setSubscription, displayed in ManagePlanModal as "until 3 Nov", and read
 * by exactly one thing: scheduleDowngrade, to decide when a downgrade lands.
 * No job compared it to the clock, and computeOrgAccess gates on
 * `subscriptionStatus` alone -- so `active` meant access forever. A customer
 * paid ₹999 once and kept the workspace indefinitely. The only status that ever
 * blocked anyone was `trialing`, and only because trial expiry is a timestamp
 * comparison that needs no job at all.
 *
 * The shape here is deliberately forgiving, because the alternative is worse
 * than not charging: a contractor locked out of today's site logs because a
 * card expired will not come back. So a lapsed period moves to `past_due` and
 * access CONTINUES for a grace week, with notices before and during. Only after
 * grace does it become `expired`.
 *
 *   active ──(period ends)──> past_due ──(grace ends)──> expired
 *                                 └──(payment lands)──> active
 *
 * Pure: no `db` import, so the rules are testable without an initialised admin
 * app. `seats.ts` and `plans.ts` are pure for the same reason.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How long access continues after a paid period lapses. */
export const GRACE_MS = 7 * DAY_MS;

/**
 * Days before the period ends on which to warn, largest first.
 *
 * Two notices, not five. This is a tool a site engineer opens every morning;
 * billing mail that arrives weekly trains people to ignore billing mail.
 */
export const NOTICE_DAYS = [7, 1] as const;

/** Statuses the lifecycle job is allowed to move. Everything else it leaves. */
const MOVABLE = new Set(["active", "past_due"]);

export type Transition =
  | { to: "past_due"; graceEndsAt: number; reason: string }
  | { to: "expired"; reason: string };

/**
 * What should happen to this org right now, or null for "nothing".
 *
 * Returning null is the safe answer and the common one. An org is only ever
 * moved when its own recorded timestamps say the time has passed:
 *
 *  - no status           grandfathered. Never touched -- these predate billing
 *                        and locking them out would be a self-inflicted outage.
 *  - internal / free     never gated by design.
 *  - trialing            handled by computeOrgAccess off trialEndsAt.
 *  - canceled / expired  already terminal.
 *  - active, no period    nothing to compare against, so nothing to do. This is
 *                        what setSubscription's `internal` action leaves behind.
 */
export function nextLifecycleState(org: any, now = Date.now()): Transition | null {
  const status = org?.subscriptionStatus;
  if (typeof status !== "string" || !MOVABLE.has(status)) return null;

  if (status === "active") {
    const end = Number(org?.currentPeriodEnd) || 0;
    // `end <= 0` rather than `!end`: a negative timestamp is junk, and reading
    // it as "a date long past" would expire the org on corrupt data.
    if (end <= 0 || now < end) return null;
    return { to: "past_due", graceEndsAt: end + GRACE_MS, reason: "paid period ended" };
  }

  // past_due: expire once grace is up. Derive the deadline from the period end
  // when graceEndsAt is missing, so an org that reached past_due before this
  // field existed still resolves instead of sitting in limbo forever.
  const graceEnds = Number(org?.graceEndsAt) || (Number(org?.currentPeriodEnd) || 0) + GRACE_MS;
  if (!Number.isFinite(graceEnds) || graceEnds <= GRACE_MS) return null; // no usable dates
  if (now < graceEnds) return null;
  return { to: "expired", reason: "grace period ended" };
}

/**
 * Which renewal notice is due, or null.
 *
 * `renewalNoticeSent` records the threshold last sent for the CURRENT period,
 * alongside the period it belongs to -- without the period stamp, a renewal
 * would inherit the previous cycle's marker and the customer would be warned
 * once and then never again.
 */
export function renewalNoticeDue(org: any, now = Date.now()): number | null {
  if (org?.subscriptionStatus !== "active") return null;
  const end = Number(org?.currentPeriodEnd) || 0;
  if (!end || now >= end) return null;

  const sentFor = Number(org?.renewalNoticeSent?.periodEnd) || 0;
  const alreadySent = sentFor === end ? Number(org?.renewalNoticeSent?.days) || 0 : 0;

  const daysLeft = (end - now) / DAY_MS;
  // Scan TIGHTEST first. Going loosest-first would mail "renews in 7 days" to
  // someone twelve hours from expiry, because 0.5 is also <= 7 -- the notice has
  // to describe the time that is actually left. A job that missed the 7-day
  // window therefore sends the 1-day notice, not a stale 7-day one.
  for (const threshold of [...NOTICE_DAYS].sort((a, b) => a - b)) {
    // Due when inside the window, and not already covered by an equal or
    // tighter notice for this same period.
    if (daysLeft <= threshold && (alreadySent === 0 || threshold < alreadySent)) {
      return threshold;
    }
  }
  return null;
}

/** The marker written after a notice goes out, scoped to the period it warned about. */
export function noticeSentPatch(org: any, days: number) {
  return { renewalNoticeSent: { days, periodEnd: Number(org?.currentPeriodEnd) || 0, at: Date.now() } };
}
