// Project-based plan catalog (server copy — keep in sync with src/lib/plans.ts).
// includedProjects / userLimit / aiQuota use null to mean "unlimited".
// monthly / annual are INR prices (null = free or custom).
export type PlanId = "free" | "starter" | "growth" | "business" | "enterprise";

export interface PlanDef {
  includedProjects: number | null;
  userLimit: number | null;
  aiQuota: number | null;
  monthly: number | null;
  annual: number | null;
}

// ₹ per extra active project / month beyond a paid plan's included cap.
export const OVERAGE_RATE = 99;

export const PLANS: Record<PlanId, PlanDef> = {
  free: { includedProjects: 1, userLimit: 2, aiQuota: 0, monthly: 0, annual: 0 },
  starter: { includedProjects: 5, userLimit: 10, aiQuota: 150, monthly: 999, annual: 9990 },
  growth: { includedProjects: 10, userLimit: 25, aiQuota: 400, monthly: 1799, annual: 17990 },
  business: { includedProjects: 20, userLimit: 60, aiQuota: 1000, monthly: 2999, annual: 29990 },
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
export function planPatch(plan: PlanId, months: number) {
  const def = PLANS[plan];
  const patch: any = {
    plan,
    includedProjects: def.includedProjects,
    userLimit: def.userLimit,
    aiQuota: def.aiQuota,
    overageRate: OVERAGE_RATE,
    // A plan change resets included capacity to the plan base, so any extra
    // project slots bought under the previous plan no longer apply.
    purchasedSlots: 0,
  };
  if (plan === "free") {
    patch.subscriptionStatus = "free";
  } else {
    patch.subscriptionStatus = "active";
    patch.currentPeriodEnd = Date.now() + months * MONTH_MS;
  }
  return patch;
}

// Amount in paise for a payable plan + billing period (null for free/custom).
export function planAmountPaise(plan: PlanId, period: "monthly" | "annual"): number | null {
  const rupees = period === "annual" ? PLANS[plan].annual : PLANS[plan].monthly;
  if (!rupees) return null;
  return Math.round(rupees * 100);
}
