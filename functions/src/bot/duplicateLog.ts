/**
 * Daily logs already saved for the same task on the same work day.
 *
 * A second log for a task on a day is usually the same report sent twice (two
 * engineers, or the bot and the app). It is still allowed, since a long day
 * can need two entries, but the person saving is told first.
 * Mirrors src/lib/duplicateLog.ts in the web app.
 */
export interface LogLike {
  id?: string;
  taskId?: unknown;
  workDate?: unknown;
  progressPercent?: unknown;
  createdByName?: unknown;
  createdVia?: unknown;
  createdAt?: unknown;
}

export function sameDayLogs<T extends LogLike>(logs: T[], taskId: string, workDate: string, excludeId?: string): T[] {
  if (!taskId || !workDate) return [];
  return logs
    .filter((l) => l && String(l.taskId) === taskId && String(l.workDate || "").slice(0, 10) === workDate.slice(0, 10) && (!excludeId || l.id !== excludeId))
    .sort((a, b) => timeKey(b.createdAt).localeCompare(timeKey(a.createdAt)));
}

/** "Ravi via Telegram" / "the app": who saved the earlier log, for the warning. */
export function whoSaved(l: LogLike): string {
  const name = String(l.createdByName || "").trim();
  const via = l.createdVia === "telegram" ? "Telegram" : l.createdVia === "whatsapp" ? "WhatsApp" : "the app";
  // The bot falls back to an email address as a name: show only the part before @.
  const shown = name && name !== "Telegram Bot" ? name.split("@")[0] : "";
  return shown ? `${shown} via ${via}` : via;
}

/** ISO string for an ISO string or a Firestore Timestamp; mirrors src/lib/timeKey.ts. */
function timeKey(v: unknown): string {
  if (typeof v === "string") return v;
  const o = v as { toDate?: () => Date; seconds?: number; _seconds?: number } | null;
  if (o && typeof o.toDate === "function") return o.toDate().toISOString();
  const secs = o ? (o.seconds ?? o._seconds) : undefined;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : "";
}
