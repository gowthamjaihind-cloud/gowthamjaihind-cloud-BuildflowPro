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
import { InventoryItem } from "../types";

// Organisation material master.
//
// This holds an item's DEFINITION — what the thing IS: name, code, unit,
// category, HSN and GST rate, plus an indicative rate for reference.
//
// It deliberately does NOT hold stock. Fifty bags of cement exist at a site,
// at a landed cost particular to that site, so quantity and avgUnitCost stay
// in each project's `inventory` collection. Adding a master to a project
// COPIES the definition and opens the stock at zero, which also means editing
// a master later can never rewrite a historical purchase order.

export interface MasterMaterial {
  id: string;
  name: string;
  code?: string;          // your own item code
  category: string;       // Material / Consumable / Tool …
  unit: string;           // MT, Bag, Nos, Cum …
  hsn?: string;           // HSN/SAC for GST
  gstRate?: number;       // 5 / 12 / 18 / 28
  indicativeRate?: number; // reference only; never used as an actual cost
  minThreshold?: number;
  notes?: string;
  createdAt: string;
  createdByUid: string;
}

function mastersPath(): string | null {
  const orgId = useAuthStore.getState().user?.currentOrgId;
  return orgId ? `organizations/${orgId}/materials` : null;
}

export async function listMasterMaterials(): Promise<MasterMaterial[]> {
  const path = mastersPath();
  if (!path) return [];
  try {
    const snap = await getDocs(query(collection(db, path), orderBy("name")));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    return [];
  }
}

/** Normalised key for spotting the same item entered twice. */
export function materialKey(m: { name?: string; code?: string }): string {
  const code = (m.code || "").trim().toUpperCase();
  if (code) return `code:${code}`;
  return `name:${(m.name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function findDuplicateMaterials(
  candidate: { name?: string; code?: string },
  masters: MasterMaterial[],
): MasterMaterial[] {
  const key = materialKey(candidate);
  return masters.filter((m) => materialKey(m) === key);
}

export async function saveMasterMaterial(
  input: Omit<MasterMaterial, "id" | "createdAt" | "createdByUid">,
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

export async function deleteMasterMaterial(id: string): Promise<void> {
  const path = mastersPath();
  if (!path) return;
  await deleteDoc(doc(db, path, id));
}

/**
 * The project stock record for a master. Copies the definition and opens the
 * stock at zero — the project owns its own quantity and landed cost from here.
 * `masterMaterialId` records the link so the UI can show it.
 */
export function toProjectInventoryItem(
  master: MasterMaterial,
  projectId: string,
): Omit<InventoryItem, "id"> & { masterMaterialId: string; hsn?: string; gstRate?: number } {
  return {
    projectId,
    masterMaterialId: master.id,
    materialId: master.code || master.id,
    name: master.name,
    category: master.category || "Material",
    code: master.code || "",
    hsn: master.hsn,
    gstRate: master.gstRate,
    quantity: 0,
    unit: master.unit || "Nos",
    // Indicative only — the real landed cost comes from goods receipts.
    unitCost: master.indicativeRate || 0,
    minThreshold: master.minThreshold ?? 0,
  };
}
