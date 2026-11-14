import type { ChatId } from "../session";
import { setSession, getSession } from "../session";
import { db } from "../../db";
import { tt, normalizeLang } from "../i18n";
import { geminiText } from "../../ai/gemini";
import { chargeAiUsage, refundAiUsage, isQuotaError } from "../../ai/usage";
import { buildAiLogPrompt, looksLikeLogText, parseModelJson, sanitizeAiLog, type AiLogContext } from "../../bot/aiLog";
import { recordBotError } from "../botErrors";
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
export const BOT_LOG_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest"];

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
  const [tasks, inv, roles, equip] = await Promise.all([
    db.collection(`${base}/tasks`).get(),
    db.collection(`${base}/inventory`).get(),
    db.collection(`${base}/labor_rate_cards`).get(),
    db.collection(`${base}/equipment`).get(),
  ]);
  // A task with children is a heading in the schedule: its progress is rolled
  // up from them, so it is never logged against directly.
  const parents = new Set(tasks.docs.map((d) => String((d.data() as any).parentId || "")).filter(Boolean));
  return {
    // Unfinished tasks only: nobody reports today's work on a finished one,
    // and a shorter list is a faster, surer answer.
    tasks: tasks.docs
      .filter((d) => !parents.has(d.id))
      .map((d) => ({ id: d.id, name: String((d.data() as any).name || "").slice(0, 80), progress: Number((d.data() as any).progress) || 0 }))
      .filter((t) => t.name && t.progress < 100)
      .slice(0, 150),
    materials: inv.docs.map((d) => ({ id: d.id, name: String((d.data() as any).name || "").slice(0, 60), unit: String((d.data() as any).unit || "") })).filter((m) => m.name).slice(0, 150),
    roles: roles.docs.map((d) => ({ id: d.id, name: String((d.data() as any).roleName || (d.data() as any).role || (d.data() as any).name || "") })).filter((r) => r.name).slice(0, 80),
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

  const result = sanitizeAiLog(raw, ctx);
  if (result.kind === "other") {
    // Not a work report: the allowance is for logs, so this one is not counted.
    await refundAiUsage(session.orgId, "botLog");
    return false;
  }
  if (result.kind === "no_task") {
    await api.sendMessage(chatId, tt(lang, "aiWhichTask"), [[{ text: tt(lang, "aiBtnPickTask"), callback_data: "log" }]]);
    return true;
  }

  const d = result.draft;
  const logId = db.collection(`${base}/dailyLogs`).doc().id;
  await setSession(chatId, {
    step: "log:menu",
    draft: {
      logId,
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
    },
  });

  // Spell out every item: the standard menu only shows counts, and the engineer
  // has to be able to check what was understood before pressing Save.
  const lines: string[] = [tt(lang, "aiUnderstood")];
  if (d.workDate && d.workDate !== todayISO()) lines.push(tt(lang, "aiForDate", { date: d.workDate }));
  for (const m of d.materials) lines.push(`• ${esc(m.name)}: <b>${m.quantity}</b> ${esc(m.unit)}`);
  for (const l of d.labour) lines.push(`• ${esc(l.roleName)}: <b>${l.headcount}</b>`);
  for (const e of d.equipment) lines.push(`• ${esc(e.name)}: <b>${e.quantity}</b> ${e.unit}`);
  if (!d.materials.length && !d.labour.length && !d.equipment.length) lines.push(tt(lang, "aiNoItems"));
  if (!d.progressGiven) lines.push("", tt(lang, "aiNoProgress", { pct: d.currentProgress }));
  if (d.unmatched.length) lines.push("", tt(lang, "aiUnmatched", { items: d.unmatched.map(esc).join(", ") }));
  lines.push("", tt(lang, "aiCheckThenSave"));
  await api.sendMessage(chatId, lines.join("\n"));
  await showMenu(api, chatId, null, await getSession(chatId));
  return true;
}
