import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { TelegramApi } from "./api";
import { getSession, setSession, clearSession, clearStep } from "./session";
import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";

const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");

const db = admin.firestore();

export const telegramWebhook = onRequest(
  {
    region: "asia-southeast1",
    secrets: [BOT_TOKEN, WEBHOOK_SECRET],
    cors: false,
  },
  async (req, res) => {
    // ---- AUTH: verify this really came from Telegram, before anything else ----
    const expected = WEBHOOK_SECRET.value();
    const received = req.get("X-Telegram-Bot-Api-Secret-Token");

    if (!expected || received !== expected) {
      console.warn("Rejected unauthenticated webhook request");
      res.status(401).send("Unauthorized");
      return;
    }

    // Always 200 back to Telegram quickly, even if we fail internally —
    // otherwise Telegram retries the same update forever.
    res.status(200).send("OK");

    const tg = new TelegramApi(BOT_TOKEN.value());
    const update = req.body;

    try {
      await handleUpdate(tg, update);
    } catch (err) {
      console.error("Error handling update:", err);
    }
  }
);

async function handleUpdate(tg: TelegramApi, update: any) {
  const msg = update.message;
  const cb = update.callback_query;

  if (cb) {
    await tg.answerCallback(cb.id);
    // Phase B will route callback queries here.
    return;
  }

  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text: string = msg.text.trim();

  // ---------- /link CODE ----------
  if (text.startsWith("/link")) {
    const arg = text.slice(5).trim();

    // Delete the message immediately so the code never lingers in chat history.
    try {
      await tg.deleteMessage(chatId, msg.message_id);
    } catch {
      /* deletion can fail in some chat types; not fatal */
    }

    if (!arg) {
      await tg.sendMessage(
        chatId,
        "Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>"
      );
      return;
    }

    if (!(await checkRateLimit(chatId))) {
      await tg.sendMessage(
        chatId,
        "Too many attempts. Please wait an hour and ask your admin for a fresh code."
      );
      return;
    }

    const code = arg.replace(/[\s-]/g, "").toUpperCase();
    const result = await redeemLinkCode(code, chatId);

    if (!result.ok) {
      // Deliberately vague — never reveal whether a code exists, is used, or expired.
      await tg.sendMessage(
        chatId,
        "That code isn't valid. It may have expired or already been used. Ask your admin for a new one."
      );
      return;
    }

    await setSession(chatId, {
      userId: result.userId,
      email: result.email,
      linkedAt: Date.now(),
    });

    await tg.sendMessage(
      chatId,
      `✅ Linked as <b>${result.email}</b>\n\nSend /help to see what I can do.`
    );
    return;
  }

  // ---------- everything below requires a valid session ----------
  const session = await getSession(chatId);

  if (!(await validateSession(chatId, session))) {
    await tg.sendMessage(
      chatId,
      "You're not linked. Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>"
    );
    return;
  }

  if (text === "/cancel") {
    await clearStep(chatId);
    await tg.sendMessage(chatId, "Cancelled.");
    return;
  }

  if (text === "/help" || text === "/start") {
    await tg.sendMessage(
      chatId,
      `<b>BuildFlow Bot</b>\n\n` +
        `/log — log today's site progress\n` +
        `/today — see what's already logged today\n` +
        `/projects — switch active project\n` +
        `/cancel — cancel what you're doing\n` +
        `/help — this message`
    );
    return;
  }

  await tg.sendMessage(chatId, "I didn't understand that. Send /help.");
}
