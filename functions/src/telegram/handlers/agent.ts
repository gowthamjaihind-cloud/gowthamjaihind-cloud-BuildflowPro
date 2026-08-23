// Site Engineer agent (v1): a two-touch daily loop.
//   • 10 AM — "plan the day": the engineer taps which tasks they'll work on.
//   • 5 PM  — "actuals": nudges about tasks (planned or in-progress) that still
//              have no log today, dropping into the button-driven log flow.
// Everything is pick-from-lists (no free text beyond quantities), so data
// integrity is preserved. Nothing is written until the user confirms.
import { setSession } from "../session";
import { db } from "../../db";
import { tt, normalizeLang, type BotLang } from "../i18n";

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
  planned: boolean;
}

// ---------------------------------------------------------------------------
// 5 PM — actuals worklist
// ---------------------------------------------------------------------------

// Tasks that still need today's log: anything planned this morning OR looks like
// work-in-progress, minus what's already logged today. Planned tasks sort first.
export async function buildWorklist(session: any): Promise<GapTask[]> {
  if (!session?.activeProjectId) return [];
  const base = projPath(session.orgId, session.activeProjectId);
  const today = todayISO();

  const [taskSnap, logSnap, planSnap] = await Promise.all([
    db.collection(`${base}/tasks`).get(),
    db.collection(`${base}/dailyLogs`).where("workDate", "==", today).get(),
    db.doc(`${base}/dailyPlans/${today}`).get(),
  ]);

  const loggedToday = new Set(
    logSnap.docs.map((d) => d.data().taskId).filter(Boolean),
  );
  const plannedIds = new Set<string>(
    planSnap.exists ? planSnap.data()!.plannedTaskIds || [] : [],
  );

  return taskSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => t.type !== "Summary" && !t.isSystemGenerated)
    .filter((t) => {
      const p = t.progress || 0;
      const active =
        t.status === "In Progress" || t.status === "Delayed" || (p > 0 && p < 100);
      return (active || plannedIds.has(t.id)) && p < 100 && !loggedToday.has(t.id);
    })
    .map((t) => ({
      id: t.id,
      name: t.name,
      progress: t.progress || 0,
      status: t.status || "",
      planned: plannedIds.has(t.id),
    }))
    .sort((a, b) => Number(b.planned) - Number(a.planned))
    .slice(0, 8);
}

// Returns true if a nudge was sent. Each task button (alog:<taskId>) opens the
// structured, pick-from-lists log flow.
export async function sendAgentNudge(
  tg: any,
  chatId: number,
  session: any,
): Promise<boolean> {
  const lang = normalizeLang(session?.lang);
  const gaps = await buildWorklist(session);
  if (gaps.length === 0) return false;

  const rows = gaps.map((g) => [
    {
      text: `${g.planned ? "⭐ " : "📝 "}${g.name} (${g.progress}%)`,
      callback_data: `alog:${g.id}`,
    },
  ]);
  rows.push([{ text: tt(lang, "btnNotToday"), callback_data: "xx" }]);

  const anyPlanned = gaps.some((g) => g.planned);
  const text =
    tt(lang, "agentNudge", { n: gaps.length }) +
    (anyPlanned ? tt(lang, "agentPlannedLegend") : "");
  await tg.sendMessage(chatId, text, rows);
  return true;
}

// ---------------------------------------------------------------------------
// 10 AM — plan the day
// ---------------------------------------------------------------------------

interface PlanCandidate {
  id: string;
  name: string;
  progress: number;
}

// Tasks a plan could include: not-complete leaf tasks (in-progress first, then
// pending), capped so the keyboard stays tappable.
export async function candidateTasks(session: any): Promise<PlanCandidate[]> {
  if (!session?.activeProjectId) return [];
  const base = projPath(session.orgId, session.activeProjectId);
  const snap = await db.collection(`${base}/tasks`).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => t.type !== "Summary" && !t.isSystemGenerated && (t.progress || 0) < 100)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 10)
    .map((t) => ({ id: t.id, name: t.name, progress: t.progress || 0 }));
}

function rank(t: any): number {
  if (t.status === "In Progress" || t.status === "Delayed") return 0;
  return (t.progress || 0) > 0 ? 1 : 2;
}

function planKeyboard(lang: BotLang, cands: PlanCandidate[], selected: string[]) {
  const sel = new Set(selected);
  const rows = cands.map((c) => [
    {
      text: `${sel.has(c.id) ? "✅ " : "▫️ "}${c.name}`,
      callback_data: `ptog:${c.id}`,
    },
  ]);
  rows.push([
    { text: tt(lang, "btnSavePlan"), callback_data: "psav" },
    { text: tt(lang, "btnCancel"), callback_data: "xx" },
  ]);
  return rows;
}

// Returns true if a plan prompt was sent.
export async function sendPlanPrompt(
  tg: any,
  chatId: number,
  session: any,
): Promise<boolean> {
  const lang = normalizeLang(session?.lang);
  const cands = await candidateTasks(session);
  if (cands.length === 0) return false;
  await setSession(chatId, {
    step: "plan:select",
    planDraft: { date: todayISO(), taskIds: [], candidates: cands },
  });
  await tg.sendMessage(chatId, tt(lang, "planHeader"), planKeyboard(lang, cands, []));
  return true;
}

export async function togglePlanTask(
  tg: any,
  chatId: number,
  messageId: any,
  session: any,
  taskId: string,
) {
  const lang = normalizeLang(session?.lang);
  const pd = session.planDraft || { taskIds: [], candidates: [] };
  const set = new Set<string>(pd.taskIds || []);
  if (set.has(taskId)) set.delete(taskId);
  else set.add(taskId);
  const taskIds = Array.from(set);
  await setSession(chatId, { planDraft: { ...pd, taskIds } });
  await tg.editMessage(chatId, messageId, tt(lang, "planHeader"), planKeyboard(lang, pd.candidates || [], taskIds));
}

export async function savePlan(
  tg: any,
  chatId: number,
  messageId: any,
  session: any,
) {
  const lang = normalizeLang(session?.lang);
  const pd = session.planDraft || { taskIds: [], candidates: [] };
  if (!pd.taskIds || pd.taskIds.length === 0) {
    await tg.editMessage(chatId, messageId, tt(lang, "planNoTasks"));
    await setSession(chatId, { step: null, planDraft: null });
    return;
  }
  const base = projPath(session.orgId, session.activeProjectId);
  const date = pd.date || todayISO();
  const names = new Map<string, string>(
    (pd.candidates || []).map((c: any) => [c.id, c.name]),
  );
  await db.doc(`${base}/dailyPlans/${date}`).set({
    date,
    projectId: session.activeProjectId,
    plannedTaskIds: pd.taskIds,
    plannedTaskNames: pd.taskIds.map((id: string) => names.get(id) || ""),
    plannedByUid: session.userId,
    plannedByName: session.email || "Telegram",
    createdVia: "telegram",
    createdAt: new Date().toISOString(),
  });
  await setSession(chatId, { step: null, planDraft: null });
  const list = pd.taskIds.map((id: string) => `• ${names.get(id) || id}`).join("\n");
  await tg.editMessage(
    chatId,
    messageId,
    tt(lang, "planSaved", { n: pd.taskIds.length, list }),
  );
}
