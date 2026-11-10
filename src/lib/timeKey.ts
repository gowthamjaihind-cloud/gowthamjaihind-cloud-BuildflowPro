/**
 * A sortable string for a date-ish Firestore field.
 *
 * Daily-log `createdAt` (and occasionally `workDate`) is written as an ISO
 * string by every current writer, but not every document in production is: some
 * hold a Firestore Timestamp (a serverTimestamp() or an Admin SDK Date written
 * by an older path or a console edit). `(x || "").localeCompare` then throws
 * "localeCompare is not a function" -- a Timestamp is truthy -- and the whole
 * Reports tab falls over on the first such log in the window.
 *
 * Normalises to an ISO-8601 string so ISO strings and Timestamps sort together.
 */
export function timeKey(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? new Date(v).toISOString() : "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  if (typeof v === "object") {
    const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number; nanoseconds?: number };
    if (typeof o.toDate === "function") return timeKey(o.toDate());
    const s = typeof o.seconds === "number" ? o.seconds : o._seconds;
    if (typeof s === "number") return timeKey(s * 1000 + Math.floor((o.nanoseconds ?? 0) / 1e6));
  }
  return "";
}

/** Compare two date-ish values; ascending. */
export const byTime = (a: unknown, b: unknown) => timeKey(a).localeCompare(timeKey(b));

/** Daily logs, newest first: workDate desc, then createdAt desc. */
export const newestLogFirst = (
  a: { workDate?: unknown; createdAt?: unknown },
  b: { workDate?: unknown; createdAt?: unknown },
) => byTime(b.workDate, a.workDate) || byTime(b.createdAt, a.createdAt);
