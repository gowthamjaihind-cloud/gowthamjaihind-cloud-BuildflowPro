import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { TelegramApi } from "./api";
import { getSession, setSession, clearStep } from "./session";
import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";
import {
  startLog, browseTasks, pickTask, showMenu, pickMaterial, askMaterialQty,
  pickLabourRole, askHeadcount, saveLog,
} from "./handlers/log";

const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");

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
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data: string = cb.data || "";

    const session = await getSession(chatId);
    if (!(await validateSession(chatId, session))) {
      await tg.editMessage(chatId, messageId, "Session expired. Send /link to reconnect.");
      return;
    }

    if (data === "xx") {
      await clearStep(chatId);
      await tg.editMessage(chatId, messageId, "Cancelled.");
      return;
    }
    if (data === "bk") {
      const s = await getSession(chatId);
      await showMenu(tg, chatId, messageId, s!);
      return;
    }
    if (data.startsWith("br:")) {
      await browseTasks(tg, chatId, messageId, session!, Number(data.slice(3)));
      return;
    }
    if (data.startsWith("t:")) {
      await pickTask(tg, chatId, messageId, session!, data.slice(2));
      return;
    }
    if (data.startsWith("p:")) {
      await setSession(chatId, {
        draft: { ...(session!.draft || {}), progressPercent: Number(data.slice(2)) },
      });
      const s = await getSession(chatId);
      await showMenu(tg, chatId, messageId, s!);
      return;
    }
    if (data === "m") {
      await pickMaterial(tg, chatId, messageId, session!);
      return;
    }
    if (data.startsWith("mi:")) {
      await askMaterialQty(tg, chatId, messageId, session!, data.slice(3));
      return;
    }
    if (data === "l") {
      await pickLabourRole(tg, chatId, messageId, session!);
      return;
    }
    if (data.startsWith("lr:")) {
      await askHeadcount(tg, chatId, messageId, session!, data.slice(3));
      return;
    }
    if (data === "nt") {
      await setSession(chatId, { step: "log:note" });
      await tg.editMessage(chatId, messageId, "Type your note.");
      return;
    }
    if (data === "sv") {
      await saveLog(tg, chatId, messageId, session!);
      return;
    }
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

  if (text === "/log") {
    await startLog(tg, chatId, session!);
    return;
  }

  await tg.sendMessage(chatId, "I didn't understand that. Send /help.");
}
