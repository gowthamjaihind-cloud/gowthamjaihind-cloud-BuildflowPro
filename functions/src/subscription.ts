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
  | { to: "expired"; reason: string }
  | { to: "canceled"; reason: string };

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
    // A customer who asked to leave gets what they asked for at the end of the
    // period they paid for -- no grace week, no dunning emails chasing money
    // they already said they did not want to spend. Asking someone to cancel
    // twice is the thing that makes people distrust a subscription.
    if (org?.cancelAtPeriodEnd === true) {
      return { to: "canceled", reason: "cancelled by the customer, effective at period end" };
    }
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

// ---- Project slots -----------------------------------------------------------
//
// Making slots expire was the right fix, but it lapses SILENTLY: a customer buys
// three extra projects, thirty days later the cap quietly drops, and the next
// time they add a project they are asked to pay again having been told nothing.
// Existing projects keep working -- that part matters and the mail says so --
// but an unannounced cap drop reads as a bait-and-switch. So the window gets a
// warning before it closes and a notice when it has.

/** Days before a slot window closes to warn. */
export const SLOT_NOTICE_DAYS = 3;

export type SlotNotice = "expiring" | "lapsed";

/**
 * Which slot notice is due, or null.
 *
 * A slot bought before expiry existed has no `slotsExpireAt` and is permanent
 * (it is already inside `includedProjects`), so it is never warned about --
 * telling someone their permanent slots are about to lapse would be a lie.
 *
 * The marker is scoped to the window it belongs to, so a customer who buys
 * again next month is warned again. "lapsed" still sends after "expiring",
 * because the two say different things.
 */
export function slotNoticeDue(org: any, now = Date.now()): SlotNotice | null {
  const qty = Math.floor(Number(org?.purchasedSlots) || 0);
  if (qty <= 0) return null;
  const expireAt = Number(org?.slotsExpireAt) || 0;
  if (expireAt <= 0) return null; // legacy, permanent — nothing to warn about

  const marker = org?.slotNoticeSent;
  const sentKind = Number(marker?.expireAt) === expireAt ? String(marker?.kind || "") : "";

  if (now >= expireAt) return sentKind === "lapsed" ? null : "lapsed";
  if (expireAt - now <= SLOT_NOTICE_DAYS * DAY_MS) return sentKind === "" ? "expiring" : null;
  return null;
}

/** The marker written after a slot notice goes out, scoped to that window. */
export function slotNoticeSentPatch(org: any, kind: SlotNotice) {
  return { slotNoticeSent: { kind, expireAt: Number(org?.slotsExpireAt) || 0, at: Date.now() } };
}

// ---- Operator view -----------------------------------------------------------

export interface LifecycleSummary {
  /** Raw status, or null when the org never had one (grandfathered). */
  status: string | null;
  /** One line an operator can read off the screen during a support call. */
  label: string;
  /** The date the label refers to, when there is one. */
  endsAt: number | null;
  /** Whole days until endsAt, negative once passed. */
  daysLeft: number | null;
  /** True when this org needs a human to look at it. */
  attention: boolean;
}

/**
 * Describe an org's billing state in one line.
 *
 * The operator panel used to render `usage.plan || usage.subscriptionStatus`,
 * which meant that for any org WITH a plan the subscription status never
 * appeared at all -- so the one question a support call actually asks ("why has
 * my workspace stopped?") was the one thing the panel could not answer. Now
 * past_due, the grace deadline and a stalled lifecycle are all visible.
 *
 * Lives here, pure and tested, rather than as formatting inside the panel,
 * because "is this org in trouble" is a rule, not a presentation detail.
 */
export function lifecycleSummary(org: any, now = Date.now()): LifecycleSummary {
  const status = typeof org?.subscriptionStatus === "string" ? org.subscriptionStatus : null;
  const days = (at: number) => Math.ceil((at - now) / DAY_MS);
  const periodEnd = Number(org?.currentPeriodEnd) || 0;

  if (!status) {
    // Never billed. Allowed everywhere by design, and nothing will ever expire
    // it -- worth flagging so it is a choice rather than an oversight.
    return { status: null, label: "No subscription — grandfathered, never gated", endsAt: null, daysLeft: null, attention: true };
  }
  if (status === "internal") {
    return { status, label: "Internal — never gated", endsAt: null, daysLeft: null, attention: false };
  }
  if (status === "free") {
    return { status, label: "Free tier — not gated, capacity-limited", endsAt: null, daysLeft: null, attention: false };
  }
  if (status === "trialing") {
    const ends = Number(org?.trialEndsAt) || 0;
    if (!ends) return { status, label: "Trial with no end date — cannot expire", endsAt: null, daysLeft: null, attention: true };
    const d = days(ends);
    return d > 0
      ? { status, label: `Trial — ${d} day${d === 1 ? "" : "s"} left`, endsAt: ends, daysLeft: d, attention: d <= 3 }
      : { status, label: "Trial expired — access blocked", endsAt: ends, daysLeft: d, attention: true };
  }
  if (status === "active") {
    if (!periodEnd) {
      return { status, label: "Active with no period — nothing will ever expire it", endsAt: null, daysLeft: null, attention: true };
    }
    const d = days(periodEnd);
    if (d > 0) {
      const label = org?.cancelAtPeriodEnd === true
        ? `Cancelling — ends in ${d} day${d === 1 ? "" : "s"}`
        : `Active — renews in ${d} day${d === 1 ? "" : "s"}`;
      // A pending cancellation is worth a human looking, while there is still
      // time to ask why.
      return { status, label, endsAt: periodEnd, daysLeft: d, attention: org?.cancelAtPeriodEnd === true };
    }
    // Between the period ending and the daily job running, an org sits here.
    return { status, label: "Period ended — will move to past due at the next run", endsAt: periodEnd, daysLeft: d, attention: true };
  }
  if (status === "past_due") {
    const graceEnds = Number(org?.graceEndsAt) || (periodEnd ? periodEnd + GRACE_MS : 0);
    if (!graceEnds) return { status, label: "Past due with no dates — access blocked", endsAt: null, daysLeft: null, attention: true };
    const d = days(graceEnds);
    return d > 0
      ? { status, label: `Past due — still working, grace ends in ${d} day${d === 1 ? "" : "s"}`, endsAt: graceEnds, daysLeft: d, attention: true }
      : { status, label: "Past due, grace over — will expire at the next run", endsAt: graceEnds, daysLeft: d, attention: true };
  }
  return { status, label: `${status === "expired" ? "Expired" : "Canceled"} — access blocked`, endsAt: null, daysLeft: null, attention: true };
}
