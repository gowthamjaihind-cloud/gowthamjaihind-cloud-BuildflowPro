import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, CircleNotch as Loader2, ArrowUp, ArrowDown, CalendarCheck } from "@phosphor-icons/react";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { usePlan } from "../hooks/usePlan";
import { useProjectsQuery } from "../hooks/queries";
import { PLANS, PLAN_ORDER, PlanId } from "../lib/plans";
import { callScheduleDowngrade, callCancelScheduledPlanChange } from "../services/firebaseFunctions";
import { useL } from "../i18n";
import { confirmDialog } from "../lib/feedback";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Plans a customer can self-serve switch between (Enterprise is sales-led).
const TIERS: PlanId[] = ["free", "starter", "growth", "business"];

// Full plan switcher for an Owner/Admin: upgrade (immediate, paid) or schedule a
// downgrade for the end of the current cycle. Shows any scheduled change.
export const ManagePlanModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const L = useL();
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const { pay, busy: payBusy, error: payError } = useRazorpayCheckout();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!isOpen) return null;

  const current = (plan.plan || "free") as PlanId;
  const currentIdx = PLAN_ORDER.indexOf(current);
  const pending = plan.pendingPlanChange || null;
  const working = busy || payBusy;

  const fmtDate = (ms?: number) =>
    ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

  const doUpgrade = (id: PlanId) => pay(id, period, () => onClose());

  const doDowngrade = async (id: PlanId) => {
    const cap = PLANS[id].includedProjects;
    const over = typeof cap === "number" ? Math.max(0, projects.length - cap) : 0;
    const when = fmtDate(plan.currentPeriodEnd) || L("the end of your current cycle", "உங்கள் தற்போதைய சுழற்சியின் முடிவில்");
    const overMsg =
      over > 0
        ? L(
            `\n\nYou have ${projects.length} projects; ${PLANS[id].name} includes ${cap}. The ${over} extra will be billed at ₹${plan.overageRate}/project/mo — no projects are deleted.`,
            `\n\nஉங்களிடம் ${projects.length} செயல்திட்டங்கள் உள்ளன; ${PLANS[id].name} இல் ${cap} அடங்கும். கூடுதல் ${over} க்கு ₹${plan.overageRate}/செயல்திட்டம்/மாதம் கட்டணம் — எந்த செயல்திட்டமும் நீக்கப்படாது.`,
          )
        : "";
    const ok = (await confirmDialog({ title: L(
        `Switch to ${PLANS[id].name} on ${when}? You keep your current plan until then.${overMsg}`,
        `${when} அன்று ${PLANS[id].name} க்கு மாறவா? அதுவரை உங்கள் தற்போதைய திட்டத்தை வைத்திருப்பீர்கள்.${overMsg}`,
      ), }));
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await callScheduleDowngrade({ targetPlan: id });
      onClose();
    } catch (e: any) {
      setErr(e?.message || L("Couldn't schedule the change.", "மாற்றத்தைத் திட்டமிட முடியவில்லை."));
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
      setErr(e?.message || L("Couldn't cancel the change.", "மாற்றத்தை ரத்து செய்ய முடியவில்லை."));
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
        className="fixed inset-0 bg-onyx/60 backdrop-blur-md z-[110] flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="soft-card w-full max-w-2xl rounded-[32px] p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">{L("Manage plan", "திட்டத்தை நிர்வகி")}</h2>
              <p className="text-[15px] text-ink-muted font-medium mt-1">
                {L("Upgrade instantly, or downgrade at the end of your cycle.", "உடனடியாக மேம்படுத்தவும், அல்லது சுழற்சியின் முடிவில் குறைக்கவும்.")}
              </p>
            </div>
            <button
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
                  {L("Scheduled: switch to", "திட்டமிடப்பட்டது: மாறும்")}{" "}
                  <b>{PLANS[pending.plan as PlanId]?.name || pending.plan}</b>{" "}
                  {L("on", "அன்று")} <b>{fmtDate(pending.effectiveAt)}</b>
                </span>
              </div>
              <button
                onClick={cancelScheduled}
                disabled={working}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50"
              >
                {L("Cancel change", "மாற்றத்தை ரத்து செய்")}
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
                {L("Monthly", "மாதாந்திர")}
              </button>
              <button
                onClick={() => setPeriod("annual")}
                className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition flex items-center gap-2 ${period === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
              >
                {L("Annual", "ஆண்டு")}
                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-success/15 text-[#2E8B6F]">{L("Save ~17%", "~17% சேமி")}</span>
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
              const monthly = id === "free" ? 0 : period === "annual" ? Math.round((p.annual || 0) / 12) : p.monthly || 0;
              return (
                <div
                  key={id}
                  className={`rounded-2xl p-4 flex flex-col border ${isCurrent ? "border-primary/50 ring-1 ring-primary/25 bg-primary/5" : "border-divider"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-black uppercase tracking-widest text-ink-muted">{p.name}</p>
                    {isCurrent && (
                      <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/15 text-primary">{L("Current", "தற்போது")}</span>
                    )}
                  </div>
                  <div className="flex items-end gap-1 mb-2">
                    <span className="font-display font-bold text-2xl tracking-tight text-ink">₹{monthly.toLocaleString("en-IN")}</span>
                    <span className="text-[11px] text-ink-muted mb-1">/ {L("mo", "மாதம்")}</span>
                  </div>
                  <p className="text-[11px] text-ink-muted mb-3">
                    {L(`${p.includedProjects} projects · ${p.userLimit} users`, `${p.includedProjects} செயல்திட்டங்கள் · ${p.userLimit} பயனர்கள்`)}
                  </p>

                  {isCurrent ? (
                    <button disabled className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-panel border border-divider text-ink-muted cursor-default">
                      {L("Your plan", "உங்கள் திட்டம்")}
                    </button>
                  ) : isUpgrade ? (
                    <button
                      onClick={() => doUpgrade(id)}
                      disabled={working}
                      className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-primary text-white hover:bg-[#B85F3B] apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowUp weight="bold" className="w-4 h-4" /> {L("Upgrade", "மேம்படுத்து")}</>}
                    </button>
                  ) : (
                    <button
                      onClick={() => doDowngrade(id)}
                      disabled={working || isPendingTarget}
                      className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isPendingTarget
                        ? <><Check weight="bold" className="w-4 h-4 text-primary" /> {L("Scheduled", "திட்டமிடப்பட்டது")}</>
                        : <><ArrowDown weight="bold" className="w-4 h-4" /> {L("Downgrade", "குறை")}</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-ink-muted mt-5">
            {L("Upgrades are charged now and apply immediately. Downgrades take effect at the end of your paid cycle — no refund, you keep your current plan until then. Prices exclusive of GST.", "மேம்படுத்தல்கள் இப்போது வசூலிக்கப்பட்டு உடனடியாகப் பொருந்தும். குறைப்புகள் உங்கள் கட்டண சுழற்சியின் முடிவில் நடைமுறைக்கு வரும் — பணத்திரும்பம் இல்லை. விலைகள் GST தவிர்த்து.")}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ManagePlanModal;
