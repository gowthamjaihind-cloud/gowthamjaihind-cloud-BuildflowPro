import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { WhatsAppApi } from "./api";
import { verifySignature, verifyChallenge, parseInbound, waSessionKey, type InboundMessage } from "./inbound";
import { MORE_PREFIX } from "./interactive";
import { getSession, setSession, clearStep, clearSession, type ChatId } from "../telegram/session";
import { checkRateLimit, redeemLinkCode, validateSession } from "../telegram/auth";
import { tt, normalizeLang, type BotLang } from "../telegram/i18n";
import * as log from "../telegram/handlers/log";
import * as projects from "../telegram/handlers/projects";
import * as agent from "../telegram/handlers/agent";
import * as invoice from "../telegram/handlers/invoice";
import { db } from "../db";

const WA_TOKEN = defineSecret("WHATSAPP_TOKEN");
const WA_PHONE_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const WA_VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const WA_APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

/**
 * The WhatsApp lane.
 *
 * It drives the SAME handlers as the Telegram bot rather than reimplementing
 * the log flow: `WhatsAppApi` mirrors `TelegramApi`'s method names, `ChatId` is
 * widened to cover a phone number, and `fetchPhotoBytes` hides the one
 * genuinely channel-shaped step. What is left here is routing plus the three
 * places WhatsApp is not Telegram:
 *
 *   1. NO MESSAGE EDITING. Telegram rewrites one card in place as the engineer
 *      works through a log. WhatsApp cannot, so `editMessage` sends a new
 *      message and the flow reads as a thread. Nothing to work around; it just
 *      looks different.
 *
 *   2. THREE BUTTONS. Telegram takes any keyboard grid. WhatsApp takes three
 *      reply buttons or a ten-row list, so `interactive.ts` reduces the grid
 *      and paginates the overflow behind a "More…" row.
 *
 *   3. THE 24-HOUR WINDOW. Free-form replies are only allowed within 24 hours
 *      of the engineer's last message. The daily reminder is business-initiated
 *      and therefore needs a Meta-approved template and is billed per
 *      conversation -- unlike Telegram, where it is free. `sendDailyNudge`
 *      below is deliberately template-only for that reason.
 */

export const whatsappStatus = onRequest(
  { region: "asia-southeast1", secrets: [WA_TOKEN, WA_PHONE_ID], cors: true, minInstances: 0 },
  async (_req, res) => {
    try {
      const wa = new WhatsAppApi(WA_TOKEN.value(), WA_PHONE_ID.value());
      const me = await wa.getMe();
      res.json(me?.ok ? { online: true, bot: me.result } : { online: false });
    } catch (err) {
      console.error("whatsappStatus error:", err);
      res.json({ online: false });
    }
  },
);

export const whatsappWebhook = onRequest(
  {
    region: "asia-southeast1",
    secrets: [WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, GEMINI_API_KEY],
    cors: false,
    minInstances: 0,
  },
  async (req, res) => {
    // ---- the one-time handshake when the webhook URL is saved in Meta ----
    if (req.method === "GET") {
      const challenge = verifyChallenge(req.query as Record<string, unknown>, WA_VERIFY_TOKEN.value());
      if (challenge === null) {
        res.status(403).send("Forbidden");
        return;
      }
      res.status(200).send(challenge);
      return;
    }

    // ---- authenticity, over the RAW bytes, before anything is parsed ----
    // rawBody is what Meta signed. Verifying a re-serialisation of req.body
    // would pass in testing and fail (or worse, wrongly pass) in production.
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw || !verifySignature(raw, req.get("X-Hub-Signature-256"), WA_APP_SECRET.value())) {
      console.warn("Rejected WhatsApp webhook with a bad or missing signature");
      res.status(401).send("Unauthorized");
      return;
    }

    // Same reasoning as the Telegram webhook: do the work BEFORE responding.
    // Cloud Run throttles CPU the instant the response is sent, so anything
    // awaited afterwards crawls. Meta retries on non-200, so failures still
    // return 200 once logged rather than being redelivered forever.
    const wa = new WhatsAppApi(WA_TOKEN.value(), WA_PHONE_ID.value());
    try {
      for (const m of parseInbound(req.body)) {
        await handleInbound(wa, m, GEMINI_API_KEY.value());
      }
    } catch (err) {
      console.error("Error handling WhatsApp update:", err);
    }
    res.status(200).send("OK");
  },
);

async function handleInbound(wa: WhatsAppApi, m: InboundMessage, geminiKey: string) {
  const chatId: ChatId = waSessionKey(m.from);
  // Blue ticks first, so a slow Gemini read does not look like a dead bot.
  wa.markRead(m.messageId).catch(() => {});

  if (m.kind === "reply" && m.replyId) {
    await handleTap(wa, chatId, m.replyId);
    return;
  }

  if (m.kind === "image" || m.kind === "document") {
    const session = await getSession(chatId);
    if (!(await validateSession(chatId, session))) {
      await wa.sendMessage(chatId, tt(session?.lang, "notLinkedShort"));
      return;
    }
    if (!m.mediaId) return;
    if (session.step === "log:photo") {
      await log.handlePhoto(wa, chatId, session, m.mediaId);
    } else {
      await invoice.handleInvoicePhoto(wa, chatId, session, m.mediaId, geminiKey);
    }
    return;
  }

  if (m.kind !== "text") {
    const session = await getSession(chatId);
    await wa.sendMessage(chatId, tt(session?.lang, "cantFetchPhoto"));
    return;
  }

  await handleText(wa, chatId, (m.text ?? "").trim());
}

/** A tapped reply button or list row. Mirrors the Telegram callback routing. */
async function handleTap(wa: WhatsAppApi, chatId: ChatId, data: string) {
  const session = await getSession(chatId);
  if (!(await validateSession(chatId, session))) {
    await wa.sendMessage(chatId, tt(session?.lang, "sessionExpired"));
    return;
  }
  const lang: BotLang = normalizeLang(session?.lang);

  // "More…" from an overflowing list: re-send the same picker, next page.
  if (data.startsWith(MORE_PREFIX)) {
    await log.browseTasks(wa, chatId, null, session, Number(data.slice(MORE_PREFIX.length)) || 1);
    return;
  }

  if (data === "lang:en" || data === "lang:ta") {
    const newLang: BotLang = data === "lang:ta" ? "ta" : "en";
    await setSession(chatId, { lang: newLang });
    await wa.sendMessage(chatId, tt(newLang, newLang === "ta" ? "languageSetTa" : "languageSetEn"));
    return;
  }
  if (data === "log") return void (await log.startLog(wa, chatId, session));
  if (data.startsWith("alog:")) return void (await log.pickTask(wa, chatId, null, session, data.slice(5)));
  if (data.startsWith("ptog:")) return void (await agent.togglePlanTask(wa, chatId, null, session, data.slice(5)));
  if (data === "psav") return void (await agent.savePlan(wa, chatId, null, session));
  if (data === "dt") return void (await log.showTaskPicker(wa, chatId, null, session));
  if (data.startsWith("ct:")) return void (await log.pickTask(wa, chatId, null, session, data.substring(3)));
  if (data === "xx") {
    await clearStep(chatId);
    await wa.sendMessage(chatId, tt(lang, "cancelled"));
    return;
  }
  if (data === "bk") return void (await log.showMenu(wa, chatId, null, await getSession(chatId)));
  if (data.startsWith("br:")) return void (await log.browseTasks(wa, chatId, null, session, Number(data.slice(3))));
  if (data.startsWith("t:")) return void (await log.pickTask(wa, chatId, null, session, data.slice(2)));
  if (data.startsWith("prj:")) return void (await projects.pickProject(wa, chatId, null, session, data.slice(4)));
  if (data.startsWith("p:")) {
    await setSession(chatId, { draft: { ...(session.draft || {}), progressPercent: Number(data.slice(2)) } });
    await log.showMenu(wa, chatId, null, await getSession(chatId));
    return;
  }
  if (data === "m") return void (await log.pickMaterial(wa, chatId, null, session));
  if (data.startsWith("mi:")) return void (await log.askMaterialQty(wa, chatId, null, session, data.slice(3)));
  if (data === "l") return void (await log.pickLabourRole(wa, chatId, null, session));
  if (data.startsWith("lr:")) return void (await log.askHeadcount(wa, chatId, null, session, data.slice(3)));
  if (data === "e") return void (await log.pickEquipment(wa, chatId, null, session));
  if (data.startsWith("ei:")) return void (await log.askEquipmentUnit(wa, chatId, null, session, data.slice(3)));
  if (data.startsWith("eu:")) return void (await log.askEquipmentQty(wa, chatId, null, session, data.slice(3)));
  if (data === "ph") {
    await setSession(chatId, { step: "log:photo" });
    await wa.sendMessage(chatId, tt(lang, "sendPhotoNow"));
    return;
  }
  if (data === "nt") {
    await setSession(chatId, { step: "log:note" });
    await wa.sendMessage(chatId, tt(lang, "typeNote"));
    return;
  }
  if (data === "sv") return void (await log.saveLog(wa, chatId, null, session));
}

async function handleText(wa: WhatsAppApi, chatId: ChatId, text: string) {
  // ---- linking ----
  // There is no deep link on WhatsApp the way t.me/<bot>?start=<code> works for
  // Telegram, and no way to delete the message afterwards, so the code stays
  // visible in the engineer's own chat history. It is single-use and short
  // lived, which is what makes that acceptable.
  if (/^(link|\/link)\b/i.test(text)) {
    const arg = text.replace(/^(link|\/link)\s*/i, "").trim();
    if (!arg) {
      await wa.sendMessage(chatId, tt("en", "askLinkCode"));
      return;
    }
    if (!(await checkRateLimit(chatId))) {
      await wa.sendMessage(chatId, tt("en", "tooManyAttempts"));
      return;
    }
    const code = arg.replace(/[\s-]/g, "").toUpperCase();
    const result = await redeemLinkCode(code, chatId);
    if (!result.ok) {
      // Deliberately vague: never reveal whether a code exists, is used or expired.
      await wa.sendMessage(chatId, tt("en", "codeInvalid"));
      return;
    }
    await setSession(chatId, {
      userId: result.userId,
      email: result.email,
      orgId: result.orgId,
      lang: "en",
      linkedAt: Date.now(),
    });
    await wa.sendMessage(chatId, tt("en", "linkedAs", { email: result.email as string }));
    return;
  }

  const session = await getSession(chatId);
  if (!(await validateSession(chatId, session))) {
    await wa.sendMessage(chatId, tt(session?.lang, "notLinked"));
    return;
  }
  const lang: BotLang = normalizeLang(session?.lang);
  const cmd = text.toLowerCase().replace(/^\//, "");

  if (cmd === "unlink") {
    if (session?.userId) {
      await db.collection("users").doc(session.userId).update({ whatsappId: null, whatsappLinkedAt: null });
      await wa.sendMessage(chatId, tt(lang, "unlinked"));
      await clearSession(chatId);
    } else {
      await wa.sendMessage(chatId, tt(lang, "notLinkedNow"));
    }
    return;
  }
  if (cmd === "cancel") {
    await clearStep(chatId);
    await wa.sendMessage(chatId, tt(lang, "cancelled"));
    return;
  }
  if (cmd === "language" || cmd === "lang") {
    await wa.sendMessage(chatId, tt(lang, "chooseLanguage"), [
      [{ text: tt(lang, "langEnglish"), callback_data: "lang:en" }],
      [{ text: tt(lang, "langTamil"), callback_data: "lang:ta" }],
    ]);
    return;
  }
  if (cmd === "log") return void (await log.startLog(wa, chatId, session));
  if (cmd === "today") return void (await log.showToday(wa, chatId, session));
  if (cmd === "projects") return void (await projects.showProjects(wa, chatId, session));

  // Free text belongs to whatever step the log flow is waiting on.
  if (session.step) {
    await log.handleStepText(wa, chatId, session, text);
    return;
  }
  await wa.sendMessage(chatId, tt(lang, "help"));
}

// The 17:00 and 10:00 nudges, which on WhatsApp have to reckon with the
// 24-hour service window. See reminders.ts.
export { whatsappLogReminder, whatsappPlanReminder } from "./reminders";
