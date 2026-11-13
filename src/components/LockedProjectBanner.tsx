import React from "react";
import { Lock } from "@phosphor-icons/react";
import { useAuthStore } from "../store";
import { usePlan } from "../hooks/usePlan";
import { useRazorpayCheckout } from "../hooks/useRazorpayCheckout";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/react-query";

/**
 * Shown over a project whose own monthly subscription has ended.
 *
 * The database refuses every write to such a project (firestore.rules,
 * projectLocked). Without this the customer would only see saves failing, with
 * no idea why or what to do about it.
 */
export const LockedProjectBanner: React.FC<{ projectId: string; projectName: string }> = ({ projectId, projectName }) => {
  const role = useAuthStore((s) => s.user?.role);
  const plan = usePlan();
  const { paySlots, busy, error } = useRazorpayCheckout();
  const qc = useQueryClient();
  // The unlock is written by the server a moment after the payment lands.
  const refreshProjects = () => {
    for (const ms of [500, 3000, 8000]) setTimeout(() => qc.invalidateQueries({ queryKey: queryKeys.projects }), ms);
  };
  const canPay = role === "Owner" || role === "Admin";
  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-surface-dark text-white text-xs font-semibold px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 shadow-lg">
      <span className="inline-flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>
          <b>{projectName}</b>{" is read-only: its monthly subscription has ended. You can view and export everything; changes won't save. Nothing is deleted."}
        </span>
      </span>
      {canPay ? (
        <button
          onClick={() => paySlots(1, refreshProjects, undefined, projectId)}
          disabled={busy}
          className="px-3 py-1 rounded-full bg-white text-ink font-bold disabled:opacity-60"
        >
          {busy ? "Opening payment…" : `Subscribe again · ₹${plan.overageRate} / month`}
        </button>
      ) : (
        <span className="opacity-80">{"Ask your organization's owner to subscribe again."}</span>
      )}
      {error && <span className="w-full text-center text-warning">{error}</span>}
    </div>
  );
};

export default LockedProjectBanner;
