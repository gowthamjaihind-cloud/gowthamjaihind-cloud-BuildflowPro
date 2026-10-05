// Project-based plan catalog (client — keep in sync with functions/src/plans.ts).
// Capacity fields use null to mean "unlimited". Prices in INR.
export type PlanId = "starter" | "business" | "enterprise";

export interface PlanDef {
  id: PlanId;
  name: string;
  tag: string;
  includedProjects: number | null;
  userLimit: number | null;
  aiQuota: number | null; // legacy per-ORG cap, kept for orgs placed before the per-project switch
  aiScansPerProject: number | null; // null = unlimited (Enterprise)
  monthly: number | null; // null = custom (Enterprise)
  annual: number | null; // total billed yearly
}

// ₹ per extra active project / month beyond a paid plan's included cap.
export const OVERAGE_RATE = 99;

// Three plans. Starter is PER-PROJECT pricing expressed as a base that includes
// one project: ₹99 + (n-1) × ₹99 is exactly ₹99 × n at every count, so the
// pricing is "₹99 per project per month" while the app keeps using the plan +
// extra-slots vocabulary (and its existing bilingual copy) to say so.
export const PLANS: Record<PlanId, PlanDef> = {
  starter: { id: "starter", name: "Starter", tag: "For solo & small contractors", includedProjects: 1, userLimit: 20, aiQuota: 150, aiScansPerProject: 30, monthly: 99, annual: 990 },
  business: { id: "business", name: "Business", tag: "For firms with an office", includedProjects: 20, userLimit: 40, aiQuota: 2000, aiScansPerProject: 100, monthly: 1499, annual: 14990 },
  enterprise: { id: "enterprise", name: "Enterprise", tag: "For multi-site firms", includedProjects: null, userLimit: null, aiQuota: null, aiScansPerProject: null, monthly: null, annual: null },
};

export const PLAN_ORDER: PlanId[] = ["starter", "business", "enterprise"];

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
  // "free" is no longer a plan, but legacy orgs still carry it as a plan or a
  // subscription status, and they must keep behaving as the free tier did.
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

/**
 * Is the customer on the wrong plan for the number of projects they run?
 *
 * Starter is deliberately uncapped -- ₹99 per project at any count -- so nothing
 * forces an upgrade. That is the right behaviour, and it leaves one hole: past
 * the crossover a Starter customer quietly pays MORE than Business would cost
 * them, and nothing says so. At 16 projects Starter is ₹1,584 against Business's
 * ₹1,499. Letting that run is charging someone for not reading a pricing table.
 *
 * The other direction is the soft cap. Business keeps working past 40 projects,
 * because blocking a paying customer mid-growth is never the answer, but at that
 * size the account is worth a conversation rather than a silent transaction --
 * and without a trigger Enterprise has no reason to exist.
 */

/** Projects past which a Business org should be talked to about Enterprise. */
export const BUSINESS_SOFT_CAP = 40;

export interface PlanAdvice {
  /** A self-serve plan that would cost less at this count, or null. */
  cheaper: PlanId | null;
  /** ₹/month on the current plan at this project count. */
  currentCost: number;
  /** ₹/month on the cheaper plan, or the current cost when there is none. */
  cheaperCost: number;
  /** ₹/month the customer is losing by staying put. Zero when nothing is cheaper. */
  savings: number;
  /** Past Business's soft cap — flag for the Enterprise conversation. */
  overSoftCap: boolean;
}

/** ₹/month a plan charges for `projects`, including per-project overage. */
export function monthlyCostOf(plan: PlanId, projects: number): number | null {
  const def = PLANS[plan];
  if (def.monthly === null || def.includedProjects === null) return null; // Enterprise
  const n = Math.max(0, Math.floor(projects));
  return def.monthly + Math.max(0, n - def.includedProjects) * OVERAGE_RATE;
}

export function planAdvice(plan: string | null | undefined, projects: number): PlanAdvice {
  const n = Math.max(0, Math.floor(Number(projects) || 0));
  const none: PlanAdvice = { cheaper: null, currentCost: 0, cheaperCost: 0, savings: 0, overSoftCap: false };
  if (!plan || !(plan in PLANS)) return none;
  const id = plan as PlanId;

  const current = monthlyCostOf(id, n);
  if (current === null) return none; // Enterprise: priced by hand, no advice to give

  const overSoftCap = id === "business" && n > BUSINESS_SOFT_CAP;

  let cheaper: PlanId | null = null;
  let cheaperCost = current;
  for (const other of Object.keys(PLANS) as PlanId[]) {
    if (other === id) continue;
    const cost = monthlyCostOf(other, n);
    if (cost === null) continue;
    if (cost < cheaperCost) {
      cheaper = other;
      cheaperCost = cost;
    }
  }
  return { cheaper, currentCost: current, cheaperCost, savings: cheaper ? current - cheaperCost : 0, overSoftCap };
}
