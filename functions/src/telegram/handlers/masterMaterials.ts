import { db } from "../../db";
import { inventoryItemFromMaster, isMasterId, masterIdOf, type MasterRow } from "../../bot/masterMaterials";

/**
 * On Save: every material picked from Master data becomes the project's own
 * inventory item (or the one someone added meanwhile), and the log points at
 * it. A master deleted since the message was read is left out rather than
 * written as a dangling id. See bot/masterMaterials.ts.
 */
export async function resolveMasterMaterials<T extends { materialId: string }>(base: string, projectId: string, materials: T[]): Promise<T[]> {
  const orgPath = base.includes("/projects/") ? base.slice(0, base.indexOf("/projects/")) : null;
  const out: T[] = [];
  for (const m of materials) {
    if (!isMasterId(m.materialId)) {
      out.push(m);
      continue;
    }
    if (!orgPath) continue;
    const masterId = masterIdOf(m.materialId);
    const inv = db.collection(`${base}/inventory`);
    const existing = await inv.where("masterMaterialId", "==", masterId).limit(1).get();
    let invId: string;
    if (!existing.empty) {
      invId = existing.docs[0].id;
    } else {
      const snap = await db.doc(`${orgPath}/materials/${masterId}`).get();
      if (!snap.exists) continue;
      const ref = await inv.add(inventoryItemFromMaster({ id: masterId, ...(snap.data() as Omit<MasterRow, "id">) }, projectId));
      invId = ref.id;
    }
    out.push({ ...m, materialId: invId });
  }
  return out;
}
