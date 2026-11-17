import { HttpsError } from "firebase-functions/v2/https";
import { db } from "../../db";
import { channelOf, type ChatId } from "../../bot/channel";
import { isQuotaError } from "../../ai/usage";
import { prepareAction, confirmAction, cancelAction } from "../../actions/run";
import { pdfForPendingPo } from "../../actions/poDoc";
import { tt, normalizeLang } from "../i18n";
import * as aiLog from "./aiLog";

/**
 * Typed or spoken requests in the bot ("PO for 100 bags cement from ABC Traders",
 * "client paid 2 lakh by UPI", "how much steel is left?"), through the same
 * engine as the app's "Do it for me" (actions/run.ts). That engine checks the
 * person's role and project access before preparing anything and again on
 * Confirm, so the bot cannot do more than the app would let them.
 *
 * Shared by Telegram and WhatsApp, like the other handlers. Only Telegram can
 * send the PO PDF today (`api.sendDocument`); WhatsApp gets the text preview.
 */

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const errText = (e: any) => (e instanceof HttpsError ? e.message : "That could not be done just now. Please try again.");

export async function handleRequest(
  api: any, chatId: ChatId, session: any,
  input: { text?: string; audio?: { base64: string; mimeType: string } },
  geminiKey: string,
): Promise<void> {
  const lang = normalizeLang(session?.lang);
  if (!session?.activeProjectId || !session?.orgId) {
    await api.sendMessage(chatId, tt(lang, "noActiveProject"));
    return;
  }
  let out;
  try {
    out = await prepareAction({
      uid: session.userId, orgId: session.orgId, projectId: session.activeProjectId,
      channel: channelOf(chatId), key: geminiKey, text: input.text, audio: input.audio, logsInline: false,
    });
  } catch (e: any) {
    await api.sendMessage(chatId, isQuotaError(e) ? tt(lang, "aiQuotaReached") : `⚠️ ${esc(errText(e))}`);
    return;
  }
  const heard = input.audio && out.transcript ? `🎙 <i>${esc(out.transcript)}</i>\n\n` : "";

  if (out.type === "log") {
    // A work report: the daily-log reader takes it from here, with its own menus.
    if (heard) await api.sendMessage(chatId, heard.trim());
    const handled = await aiLog.handleFreeText(api, chatId, session, out.transcript, geminiKey);
    if (!handled) await api.sendMessage(chatId, tt(lang, "didntUnderstand"));
    return;
  }
  if (out.type !== "pending") {
    const icon = out.type === "denied" ? "🔒 " : "";
    await api.sendMessage(chatId, `${heard}${icon}${esc(out.message)}`);
    return;
  }

  const text = [
    heard + tt(lang, "actCheck"),
    "",
    ...out.lines.map(esc),
    ...(out.blockers.length ? ["", ...out.blockers.map((b) => `⚠️ ${esc(b)}`), "", tt(lang, "actFixInApp")] : ["", tt(lang, "actTapConfirm")]),
  ].join("\n");
  const buttons = out.blockers.length
    ? [[{ text: tt(lang, "actBtnCancel"), callback_data: `act:n:${out.id}` }]]
    : [[{ text: tt(lang, "actBtnConfirm"), callback_data: `act:y:${out.id}` }, { text: tt(lang, "actBtnCancel"), callback_data: `act:n:${out.id}` }]];

  if (out.pending.kind === "po" && typeof api.sendDocument === "function") {
    try {
      const pdf = await pdfForPendingPo(session.orgId, session.activeProjectId, out.pending);
      // The buttons go on the message, not the PDF, so they stay in view
      // after the PDF is opened.
      await api.sendDocument(chatId, pdf.buffer, pdf.filename, tt(lang, "actDraftCaption"));
    } catch (e) {
      console.error("PO preview PDF failed", e);
    }
  }
  await api.sendMessage(chatId, text, buttons);
}

/** Confirm (`act:y:<id>`) or Cancel (`act:n:<id>`). */
export async function handleTap(api: any, chatId: ChatId, messageId: any, session: any, data: string): Promise<void> {
  const lang = normalizeLang(session?.lang);
  const [, verb, id] = data.split(":");
  if (!id) return;
  const say = (t: string) => (messageId != null ? api.editMessage(chatId, messageId, t) : api.sendMessage(chatId, t));
  if (verb === "n") {
    await cancelAction(id, session.userId);
    await say(tt(lang, "actCancelled"));
    return;
  }
  let result;
  try {
    result = await confirmAction(id, session.userId);
  } catch (e: any) {
    await say(`⚠️ ${esc(errText(e))}`);
    return;
  }
  await say(`✅ ${esc(result.message)}`);
  if (result.poNumber && typeof api.sendDocument === "function") {
    try {
      const p: any = (await db.doc(`pending_actions/${id}`).get()).data();
      const pdf = await pdfForPendingPo(result.orgId, result.projectId, p.pending, { poNumber: result.poNumber });
      await api.sendDocument(chatId, pdf.buffer, pdf.filename, tt(lang, "actPoCaption", { po: esc(result.poNumber) }));
    } catch (e) {
      console.error("PO PDF failed", e);
    }
  }
}
