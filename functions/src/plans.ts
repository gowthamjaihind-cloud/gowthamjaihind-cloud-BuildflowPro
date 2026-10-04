// Project-based plan catalog (server copy — keep in sync with src/lib/plans.ts).
// includedProjects / userLimit / aiQuota use null to mean "unlimited".
// monthly / annual are INR prices (null = free or custom).
export type PlanId = "starter" | "business" | "enterprise";

export interface PlanDef {
  includedProjects: number | null;
  userLimit: number | null;
  aiQuota: number | null;
  monthly: number | null;
  annual: number | null;
}

// ₹ per extra active project / month beyond a paid plan's included cap.
export const OVERAGE_RATE = 99;

// Three plans — keep in sync with src/lib/plans.ts, which plans.test.ts checks
// field by field. Starter is per-project pricing written as a base including one
// project: ₹99 + (n-1) × ₹99 equals ₹99 × n at every count.
export const PLANS: Record<PlanId, PlanDef> = {
  starter: { includedProjects: 1, userLimit: 20, aiQuota: 150, monthly: 99, annual: 990 },
  business: { includedProjects: 20, userLimit: 40, aiQuota: 2000, monthly: 1499, annual: 14990 },
  enterprise: { includedProjects: null, userLimit: null, aiQuota: null, monthly: null, annual: null },
};

export const isPlanId = (x: any): x is PlanId =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(PLANS, x);

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extra project slots last 30 days, not forever.
 *
 * createSlotOrder prices a slot at OVERAGE_RATE and calls it an add-on "for the
 * current cycle", but the payment handler used to do
 * `includedProjects: increment(qty)` and nothing ever took it back -- so ₹99
 * bought a project permanently. Against a project that costs about ₹8/month to
 * run for a year and then ₹2/month to retain, one ₹99 payment is consumed by
 * the build alone and retention runs at a loss from handover onward.
 *
 * Slots therefore live in their own fields and are added to the plan's base cap
 * only while unexpired. `includedProjects` goes back to meaning the PLAN's cap
 * and is written by planPatch alone.
 *
 * Expiry is 30 days from purchase rather than the subscription's
 * currentPeriodEnd: buying two days before a cycle boundary would otherwise
 * charge a full month for two days. A full month's price buys a full month.
 */
export function slotPurchasePatch(org: any, qty: number, now = Date.now()) {
  // `Number(...) || 0` before the floor: Math.floor(NaN) is NaN and
  // Math.max(0, NaN) is NaN, so a junk quantity would write purchasedSlots: NaN
  // onto the org and every later comparison against it would silently be false.
  const add = Math.max(0, Math.floor(Number(qty) || 0));
  const existingUntil = Number(org?.slotsExpireAt) || 0;
  const withinSameWindow = existingUntil > now;
  // Buying again inside a live window tops the same window up. Otherwise this
  // starts a fresh one -- which is also what makes a legacy org safe: its old
  // slots are already baked into includedProjects and it has no slotsExpireAt,
  // so the count resets here instead of being counted a second time.
  const prior = withinSameWindow ? Math.max(0, Math.floor(Number(org?.purchasedSlots) || 0)) : 0;
  return {
    purchasedSlots: prior + add,
    slotsExpireAt: withinSameWindow ? existingUntil : now + MONTH_MS,
  };
}

/**
 * Slots that are still live. Zero once the window has passed.
 *
 * A slot bought before this scheme existed has no `slotsExpireAt` and is
 * already counted inside `includedProjects`, so it reads as zero here and stays
 * permanent. Nobody loses capacity they paid for.
 */
export function activeSlots(org: any, now = Date.now()): number {
  const qty = Math.floor(Number(org?.purchasedSlots) || 0);
  if (qty <= 0) return 0;
  const until = Number(org?.slotsExpireAt) || 0;
  return until > now ? qty : 0;
}

/**
 * The project cap actually in force: the plan's own cap plus any live slots.
 * null means unlimited (Enterprise); undefined means no cap was ever set.
 */
export function effectiveProjectCap(org: any, now = Date.now()): number | null | undefined {
  const base = org?.includedProjects;
  if (base === null) return null; // unlimited
  if (typeof base !== "number") return undefined; // never placed on a plan
  return base + activeSlots(org, now);
}

// The org-doc patch that puts an org on a plan. Shared by setOrgPlan (manual)
// and the Razorpay webhook (automatic) so both activate identically.
/**
 * Just the capacity a plan grants — no subscription lifecycle.
 *
 * Separated out because a DOWNGRADE must change what the org can do without
 * granting it a paid period. applyScheduledPlanChanges used to call
 * planPatch(target, 1), which set `active` and pushed currentPeriodEnd a month
 * out, so every downgrade handed the customer a free month nobody had paid for.
 */
export function planCapacityPatch(plan: PlanId) {
  const def = PLANS[plan];
  return {
    plan,
    includedProjects: def.includedProjects,
    userLimit: def.userLimit,
    aiQuota: def.aiQuota,
    overageRate: OVERAGE_RATE,
    // A plan change resets included capacity to the plan base, so any extra
    // project slots bought under the previous plan no longer apply.
    purchasedSlots: 0,
  };
}

export function planPatch(plan: PlanId, months: number) {
  const patch: any = planCapacityPatch(plan);
  const now = Date.now();
  patch.subscriptionStatus = "active";
  patch.currentPeriodEnd = now + months * MONTH_MS;
  // Both bounds and the amount paid are recorded so an upgrade part-way through
  // can be prorated against what this period actually cost. Inferring it later is
  // not possible: currentPeriodEnd alone cannot tell a monthly period from an
  // annual one, and guessing monthly on an annual plan would over-credit
  // twelvefold.
  patch.currentPeriodStart = now;
  patch.currentPeriodPaise = planAmountPaise(plan, months >= 12 ? "annual" : "monthly") ?? 0;
  return patch;
}

export interface Proration {
  /** The target plan's list price, in paise. */
  fullPaise: number;
  /** Credit for the unused part of the period already paid for. */
  creditPaise: number;
  /** What to actually charge. Never below ₹1, which Razorpay will not accept. */
  amountPaise: number;
  /** Whole days of credit, for showing the customer why the price differs. */
  creditDays: number;
}

/** Razorpay rejects an order below ₹1, so a fully-credited upgrade still charges this. */
export const MIN_ORDER_PAISE = 100;

/**
 * Price an upgrade against what the customer has already paid for.
 *
 * Without this, upgrading on day 20 of 30 charged the full new price and
 * silently discarded the ten days of the old plan already bought — and the UI
 * said only "Upgrades are charged now and apply immediately". At these prices an
 * Indian SMB customer does that arithmetic, and being charged twice for the same
 * ten days is the kind of thing that ends a subscription.
 *
 * Credit is only given when the period's own record says what it cost and when
 * it runs. An org with no `currentPeriodStart` — anything that predates this, or
 * was activated by hand through setSubscription — is charged list price, exactly
 * as before. Under-crediting is recoverable; over-crediting is money gone.
 */
export function prorateUpgrade(
  org: any,
  targetPlan: PlanId,
  period: "monthly" | "annual",
  now = Date.now(),
): Proration {
  const fullPaise = planAmountPaise(targetPlan, period) ?? 0;
  const none = { fullPaise, creditPaise: 0, amountPaise: fullPaise, creditDays: 0 };
  if (fullPaise <= 0) return none;

  // Only a live, paid-for period earns credit.
  if (org?.subscriptionStatus !== "active") return none;
  const start = Number(org?.currentPeriodStart) || 0;
  const end = Number(org?.currentPeriodEnd) || 0;
  const paid = Number(org?.currentPeriodPaise) || 0;
  if (start <= 0 || end <= start || paid <= 0) return none;
  if (now < start || now >= end) return none;

  const remaining = end - now;
  const total = end - start;
  const creditPaise = Math.min(
    Math.floor((remaining / total) * paid),
    Math.max(0, fullPaise - MIN_ORDER_PAISE), // always leave something to charge
  );
  return {
    fullPaise,
    creditPaise,
    amountPaise: Math.max(MIN_ORDER_PAISE, fullPaise - creditPaise),
    creditDays: Math.floor(remaining / MONTH_MS * 30),
  };
}

// Amount in paise for a payable plan + billing period (null for free/custom).
export function planAmountPaise(plan: PlanId, period: "monthly" | "annual"): number | null {
  const rupees = period === "annual" ? PLANS[plan].annual : PLANS[plan].monthly;
  if (!rupees) return null;
  return Math.round(rupees * 100);
}
