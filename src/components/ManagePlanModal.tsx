import { useTaxRate, gstNote } from "../hooks/useTaxRate";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, CircleNotch as Loader2, ArrowUp, ArrowDown, CalendarCheck } from "@phosphor-icons/react";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { usePlan } from "../hooks/usePlan";
import { useProjectsQuery } from "../hooks/queries";
import { PLANS, PLAN_ORDER, PlanId } from "../lib/plans";
import { callScheduleDowngrade, callCancelScheduledPlanChange } from "../services/firebaseFunctions";
import { confirmDialog } from "../lib/feedback";
import { DialogBehaviour } from "../lib/useDialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Plans a customer can self-serve switch between (Enterprise is sales-led).
// Business → Starter is the only self-serve downgrade now. Leaving altogether
// means stopping payment: the lifecycle handles past_due, grace, then expired.
const TIERS: PlanId[] = ["starter", "business"];

// Full plan switcher for an Owner/Admin: upgrade (immediate, paid) or schedule a
// downgrade for the end of the current cycle. Shows any scheduled change.
export const ManagePlanModal: React.FC<Props> = ({ isOpen, onClose }) => {
  // Pricing copy follows the rate checkout will actually charge: 0 until a
  // GSTIN is configured, so the GST line is simply absent until it is true.
  const taxRatePct = useTaxRate();
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const { pay, busy: payBusy, error: payError } = useRazorpayCheckout();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!isOpen) return null;

  const current = (plan.plan || "starter") as PlanId;
  const currentIdx = PLAN_ORDER.indexOf(current);
  const pending = plan.pendingPlanChange || null;
  const working = busy || payBusy;

  const fmtDate = (ms?: number) =>
    ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

  const doUpgrade = (id: PlanId) => pay(id, period, () => onClose());

  const doDowngrade = async (id: PlanId) => {
    const cap = PLANS[id].includedProjects;
    const over = typeof cap === "number" ? Math.max(0, projects.length - cap) : 0;
    const when = fmtDate(plan.currentPeriodEnd) || "the end of your current cycle";
    const overMsg =
      over > 0
        ? `\n\nYou have ${projects.length} projects; ${PLANS[id].name} includes ${cap}. The ${over} extra will be billed at ₹${plan.overageRate}/project/mo — no projects are deleted.`
        : "";
    const ok = (await confirmDialog({ title: `Switch to ${PLANS[id].name} on ${when}? You keep your current plan until then.${overMsg}`, }));
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await callScheduleDowngrade({ targetPlan: id });
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Couldn't schedule the change.");
    } finally {
      setBusy(false);
    }
  };

  const cancelScheduled = async () => {
    setBusy(true);
    setErr(null);
    try {
      await callCancelScheduledPlanChange();
    } catch (e: any) {
      setErr(e?.message || "Couldn't cancel the change.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-surface-dark/60 backdrop-blur-md z-[110] flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="soft-card w-full max-w-2xl rounded-[32px] p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        >
          <DialogBehaviour />
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">{"Manage plan"}</h2>
              <p className="text-[15px] text-ink-muted font-medium mt-1">
                {"Upgrade instantly, or downgrade at the end of your cycle."}
              </p>
            </div>
            <button aria-label={"Close"}
              type="button"
              onClick={onClose}
              className="p-2.5 hover:bg-panel rounded-full transition-colors text-ink-muted hover:text-ink"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {pending && (
            <div className="mb-5 p-4 rounded-2xl border border-primary/30 bg-primary/8 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 text-sm">
                <CalendarCheck weight="duotone" className="w-5 h-5 text-primary shrink-0" />
                <span className="text-ink">
                  {"Scheduled: switch to"}{" "}
                  <b>{PLANS[pending.plan as PlanId]?.name || pending.plan}</b>{" "}
                  {"on"} <b>{fmtDate(pending.effectiveAt)}</b>
                </span>
              </div>
              <button
                onClick={cancelScheduled}
                disabled={working}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50"
              >
                {"Cancel change"}
              </button>
            </div>
          )}

          {(err || payError) && (
            <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 text-sm text-center">
              {err || payError}
            </div>
          )}

          {/* Billing period toggle (affects upgrade pricing) */}
          <div className="flex items-center justify-center mb-5">
            <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
              <button
                onClick={() => setPeriod("monthly")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition ${period === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
              >
                {"Monthly"}
              </button>
              <button
                onClick={() => setPeriod("annual")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition flex items-center gap-2 ${period === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
              >
                {"Annual"}
                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-success/15 text-success">{"Save ~17%"}</span>
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {TIERS.map((id) => {
              const p = PLANS[id];
              const idx = PLAN_ORDER.indexOf(id);
              const isCurrent = id === current;
              const isUpgrade = idx > currentIdx;
              const isPendingTarget = pending?.plan === id;
              const monthly = period === "annual" ? Math.round((p.annual || 0) / 12) : p.monthly || 0;
              return (
                <div
                  key={id}
                  className={`rounded-2xl p-4 flex flex-col border ${isCurrent ? "border-primary/50 ring-1 ring-primary/25 bg-primary/5" : "border-divider"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black uppercase tracking-widest text-ink-muted">{p.name}</p>
                    {isCurrent && (
                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">{"Current"}</span>
                    )}
                  </div>
                  <div className="flex items-end gap-1 mb-2">
                    <span className="font-display font-bold text-2xl tracking-tight text-ink">₹{monthly.toLocaleString("en-IN")}</span>
                    <span className="text-[11px] text-ink-muted mb-1">/ {"mo"}</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mb-3">
                    {`${p.includedProjects} projects · ${p.userLimit} users`}
                  </p>

                  {isCurrent ? (
                    <button disabled className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-panel border border-divider text-ink-muted cursor-default">
                      {"Your plan"}
                    </button>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => doUpgrade(id)}
                      disabled={working}
                      className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-primary text-on-primary hover:bg-primary-deep apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUp weight="bold" className="w-4 h-4" /> {"Upgrade"}</>}
                    </button>
                  ) : (
                    <button
                      onClick={() => doDowngrade(id)}
                      disabled={working || isPendingTarget}
                      className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isPendingTarget
                        ? <><Check weight="bold" className="w-4 h-4 text-primary" /> {"Scheduled"}</>
                        : <><ArrowDown weight="bold" className="w-4 h-4" /> {"Downgrade"}</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-ink-muted mt-5">
            {`Upgrades are charged now and apply immediately. Downgrades take effect at the end of your paid cycle — no refund, you keep your current plan until then.${gstNote(taxRatePct)}`}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ManagePlanModal;
