import { timeKey } from "./timeKey";

/**
 * Which material-issue lines are already counted by a daily log.
 *
 * A daily log's materials are consumption in their own right, and every view
 * that totals cost or consumption counts them. Saving a log ALSO writes a
 * material issue as a stock-movement record, so a view that counted both would
 * count the same steel twice. The current app tags those records ("Daily
 * Progress: <taskId>") and the views skip them.
 *
 * The retired Telegram server wrote the same kind of record WITHOUT the tag and
 * kept the log's materials in a field (`consumption`) nothing reads. Editing
 * such a log in the app saves its materials under `materials`, and the same
 * quantities then showed twice: "Issue:" and "Daily Log:".
 *
 * Matching is per LINE, not per issue. An earlier version dropped an issue only
 * when every one of its items matched, so one item spelled differently kept
 * the whole record -- matching steel lines included. Now each line is dropped
 * on its own when a daily log for the same task, on the same day, lists the
 * same material (by id, or by name ignoring case, spacing and punctuation).
 * Quantities are not compared: editing a log never rewrote its issue, and the
 * log is the one to trust. A line no log mentions is kept, so genuine and
 * legacy consumption is not lost.
 */

const idOf = (m: any): string => String(m?.materialId || m?.itemId || "");
/** "STEEL-8mm", "Steel 8 mm" and "steel_8mm" are the same material. */
export const nameKey = (m: any): string =>
  String(m?.name || m?.materialName || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Calendar day of a string or Timestamp. Legacy logs store workDate as a Timestamp. */
const dayOf = (v: unknown): string => timeKey(v).slice(0, 10);

export function isTaggedDailyLogIssue(issue: any): boolean {
  return Boolean(issue?.remarks?.startsWith?.("Daily Progress") || issue?.notes?.startsWith?.("Daily Progress"));
}

/** The days an issue may be filed under: its issue date, else its date. */
const issueDay = (issue: any): string => dayOf(issue?.issueDate || issue?.date);

/** Materials the daily logs record, indexed by task and day. */
function logIndex(logs: any[]) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const log of logs || []) {
    if (!log?.taskId || !Array.isArray(log?.materials)) continue;
    const day = dayOf(log.workDate);
    if (!day) continue;
    for (const m of log.materials) {
      const id = idOf(m);
      const name = nameKey(m);
      if (id) ids.add(`${log.taskId}|${day}|${id}`);
      if (name) names.add(`${log.taskId}|${day}|${name}`);
    }
  }
  return { ids, names };
}

function lineCovered(issue: any, m: any, ix: ReturnType<typeof logIndex>): boolean {
  const key = `${issue.taskId}|${issueDay(issue)}`;
  const id = idOf(m);
  const name = nameKey(m);
  return Boolean((id && ix.ids.has(`${key}|${id}`)) || (name && ix.names.has(`${key}|${name}`)));
}

/**
 * The issues that are consumption in their own right, each with only the lines
 * no daily log already counts. Issues left with no lines are dropped. A
 * trimmed issue's totalCost is recomputed from what remains.
 */
export function standaloneIssues<T>(issues: T[], logs: any[]): T[] {
  const ix = logIndex(logs);
  const out: T[] = [];
  for (const iss of issues as any[]) {
    if (isTaggedDailyLogIssue(iss)) continue;
    if (!iss?.taskId || !issueDay(iss)) {
      out.push(iss);
      continue;
    }
    if (Array.isArray(iss.items)) {
      const items = iss.items.filter((m: any) => !lineCovered(iss, m, ix));
      if (!items.length) continue;
      if (items.length === iss.items.length) out.push(iss);
      else
        out.push({
          ...iss,
          items,
          totalCost: items.reduce(
            (s: number, m: any) => s + (m.totalPrice ?? (m.quantity || 0) * (m.unitCost || m.unitPrice || 0)),
            0,
          ),
        });
    } else if (iss.materialId) {
      if (!lineCovered(iss, { materialId: iss.materialId, name: iss.name }, ix)) out.push(iss);
    } else {
      out.push(iss);
    }
  }
  return out;
}

/** Back-compat helper for a single issue: true when every line is a log's. */
export function isDailyLogIssue(issue: any, logs: any[]): boolean {
  return standaloneIssues([issue], logs).length === 0;
}

/**
 * Opt-in readout for when a duplicate survives: open the app with
 * ?debugIssues=1 and the console lists, per task, each issue line and whether
 * a log covers it, with the exact keys compared. Shows ids, names and dates
 * only -- no costs or people.
 */
export function debugIssueMatching(taskId: string, issues: any[], logs: any[]) {
  try {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("debugIssues")) return;
    const ix = logIndex(logs);
    const rows = (issues || [])
      .filter((i: any) => i?.taskId === taskId)
      .flatMap((iss: any) =>
        (Array.isArray(iss.items) ? iss.items : [{ materialId: iss.materialId, name: iss.name }]).map((m: any) => ({
          issue: iss.id,
          tagged: isTaggedDailyLogIssue(iss),
          day: issueDay(iss),
          id: idOf(m),
          name: nameKey(m),
          covered: lineCovered(iss, m, ix),
        })),
      );
    const logRows = (logs || [])
      .filter((l: any) => l?.taskId === taskId)
      .flatMap((l: any) =>
        (l.materials || []).map((m: any) => ({ log: l.id, day: dayOf(l.workDate), rawDay: typeof l.workDate, id: idOf(m), name: nameKey(m) })),
      );
    console.groupCollapsed(`[debugIssues] task ${taskId}`);
    console.table(rows);
    console.table(logRows);
    console.groupEnd();
  } catch {
    /* diagnostics must never break the page */
  }
}
