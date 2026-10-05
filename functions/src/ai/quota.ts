/**
 * How much AI an org may use this month.
 *
 * Pure, and in its own module, because usage.ts imports `db` — which calls
 * getFirestore() at module load and throws in a node test environment before a
 * single test can be collected. seats.ts, subscription.ts and lib/orgAccess.ts
 * were split out for exactly the same reason; this rule decides whether a
 * paying customer can scan an invoice, so it belongs under test.
 */

/**
 * This month's AI allowance for an org.
 *
 * PER PROJECT, not per org. The catalog sells "30 scans per project" on Starter
 * and 100 on Business, and a flat per-org number cannot express that: a Starter
 * customer running ten projects at ₹99 each was getting the same 150 scans as
 * one running a single project. That number is a leftover from when Starter
 * meant five projects for ₹999.
 *
 * Resolution order, and the order matters:
 *  • aiScansPerProject a number  → that, times the project count. The floor is
 *    one project's worth, so an org that has not created a project yet is not
 *    sitting at zero before it starts.
 *  • aiScansPerProject null      → unlimited (Enterprise).
 *  • field absent                → fall back to the legacy per-org aiQuota, so
 *    an org placed on a plan before this change keeps exactly the cap it had.
 *    Nothing is retroactively reduced under a customer mid-month.
 *  • no aiQuota either           → the subscription lifecycle decides:
 *      - no status / "internal"  → grandfathered or operator → unlimited
 *      - "active"                → generous cap
 *      - "trialing"              → enough to evaluate, bounded so a trial
 *                                  cannot run up the Gemini bill
 *      - "free"                  → 0 (the retired Lite tier had no AI)
 *      - expired/past_due/…      → 0 (also blocked by the app paywall)
 */
export function aiQuotaFor(orgData: any, projectCount = 1): number | null {
  const perProject = orgData?.aiScansPerProject;
  if (perProject === null) return null; // explicit unlimited (Enterprise)
  if (typeof perProject === "number" && perProject > 0) {
    return perProject * Math.max(1, Math.floor(Number(projectCount) || 0));
  }

  const q = orgData?.aiQuota;
  if (q === null) return null;
  if (typeof q === "number") return q;

  const status = orgData?.subscriptionStatus;
  if (!status || status === "internal") return null;
  if (status === "active") return 2000;
  if (status === "trialing") return 100;
  return 0; // free | expired | past_due | canceled
}
