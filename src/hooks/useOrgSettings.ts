import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuthStore } from "../store";
import { OrgSettings } from "../types";

// Reads/writes company tax identity on the organization doc
// (organizations/{orgId}) so both the web app and server-side functions can
// use it. The GST state code is the first two digits of the GSTIN.
export function useOrgSettings() {
  const user = useAuthStore((s) => s.user);
  const orgId = user?.currentOrgId;
  const [settings, setSettings] = useState<OrgSettings>({});
  const [members, setMembers] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, "organizations", orgId))
      .then((snap) => {
        if (cancelled) return;
        const d: any = snap.exists() ? snap.data() : {};
        setSettings({ companyName: d.companyName, gstin: d.gstin, stateCode: d.stateCode });
        setMembers(d.members || {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(load, [orgId]);

  // Membership state (see firestore.rules): an org is "claimed" once it has any
  // members; the signed-in user is a member if their uid is a key in the map.
  const isClaimed = !!members && Object.keys(members).length > 0;
  const isMember = !!(members && user && members[user.uid]);

  // One-time claim: the first person to claim an unclaimed org becomes its Owner.
  // Rules only permit this while the org has no members and only lets you add
  // yourself as Owner — so it can't be used to seize an org that's already owned.
  const claim = async () => {
    if (!orgId) throw new Error("No organization selected.");
    if (!user) throw new Error("Not signed in.");
    await setDoc(
      doc(db, "organizations", orgId),
      { members: { [user.uid]: "Owner" } },
      { merge: true },
    );
    setMembers((m) => ({ ...(m || {}), [user.uid]: "Owner" }));
  };

  const save = async (patch: Partial<OrgSettings>) => {
    if (!orgId) throw new Error("No organization selected.");
    // Keep stateCode in sync with the GSTIN prefix.
    const next: Partial<OrgSettings> = { ...patch };
    if (patch.gstin !== undefined) {
      next.gstin = patch.gstin.trim().toUpperCase();
      next.stateCode = next.gstin.slice(0, 2);
    }
    await setDoc(doc(db, "organizations", orgId), next, { merge: true });
    setSettings((s) => ({ ...s, ...next }));
  };

  return { settings, loading, save, orgId, members, isClaimed, isMember, claim };
}
