import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuthStore } from "../store";
import { SubscriptionStatus } from "../types";

export interface OrgAccess {
  loading: boolean;
  allowed: boolean;              // may the org use the app right now?
  status?: SubscriptionStatus;   // undefined = grandfathered
  isTrial: boolean;
  daysLeft: number;              // days remaining in trial (0 if not trialing)
  reason?: "trial_expired" | "past_due" | "canceled" | "expired";
  companyName?: string;
}

const DAY = 24 * 60 * 60 * 1000;

// Pure lifecycle logic (see functions/src/billing.ts). Orgs with no
// subscriptionStatus are grandfathered — always allowed — so the operator org
// and any pre-billing org are never locked out.
export function computeOrgAccess(data: any, now = Date.now()): Omit<OrgAccess, "loading"> {
  const status: SubscriptionStatus | undefined = data?.subscriptionStatus;
  const companyName = data?.companyName;
  if (!status || status === "active" || status === "internal") {
    return { allowed: true, status, isTrial: false, daysLeft: 0, companyName };
  }
  if (status === "trialing") {
    const ends = Number(data?.trialEndsAt) || 0;
    if (now < ends) {
      return { allowed: true, status, isTrial: true, daysLeft: Math.ceil((ends - now) / DAY), companyName };
    }
    return { allowed: false, status, isTrial: true, daysLeft: 0, reason: "trial_expired", companyName };
  }
  // past_due | canceled | expired
  return { allowed: false, status, isTrial: false, daysLeft: 0, reason: status as any, companyName };
}

// Realtime access state for the signed-in user's current org.
export function useOrgAccess(): OrgAccess {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.currentOrgId;
  const [state, setState] = useState<OrgAccess>({ loading: true, allowed: true, isTrial: false, daysLeft: 0 });

  useEffect(() => {
    if (!orgId) {
      setState({ loading: false, allowed: true, isTrial: false, daysLeft: 0 });
      return;
    }
    const unsub = onSnapshot(
      doc(db, "organizations", orgId),
      (snap) => setState({ loading: false, ...computeOrgAccess(snap.exists() ? snap.data() : {}) }),
      () => setState({ loading: false, allowed: true, isTrial: false, daysLeft: 0 }),
    );
    return unsub;
  }, [orgId]);

  return state;
}
