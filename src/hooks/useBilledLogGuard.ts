import { useProjectData } from "./useProjectData";
import { confirmDialog } from "../lib/feedback";
import { billsForDailyLog } from "../lib/raReconcile";
import type { DailyLogEntry, RABill } from "../types";

/**
 * Before a daily log that is on a certified RA bill is changed or deleted,
 * say so and what happens next. Returns false if the user backs out.
 *
 * Bills certified with recorded amounts (lib/raReconcile.ts) settle the
 * difference on the contractor's next RA bill; older bills cannot, so the
 * message says to sort it out with the contractor. Roles that do not see money
 * cannot read RA bills, so for them this never asks (the reconciliation on the
 * next bill still happens).
 */
export function useBilledLogGuard(projectId: string) {
  const { data: raBills = [] } = useProjectData<RABill>(projectId, "ra_bills");

  return async (log: Pick<DailyLogEntry, "id">, action: "edit" | "delete"): Promise<boolean> => {
    const bills = billsForDailyLog(log.id, raBills);
    if (bills.length === 0) return true;
    const names = bills.map((b) => b.billNumber).join(", ");
    const tracked = bills.every((b) => b.logAmounts && Object.keys(b.logAmounts).some((id) => id.startsWith(`${log.id}_`)));
    const next = tracked
      ? action === "delete"
        ? "Its labour will be deducted on the contractor's next RA bill. If the same day's work is entered again, it will not be billed a second time."
        : "If you change the labour, the difference will be added to or deducted from the contractor's next RA bill."
      : action === "delete"
        ? "That bill was certified before adjustments were tracked, so its amount will not be deducted automatically: settle it with the contractor. Entering the same day's work again will not be billed a second time."
        : "That bill was certified before adjustments were tracked, so a change in labour will not reach any bill: settle the difference with the contractor.";
    return confirmDialog({
      title: action === "delete" ? "This log is on a certified RA bill" : "This log is on a certified RA bill",
      body: `It was billed on ${names}.\n\n${next}`,
      confirmLabel: action === "delete" ? "Delete anyway" : "Save anyway",
      cancelLabel: "Go back",
    });
  };
}
