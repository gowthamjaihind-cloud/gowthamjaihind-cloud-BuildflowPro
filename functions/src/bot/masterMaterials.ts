/**
 * Materials from the company's Master data that the project does not stock yet.
 *
 * The bot used to match a site message only against the project's Inventory,
 * so "Big jalli 3 units" came back unmatched whenever Big jalli lived in
 * Master data but had not been added to this project ("Inventory -> From
 * master"). Now those masters are offered to the model too, under an id with
 * MASTER_PREFIX; on Save the material is added to the project exactly as the
 * app's From master button does (src/services/masterMaterialService.ts,
 * toProjectInventoryItem), and the log points at the new inventory item.
 *
 * Pure: no Firestore, so it is unit-tested. The Firestore half is in
 * telegram/handlers/masterMaterials.ts.
 */

export const MASTER_PREFIX = "master:";

export interface MasterRow {
  id: string;
  name?: string;
  code?: string;
  category?: string;
  unit?: string;
  hsn?: string;
  gstRate?: number;
  indicativeRate?: number;
  minThreshold?: number;
}

export interface InventoryRow {
  id: string;
  name?: string;
  masterMaterialId?: string;
}

const key = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Masters the project does not already stock (by link or by the same name). */
export function mastersNotInProject(masters: MasterRow[], inventory: InventoryRow[]): MasterRow[] {
  const linked = new Set(inventory.map((i) => String(i.masterMaterialId || "")).filter(Boolean));
  const names = new Set(inventory.map((i) => key(i.name)).filter(Boolean));
  return masters.filter((m) => key(m.name) && !linked.has(m.id) && !names.has(key(m.name)));
}

export const isMasterId = (id: unknown) => String(id ?? "").startsWith(MASTER_PREFIX);
export const masterIdOf = (id: string) => id.slice(MASTER_PREFIX.length);

/** The project's inventory item for a master: the same fields as the app's From master. */
export function inventoryItemFromMaster(master: MasterRow, projectId: string) {
  return {
    projectId,
    masterMaterialId: master.id,
    materialId: master.code || master.id,
    name: String(master.name || ""),
    category: master.category || "Material",
    code: master.code || "",
    ...(master.hsn ? { hsn: master.hsn } : {}),
    ...(typeof master.gstRate === "number" ? { gstRate: master.gstRate } : {}),
    quantity: 0,
    openingQty: 0,
    unit: master.unit || "Nos",
    // Indicative only; the real landed cost comes from goods receipts.
    unitCost: Number(master.indicativeRate) || 0,
    minThreshold: Number(master.minThreshold) || 0,
    addedVia: "telegram",
  };
}
