import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { Vendor } from "../types";

// Organisation vendor master.
//
// This holds a supplier's DEFINITION only — who they are, not what you owe
// them. Balances, ledgers, purchase orders and goods receipts remain
// project-scoped and are untouched by this collection.
//
// A project vendor is created by COPYING a master into the project's
// `suppliers` collection. That is deliberate: the existing GRN and ledger
// transactions mutate the project vendor document, and a snapshot also means
// correcting a master later never rewrites historical purchase orders.

export interface MasterVendor {
  id: string;
  name: string;
  type: "Material" | "Labor" | "Both";
  gstin?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
  notes?: string;
  createdAt: string;
  createdByUid: string;
}

function mastersPath(): string | null {
  const orgId = useAuthStore.getState().user?.currentOrgId;
  return orgId ? `organizations/${orgId}/vendors` : null;
}

export async function listMasterVendors(): Promise<MasterVendor[]> {
  const path = mastersPath();
  if (!path) return [];
  try {
    const snap = await getDocs(query(collection(db, path), orderBy("name")));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // Never block the vendor screen because the master failed to load.
    return [];
  }
}

/** Normalised key for spotting the same supplier entered twice. */
export function vendorKey(v: { name?: string; gstin?: string }): string {
  const gst = (v.gstin || "").replace(/\s/g, "").toUpperCase();
  if (gst) return `gst:${gst}`;
  return `name:${(v.name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** Existing masters that look like the same supplier as `candidate`. */
export function findDuplicates(
  candidate: { name?: string; gstin?: string },
  masters: MasterVendor[],
): MasterVendor[] {
  const key = vendorKey(candidate);
  return masters.filter((m) => vendorKey(m) === key);
}

export async function saveMasterVendor(
  input: Omit<MasterVendor, "id" | "createdAt" | "createdByUid">,
  existingId?: string,
): Promise<string> {
  const path = mastersPath();
  if (!path) throw new Error("No organisation selected.");
  const user = useAuthStore.getState().user;
  const ref = existingId ? doc(db, path, existingId) : doc(collection(db, path));
  await setDoc(
    ref,
    {
      ...input,
      name: (input.name || "").trim(),
      createdAt: new Date().toISOString(),
      createdByUid: user?.uid || "",
    },
    { merge: true },
  );
  return ref.id;
}

export async function deleteMasterVendor(id: string): Promise<void> {
  const path = mastersPath();
  if (!path) return;
  await deleteDoc(doc(db, path, id));
}

/**
 * The project-vendor payload for a master. Copies the definition and starts a
 * fresh balance — the project owns its own ledger from here on. `masterVendorId`
 * records where it came from, so the UI can show it is linked.
 */
export function toProjectVendor(
  master: MasterVendor,
  projectId: string,
): Omit<Vendor, "id"> & { masterVendorId: string; gstin?: string } {
  return {
    projectId,
    masterVendorId: master.id,
    name: master.name,
    type: master.type,
    gstin: master.gstin,
    contactPerson: master.contactPerson || "",
    email: master.email || "",
    phone: master.phone || "",
    address: master.address || "",
    outstandingBalance: 0,
  };
}
