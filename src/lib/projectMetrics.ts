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
  startDate?: string;
  endDate?: string;
  status?: string;
  isCritical?: boolean;
  progress?: number | string;
}

/**
 * How far through its own window a task should be by now, 0-100.
 *
 * This is the shared definition of "behind": actual progress measured against
 * elapsed time, not against a fixed threshold. The phase timeline used to call
 * a phase behind schedule whenever progress was under 30%, which flagged a
 * phase that had barely started and said nothing about whether it was late.
 * With one definition, the dashboard KPI and the phase labels can no longer
 * contradict each other.
 */
export function expectedProgress(
  startDate?: string,
  endDate?: string,
  now: number = Date.now(),
): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (now < start) return 0;
  return Math.min(100, ((now - start) / (end - start)) * 100);
}

/** Points of slippage tolerated before something is called behind. */
export const SLIP_TOLERANCE = 10;

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

/**
 * Tasks that are late: past their end date and unfinished, explicitly marked
 * Delayed, or materially behind where they should be by now.
 *
 * The third case is what stops the dashboard reading "0 at risk" while a phase
 * below it is labelled behind schedule -- both now measure progress against
 * elapsed time.
 */
export function tasksAtRisk(tasks: RiskTask[]): {
  count: number;
  criticalCount: number;
} {
  const valid = tasks.filter((t) => !t.isSystemGenerated);
  const today = new Date().toISOString().split("T")[0];
  const atRisk = valid.filter((t) => {
    if (t.status === "Completed") return false;
    if (t.status === "Delayed") return true;
    if (t.endDate && t.endDate < today) return true;
    const expected = expectedProgress(t.startDate, t.endDate);
    if (expected === null) return false;
    return (Number(t.progress) || 0) + SLIP_TOLERANCE < expected;
  });
  return {
    count: atRisk.length,
    criticalCount: atRisk.filter((t) => t.isCritical).length,
  };
}
