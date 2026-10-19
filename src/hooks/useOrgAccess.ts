import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "../store";
// The rule itself lives in lib/orgAccess.ts, with no imports, so it is testable
// in a node environment -- this module pulls in the zustand store, which reads
// localStorage at load time and throws before any test can be collected.
import { computeOrgAccess, GRACE_MS, type OrgAccessState } from "../lib/orgAccess";
import { SNAPSHOT_TIMEOUT_MS } from "../lib/realtime";

export { computeOrgAccess, GRACE_MS };

export interface OrgAccess extends OrgAccessState {
  loading: boolean;
  /** True when we never heard back. Access still fails OPEN -- see below. */
  unavailable?: boolean;
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
    // See SNAPSHOT_TIMEOUT_MS. Note what this falls back TO: allowed. Locking a
    // paying customer out of their own workspace because their connection
    // dropped is far worse than briefly letting a lapsed one in, and the server
    // is the real gate either way -- rules and callables still refuse.
    const giveUp = setTimeout(() => {
      setState((s) =>
        s.loading
          ? { loading: false, unavailable: true, allowed: true, isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0 }
          : s,
      );
    }, SNAPSHOT_TIMEOUT_MS);

    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => {
        clearTimeout(giveUp);
        setState({ loading: false, unavailable: false, ...computeOrgAccess(snap.exists() ? snap.data() : {}) });
      },
      () => {
        clearTimeout(giveUp);
        setState({ loading: false, unavailable: true, allowed: true, isTrial: false, daysLeft: 0, inGrace: false, graceDaysLeft: 0 });
      },
    );
    return () => {
      clearTimeout(giveUp);
      unsub();
    };
  }, [orgId]);

  return state;
}
