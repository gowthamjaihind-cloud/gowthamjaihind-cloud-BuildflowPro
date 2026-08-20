import React, { useState } from "react";
import { Stack, Copy, Check, Plus } from "@phosphor-icons/react";
import { usePlan } from "../../hooks/usePlan";
import { useProjectsQuery } from "../../hooks/queries";
import { useAuthStore } from "../../store";
import { projectCapState, PLANS, PlanId } from "../../lib/plans";
import { AddCapacityModal } from "../AddCapacityModal";

// Compact "your plan + usage" summary for the org settings page: current plan,
// projects used vs included, any per-project overage, and the (copyable) org ID
// operators need for the Operator panel actions.
export const PlanSummary: React.FC = () => {
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const orgId = useAuthStore((s) => s.user?.currentOrgId);
  const role = useAuthStore((s) => s.user?.role);
  const [copied, setCopied] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);
  if (plan.loading) return null;

  const planName =
    plan.plan && PLANS[plan.plan as PlanId] ? PLANS[plan.plan as PlanId].name : plan.plan || "—";
  const cap = projectCapState(plan, projects.length);
  // "Add projects / upgrade" applies to paid, capped plans (not Free, not the
  // uncapped Enterprise/grandfathered orgs) and only for Owners/Admins.
  const canManageCapacity =
    (role === "Owner" || role === "Admin") && cap.capped && !cap.isFree;

  const copyId = async () => {
    if (!orgId) return;
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="mb-6 p-5 rounded-2xl border border-divider bg-panel">
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
        {canManageCapacity && (
          <button
            onClick={() => setShowCapacity(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 apple-transition"
          >
            <Plus weight="bold" className="w-3.5 h-3.5" /> Add projects / upgrade
          </button>
        )}
      </div>
      <AddCapacityModal isOpen={showCapacity} onClose={() => setShowCapacity(false)} />
      {orgId && (
        <div className="mt-3 pt-3 border-t border-divider/60 flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">
            Org ID: <span className="font-mono text-ink">{orgId}</span>
          </span>
          <button
            onClick={copyId}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-primary apple-transition"
            title="Copy organization ID"
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-success" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;
