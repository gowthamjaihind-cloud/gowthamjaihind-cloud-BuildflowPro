import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "../store";
// The rule itself lives in lib/orgAccess.ts, with no imports, so it is testable
// in a node environment -- this module pulls in the zustand store, which reads
// localStorage at load time and throws before any test can be collected.
import { computeOrgAccess, GRACE_MS, type OrgAccessState } from "../lib/orgAccess";

export { computeOrgAccess, GRACE_MS };

export interface OrgAccess extends OrgAccessState {
  loading: boolean;
}

// Realtime access state for the signed-in user's current org.
export function useOrgAccess(): OrgAccess {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.currentOrgId;
  const [state, setState] = useState<OrgAccess>({ loading: true, allowed: true, isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0 });

  useEffect(() => {
    if (!orgId) {
      setState({ loading: false, allowed: true, isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0 });
      return;
    }
    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => setState({ loading: false, ...computeOrgAccess(snap.exists() ? snap.data() : {}) }),
      () => setState({ loading: false, allowed: true, isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0 }),
    );
    return unsub;
  }, [orgId]);

  return state;
}
