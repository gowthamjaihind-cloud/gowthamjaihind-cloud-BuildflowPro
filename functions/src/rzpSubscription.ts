/**
 * Razorpay Subscriptions, translated into this app's org state.
 *
 * Until now `createRazorpayOrder` placed a ONE-OFF order: /v1/orders, paid
 * once. Nothing ever charged a second time, so every customer had to remember
 * to pay again each month or lapse into grace and then expire. The enforcement
 * half of billing was complete and tested; the collection half did not exist.
 *
 * A subscription changes who owns the truth. Razorpay decides when a charge
 * happens and whether it succeeded, and tells us by webhook. These functions
 * are the whole translation layer, kept pure -- no `db`, no fetch -- so the
 * state machine can be tested without an initialised admin app, the same
 * reason seats.ts and subscription.ts are pure.
 *
 * Scope: the PLAN FEE only. Extra project slots stay one-off purchases, which
 * is why nothing here touches includedProjects or purchasedSlots.
 */

/** Statuses Razorpay reports on a subscription entity. */
export type RzpStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "completed"
  | "expired"
  | "paused";

/** The org fields a subscription event may set. Deliberately narrow. */
export interface SubscriptionPatch {
  subscriptionStatus?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  razorpaySubscriptionId?: string;
  /** Why this patch happened, for the audit trail and for support. */
  reason: string;
}

/** Razorpay sends unix SECONDS; everything in this codebase is milliseconds. */
export function toMillis(unixSeconds: unknown): number | null {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

/**
 * What an incoming subscription event means for the org.
 *
 * Returns null when the event carries no state change we act on -- an
 * unrecognised event, or one of the pre-payment states. Returning null rather
 * than a no-op patch matters: the caller writes nothing at all, so a stray
 * event cannot clear a field by writing undefined over it.
 */
export function subscriptionPatch(event: string, sub: any): SubscriptionPatch | null {
  const id = typeof sub?.id === "string" ? sub.id : undefined;
  const start = toMillis(sub?.current_start);
  const end = toMillis(sub?.current_end);

  // Both charged and activated mean "paid, and the period Razorpay reports is
  // the period they have". Taking the dates FROM RAZORPAY rather than adding a
  // month locally is the point: Razorpay's cycle is the one the customer is
  // actually billed on, and a local guess drifts a day every cycle on months
  // of different lengths, which eventually expires a paying customer.
  if (event === "subscription.charged" || event === "subscription.activated") {
    const patch: SubscriptionPatch = {
      subscriptionStatus: "active",
      reason: event === "subscription.charged" ? "subscription charged" : "subscription activated",
    };
    if (id) patch.razorpaySubscriptionId = id;
    if (start !== null) patch.currentPeriodStart = start;
    if (end !== null) patch.currentPeriodEnd = end;
    return patch;
  }

  // Every retry has failed. Razorpay stops trying; this is a real dunning
  // state, so hand it to the existing past_due path, which already grants the
  // grace week and sends the notices.
  if (event === "subscription.halted") {
    return { subscriptionStatus: "past_due", reason: "subscription halted — payment retries exhausted" };
  }

  // A charge failed but Razorpay is still retrying. Access must NOT change:
  // the customer has not lost anything yet, and flipping them to past_due here
  // would start a grace clock that a successful retry then has to undo.
  if (event === "subscription.pending") return null;

  if (event === "subscription.cancelled") {
    return { subscriptionStatus: "canceled", reason: "subscription cancelled at Razorpay" };
  }

  // total_count exhausted. We create subscriptions with a count far past any
  // realistic lifetime, so this is a long-lived account reaching the end of its
  // schedule rather than anything the customer did.
  if (event === "subscription.completed") {
    return { subscriptionStatus: "canceled", reason: "subscription schedule completed" };
  }

  if (event === "subscription.paused") {
    return { subscriptionStatus: "past_due", reason: "subscription paused" };
  }

  // created / authenticated: authorised but not yet charged. Granting access
  // here would hand over the product on a mandate that has not collected
  // anything, so they wait for subscription.charged.
  return null;
}

/**
 * A Razorpay plan is IMMUTABLE once created, so the cache key has to carry
 * everything that determines its amount. The tax rate is in here for exactly
 * that reason: when a GSTIN is set and the rate goes from 0 to 18, every plan
 * amount changes, and reusing the old plan id would keep charging the old,
 * tax-free amount forever with nothing to show it had gone wrong.
 */
export function planCacheKey(plan: string, period: "monthly" | "annual", taxRatePct: number): string {
  const rate = Number.isFinite(Number(taxRatePct)) && Number(taxRatePct) > 0 ? Number(taxRatePct) : 0;
  return `${plan}_${period}_gst${rate}`;
}

/** Razorpay calls them monthly and yearly; this catalog calls them monthly and annual. */
export function rzpPeriod(period: "monthly" | "annual"): "monthly" | "yearly" {
  return period === "annual" ? "yearly" : "monthly";
}

/**
 * How many cycles to schedule.
 *
 * Razorpay requires a finite total_count, so "forever" has to be expressed as a
 * number. These are far past any realistic account lifetime; reaching one means
 * subscription.completed, which the customer can simply resubscribe from.
 */
export function totalCycles(period: "monthly" | "annual"): number {
  return period === "annual" ? 10 : 120; // ten years either way
}
