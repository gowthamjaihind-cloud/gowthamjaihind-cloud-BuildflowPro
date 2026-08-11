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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, "organizations", orgId))
      .then((snap) => {
        if (cancelled) return;
        const d: any = snap.exists() ? snap.data() : {};
        setSettings({ companyName: d.companyName, gstin: d.gstin, stateCode: d.stateCode });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

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

  return { settings, loading, save, orgId };
}
