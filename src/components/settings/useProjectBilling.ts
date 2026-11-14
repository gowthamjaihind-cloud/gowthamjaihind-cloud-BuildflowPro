import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePlan } from "../../hooks/usePlan";
import { useProjectsQuery } from "../../hooks/queries";
import { useAuthStore } from "../../store";
import { useRazorpayCheckout } from "../../hooks/useRazorpayCheckout";
import { liveSlotSubs, PLANS, PlanId, SlotSubView } from "../../lib/plans";
import { queryKeys } from "../../lib/react-query";
import { timeKey } from "../../lib/timeKey";
import { confirmDialog } from "../../lib/feedback";
import { callCancelSlotSubscription } from "../../services/firebaseFunctions";
import type { Project } from "../../types";

export const fmtBillDate = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

export interface ProjectBillingRow {
  p: Project;
  /** The extra-project subscription paying for this project, if any. */
  sub?: SlotSubView;
  /** True when a scheduled downgrade will make this project read-only. */
  willLock: boolean;
}

/**
 * Every project and how it is paid for, plus the two things a customer can do
 * about one: cancel its subscription, or subscribe again once it is read-only.
 *
 * One row per project, oldest first. The server keeps the OLDEST projects open
 * after a downgrade (functions/src/slotSubs.ts), which is how `willLock` is
 * worked out here.
 */
export function useProjectBilling() {
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const role = useAuthStore((s) => s.user?.role);
  const isOwnerAdmin = role === "Owner" || role === "Admin";
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const { paySlots, busy: payBusy, error: payError } = useRazorpayCheckout();
  const qc = useQueryClient();
  // The unlock is written by the server a moment after the payment lands.
  const refreshProjects = () => {
    for (const ms of [500, 3000, 8000]) setTimeout(() => qc.invalidateQueries({ queryKey: queryKeys.projects }), ms);
  };

  const slotSubs = liveSlotSubs(plan);
  const subByProject = new Map<string, SlotSubView>();
  for (const sub of slotSubs) for (const pid of sub.projectIds) subByProject.set(pid, sub);
  const ordered = [...projects].sort((a, b) => {
    const ka = timeKey((a as any).createdAt), kb = timeKey((b as any).createdAt);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const pending = plan.pendingPlanChange || null;
  const pendingCap = pending ? PLANS[pending.plan as PlanId]?.includedProjects : undefined;
  let planSeat = 0;
  const rows: ProjectBillingRow[] = ordered.map((p) => {
    const sub = subByProject.get(p.id);
    const inPlan = !sub && !p.billingLocked;
    const seat = inPlan ? planSeat++ : -1;
    return { p, sub, willLock: inPlan && typeof pendingCap === "number" && seat >= pendingCap };
  });
  const unusedSubs = slotSubs.filter((sub) => sub.projectIds.length < sub.qty);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || "a deleted project";

  const cancelSlots = async (sub: SlotSubView) => {
    const names = sub.projectIds.map(projectName).join(", ");
    const one = sub.projectIds.length === 1;
    const when = fmtBillDate(sub.until) || "the end of the month you've paid for";
    const ok = await confirmDialog({
      title: names ? `Cancel the subscription for ${names}?` : "Cancel this unused extra-project subscription?",
      body: names
        ? `No further payment is taken. ${names} ${one ? "stays" : "stay"} fully usable until ${when}, then ${one ? "becomes" : "become"} read-only: everyone can still open and export ${one ? "it" : "them"}, but nothing can be added or changed until you subscribe again. Nothing is deleted.`
        : `No further payment is taken. It is not paying for any project, so nothing changes for your projects.`,
      confirmLabel: "Cancel subscription",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    setSlotBusy(sub.id);
    setCancelErr(null);
    try {
      await callCancelSlotSubscription({ subscriptionId: sub.id });
    } catch (e: any) {
      setCancelErr(e?.message || "Couldn't cancel that. Please try again.");
    } finally {
      setSlotBusy(null);
    }
  };

  // A read-only project is re-opened by subscribing again FOR THAT PROJECT.
  const resubscribe = (projectId: string) => paySlots(1, refreshProjects, undefined, projectId);

  return { plan, projects, isOwnerAdmin, rows, unusedSubs, slotSubs, projectName, cancelSlots, resubscribe, slotBusy, cancelErr, payBusy, payError, pending };
}
