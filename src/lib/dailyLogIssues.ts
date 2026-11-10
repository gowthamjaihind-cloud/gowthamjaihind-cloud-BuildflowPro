/**
 * Which material issues are already counted by a daily log.
 *
 * A daily log's materials are consumption in their own right, and every view
 * that totals cost or consumption counts them. Saving a log ALSO writes a
 * material issue as a stock-movement record, so a view that counted both would
 * count the same steel twice. The current app tags those records ("Daily
 * Progress: <taskId>") and the views skip them.
 *
 * The old Telegram server (server.ts, retired) wrote the same kind of record
 * WITHOUT the tag, and kept the log's materials in a field called
 * `consumption` that nothing reads. So those logs showed only their "Issue:"
 * rows -- until someone edited one in the app, which saves the materials under
 * `materials`, and the same quantities then appeared twice: once as "Issue:",
 * once as "Daily Log:".
 *
 * An untagged issue is therefore treated as a log's own record when a daily log
 * exists for the same task on the same date whose materials cover every item
 * in the issue. Quantities are deliberately NOT compared: editing a log changes
 * its quantities but never rewrote the issue, and the log is the one to trust.
 */

import { timeKey } from "./timeKey";

const itemId = (m: any): string => String(m?.materialId || m?.itemId || "");
const itemName = (m: any): string =>
  String(m?.name || m?.materialName || "").trim().toLowerCase().replace(/\s+/g, " ");
/**
 * The calendar day of a date-ish value. Legacy logs carry workDate as a
 * Firestore Timestamp (the cost breakdown has always had a branch for it), so
 * comparing raw values missed exactly the logs this file exists for.
 */
const dayOf = (v: unknown): string => timeKey(v).slice(0, 10);

export function isTaggedDailyLogIssue(issue: any): boolean {
  return Boolean(issue?.remarks?.startsWith?.("Daily Progress") || issue?.notes?.startsWith?.("Daily Progress"));
}

export function isDailyLogIssue(issue: any, logs: any[]): boolean {
  if (isTaggedDailyLogIssue(issue)) return true;
  const day = dayOf(issue?.issueDate || issue?.date);
  if (!issue?.taskId || !day) return false;
  const items: any[] = Array.isArray(issue.items)
    ? issue.items
    : issue.materialId
      ? [{ materialId: issue.materialId, name: issue.name }]
      : [];
  if (!items.length) return false;
  return logs.some((log) => {
    if (log?.taskId !== issue.taskId || dayOf(log?.workDate) !== day || !Array.isArray(log?.materials)) return false;
    // By id first; by name where the ids differ or are missing, because the
    // retired server keyed items by whatever its session held, not always the
    // inventory id the app writes.
    const ids = new Set(log.materials.map(itemId).filter(Boolean));
    const names = new Set(log.materials.map(itemName).filter(Boolean));
    return items.every((m) => {
      const id = itemId(m);
      const name = itemName(m);
      return (id && ids.has(id)) || (name && names.has(name));
    });
  });
}

/** The issues that are consumption in their own right, not a daily log's record. */
export function standaloneIssues<T>(issues: T[], logs: any[]): T[] {
  return issues.filter((iss) => !isDailyLogIssue(iss, logs));
}
