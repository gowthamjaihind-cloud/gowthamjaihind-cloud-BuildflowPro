"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUserUnlinked = exports.telegramWebhook = void 0;
const admin = require("firebase-admin");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const api_1 = require("./api");
const session_1 = require("./session");
const auth_1 = require("./auth");
const log_1 = require("./handlers/log");
const projects_1 = require("./handlers/projects");
const BOT_TOKEN = (0, params_1.defineSecret)("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = (0, params_1.defineSecret)("TELEGRAM_WEBHOOK_SECRET");
exports.telegramWebhook = (0, https_1.onRequest)({
    region: "asia-southeast1",
    secrets: [BOT_TOKEN, WEBHOOK_SECRET],
    cors: false,
}, async (req, res) => {
    // ---- AUTH: verify this really came from Telegram, before anything else ----
    const expected = WEBHOOK_SECRET.value();
    const received = req.get("X-Telegram-Bot-Api-Secret-Token");
    console.log("Webhook received! expected secret length:", expected?.length, "received secret:", received);
    if (expected && received !== expected) {
        console.warn("Rejected unauthenticated webhook request");
        res.status(401).send("Unauthorized");
        return;
    }
    // Always 200 back to Telegram quickly, even if we fail internally —
    // otherwise Telegram retries the same update forever.
    res.status(200).send("OK");
    const tg = new api_1.TelegramApi(BOT_TOKEN.value());
    const update = req.body;
    try {
        await handleUpdate(tg, update);
    }
    catch (err) {
        console.error("Error handling update:", err);
    }
});
async function handleUpdate(tg, update) {
    const msg = update.message;
    const cb = update.callback_query;
    if (cb) {
        await tg.answerCallback(cb.id);
        const chatId = cb.message.chat.id;
        const messageId = cb.message.message_id;
        const data = cb.data || "";
        const session = await (0, session_1.getSession)(chatId);
        if (!(await (0, auth_1.validateSession)(chatId, session))) {
            await tg.editMessage(chatId, messageId, "Session expired. Send /link to reconnect.");
            return;
        }
        if (data === "xx") {
            await (0, session_1.clearStep)(chatId);
            await tg.editMessage(chatId, messageId, "Cancelled.");
            return;
        }
        if (data === "bk") {
            const s = await (0, session_1.getSession)(chatId);
            await (0, log_1.showMenu)(tg, chatId, messageId, s);
            return;
        }
        if (data.startsWith("br:")) {
            await (0, log_1.browseTasks)(tg, chatId, messageId, session, Number(data.slice(3)));
            return;
        }
        if (data.startsWith("t:")) {
            await (0, log_1.pickTask)(tg, chatId, messageId, session, data.slice(2));
            return;
        }
        if (data.startsWith("prj:")) {
            await (0, projects_1.pickProject)(tg, chatId, messageId, session, data.slice(4));
            return;
        }
        if (data.startsWith("p:")) {
            await (0, session_1.setSession)(chatId, {
                draft: { ...(session.draft || {}), progressPercent: Number(data.slice(2)) },
            });
            const s = await (0, session_1.getSession)(chatId);
            await (0, log_1.showMenu)(tg, chatId, messageId, s);
            return;
        }
        if (data === "m") {
            await (0, log_1.pickMaterial)(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("mi:")) {
            await (0, log_1.askMaterialQty)(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data === "l") {
            await (0, log_1.pickLabourRole)(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("lr:")) {
            await (0, log_1.askHeadcount)(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data === "ph") {
            await (0, session_1.setSession)(chatId, { step: "log:photo" });
            await tg.editMessage(chatId, messageId, "Send the photo now.");
            return;
        }
        if (data === "nt") {
            await (0, session_1.setSession)(chatId, { step: "log:note" });
            await tg.editMessage(chatId, messageId, "Type your note.");
            return;
        }
        if (data === "sv") {
            await (0, log_1.saveLog)(tg, chatId, messageId, session);
            return;
        }
        return;
    }
    // Photos arrive with msg.photo and no msg.text
    if (msg?.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        const chatId = msg.chat.id;
        const session = await (0, session_1.getSession)(chatId);
        if (!(await (0, auth_1.validateSession)(chatId, session))) {
            await tg.sendMessage(chatId, "You're not linked. Send /link to connect.");
            return;
        }
        if (session.step !== "log:photo") {
            await tg.sendMessage(chatId, "Tap '+ Photo' in /log first, then send the photo.");
            return;
        }
        await (0, log_1.handlePhoto)(tg, chatId, session, msg.photo);
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
        if (!(await (0, auth_1.checkRateLimit)(chatId))) {
            await tg.sendMessage(chatId, "Too many attempts. Please wait an hour and ask your admin for a fresh code.");
            return;
        }
        const code = arg.replace(/[\s-]/g, "").toUpperCase();
        console.log("LINK ATTEMPT:", JSON.stringify({ chatId, rawInput: arg, normalizedCode: code }));
        const result = await (0, auth_1.redeemLinkCode)(code, chatId);
        if (!result.ok) {
            // Deliberately vague — never reveal whether a code exists, is used, or expired.
            await tg.sendMessage(chatId, "That code isn't valid. It may have expired or already been used. Ask your admin for a new one.");
            return;
        }
        await (0, session_1.setSession)(chatId, {
            userId: result.userId,
            email: result.email,
            orgId: result.orgId,
            linkedAt: Date.now(),
        });
        await tg.sendMessage(chatId, `✅ Linked as <b>${result.email}</b>\n\nSend /help to see what I can do.`);
        return;
    }
    // ---------- everything below requires a valid session ----------
    const session = await (0, session_1.getSession)(chatId);
    if (!(await (0, auth_1.validateSession)(chatId, session))) {
        await tg.sendMessage(chatId, "You're not linked. Ask your admin for a link code, then send:\n<code>/link ABCD-EFGH</code>");
        return;
    }
    if (text === "/unlink") {
        if (session?.userId) {
            await admin.firestore().collection("users").doc(session.userId).update({
                telegramChatId: null,
                telegramLinkedAt: null
            });
            await tg.sendMessage(chatId, "Your Telegram account has been unlinked.");
            await (0, session_1.clearSession)(chatId);
        }
        else {
            await tg.sendMessage(chatId, "You are not currently linked.");
        }
        return;
    }
    if (text === "/cancel") {
        await (0, session_1.clearStep)(chatId);
        await tg.sendMessage(chatId, "Cancelled.");
        return;
    }
    if (text === "/help" || text === "/start") {
        await tg.sendMessage(chatId, `<b>BuildFlow Bot</b>\n\n` +
            `/log — log today's site progress\n` +
            `/today — see what's already logged today\n` +
            `/projects — switch active project\n` +
            `/cancel — cancel what you're doing\n` +
            `/help — this message`);
        return;
    }
    if (text === "/log") {
        await (0, log_1.startLog)(tg, chatId, session);
        return;
    }
    if (text === "/projects") {
        await (0, projects_1.showProjects)(tg, chatId, session);
        return;
    }
    const step = session.step;
    if (step === "log:progress") {
        const pct = parseInt(text, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            await tg.sendMessage(chatId, "Enter a number between 0 and 100.");
            return;
        }
        await (0, session_1.setSession)(chatId, {
            draft: { ...(session.draft || {}), progressPercent: pct },
        });
        const s = await (0, session_1.getSession)(chatId);
        await (0, log_1.showMenu)(tg, chatId, null, s);
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
        await (0, session_1.setSession)(chatId, { draft: { ...rest, materials } });
        const s = await (0, session_1.getSession)(chatId);
        await (0, log_1.showMenu)(tg, chatId, null, s);
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
        await (0, session_1.setSession)(chatId, { draft: { ...rest, labour } });
        const s = await (0, session_1.getSession)(chatId);
        await (0, log_1.showMenu)(tg, chatId, null, s);
        return;
    }
    if (step === "log:note") {
        await (0, session_1.setSession)(chatId, { draft: { ...(session.draft || {}), note: text } });
        const s = await (0, session_1.getSession)(chatId);
        await (0, log_1.showMenu)(tg, chatId, null, s);
        return;
    }
    await tg.sendMessage(chatId, "I didn't understand that. Send /help.");
}
const firestore_1 = require("firebase-functions/v2/firestore");
exports.onUserUnlinked = (0, firestore_1.onDocumentUpdated)({
    document: "users/{userId}",
    region: "asia-southeast1",
    secrets: [BOT_TOKEN],
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const oldChatId = beforeData?.telegramChatId;
    const newChatId = afterData?.telegramChatId;
    if (oldChatId && !newChatId) {
        const tg = new api_1.TelegramApi(BOT_TOKEN.value());
        try {
            await tg.sendMessage(oldChatId, "Your Telegram account has been unlinked from BuildFlow.");
        }
        catch (err) {
            console.error("Failed to send unlink message:", err);
        }
    }
});
//# sourceMappingURL=index.js.map