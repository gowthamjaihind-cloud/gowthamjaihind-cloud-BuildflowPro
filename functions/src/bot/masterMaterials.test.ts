import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MASTER_PREFIX, inventoryItemFromMaster, isMasterId, masterIdOf, mastersNotInProject } from "./masterMaterials";
import { sanitizeAiLog, type AiLogContext } from "./aiLog";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("materials from Master data", () => {
  const masters = [
    { id: "mBig", name: "Big jalli", unit: "Unit", code: "AGG40", hsn: "2517", gstRate: 5, indicativeRate: 3200 },
    { id: "mCem", name: "OPC 53 Cement", unit: "Bag" },
    { id: "mSteel", name: "Steel 8mm", unit: "kg" },
  ];
  const inventory = [
    { id: "i1", name: "opc 53  cement" }, // same material, typed differently
    { id: "i2", name: "Something else", masterMaterialId: "mSteel" }, // linked already
  ];

  it("offers only masters the project does not already stock", () => {
    expect(mastersNotInProject(masters, inventory).map((m) => m.id)).toEqual(["mBig"]);
  });

  it("adds a master to the project the way the app's From master does", () => {
    expect(inventoryItemFromMaster(masters[0], "p1")).toEqual({
      projectId: "p1", masterMaterialId: "mBig", materialId: "AGG40", name: "Big jalli", category: "Material",
      code: "AGG40", hsn: "2517", gstRate: 5, quantity: 0, openingQty: 0, unit: "Unit", unitCost: 3200, minThreshold: 0, addedVia: "telegram",
    });
  });

  it("lets the model pick a master, and keeps its marked id for Save to resolve", () => {
    const ctx: AiLogContext = {
      tasks: [{ id: "t1", name: "RCC for Footing", progress: 50 }],
      materials: [{ id: `${MASTER_PREFIX}mBig`, name: "Big jalli", unit: "Unit" }],
      roles: [], equipment: [],
    };
    const r = sanitizeAiLog({ intent: "daily_log", taskId: "t1", materials: [{ materialId: `${MASTER_PREFIX}mBig`, quantity: 3 }] }, ctx);
    if (r.kind !== "log") throw new Error("expected a log");
    expect(r.draft.materials).toEqual([{ materialId: "master:mBig", name: "Big jalli", unit: "Unit", quantity: 3 }]);
    expect(isMasterId(r.draft.materials[0].materialId)).toBe(true);
    expect(masterIdOf(r.draft.materials[0].materialId)).toBe("mBig");
  });

  it("is resolved before the bot writes a daily log", () => {
    const src = readFileSync(join(HERE, "../telegram/handlers/log.ts"), "utf8");
    const save = src.slice(src.indexOf("export async function saveLog"));
    expect(save.indexOf("resolveMasterMaterials(")).toBeGreaterThan(-1);
    expect(save.indexOf("resolveMasterMaterials(")).toBeLessThan(save.indexOf("dailyLogs`).doc("));
    expect(save).toMatch(/\n\s+materials,\n/);
  });
});
