import { BOT_LOG_MODELS as POLICY_BOT_LOG_MODELS } from "../../ai/geminiPolicy";
import type { ChatId } from "../session";
import { setSession, getSession } from "../session";
import { db } from "../../db";
import { tt, normalizeLang } from "../i18n";
import { geminiText } from "../../ai/gemini";
import { chargeAiUsage, refundAiUsage, isQuotaError } from "../../ai/usage";
import { buildAiLogPrompt, looksLikeLogText, parseModelJson, sanitizeAiLogs, type AiLogContext, type AiLogDraft } from "../../bot/aiLog";
import { recordBotError } from "../botErrors";
import { MASTER_PREFIX, isMasterId, mastersNotInProject } from "../../bot/masterMaterials";
import { showMenu } from "./log";

/**
 * "Footing concrete 45% done, 20 bags cement, 4 masons and 6 helpers" typed as
 * an ordinary message becomes a filled-in daily-log draft.
 *
 * Nothing is saved from the sentence alone. The engineer is shown what was
 * understood, with the same Save / Add / Cancel buttons as the tap-through
 * flow, and the log is written only when they press Save. Channel-neutral:
 * `api` is the Telegram wrapper today and a WhatsApp one later.
 */

const projPath = (orgId: any, projectId: any) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

const todayISO = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0];

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Models for the typed-report read, fastest first. A lookup against the
 * project's own lists does not need the larger models, and the "lite" ones
 * answer in a second or two. Retired names answer 404 and are skipped.
 */
export const BOT_LOG_MODELS = POLICY_BOT_LOG_MODELS;

/** The exact request the bot sends for a typed report. Shared with the operator's AI self-test. */
export function botLogRequest(text: string, ctx: AiLogContext) {
  return {
    body: { contents: [{ role: "user", parts: [{ text: buildAiLogPrompt(text, ctx) }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } },
    // 2.5 models "think" before answering unless told not to. This is a
    // lookup, not a puzzle: no thinking, and a short answer. Only 2.5 models
    // accept the setting, so nothing else is sent it.
    forModel: (model: string, b: any) =>
      model.startsWith("gemini-2.5")
        ? { ...b, generationConfig: { ...b.generationConfig, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }
        : b,
  };
}

export async function loadContext(base: string): Promise<AiLogContext> {
  // The company's Master data too: a material not yet stocked on this
  // project can still be matched, and is added to the project on Save.
  const orgPath = base.includes("/projects/") ? base.slice(0, base.indexOf("/projects/")) : null;
  const [tasks, inv, roles, equip, masters] = await Promise.all([
    db.collection(`${base}/tasks`).get(),
    db.collection(`${base}/inventory`).get(),
    db.collection(`${base}/labor_rate_cards`).get(),
    db.collection(`${base}/equipment`).get(),
    orgPath ? db.collection(`${orgPath}/materials`).get().catch(() => null) : Promise.resolve(null),
  ]);
  const stocked = inv.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const fromMaster = mastersNotInProject((masters?.docs || []).map((d) => ({ id: d.id, ...(d.data() as any) })), stocked);
  // A task with children is a heading in the schedule: its progress is rolled
  // up from them, so it is never logged against directly.
  const parents = new Set(tasks.docs.map((d) => String((d.data() as any).parentId || "")).filter(Boolean));
  return {
    // Unfinished tasks first, then finished ones: a task marked 100% can
    // still get a day's work (snagging, a second pass), and a task missing
    // from the list sends its work to the wrong task.
    tasks: tasks.docs
      .filter((d) => !parents.has(d.id))
      .map((d) => ({ id: d.id, name: String((d.data() as any).name || "").slice(0, 80), progress: Number((d.data() as any).progress) || 0 }))
      .filter((t) => t.name)
      .sort((a, b) => Number(a.progress >= 100) - Number(b.progress >= 100))
      .slice(0, 150),
    // Project stock first; Master data after it, under MASTER_PREFIX ids.
    materials: [
      ...stocked.map((m) => ({ id: m.id, name: String(m.name || "").slice(0, 60), unit: String(m.unit || "") })),
      ...fromMaster.map((m) => ({ id: `${MASTER_PREFIX}${m.id}`, name: String(m.name || "").slice(0, 60), unit: String(m.unit || "") })),
    ].filter((m) => m.name).slice(0, 200),
    // Lump-sum rate cards are amounts, not roles a head count can be logged against.
    roles: roles.docs.filter((d) => (d.data() as any).unit !== "Lumpsum").map((d) => ({ id: d.id, name: String((d.data() as any).roleName || (d.data() as any).role || (d.data() as any).name || "") })).filter((r) => r.name).slice(0, 80),
    equipment: equip.docs.map((d) => ({ id: d.id, name: String((d.data() as any).name || "") })).filter((e) => e.name).slice(0, 80),
  };
}

/**
 * Returns true when the message was handled here (whatever the outcome), and
 * false when it should fall through to "I didn't understand that".
 */
export async function handleFreeText(api: any, chatId: ChatId, session: any, text: string, geminiKey: string): Promise<boolean> {
  if (!looksLikeLogText(text) || !geminiKey) return false;
  const lang = normalizeLang(session?.lang);
  if (!session?.activeProjectId) {
    await api.sendMessage(chatId, tt(lang, "noActiveProject"));
    return true;
  }
  const base = projPath(session.orgId, session.activeProjectId);
  const ctx = { ...(await loadContext(base)), today: todayISO() };
  if (!ctx.tasks.length) {
    await api.sendMessage(chatId, tt(lang, "aiNoTasks"));
    return true;
  }

  // Charged before the call so two messages at once cannot slip past the
  // monthly allowance; given back if the model gives no answer.
  try {
    await chargeAiUsage(session.orgId, "botLog");
  } catch (e: any) {
    if (isQuotaError(e)) {
      await api.sendMessage(chatId, tt(lang, "aiQuotaReached"));
      return true;
    }
    throw e;
  }

  let raw: any;
  try {
    const req = botLogRequest(text, ctx);
    // Runs in the queue worker (120s), not the webhook. A stuck request gives
    // way to the next model instead of using the whole budget.
    const { text: out } = await geminiText(req.body, geminiKey, 90_000, { perAttemptMs: 25_000, forModel: req.forModel, models: BOT_LOG_MODELS });
    raw = parseModelJson(out);
  } catch (e: any) {
    console.error("AI log read failed:", e);
    await recordBotError("aiText", e);
    await refundAiUsage(session.orgId, "botLog");
    await api.sendMessage(chatId, tt(lang, "aiBusy"), [[{ text: tt(lang, "aiBtnLogWithButtons"), callback_data: "log" }]]);
    return true;
  }

  const result = sanitizeAiLogs(raw, ctx);
  if (result.kind === "other") {
    // Not a work report: the allowance is for logs, so this one is not counted.
    await refundAiUsage(session.orgId, "botLog");
    return false;
  }
  if (result.kind === "no_task") {
    await api.sendMessage(chatId, tt(lang, "aiWhichTask"), [[{ text: tt(lang, "aiBtnPickTask"), callback_data: "log" }]]);
    return true;
  }

  const total = result.drafts.length;
  const asDraft = (d: AiLogDraft, i: number) => ({
    taskId: d.taskId,
    taskName: d.taskName,
    workDate: d.workDate || todayISO(),
    currentProgress: d.currentProgress,
    progressPercent: d.progressPercent,
    materials: d.materials,
    labour: d.labour,
    equipment: d.equipment,
    photoUrls: [],
    ...(d.note ? { note: d.note } : {}),
    viaAi: true,
    batchIndex: i + 1,
    batchTotal: total,
  });
  const [first, ...rest] = result.drafts.map(asDraft);
  await setSession(chatId, {
    step: "log:menu",
    draft: { ...first, logId: db.collection(`${base}/dailyLogs`).doc().id },
    // Each further log gets its id when it becomes current (log.showNextPendingDraft).
    pendingDrafts: rest,
  });

  // Spell out every item of every log: the standard menu only shows counts,
  // and the engineer has to be able to check what was understood before Save.
  const lines: string[] = [total > 1 ? tt(lang, "aiLogsUnderstood", { n: total }) : tt(lang, "aiUnderstood")];
  const date = result.drafts[0].workDate;
  if (date && date !== todayISO()) {
    const shown = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    lines.push(tt(lang, "aiForDate", { date: shown }));
  }
  result.drafts.forEach((d, i) => {
    if (total > 1) lines.push("", `<b>${i + 1}. ${esc(d.taskName)}</b>`);
    // 🆕 = from Master data, added to this project when saved. A symbol, not
    // words, so it reads the same in both languages.
    for (const m of d.materials) lines.push(`• ${isMasterId(m.materialId) ? "🆕 " : ""}${esc(m.name)}: <b>${m.quantity}</b> ${esc(m.unit)}`);
    for (const l of d.labour) lines.push(`• ${esc(l.roleName)}: <b>${l.headcount}</b>`);
    for (const e of d.equipment) lines.push(`• ${esc(e.name)}: <b>${e.quantity}</b> ${e.unit}`);
    if (!d.materials.length && !d.labour.length && !d.equipment.length) lines.push(tt(lang, "aiNoItems"));
    if (!d.progressGiven) lines.push(tt(lang, "aiNoProgress", { pct: d.currentProgress }));
  });
  for (const pl of result.placed) lines.push("", tt(lang, "aiPlacedUnder", { heading: esc(pl.heading), task: esc(pl.taskName) }));
  if (result.unmatched.length) lines.push("", tt(lang, "aiUnmatched", { items: result.unmatched.map(esc).join(", ") }));
  lines.push("", tt(lang, total > 1 ? "aiCheckThenSaveEach" : "aiCheckThenSave"));
  await api.sendMessage(chatId, lines.join("\n"));
  await showMenu(api, chatId, null, await getSession(chatId));
  return true;
}
