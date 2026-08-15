import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { useAuthStore } from "../store";

export interface OrgOption { orgId: string; name: string; }

// Lists every organization the signed-in user belongs to (from users/{uid}.orgIds,
// falling back to their currentOrgId) and lets them switch the active one.
// Self-heals older accounts that predate orgIds by folding in currentOrgId.
export function useMyOrgs() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid;
  const currentOrgId = user?.currentOrgId;
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Ensure currentOrgId is recorded in orgIds (backfill for pre-switcher users).
  useEffect(() => {
    if (!uid || !currentOrgId) return;
    const ids = user?.orgIds || [];
    if (!ids.includes(currentOrgId)) {
      updateDoc(doc(db, "users", uid), { orgIds: arrayUnion(currentOrgId) }).catch(() => {});
    }
  }, [uid, currentOrgId, user?.orgIds]);

  useEffect(() => {
    const ids = Array.from(new Set([...(user?.orgIds || []), ...(currentOrgId ? [currentOrgId] : [])]));
    if (!ids.length) {
      setOrgs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      ids.map(async (orgId) => {
        try {
          const snap = await getDoc(doc(db, "organizations", orgId));
          return { orgId, name: (snap.exists() ? (snap.data() as any).companyName : "") || "Organization" };
        } catch {
          return null;
        }
      }),
    )
      .then((rows) => {
        if (!cancelled) setOrgs(rows.filter(Boolean) as OrgOption[]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, currentOrgId, (user?.orgIds || []).join(",")]);

  // Switch the active org: write currentOrgId on the user doc, then reload so
  // all org-scoped queries/state reset cleanly to the new tenant.
  const switchTo = async (orgId: string) => {
    if (!uid || orgId === currentOrgId) return;
    setSwitching(true);
    try {
      await updateDoc(doc(db, "users", uid), { currentOrgId: orgId });
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  };

  return { orgs, currentOrgId, loading, switching, switchTo };
}
