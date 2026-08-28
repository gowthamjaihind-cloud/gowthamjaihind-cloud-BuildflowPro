// Shared project-level metrics.
//
// These were computed inline in DashboardView. Project Insights needs the same
// figures, and two screens quoting different completion percentages for one
// project is worse than either number being slightly off — so they live here
// and both screens read from the same definition.

interface ProgressTask {
  type?: string;
  isSystemGenerated?: boolean;
  duration?: number | string;
  progress?: number | string;
}

interface RiskTask {
  isSystemGenerated?: boolean;
  endDate?: string;
  status?: string;
  isCritical?: boolean;
}

/**
 * Completion for the whole project, as a whole-number percentage.
 * Weighted by duration, so a long task counts for more than a short one.
 */
export function globalProgress(tasks: ProgressTask[]): number {
  const active = tasks.filter(
    (t) => t.type === "Task" && !t.isSystemGenerated,
  );
  if (active.length === 0) return 0;
  const totalDuration = active.reduce(
    (acc, t) => acc + (Number(t.duration) || 1),
    0,
  );
  const weighted = active.reduce(
    (acc, t) => acc + (Number(t.progress) || 0) * (Number(t.duration) || 1),
    0,
  );
  return Math.round(weighted / (totalDuration || 1));
}

/** Tasks past their end date and unfinished, or explicitly marked Delayed. */
export function tasksAtRisk(tasks: RiskTask[]): {
  count: number;
  criticalCount: number;
} {
  const valid = tasks.filter((t) => !t.isSystemGenerated);
  const today = new Date().toISOString().split("T")[0];
  const atRisk = valid.filter(
    (t) =>
      (t.endDate && t.endDate < today && t.status !== "Completed") ||
      t.status === "Delayed",
  );
  return {
    count: atRisk.length,
    criticalCount: atRisk.filter((t) => t.isCritical).length,
  };
}
