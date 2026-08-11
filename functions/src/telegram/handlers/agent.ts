// Site Engineer agent (v1): proactively finds tasks that still need today's log,
// asks the engineer to describe the day in one message, parses it with Gemini
// into a structured draft, and — after a one-tap Save — writes it through the
// existing daily-log path. Propose → human confirms; nothing is written until
// the user taps Save.
import { setSession } from "../session";
import { db } from "../../db";

const projPath = (orgId: any, projectId: any) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const todayISO = () => {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // Asia/Kolkata
  return now.toISOString().split("T")[0];
};

// Same fallback list the insights function uses — guards against a model ID
// 404-ing on a given key.
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash",
];

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

// Returns true if a nudge was sent (i.e. there were gaps).
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
    `🌇 <b>End-of-day check-in</b>\n\n${gaps.length} task${gaps.length > 1 ? "s" : ""} still need today's update. Tap one and just describe the work in a sentence — I'll fill in the log for you.`,
    rows,
  );
  return true;
}

// User tapped a task from the nudge (callback alog:<taskId>).
export async function startTaskCapture(
  tg: any,
  chatId: number,
  messageId: any,
  session: any,
  taskId: string,
) {
  const base = projPath(session.orgId, session.activeProjectId);
  const snap = await db.doc(`${base}/tasks/${taskId}`).get();
  if (!snap.exists) {
    await tg.editMessage(chatId, messageId, "That task no longer exists.");
    return;
  }
  const t = snap.data()!;
  const logId = db.collection(`${base}/dailyLogs`).doc().id;
  await setSession(chatId, {
    step: "agent:capture",
    draft: {
      logId,
      taskId,
      taskName: t.name,
      workDate: todayISO(),
      currentProgress: t.progress || 0,
      materials: [],
      labour: [],
      equipment: [],
      photoUrls: [],
    },
  });
  await tg.editMessage(
    chatId,
    messageId,
    `<b>${t.name}</b> — now at ${t.progress || 0}%\n\nDescribe today's work in one message. e.g.\n<i>"poured 20% more, 6 masons, 2 bags cement, crane 4 hrs"</i>`,
  );
}

// User typed their description (session.step === "agent:capture").
export async function handleCaptureText(
  tg: any,
  chatId: number,
  session: any,
  text: string,
  apiKey: string,
) {
  const base = projPath(session.orgId, session.activeProjectId);
  const d = session.draft || {};

  const [inv, roles, equip] = await Promise.all([
    db.collection(`${base}/inventory`).limit(200).get(),
    db.collection(`${base}/labor_rate_cards`).limit(200).get(),
    db.collection(`${base}/equipment`).limit(200).get(),
  ]);

  const ctx = {
    task: d.taskName,
    currentProgress: d.currentProgress,
    inventory: inv.docs.map((x) => ({
      id: x.id,
      name: x.data().name,
      unit: x.data().unit || "",
    })),
    roles: roles.docs.map((x) => ({ id: x.id, name: x.data().role })),
    equipment: equip.docs.map((x) => ({ id: x.id, name: x.data().name })),
  };

  let parsed: any;
  try {
    parsed = await extractDailyLog(text, ctx, apiKey);
  } catch (e) {
    console.error("Agent extract failed:", e);
    await tg.sendMessage(
      chatId,
      'I couldn\'t read that. Try again, e.g. "20%, 6 masons, 2 bags cement".',
    );
    return;
  }

  const draft = {
    ...d,
    progressPercent: clampPct(parsed.progressPercent, d.currentProgress),
    materials: sanitizeMaterials(parsed.materials),
    labour: sanitizeLabour(parsed.labour),
    equipment: sanitizeEquipment(parsed.equipment),
    note: typeof parsed.note === "string" ? parsed.note : "",
  };

  await setSession(chatId, { step: "agent:confirm", draft });
  await tg.sendMessage(chatId, summaryText(draft), [
    [{ text: "✅ Save", callback_data: "asv" }],
    [
      { text: "✏️ Re-describe", callback_data: "aed" },
      { text: "✖ Cancel", callback_data: "xx" },
    ],
  ]);
}

export async function reDescribe(
  tg: any,
  chatId: number,
  messageId: any,
  _session: any,
) {
  await setSession(chatId, { step: "agent:capture" });
  await tg.editMessage(
    chatId,
    messageId,
    "OK — describe today's work again in one message.",
  );
}

function clampPct(v: any, current: number): number {
  const n = Number(v);
  if (!isFinite(n)) return current;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function sanitizeMaterials(arr: any): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((m) => m && m.name && Number(m.quantity) > 0)
    .map((m) => ({
      materialId: m.materialId || "",
      name: String(m.name),
      unit: m.unit || "",
      quantity: Number(m.quantity),
    }));
}

function sanitizeLabour(arr: any): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((l) => l && l.roleName && Number(l.headcount) > 0)
    .map((l) => ({
      roleId: l.roleId || "",
      roleName: String(l.roleName),
      headcount: Math.round(Number(l.headcount)),
    }));
}

function sanitizeEquipment(arr: any): any[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e) => e && e.name && Number(e.quantity) > 0)
    .map((e) => ({
      equipmentId: e.equipmentId || "",
      name: String(e.name),
      unit: e.unit === "days" ? "days" : "hours",
      quantity: Number(e.quantity),
    }));
}

function summaryText(d: any): string {
  let t = `<b>${d.taskName}</b>\n${d.currentProgress}% → <b>${d.progressPercent}%</b>`;
  for (const m of d.materials || [])
    t += `\n📦 ${m.name} — ${m.quantity} ${m.unit || ""}${m.materialId ? "" : " ⚠️"}`;
  for (const l of d.labour || [])
    t += `\n👷 ${l.roleName} — ${l.headcount}${l.roleId ? "" : " ⚠️"}`;
  for (const e of d.equipment || [])
    t += `\n🚜 ${e.name} — ${e.quantity} ${e.unit}${e.equipmentId ? "" : " ⚠️"}`;
  if (d.note) t += `\n📝 ${d.note}`;
  const hasUnmatched =
    (d.materials || []).some((m: any) => !m.materialId) ||
    (d.labour || []).some((l: any) => !l.roleId) ||
    (d.equipment || []).some((e: any) => !e.equipmentId);
  if (hasUnmatched)
    t += `\n\n<i>⚠️ = not matched to your master list (still recorded by name).</i>`;
  t += `\n\nSave this log?`;
  return t;
}

async function extractDailyLog(
  text: string,
  ctx: any,
  key: string,
): Promise<any> {
  const prompt = `You convert a site engineer's short message about ONE construction task into a structured daily log. Use ONLY the message; never invent quantities.

TASK: "${ctx.task}", currently at ${ctx.currentProgress}% cumulative progress.

Match any mentioned material / labour-role / equipment to the MASTERS by name (case-insensitive, fuzzy). If a confident match exists use its id; otherwise set the id to null and keep the spoken name.

Return ONLY JSON:
{
  "progressPercent": <integer 0-100 = NEW cumulative % after today. If the message states an absolute % use it. If it says "X% more" / "increased by X" add X to the current %. If no % is mentioned, return the current % unchanged.>,
  "materials": [{"materialId": <id or null>, "name": <string>, "unit": <string>, "quantity": <number>}],
  "labour": [{"roleId": <id or null>, "roleName": <string>, "headcount": <integer>}],
  "equipment": [{"equipmentId": <id or null>, "name": <string>, "unit": "hours" or "days", "quantity": <number>}],
  "note": <string: anything not captured above, e.g. issues/delays; "" if none>
}

MASTERS:
inventory (materials): ${JSON.stringify(ctx.inventory)}
roles (labour): ${JSON.stringify(ctx.roles)}
equipment: ${JSON.stringify(ctx.equipment)}

MESSAGE:
"${text}"`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };

  let lastErr = "no models tried";
  for (const model of MODELS) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = `network ${e}`;
      continue;
    }
    if (res.status === 404) {
      lastErr = `model ${model} unavailable`;
      continue;
    }
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      throw new Error(`gemini ${res.status}: ${b.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const out: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) {
      lastErr = `empty from ${model}`;
      continue;
    }
    try {
      return JSON.parse(out);
    } catch {
      const m = out.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      lastErr = "unparseable";
    }
  }
  throw new Error(`no usable model: ${lastErr}`);
}
