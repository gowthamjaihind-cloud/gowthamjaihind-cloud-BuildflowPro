import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "../store";
import { OVERAGE_RATE } from "../lib/plans";
import { SNAPSHOT_TIMEOUT_MS } from "../lib/realtime";

export interface PendingPlanChange {
  plan: string;        // target plan the org will move to
  effectiveAt: number; // epoch ms — when the downgrade applies
}

export interface OrgPlan {
  loading: boolean;
  /**
   * True when we never heard back -- an unreachable backend, or a read that
   * errored. The caller must say so rather than render nothing: a missing
   * billing panel reads as "this account has no plan", which is worse than
   * "we could not load it".
   */
  unavailable?: boolean;
  plan?: string;                     // free | starter | growth | business | enterprise
  includedProjects?: number | null;  // null = unlimited; undefined = no cap set
  userLimit?: number | null;
  aiQuota?: number | null;
  overageRate: number;
  subscriptionStatus?: string;
  currentPeriodEnd?: number;         // epoch ms; end of the paid cycle
  pendingPlanChange?: PendingPlanChange | null; // scheduled end-of-cycle downgrade
  /** True once the customer has asked to cancel; takes effect at period end. */
  cancelAtPeriodEnd?: boolean;
}

// Realtime plan/capacity for the signed-in user's current org. Absent
// includedProjects means the org isn't on a project plan yet (no cap enforced).
export function usePlan(): OrgPlan {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.currentOrgId;
  const [state, setState] = useState<OrgPlan>({ loading: true, overageRate: OVERAGE_RATE });

  useEffect(() => {
    if (!orgId) {
      setState({ loading: false, overageRate: OVERAGE_RATE });
      return;
    }
    // See SNAPSHOT_TIMEOUT_MS: an unreachable backend calls neither callback,
    // so without this the component waits for a snapshot that never comes.
    const giveUp = setTimeout(() => {
      setState((s) => (s.loading ? { ...s, loading: false, unavailable: true } : s));
    }, SNAPSHOT_TIMEOUT_MS);

    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => {
        clearTimeout(giveUp);
        const d: any = snap.exists() ? snap.data() : {};
        setState({
          loading: false,
          unavailable: false,
          plan: d.plan,
          includedProjects: d.includedProjects,
          userLimit: d.userLimit,
          aiQuota: d.aiQuota,
          overageRate: Number(d.overageRate) || OVERAGE_RATE,
          subscriptionStatus: d.subscriptionStatus,
          currentPeriodEnd: typeof d.currentPeriodEnd === "number" ? d.currentPeriodEnd : undefined,
          pendingPlanChange: d.pendingPlanChange || null,
          cancelAtPeriodEnd: d.cancelAtPeriodEnd === true,
        });
      },
      () => {
        clearTimeout(giveUp);
        // A read that errors is also "we could not load your plan" -- the panel
        // must explain itself rather than quietly disappear.
        setState({ loading: false, unavailable: true, overageRate: OVERAGE_RATE });
      },
    );
    return () => {
      clearTimeout(giveUp);
      unsub();
    };
  }, [orgId]);

  return state;
}
