import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "../store";
import { OVERAGE_RATE } from "../lib/plans";

export interface OrgPlan {
  loading: boolean;
  plan?: string;                     // free | starter | growth | business | enterprise
  includedProjects?: number | null;  // null = unlimited; undefined = no cap set
  userLimit?: number | null;
  aiQuota?: number | null;
  overageRate: number;
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
    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => {
        const d: any = snap.exists() ? snap.data() : {};
        setState({
          loading: false,
          plan: d.plan,
          includedProjects: d.includedProjects,
          userLimit: d.userLimit,
          aiQuota: d.aiQuota,
          overageRate: Number(d.overageRate) || OVERAGE_RATE,
        });
      },
      () => setState({ loading: false, overageRate: OVERAGE_RATE }),
    );
    return unsub;
  }, [orgId]);

  return state;
}
