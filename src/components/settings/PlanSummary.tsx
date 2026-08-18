import React from "react";
import { Stack } from "@phosphor-icons/react";
import { usePlan } from "../../hooks/usePlan";
import { useProjectsQuery } from "../../hooks/queries";
import { projectCapState, PLANS, PlanId } from "../../lib/plans";

// Compact "your plan + usage" summary for the org settings page: current plan,
// projects used vs included, and any per-project overage.
export const PlanSummary: React.FC = () => {
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  if (plan.loading) return null;

  const planName =
    plan.plan && PLANS[plan.plan as PlanId] ? PLANS[plan.plan as PlanId].name : plan.plan || "—";
  const cap = projectCapState(plan, projects.length);

  return (
    <div className="mb-6 p-5 rounded-2xl border border-divider bg-panel flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Stack weight="duotone" className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">Your plan</p>
          <p className="font-bold text-ink">{planName}</p>
        </div>
      </div>
      <div className="text-sm text-ink-muted">
        Projects:{" "}
        <b className="text-ink">
          {projects.length}
          {cap.capped && cap.included !== null ? ` / ${cap.included}` : ""}
        </b>
        {cap.overage > 0 && (
          <span className="text-[#B85F3B] font-semibold"> · {cap.overage} extra · ₹{cap.overageCost}/mo</span>
        )}
      </div>
    </div>
  );
};

export default PlanSummary;
