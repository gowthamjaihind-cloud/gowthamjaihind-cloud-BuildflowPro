// Site Engineer agent (v1): proactively finds tasks that still need today's log
// and nudges the engineer about those specifically. Tapping a task drops into
// the normal button-driven log flow (pick from master lists — no free text), so
// data integrity is preserved. Nothing is written until the user taps Save.
import { db } from "../../db";

const projPath = (orgId: any, projectId: any) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const todayISO = () => {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // Asia/Kolkata
  return now.toISOString().split("T")[0];
};

interface GapTask {
  id: string;
  name: string;
  progress: number;
  status: string;
}

// Tasks in the user's active project that look like work-in-progress but have no
// daily log for today.
export async function buildWorklist(session: any): Promise<GapTask[]> {
  if (!session?.activeProjectId) return [];
  const base = projPath(session.orgId, session.activeProjectId);
  const today = todayISO();

  const [taskSnap, logSnap] = await Promise.all([
    db.collection(`${base}/tasks`).get(),
    db.collection(`${base}/dailyLogs`).where("workDate", "==", today).get(),
  ]);

  const loggedToday = new Set(
    logSnap.docs.map((d) => d.data().taskId).filter(Boolean),
  );

  return taskSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => t.type !== "Summary" && !t.isSystemGenerated)
    .filter((t) => {
      const p = t.progress || 0;
      const active =
        t.status === "In Progress" || t.status === "Delayed" || (p > 0 && p < 100);
      return active && p < 100 && !loggedToday.has(t.id);
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      progress: t.progress || 0,
      status: t.status || "",
    }))
    .slice(0, 6);
}

// Returns true if a nudge was sent (i.e. there were gaps). Each task button
// (alog:<taskId>) opens the structured, pick-from-lists log flow.
export async function sendAgentNudge(
  tg: any,
  chatId: number,
  session: any,
): Promise<boolean> {
  const gaps = await buildWorklist(session);
  if (gaps.length === 0) return false;

  const rows = gaps.map((g) => [
    { text: `📝 ${g.name} (${g.progress}%)`, callback_data: `alog:${g.id}` },
  ]);
  rows.push([{ text: "Not today", callback_data: "xx" }]);

  await tg.sendMessage(
    chatId,
    `🌇 <b>End-of-day check-in</b>\n\n${gaps.length} task${gaps.length > 1 ? "s" : ""} still need today's update. Tap one to log it — pick from your lists, no typing except quantities.`,
    rows,
  );
  return true;
}
