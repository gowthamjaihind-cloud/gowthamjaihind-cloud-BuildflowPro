import React, { useEffect, useState } from "react";
import { Stack, Copy, Check, Plus, SlidersHorizontal, CalendarCheck, WarningCircle } from "@phosphor-icons/react";
import { usePlan } from "../../hooks/usePlan";
import { useProjectsQuery } from "../../hooks/queries";
import { useAuthStore } from "../../store";
import { projectCapState, planAdvice, liveSlotSubs, billableProjectCount, PLANS, PlanId } from "../../lib/plans";
import { AddCapacityModal } from "../AddCapacityModal";
import { ManagePlanModal } from "../ManagePlanModal";
import { Tooltip } from "../Tooltip";
import {
  callCancelSlotSubscription,
  callConfirmSubscription,
  callCancelSubscription,
  callResumeSubscription,
  callGetBillingHistory,
  type BillingHistoryRow,
} from "../../services/firebaseFunctions";
import { confirmDialog, toast } from "../../lib/feedback";
import { useRazorpayCheckout } from "../../hooks/useRazorpayCheckout";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/react-query";

// Plans an Owner/Admin can self-serve manage (upgrade/downgrade).
// No free tier any more; Enterprise is not self-serve.
const SELF_SERVE_PLANS = ["starter", "business"];

// Compact "your plan + usage" summary for the org settings page: current plan,
// projects used vs included, any per-project overage, and the (copyable) org ID
// operators need for the Operator panel actions.
export const PlanSummary: React.FC = () => {
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const orgId = useAuthStore((s) => s.user?.currentOrgId);
  const role = useAuthStore((s) => s.user?.role);
  // Declared with the other state, above the early returns: hooks must run in
  // the same order on every render.
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const { paySlots, busy: payBusy, error: payError } = useRazorpayCheckout();
  const qc = useQueryClient();
  // The unlock is written by the server a moment after the payment lands.
  const refreshProjects = () => {
    for (const ms of [500, 3000, 8000]) setTimeout(() => qc.invalidateQueries({ queryKey: queryKeys.projects }), ms);
  };
  // A payment whose webhook was late or lost leaves a paid workspace reading
  // "not subscribed". Opening Settings asks the server to check with Razorpay.
  // Owners and Admins only; it is a no-op for a workspace with nothing pending.
  const unpaid = !!orgId && !!plan.subscriptionStatus && plan.subscriptionStatus !== "active";
  const canManage = role === "Owner" || role === "Admin";
  useEffect(() => {
    if (unpaid && canManage) callConfirmSubscription().catch(() => {});
  }, [unpaid, canManage, orgId]);
  const [copied, setCopied] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [history, setHistory] = useState<BillingHistoryRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  if (plan.loading) return null;

  // The panel used to render nothing here too, because `unavailable` did not
  // exist and an unreachable backend never cleared `loading`. An owner whose
  // subscription had lapsed opened Settings to fix it and found the billing
  // section simply absent -- indistinguishable from having no plan at all.
  // Say what happened instead; the SDK keeps retrying, so this clears itself.
  if (plan.unavailable) {
    return (
      <div className="soft-card squircle-24 p-5 mb-6 flex items-start gap-3 border border-warning/30 bg-warning/5">
        <WarningCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" weight="fill" />
        <div>
          <p className="text-sm font-bold text-ink">We couldn't load your plan</p>
          <p className="text-sm text-ink-muted mt-0.5">
            Your billing details are still on our side — this is a connection problem, not a change
            to your account. It'll fill in on its own once you're back online.
          </p>
        </div>
      </div>
    );
  }

  const planName =
    plan.plan && PLANS[plan.plan as PlanId] ? PLANS[plan.plan as PlanId].name : plan.plan || "—";
  const cap = projectCapState(plan, billableProjectCount(projects));
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
  // Is a different plan cheaper for the number of projects they actually run?
  // Starter is uncapped on purpose, so nothing forces an upgrade — which leaves
  // a customer past the crossover quietly paying more than Business would cost
  // them. At 16 projects that is ₹1,584 against ₹1,499. Saying nothing is
  // charging someone for not reading a pricing table.
  const advice = planAdvice(plan.plan, billableProjectCount(projects));

  // Leaving. Takes effect at the end of the period already paid for -- nothing
  // is cut off early and nothing is deleted -- and it is reversible right up
  // until it lands, which is the point of showing it rather than hiding it.
  // Razorpay emails a receipt; the app recorded nothing. A contractor doing GST
  // filing should not have to search their inbox for a payment their own
  // workspace made. Loaded on demand rather than on mount — most visits to this
  // screen are not about an invoice.
  const loadHistory = async () => {
    setHistoryBusy(true);
    try {
      setHistory((await callGetBillingHistory()).rows);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't load billing history.");
    } finally {
      setHistoryBusy(false);
    }
  };

  const slotSubs = liveSlotSubs(plan);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || "a deleted project";
  const namesOf = (ids: string[]) => ids.map(projectName).join(", ");

  const cancelSlots = async (id: string, qty: number, until: number, projectIds: string[]) => {
    const names = namesOf(projectIds);
    const when = fmtDate(until) || "the end of the month you've paid for";
    const ok = await confirmDialog({
      title: names ? `Cancel the subscription for ${names}?` : "Cancel this unused extra project?",
      body: names
        ? `No further payment is taken. ${names} ${projectIds.length === 1 ? "stays" : "stay"} fully usable until ${when}, then ${projectIds.length === 1 ? "becomes" : "become"} read-only: everyone can still open and export ${projectIds.length === 1 ? "it" : "them"}, but nothing can be added or changed until you subscribe again. Nothing is deleted.`
        : `No further payment is taken. You can still create a project with it until ${when}.`,
      confirmLabel: "Cancel subscription",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    setSlotBusy(id); setCancelErr(null);
    try {
      await callCancelSlotSubscription({ subscriptionId: id });
    } catch (e: any) {
      setCancelErr(e?.message || "Couldn't cancel that. Please try again.");
    } finally {
      setSlotBusy(null);
    }
  };

  // A locked project is re-opened by subscribing again FOR THAT PROJECT.
  const lockedProjects = projects.filter((p) => p.billingLocked);
  const resubscribe = (projectId: string) => paySlots(1, refreshProjects, undefined, projectId);

  const cancelPlan = async () => {
    const until = fmtDate(plan.currentPeriodEnd);
    const ok = await confirmDialog({
      title: "Cancel your plan?",
      body:
        `Your workspace stays fully usable${until ? ` until ${until}` : " until the end of the period you've paid for"}. ` +
        "Nothing is deleted — every project, log and photo stays exactly where it is, and you can restart any time. " +
        "There's no refund for the rest of this period.",
      confirmLabel: "Cancel my plan",
      cancelLabel: "Keep my plan",
      destructive: true,
    });
    if (!ok) return;
    setCancelBusy(true); setCancelErr(null);
    try {
      await callCancelSubscription();
      toast.info("Your plan will end at the close of this billing period. Nothing has been deleted.");
    } catch (e: any) {
      setCancelErr(e?.message || "Couldn't cancel the plan.");
    } finally {
      setCancelBusy(false);
    }
  };

  const resumePlan = async () => {
    setCancelBusy(true); setCancelErr(null);
    try {
      await callResumeSubscription();
      toast.success("Your plan will continue as normal.");
    } catch (e: any) {
      setCancelErr(e?.message || "Couldn't resume the plan.");
    } finally {
      setCancelBusy(false);
    }
  };

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
      {plan.cancelAtPeriodEnd && (
        <div className="mb-4 p-3 rounded-xl border border-warning/30 bg-warning/8 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink">
            Your plan ends {fmtDate(plan.currentPeriodEnd) ? <b>on {fmtDate(plan.currentPeriodEnd)}</b> : "at the end of this period"}.
            {" "}Everything keeps working until then, and nothing will be deleted afterwards.
          </p>
          <button
            onClick={resumePlan}
            disabled={cancelBusy}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 apple-transition disabled:opacity-50"
          >
            {"Keep my plan"}
          </button>
        </div>
      )}
      {cancelErr && (
        <div className="mb-4 p-3 rounded-xl border border-danger/30 bg-danger/8 text-sm text-danger">{cancelErr}</div>
      )}
      {advice.cheaper && isOwnerAdmin && !plan.cancelAtPeriodEnd && (
        <div className="mb-4 p-3 rounded-xl border border-success/30 bg-success/8 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink">
            You have <b>{billableProjectCount(projects)} projects</b>. {PLANS[advice.cheaper as PlanId]?.name ?? advice.cheaper} would cost{" "}
            <b>₹{advice.cheaperCost}</b> a month instead of <b>₹{advice.currentCost}</b> — <b>₹{advice.savings} less</b>.
          </p>
          <button
            onClick={() => setShowManage(true)}
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-success/15 text-success hover:bg-success/25 apple-transition"
          >
            {`Switch to ${PLANS[advice.cheaper as PlanId]?.name ?? advice.cheaper}`}
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Stack weight="duotone" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{"Your plan"}</p>
            <p className="font-bold text-ink">{planName}</p>
          </div>
        </div>
        <div className="text-sm text-ink-muted">
          {"Projects"}:{" "}
          <b className="text-ink">
            {billableProjectCount(projects)}
            {cap.capped && cap.included !== null ? ` / ${cap.included}` : ""}
          </b>
          {cap.overage > 0 && (
            <span className="text-warning font-semibold"> · {`${cap.overage} extra · ₹${cap.overageCost}/mo`}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageCapacity && (
            <button
              onClick={() => setShowCapacity(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 apple-transition"
            >
              <Plus weight="bold" className="w-3.5 h-3.5" /> {"Add projects"}
            </button>
          )}
          {canManagePlan && (
            <button
              onClick={() => setShowManage(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-surface-dark text-white hover:opacity-90 apple-transition"
            >
              <SlidersHorizontal weight="bold" className="w-3.5 h-3.5" /> {"Manage plan"}
            </button>
          )}
          {isOwnerAdmin && (
            <button
              onClick={() => (history === null ? loadHistory() : setHistory(null))}
              disabled={historyBusy}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50"
            >
              {historyBusy ? "Loading…" : history === null ? "Billing history" : "Hide history"}
            </button>
          )}
          {/* Leaving has to be findable. Until this existed the only way off a
              paid plan was to stop paying and let it lapse through past_due and
              a week of dunning email, which reads as a dark pattern even when
              nothing is actually hidden. */}
          {canManagePlan && plan.subscriptionStatus === "active" && !plan.cancelAtPeriodEnd && (
            <button
              onClick={cancelPlan}
              disabled={cancelBusy}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-ink-muted hover:text-danger apple-transition disabled:opacity-50"
            >
              {"Cancel plan"}
            </button>
          )}
        </div>
      </div>

      {/* Extra projects are their own monthly subscriptions. They have to be
          visible and cancellable here: a recurring charge with no way to see or
          stop it is the thing customers rightly complain about. */}
      {(slotSubs.length > 0 || lockedProjects.length > 0) && (
        <div className="mt-3 p-3 rounded-xl border border-divider bg-panel/50 text-xs text-ink space-y-2">
          <p className="font-bold">{"Extra projects"}</p>
          {slotSubs.map((s) => {
            const ending = s.status === "cancelling" || s.status === "cancelled";
            const names = namesOf(s.projectIds);
            const spare = s.qty - s.projectIds.length;
            return (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{names || "Not used yet"}</b>
                  {names && spare > 0 ? ` (+${spare} not used yet)` : ""}
                  {" · "}₹{(s.qty * plan.overageRate).toLocaleString("en-IN")}{" / month · "}
                  {ending ? `ends ${fmtDate(s.until)}, then read-only` : s.status === "halted" ? `payment failed, ends ${fmtDate(s.until)}` : `renews ${fmtDate(s.until)}`}
                </span>
                {isOwnerAdmin && !ending && (
                  <button
                    onClick={() => cancelSlots(s.id, s.qty, s.until, s.projectIds)}
                    disabled={slotBusy === s.id}
                    className="font-bold px-2 py-1 rounded-lg text-ink-muted hover:text-danger apple-transition disabled:opacity-50"
                  >
                    {slotBusy === s.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
            );
          })}
          {lockedProjects.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{p.name}</b>{" · read-only: its subscription has ended"}
              </span>
              {isOwnerAdmin && (
                <button
                  onClick={() => resubscribe(p.id)}
                  disabled={payBusy}
                  className="font-bold px-2 py-1 rounded-lg text-primary hover:text-primary-deep apple-transition disabled:opacity-50"
                >
                  {`Subscribe again · ₹${plan.overageRate} / month`}
                </button>
              )}
            </div>
          ))}
          {payError && <p className="text-danger">{payError}</p>}
        </div>
      )}

      {pending && (
        <div className="mt-3 p-3 rounded-xl border border-primary/25 bg-primary/5 flex items-center gap-2 text-xs text-ink">
          <CalendarCheck weight="duotone" className="w-4 h-4 text-primary shrink-0" />
          <span>
            {"Scheduled: switches to"} <b>{pendingName}</b> {"on"} <b>{fmtDate(pending.effectiveAt)}</b>
          </span>
        </div>
      )}

      <AddCapacityModal isOpen={showCapacity} onClose={() => setShowCapacity(false)} />
      <ManagePlanModal isOpen={showManage} onClose={() => setShowManage(false)} />
      {orgId && (
        <div className="mt-3 pt-3 border-t border-divider/60 flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-muted">
            {"Org ID"}: <span className="font-mono text-ink">{orgId}</span>
          </span>
          <Tooltip label={"Copy organization ID"}>
            <button
              onClick={copyId}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-primary apple-transition"
             
            >
              {copied ? <><Check className="w-3.5 h-3.5 text-success" /> {"Copied"}</> : <><Copy className="w-3.5 h-3.5" /> {"Copy"}</>}
            </button>
          </Tooltip>
        </div>
      )}

      {history !== null && (
        <div className="mt-4 pt-4 border-t border-divider">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-muted mb-2">{"Billing history"}</p>
          {history.length === 0 ? (
            <p className="text-sm text-ink-muted">{"No payments yet."}</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h) => (
                <div key={h.orderId} className="flex items-baseline justify-between gap-3 text-sm flex-wrap">
                  <span className="text-ink">
                    {h.kind === "slots"
                      ? `${h.quantity ?? 1} extra project${(h.quantity ?? 1) === 1 ? "" : "s"}`
                      : `${PLANS[h.plan as PlanId]?.name ?? h.plan ?? "Plan"}${h.period === "annual" ? " · annual" : ""}`}
                    {h.paidAt && <span className="text-ink-muted"> · {fmtDate(Date.parse(h.paidAt))}</span>}
                  </span>
                  <span className="font-bold text-ink">
                    ₹{h.amount}
                    {/* Say so when proration made it cheaper than the sticker —
                        an unexplained smaller number reads as a billing error. */}
                    {h.credit ? (
                      <span className="font-normal text-ink-muted"> {`(₹${h.listAmount} less ₹${h.credit} credit)`}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink-muted mt-3">
            {"Payments are collected by Razorpay, who email a receipt for each one. Prices exclude GST."}
          </p>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;
