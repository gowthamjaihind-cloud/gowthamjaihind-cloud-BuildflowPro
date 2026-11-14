import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import type { CompanyProfile } from "../types";

/**
 * The company's letterhead details (address, contact, PAN, logo, standard PO
 * terms): organizations/{orgId}/profile/company. Any member can read it; only
 * an Owner or Admin can save (firestore.rules).
 */
export function useCompanyProfile() {
  const orgId = useAuthStore((s) => s.user?.currentOrgId);
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [loading, setLoading] = useState(!!orgId);

  useEffect(() => {
    if (!orgId) {
      setProfile({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDoc(doc(db, "organizations", orgId, "profile", "company"))
      .then((snap) => {
        if (!cancelled) setProfile(snap.exists() ? (snap.data() as CompanyProfile) : {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const save = async (next: CompanyProfile) => {
    if (!orgId) throw new Error("No organization selected.");
    // Whole-document write: a cleared field must actually be cleared.
    const clean = Object.fromEntries(
      Object.entries(next).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]).filter(([, v]) => v !== undefined && v !== ""),
    ) as CompanyProfile;
    await setDoc(doc(db, "organizations", orgId, "profile", "company"), clean);
    setProfile(clean);
  };

  return { profile, loading, save, orgId };
}

/** Read once, outside React (the PDF export needs it at click time). */
export async function fetchCompanyProfile(orgId: string | undefined | null): Promise<CompanyProfile> {
  if (!orgId) return {};
  try {
    const snap = await getDoc(doc(db, "organizations", orgId, "profile", "company"));
    return snap.exists() ? (snap.data() as CompanyProfile) : {};
  } catch {
    return {};
  }
}
