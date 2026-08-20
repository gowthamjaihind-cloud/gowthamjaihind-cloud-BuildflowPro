import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Stack, Check, CircleNotch as Loader2, Plus, Minus } from "@phosphor-icons/react";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { usePlan } from "../hooks/usePlan";
import { useProjectsQuery } from "../hooks/queries";
import { PLANS, PLAN_ORDER, PlanId } from "../lib/plans";

interface AddCapacityModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Fired after a successful slot purchase or plan upgrade. The parent decides
  // what happens next (e.g. proceed to create the project that hit the cap).
  onSuccess?: () => void;
}

// Shown to an Owner/Admin on a paid plan who has run out of included projects.
// Offers BOTH paths: buy ₹99 project slots for the current cycle, or upgrade to
// a bigger plan. Payment auto-activates on the server; usePlan updates live.
export const AddCapacityModal: React.FC<AddCapacityModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const plan = usePlan();
  const { data: projects = [] } = useProjectsQuery();
  const { pay, paySlots, busy, error } = useRazorpayCheckout();
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");

  const included = typeof plan.includedProjects === "number" ? plan.includedProjects : 0;
  const rate = plan.overageRate;
  // Slots needed to create one more project past the cap (at least 1).
  const minSlots = Math.max(1, projects.length + 1 - included);
  const [qty, setQty] = useState(minSlots);
  const slots = Math.max(minSlots, qty);

  // Upgrade options: paid plans with a larger included cap than the current one.
  const currentIdx = plan.plan ? PLAN_ORDER.indexOf(plan.plan as PlanId) : -1;
  const upgrades = useMemo(
    () =>
      (["starter", "growth", "business"] as PlanId[]).filter((id) => {
        const idx = PLAN_ORDER.indexOf(id);
        const cap = PLANS[id].includedProjects ?? 0;
        return idx > currentIdx && cap > included;
      }),
    [currentIdx, included],
  );

  if (!isOpen) return null;

  const handleBuySlots = () =>
    paySlots(slots, () => {
      onSuccess?.();
      onClose();
    });

  const handleUpgrade = (id: PlanId) =>
    pay(id, period, () => {
      onSuccess?.();
      onClose();
    });

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
          className="soft-card w-full max-w-xl rounded-[32px] p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-ink tracking-tight">Add project capacity</h2>
              <p className="text-[15px] text-ink-muted font-medium mt-1">
                You've used {projects.length} of {included} included project{included === 1 ? "" : "s"}.
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

          {error && (
            <div className="mb-4 p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 text-sm text-center">
              {error}
            </div>
          )}

          {/* Buy extra slots */}
          <div className="rounded-2xl border border-primary/30 ring-1 ring-primary/20 p-5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <Stack weight="duotone" className="w-5 h-5 text-primary" />
              <p className="font-bold text-ink">Add project slots</p>
            </div>
            <p className="text-sm text-ink-muted mb-4">
              ₹{rate} per extra project / month. Added to this plan immediately.
            </p>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="inline-flex items-center gap-3 bg-panel border border-divider rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(minSlots, q - 1))}
                  disabled={slots <= minSlots || busy}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-surface disabled:opacity-40 apple-transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-bold text-lg text-ink w-8 text-center">{slots}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(50, Math.max(minSlots, q) + 1))}
                  disabled={slots >= 50 || busy}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-ink hover:bg-surface disabled:opacity-40 apple-transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleBuySlots}
                disabled={busy}
                className="flex-1 min-w-[160px] py-3 rounded-xl font-bold text-sm bg-primary text-white hover:bg-[#B85F3B] apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Pay ₹${(slots * rate).toLocaleString("en-IN")} / mo`}
              </button>
            </div>
          </div>

          {/* Or upgrade the plan */}
          {upgrades.length > 0 && (
            <>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-divider flex-1" />
                <span className="text-[11px] font-black uppercase tracking-widest text-ink-muted">or upgrade your plan</span>
                <div className="h-px bg-divider flex-1" />
              </div>

              <div className="flex items-center justify-center mb-4">
                <div className="inline-flex items-center bg-panel border border-divider rounded-full p-1">
                  <button
                    onClick={() => setPeriod("monthly")}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition ${period === "monthly" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setPeriod("annual")}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold apple-transition flex items-center gap-2 ${period === "annual" ? "bg-surface-dark text-white shadow" : "text-ink-muted hover:text-ink"}`}
                  >
                    Annual
                    <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-success/15 text-[#2E8B6F]">Save ~17%</span>
                  </button>
                </div>
              </div>

              <div className={`grid gap-3 ${upgrades.length === 1 ? "grid-cols-1" : upgrades.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                {upgrades.map((id) => {
                  const p = PLANS[id];
                  const monthly = period === "annual" ? Math.round((p.annual || 0) / 12) : p.monthly || 0;
                  return (
                    <div key={id} className="rounded-2xl p-4 flex flex-col border border-divider">
                      <p className="text-xs font-black uppercase tracking-widest text-ink-muted mb-1">{p.name}</p>
                      <div className="flex items-end gap-1 mb-2">
                        <span className="font-display font-bold text-2xl tracking-tight">₹{monthly.toLocaleString("en-IN")}</span>
                        <span className="text-[11px] text-ink-muted mb-1">/ mo</span>
                      </div>
                      <div className="inline-flex self-start items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-3 bg-sage/15 text-[#3E8388]">
                        <Stack weight="bold" className="w-3.5 h-3.5" /> {p.includedProjects} projects
                      </div>
                      <button
                        onClick={() => handleUpgrade(id)}
                        disabled={busy}
                        className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm bg-panel border border-divider text-ink hover:bg-surface apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check weight="bold" className="w-4 h-4" /> Upgrade</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="text-center text-[11px] text-ink-muted mt-5">
            Extra slots apply to your current billing cycle. Prices exclusive of GST.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddCapacityModal;
