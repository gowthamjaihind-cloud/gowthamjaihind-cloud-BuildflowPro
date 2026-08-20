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

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

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
