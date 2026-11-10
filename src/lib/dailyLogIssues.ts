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

const itemId = (m: any): string => String(m?.materialId || m?.itemId || "");

export function isTaggedDailyLogIssue(issue: any): boolean {
  return Boolean(issue?.remarks?.startsWith?.("Daily Progress") || issue?.notes?.startsWith?.("Daily Progress"));
}

export function isDailyLogIssue(issue: any, logs: any[]): boolean {
  if (isTaggedDailyLogIssue(issue)) return true;
  const date = issue?.issueDate || issue?.date;
  if (!issue?.taskId || !date) return false;
  const ids = Array.isArray(issue.items) ? issue.items.map(itemId) : issue.materialId ? [String(issue.materialId)] : [];
  if (!ids.length || ids.some((id: string) => !id)) return false;
  return logs.some((log) => {
    if (log?.taskId !== issue.taskId || log?.workDate !== date || !Array.isArray(log?.materials)) return false;
    const have = new Set(log.materials.map(itemId));
    return ids.every((id: string) => have.has(id));
  });
}

/** The issues that are consumption in their own right, not a daily log's record. */
export function standaloneIssues<T>(issues: T[], logs: any[]): T[] {
  return issues.filter((iss) => !isDailyLogIssue(iss, logs));
}
