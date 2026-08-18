// Project-based plan catalog (server copy — keep in sync with src/lib/plans.ts).
// includedProjects / userLimit / aiQuota use null to mean "unlimited".
export type PlanId = "free" | "starter" | "growth" | "business" | "enterprise";

export interface PlanDef {
  includedProjects: number | null;
  userLimit: number | null;
  aiQuota: number | null;
}

// ₹ per extra active project / month beyond a paid plan's included cap.
export const OVERAGE_RATE = 99;

export const PLANS: Record<PlanId, PlanDef> = {
  free: { includedProjects: 1, userLimit: 2, aiQuota: 0 },
  starter: { includedProjects: 5, userLimit: 10, aiQuota: 150 },
  growth: { includedProjects: 10, userLimit: 25, aiQuota: 400 },
  business: { includedProjects: 20, userLimit: 60, aiQuota: 1000 },
  enterprise: { includedProjects: null, userLimit: null, aiQuota: null },
};

export const isPlanId = (x: any): x is PlanId =>
  typeof x === "string" && Object.prototype.hasOwnProperty.call(PLANS, x);
