/**
 * Progress of a summary task, from its children. Pure.
 *
 * A summary task ("Substructure") has no daily logs of its own, so its progress
 * stayed at 0% while every task under it was finished, and the Gantt and WBS
 * showed a completed phase as not started. It is the duration-weighted average
 * of its children: a 12-day pour counts for more than a 1-day milestone.
 */
export interface ChildProgress {
  progress?: unknown;
  duration?: unknown;
}

export function summaryProgress(children: ChildProgress[]): number {
  let weight = 0;
  let done = 0;
  for (const c of children) {
    const w = Math.max(1, Number(c.duration) || 0);
    const p = Math.min(100, Math.max(0, Number(c.progress) || 0));
    weight += w;
    done += w * p;
  }
  return weight > 0 ? Math.round(done / weight) : 0;
}

/** Status a summary shows for a given rolled-up progress, keeping manual holds. */
export function summaryStatus(progress: number, current: unknown): string {
  if (current === "On Hold" || current === "Delayed") return String(current);
  if (progress >= 100) return "Completed";
  if (progress > 0) return "In Progress";
  return "Pending";
}
