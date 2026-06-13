import { DailyLogEntry } from "../types";

export interface AggregateStats {
  totalLabor: number;
  materialsRollup: { name: string; unit: string; count: number }[];
  laborByRole: { roleName: string; count: number }[];
}

export function aggregateLogs(logs: DailyLogEntry[]): AggregateStats {
  let labor = 0;
  const materialMap = new Map<string, { count: number; name: string; unit: string }>();
  const roleMap = new Map<string, { count: number; roleName: string }>();

  logs.forEach(log => {
    log.labour.forEach(l => {
      labor += l.headcount;
      const existingRole = roleMap.get(l.roleId) || { count: 0, roleName: l.roleName };
      existingRole.count += l.headcount;
      roleMap.set(l.roleId, existingRole);
    });
    log.materials.forEach(m => {
      const existingMat = materialMap.get(m.materialId) || { count: 0, name: m.name, unit: m.unit };
      existingMat.count += (m.quantity || 0);
      materialMap.set(m.materialId, existingMat);
    });
  });

  return {
    totalLabor: labor,
    materialsRollup: Array.from(materialMap.values()),
    laborByRole: Array.from(roleMap.values())
  };
}
