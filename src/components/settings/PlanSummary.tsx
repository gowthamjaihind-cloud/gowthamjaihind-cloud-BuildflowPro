import React, { useState } from "react";
import { Stack, Copy, Check, Plus, SlidersHorizontal, CalendarCheck } from "@phosphor-icons/react";
import { usePlan } from "../../hooks/usePlan";
import { useProjectsQuery } from "../../hooks/queries";
import { useAuthStore } from "../../store";
import { projectCapState, PLANS, PlanId } from "../../lib/plans";
import { AddCapacityModal } from "../AddCapacityModal";
import { ManagePlanModal } from "../ManagePlanModal";
import { useL } from "../../i18n";

// Plans an Owner/Admin can self-serve manage (upgrade/downgrade).
const SELF_SERVE_PLANS = ["free", "starter", "growth", "business"];

// Compact "your plan + usage" summary for the org settings page: current plan,
// projects used vs included, any per-project overage, and the (copyable) org ID
// operators need for the Operator panel actions.
export const PlanSummary: React.FC = () => {
  const L = useL();
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const orgId = useAuthStore((s) => s.user?.currentOrgId);
  const role = useAuthStore((s) => s.user?.role);
  const [copied, setCopied] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);
  const [showManage, setShowManage] = useState(false);
  if (plan.loading) return null;

  const planName =
    plan.plan && PLANS[plan.plan as PlanId] ? PLANS[plan.plan as PlanId].name : plan.plan || "—";
  const cap = projectCapState(plan, projects.length);
  const isOwnerAdmin = role === "Owner" || role === "Admin";
  // "Add projects" applies to paid, capped plans (not Free, not the uncapped
  // Enterprise/grandfathered orgs) and only for Owners/Admins.
  const canManageCapacity = isOwnerAdmin && cap.capped && !cap.isFree;
  // "Manage plan" (upgrade/downgrade) applies to any self-serve tier — including
  // Free (upgrade only) — but not internal/enterprise/grandfathered orgs.
  const canManagePlan = isOwnerAdmin && SELF_SERVE_PLANS.includes(plan.plan as string);
  const pending = plan.pendingPlanChange || null;
  const pendingName =
    pending && PLANS[pending.plan as PlanId] ? PLANS[pending.plan as PlanId].name : pending?.plan;
  const fmtDate = (ms?: number) =>
    ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

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
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{L("Your plan","உங்கள் திட்டம்")}</p>
            <p className="font-bold text-ink">{planName}</p>
          </div>
        </div>
        <div className="text-sm text-ink-muted">
          {L("Projects","செயல்திட்டங்கள்")}:{" "}
          <b className="text-ink">
            {projects.length}
            {cap.capped && cap.included !== null ? ` / ${cap.included}` : ""}
          </b>
          {cap.overage > 0 && (
            <span className="text-[#B85F3B] font-semibold"> · {L(`${cap.overage} extra · ₹${cap.overageCost}/mo`, `${cap.overage} கூடுதல் · ₹${cap.overageCost}/மாதம்`)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageCapacity && (
            <button
              onClick={() => setShowCapacity(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 apple-transition"
            >
              <Plus weight="bold" className="w-3.5 h-3.5" /> {L("Add projects","செயல்திட்டங்கள் சேர்")}
            </button>
          )}
          {canManagePlan && (
            <button
              onClick={() => setShowManage(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-surface-dark text-white hover:opacity-90 apple-transition"
            >
              <SlidersHorizontal weight="bold" className="w-3.5 h-3.5" /> {L("Manage plan","திட்டத்தை நிர்வகி")}
            </button>
          )}
        </div>
      </div>

      {pending && (
        <div className="mt-3 p-3 rounded-xl border border-primary/25 bg-primary/5 flex items-center gap-2 text-xs text-ink">
          <CalendarCheck weight="duotone" className="w-4 h-4 text-primary shrink-0" />
          <span>
            {L("Scheduled: switches to","திட்டமிடப்பட்டது: மாறும்")} <b>{pendingName}</b> {L("on","அன்று")} <b>{fmtDate(pending.effectiveAt)}</b>
          </span>
        </div>
      )}

      <AddCapacityModal isOpen={showCapacity} onClose={() => setShowCapacity(false)} />
      <ManagePlanModal isOpen={showManage} onClose={() => setShowManage(false)} />
      {orgId && (
        <div className="mt-3 pt-3 border-t border-divider/60 flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">
            {L("Org ID","நிறுவன ஐடி")}: <span className="font-mono text-ink">{orgId}</span>
          </span>
          <button
            onClick={copyId}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-primary apple-transition"
            title={L("Copy organization ID","நிறுவன ஐடியை நகலெடு")}
          >
            {copied ? <><Check className="w-3.5 h-3.5 text-success" /> {L("Copied","நகலெடுக்கப்பட்டது")}</> : <><Copy className="w-3.5 h-3.5" /> {L("Copy","நகலெடு")}</>}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;
