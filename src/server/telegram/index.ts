import { Request, Response } from "express";
import { TelegramApi } from "./api.ts";
import { authPromise } from "../firebase_client.ts";
import { getSession, setSession, clearStep, clearSession } from "./session.ts";
import { checkRateLimit, redeemLinkCode, validateSession } from "./auth.ts";
import * as log from "./handlers/log.ts";
import * as projects from "./handlers/projects.ts";
import * as payments from "./handlers/payments.ts";
import { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase_client.ts";

export const handleTelegramWebhook = async (req: Request, res: Response) => {
  
  await authPromise;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'buildflow_secret_123';
  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    console.error("Telegram bot is not configured (missing env vars)");
    res.status(500).send("Bot not configured");
    return;
  }
  const expected = WEBHOOK_SECRET;
  const received = req.get("X-Telegram-Bot-Api-Secret-Token");
  
  if (!expected || received !== expected) {
    console.warn("Rejected unauthenticated webhook request");
    res.status(401).send("Unauthorized");
    return;
  }
  
  res.status(200).send("OK");
  
  const tg = new TelegramApi(BOT_TOKEN);
  try {
    await handleUpdate(tg, req.body);
  } catch (err) {
    console.error("Error handling update:", err); 
  }
};

export const getTelegramBotStatus = async (req: Request, res: Response) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.json({ online: false, reason: "Bot token not configured" });
  }
  const tg = new TelegramApi(BOT_TOKEN);
  try {
    const me = await tg.getMe();
    if (me && me.ok) {
      return res.json({ online: true, bot: me.result });
    } else {
      return res.json({ online: false, reason: "Failed to connect to Telegram API" });
    }
  } catch (err: any) {
    return res.json({ online: false, error: err?.message || "Error" });
  }
};

export async function startPolling() {
  await authPromise;

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.warn("Telegram bot token not found. Polling disabled.");
    return;
  }
  const tg = new TelegramApi(BOT_TOKEN);
  let offset = 0;
  console.log("Started Telegram Bot Long Polling...");
  while (true) {
    try {
      const updates = await tg.getUpdates(offset, 60);
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(tg, update);
        } catch (e) {
          console.error("Error processing individual update:", e);
        }
      }
    } catch (e) {
      // Ignore abort errors which are normal on shutdown/restart
      console.error("Telegram polling error:", e);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}




export async function showMainMenu(tg: any, chatId: number, messageId: number | null, session: any) {
    const isAdminOrOwner = await payments.isUserAdminOrOwner(session);
    const proj = await payments.getProjectDetails(session);
    const projName = proj ? proj.name : "None Selected";

    let text = `<b>🏗️ Sitetru Command Center</b>\n\n` +
        `📌 <b>Active Project:</b> ${projName}\n`;
    if (session.email) {
        text += `👤 <b>User:</b> ${session.email}\n`;
    }
    text += `\nSelect an operation from the options below:`;

    const buttons: any[] = [
        [
            { text: "📝 Log Site Progress", callback_data: "menu:log" },
            { text: "📊 Today's Progress", callback_data: "menu:today" },
        ],
    ];

    if (isAdminOrOwner) {
        buttons.push([
            { text: "💳 Payment Management", callback_data: "pm:menu" },
        ]);
    }

    buttons.push([
        { text: "📁 Switch Active Project", callback_data: "menu:projects" },
        { text: "❓ Help & Commands", callback_data: "menu:help" },
    ]);

    if (messageId) {
        await tg.editMessage(chatId, messageId, text, buttons);
    } else {
        await tg.sendMessage(chatId, text, buttons);
    }
}

async function showHelpMessage(tg: any, chatId: number, messageId: number | null, session: any) {
    const isAdminOrOwner = await payments.isUserAdminOrOwner(session);
    let text = `<b>🤖 Sitetru Telegram Bot Help</b>\n\n` +
        `Tap any button in the main menu or use commands:\n\n` +
        `<b>Site Logging:</b>\n` +
        `• /log — Record task progress, materials & labour\n` +
        `• /today — View site logs recorded today\n\n` +
        `<b>Project Management:</b>\n` +
        `• /projects — Switch active project\n`;

    if (isAdminOrOwner) {
        text += `\n<b>Payment Management:</b>\n` +
            `• /payments — Open Payment Hub\n` +
            `  └ 📥 Client Payment (Inward)\n` +
            `  └ 📤 Vendor Payment (Outward)\n`;
    }

    text += `\n• /cancel — Cancel current operation\n` +
        `• /help or /start — Return to Main Menu`;

    const buttons: any[] = [];
    if (isAdminOrOwner) {
        buttons.push([{ text: "💳 Payment Management", callback_data: "pm:menu" }]);
    }
    buttons.push([{ text: "🔙 Main Menu", callback_data: "menu:main" }]);

    if (messageId) {
        await tg.editMessage(chatId, messageId, text, buttons);
    } else {
        await tg.sendMessage(chatId, text, buttons);
    }
}

export async function handleUpdate(tg: TelegramApi, update: any) {
    const msg = update.message;
    const cb = update.callback_query;
    
    // Ignore non-private chats (groups, supergroups, channels) to prevent spamming and errors
    const chat = msg?.chat || cb?.message?.chat;
    if (chat && chat.type !== "private") {
        return;
    }

    if (cb) {
        await tg.answerCallback(cb.id);
        const chatId = cb.message.chat.id;
        const messageId = cb.message.message_id;
        const data = cb.data || "";
        const session = await getSession(chatId);
        if (!(await validateSession(chatId, session))) {
            await tg.editMessage(chatId, messageId, "Session expired. Send /link to reconnect.");
            return;
        }

        // ---------- MAIN MENU CALLBACKS ----------
        if (data === "menu:main") {
            await showMainMenu(tg, chatId, messageId, session);
            return;
        }
        if (data === "menu:log") {
            await log.startLog(tg, chatId, session);
            return;
        }
        if (data === "menu:today") {
            await log.showTodayLogs(tg, chatId, messageId, session);
            return;
        }
        if (data === "menu:projects") {
            await projects.showProjects(tg, chatId, session);
            return;
        }
        if (data === "menu:help") {
            await showHelpMessage(tg, chatId, messageId, session);
            return;
        }

        if (data === "xx") {
            await clearStep(chatId);
            await tg.editMessage(chatId, messageId, "Operation cancelled.", [
                [{ text: "🔙 Main Menu", callback_data: "menu:main" }]
            ]);
            return;
        }
        if (data === "bk") {
            const s = await getSession(chatId);
            await log.showMenu(tg, chatId, messageId, s);
            return;
        }
        
        if (data.startsWith("dt:")) {
            const dtAction = data.slice(3);
            if (dtAction === "pick") {
                await log.pickCustomDate(tg, chatId, messageId);
            } else if (dtAction === "back") {
                await log.showDatePicker(tg, chatId, messageId, session);
            } else if (dtAction === "changetask") {
                await log.showTaskPicker(tg, chatId, messageId, session);
            } else {
                await log.confirmTask(tg, chatId, messageId, session, dtAction);
            }
            return;
        }
        
        if (data.startsWith("ct:")) {
            const taskId = data.slice(3);
            await log.pickTask(tg, chatId, messageId, session, taskId);
            return;
        }

        if (data.startsWith("br:")) {
            await log.browseTasks(tg, chatId, messageId, session, Number(data.slice(3)));
            return;
        }
        if (data.startsWith("t:")) {
            await log.pickTask(tg, chatId, messageId, session, data.slice(2));
            return;
        }
        if (data.startsWith("prj:")) {
            await projects.pickProject(tg, chatId, messageId, session, data.slice(4));
            return;
        }
        if (data.startsWith("p:")) {
            await setSession(chatId, {
                draft: { ...(session.draft || {}), progressPercent: Number(data.slice(2)) },
            });
            const s = await getSession(chatId);
            await log.showMenu(tg, chatId, messageId, s);
            return;
        }
        if (data === "m") {
            await log.pickMaterial(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("mi:")) {
            await log.askMaterialQty(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data === "l") {
            await log.pickLabourRole(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("lr:")) {
            await log.askHeadcount(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data === "ph") {
            await setSession(chatId, { step: "log:photo" });
            await tg.editMessage(chatId, messageId, "Send the photo now.");
            return;
        }
        if (data === "nt") {
            await setSession(chatId, { step: "log:note" });
            await tg.editMessage(chatId, messageId, "Type your note.");
            return;
        }
        if (data === "sv") {
            await log.saveLog(tg, chatId, messageId, session);
            return;
        }

        // ---------- PAYMENT CALLBACKS ----------
        if (data === "pm:menu") {
            await payments.showPaymentsMenu(tg, chatId, messageId, session);
            return;
        }
        if (data === "pm:client") {
            await payments.startClientPayment(tg, chatId, messageId, session);
            return;
        }
        if (data === "pm:vendor") {
            await payments.startVendorPayment(tg, chatId, messageId, session);
            return;
        }
        if (data === "pm:summary") {
            await payments.showPaymentSummary(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("pm:method:")) {
            const method = data.slice(10);
            await payments.pickPaymentMethod(tg, chatId, messageId, session, method);
            return;
        }
        if (data === "pm:skip_ref") {
            await payments.handleClientReference(tg, chatId, "", messageId, session);
            return;
        }
        if (data === "pm:skip_desc") {
            await payments.handleClientDescription(tg, chatId, "", messageId, session);
            return;
        }
        if (data === "pm:save_client") {
            await payments.saveClientPayment(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("pm:vsel:")) {
            const vendorId = data.slice(8);
            await payments.pickVendor(tg, chatId, messageId, session, vendorId);
            return;
        }
        if (data === "pm:vskip_desc") {
            await payments.handleVendorDescription(tg, chatId, "", messageId, session);
            return;
        }
        if (data === "pm:save_vendor") {
            await payments.saveVendorPayment(tg, chatId, messageId, session);
            return;
        }
        return;
    }
    // Photos arrive with msg.photo and no msg.text
    if (msg?.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        const chatId = msg.chat.id;
        const session = await getSession(chatId);
        if (!(await validateSession(chatId, session))) {
            await tg.sendMessage(chatId, "You're not linked. Send /link to connect.");
            return;
        }
        if (session.step !== "log:photo") {
            await tg.sendMessage(chatId, "Tap '+ Photo' in /log first, then send the photo.");
            return;
        }
        await log.handlePhoto(tg, chatId, session, msg.photo);
        return;
    }
    if (!msg?.text)
        return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    // ---------- /link CODE ----------
    if (text.startsWith("/link")) {
        const arg = text.slice(5).trim();
        // Delete the message immediately so the code never lingers in chat history.
        try {
            await tg.deleteMessage(chatId, msg.message_id);
        }
        catch {
            /* deletion can fail in some chat types; not fatal */
        }
        if (!arg) {
            await tg.sendMessage(chatId, "Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>");
            return;
        }
        if (!(await checkRateLimit(chatId))) {
            await tg.sendMessage(chatId, "Too many attempts. Please wait an hour and ask your admin for a fresh code.");
            return;
        }
        const code = arg.replace(/[\s-]/g, "").toUpperCase();
        console.log("LINK ATTEMPT:", JSON.stringify({ chatId, rawInput: arg, normalizedCode: code }));
        const result = await redeemLinkCode(code, chatId);
        if (!result.ok) {
            // Deliberately vague — never reveal whether a code exists, is used, or expired.
            await tg.sendMessage(chatId, "That code isn't valid. It may have expired or already been used. Ask your admin for a new one.");
            return;
        }
        await setSession(chatId, {
            userId: result.userId,
            email: result.email,
            orgId: result.orgId,
            linkedAt: Date.now(),
        });
        await tg.sendMessage(chatId, `✅ Linked as <b>${result.email}</b>\n\nSend /help to see what I can do.`);
        return;
    }
    // ---------- everything below requires a valid session ----------
    const session = await getSession(chatId);
    if (!(await validateSession(chatId, session))) {
        await tg.sendMessage(chatId, "You're not linked. Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>");
        return;
    }
    if (text === "/unlink") {
        if (session?.userId) {
            await updateDoc(doc(db, "users", session.userId), {
                telegramChatId: null,
                telegramLinkedAt: null
            });
            await tg.sendMessage(chatId, "Your Telegram account has been unlinked.");
            await clearSession(chatId);
        }
        else {
            await tg.sendMessage(chatId, "You are not currently linked.");
        }
        return;
    }
    if (text === "/cancel") {
        await clearStep(chatId);
        await tg.sendMessage(chatId, "Cancelled.");
        return;
    }
    if (text === "/start" || text === "/menu") {
        await showMainMenu(tg, chatId, null, session);
        return;
    }
    if (text === "/help") {
        await showHelpMessage(tg, chatId, null, session);
        return;
    }
    if (text === "/today") {
        await log.showTodayLogs(tg, chatId, null, session);
        return;
    }
    if (text === "/log") {
        await log.startLog(tg, chatId, session);
        return;
    }
    if (text === "/projects") {
        await projects.showProjects(tg, chatId, session);
        return;
    }
    if (text === "/payments" || text === "/payment") {
        await payments.showPaymentsMenu(tg, chatId, null, session);
        return;
    }
    if (text === "/client_payment" || text === "/clientpayment" || text === "/payment_in" || text === "/clientpay") {
        await payments.startClientPayment(tg, chatId, null, session);
        return;
    }
    if (text === "/vendor_payment" || text === "/vendorpayment" || text === "/payment_out" || text === "/vendorpay") {
        await payments.startVendorPayment(tg, chatId, null, session);
        return;
    }
    const step = session.step;
    if (step === "pm:client_amt") {
        await payments.handleClientAmountEntered(tg, chatId, text, session);
        return;
    }
    if (step === "pm:client_ref") {
        await payments.handleClientReference(tg, chatId, text, null, session);
        return;
    }
    if (step === "pm:client_desc") {
        await payments.handleClientDescription(tg, chatId, text, null, session);
        return;
    }
    if (step === "pm:vendor_amt") {
        await payments.handleVendorAmountEntered(tg, chatId, text, session);
        return;
    }
    if (step === "pm:vendor_desc") {
        await payments.handleVendorDescription(tg, chatId, text, null, session);
        return;
    }
    if (step === "log:progress") {
        const pct = parseInt(text, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            await tg.sendMessage(chatId, "Enter a number between 0 and 100.");
            return;
        }
        await setSession(chatId, {
            draft: { ...(session.draft || {}), progressPercent: pct },
        });
        const s = await getSession(chatId);
        await log.showMenu(tg, chatId, null, s);
        return;
    }
    if (step === "log:material_qty") {
        const qty = parseFloat(text);
        if (isNaN(qty) || qty <= 0) {
            await tg.sendMessage(chatId, "Enter a quantity greater than 0.");
            return;
        }
        const d = session.draft || {};
        const materials = [...(d.materials || []), { ...d.pendingMaterial, quantity: qty }];
        const rest = { ...d };
        delete rest.pendingMaterial;
        await setSession(chatId, { draft: { ...rest, materials } });
        const s = await getSession(chatId);
        await log.showMenu(tg, chatId, null, s);
        return;
    }
    if (step === "log:labour_count") {
        const n = parseInt(text, 10);
        if (isNaN(n) || n <= 0) {
            await tg.sendMessage(chatId, "Enter a headcount greater than 0.");
            return;
        }
        const d = session.draft || {};
        const labour = [...(d.labour || []), { ...d.pendingLabour, headcount: n }];
        const rest = { ...d };
        delete rest.pendingLabour;
        await setSession(chatId, { draft: { ...rest, labour } });
        const s = await getSession(chatId);
        await log.showMenu(tg, chatId, null, s);
        return;
    }
    if (step === "log:note") {
        await setSession(chatId, { draft: { ...(session.draft || {}), note: text } });
        const s = await getSession(chatId);
        await log.showMenu(tg, chatId, null, s);
        return;
    }
    await tg.sendMessage(chatId, "I didn't understand that. Send /help.");
}
