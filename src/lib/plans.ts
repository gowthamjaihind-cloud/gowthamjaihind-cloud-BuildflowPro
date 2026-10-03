// Project-based plan catalog (client — keep in sync with functions/src/plans.ts).
// Capacity fields use null to mean "unlimited". Prices in INR.
export type PlanId = "free" | "starter" | "growth" | "business" | "enterprise";

export interface PlanDef {
  id: PlanId;
  name: string;
  tag: string;
  includedProjects: number | null;
  userLimit: number | null;
  aiQuota: number | null;
  monthly: number | null; // null = custom (Enterprise)
  annual: number | null; // total billed yearly
}

// ₹ per extra active project / month beyond a paid plan's included cap.
export const OVERAGE_RATE = 99;

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", name: "Free", tag: "For solo & small contractors", includedProjects: 1, userLimit: 2, aiQuota: 0, monthly: 0, annual: 0 },
  starter: { id: "starter", name: "Starter", tag: "For small contractors", includedProjects: 5, userLimit: 10, aiQuota: 150, monthly: 999, annual: 9990 },
  growth: { id: "growth", name: "Growth", tag: "For growing firms", includedProjects: 10, userLimit: 25, aiQuota: 400, monthly: 1799, annual: 17990 },
  business: { id: "business", name: "Business", tag: "For established firms", includedProjects: 20, userLimit: 60, aiQuota: 1000, monthly: 2999, annual: 29990 },
  enterprise: { id: "enterprise", name: "Enterprise", tag: "For multi-site firms", includedProjects: null, userLimit: null, aiQuota: null, monthly: null, annual: null },
};

export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "business", "enterprise"];

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Extra project slots last 30 days (see functions/src/plans.ts — server copy).
 *
 * A slot bought before this scheme existed has no `slotsExpireAt` and is
 * already inside `includedProjects`, so it reads as zero here and stays
 * permanent rather than vanishing from under a paying customer.
 */
export function activeSlots(org: any, now = Date.now()): number {
  const qty = Math.floor(Number(org?.purchasedSlots) || 0);
  if (qty <= 0) return 0;
  const until = Number(org?.slotsExpireAt) || 0;
  return until > now ? qty : 0;
}

// Effective included-project cap for an org doc: the plan's own cap plus any
// slots still inside their 30-day window. Absent field = no cap
// (grandfathered / trialing / internal). null = unlimited (Enterprise).
export function includedProjectsOf(org: any, now = Date.now()): number | null | undefined {
  const base = org?.includedProjects;
  if (base === null) return null;
  if (typeof base !== "number") return undefined;
  return base + activeSlots(org, now);
}

// Given a current active-project count and an org's plan, describe cap state.
// `included` is the EFFECTIVE cap, so slots inside their window count and
// lapsed ones do not -- reading org.includedProjects raw here is what made a
// one-off ₹99 buy a project for good.
export function projectCapState(org: any, currentCount: number, now = Date.now()) {
  const included = includedProjectsOf(org, now);
  const rate = Number(org?.overageRate) || OVERAGE_RATE;
  const isFree = org?.plan === "free" || org?.subscriptionStatus === "free";
  if (included === null || included === undefined) {
    return { capped: false, included: null as number | null, overage: 0, overageCost: 0, isFree, atOrOver: false };
  }
  const overage = Math.max(0, currentCount - included);
  return {
    capped: true,
    included,
    overage,
    overageCost: overage * rate,
    isFree,
    atOrOver: currentCount >= included,
  };
}
