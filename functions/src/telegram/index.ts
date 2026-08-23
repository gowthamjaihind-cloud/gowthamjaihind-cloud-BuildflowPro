import { onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { TelegramApi } from "./api";
import { getSession, setSession, clearStep, clearSession } from "./session";
import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";
import { tt, normalizeLang, type BotLang } from "./i18n";
import * as log from "./handlers/log";
import * as projects from "./handlers/projects";
import * as agent from "./handlers/agent";
import * as invoice from "./handlers/invoice";
import { db } from "../db";
const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");
// Used by the invoice-photo reader (Gemini vision) in the webhook.
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Lightweight status endpoint for the web app's "Bot Online" badge.
// Exposed to the frontend via a Firebase Hosting rewrite: /api/telegram-status
export const telegramStatus = onRequest({
    region: "asia-southeast1",
    secrets: [BOT_TOKEN],
    cors: true,
    // Keep one instance warm — the app polls this every 15s for the
    // "Bot Online" badge, so cold starts here make the whole Telegram
    // section of the app feel slow.
    minInstances: 1,
}, async (_req, res) => {
    try {
        const tg = new TelegramApi(BOT_TOKEN.value());
        const me = await tg.getMe();
        if (me?.ok && me.result) {
            res.json({ online: true, bot: me.result });
        } else {
            res.json({ online: false });
        }
    } catch (err) {
        console.error("telegramStatus error:", err);
        res.json({ online: false });
    }
});
export const telegramWebhook = onRequest({
    region: "asia-southeast1",
    secrets: [BOT_TOKEN, WEBHOOK_SECRET, GEMINI_API_KEY],
    cors: false,
    // No warm instance kept here: the handler now does its work before
    // responding (see below), so it finishes in ~1-2s once running. A cold
    // start only adds ~3s to the very first message after a long idle spell,
    // which isn't worth the always-on cost. telegramStatus stays warm because
    // the app polls it every 15s for the "Bot Online" badge.
    minInstances: 0,
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
    // IMPORTANT: do the work BEFORE responding. On Cloud Run (Functions v2) the
    // CPU is throttled the instant the response is sent, so anything awaited
    // after res.send() runs at a crawl — that was the ~2-minute delay before the
    // bot replied. Telegram's webhook timeout is ~60s and this handler finishes
    // in ~1-2s, so awaiting first is both correct and fast. If it ever throws we
    // still 200 back so Telegram doesn't retry the same update forever.
    const tg = new TelegramApi(BOT_TOKEN.value());
    const update = req.body;
    try {
        await handleUpdate(tg, update, GEMINI_API_KEY.value());
    }
    catch (err) {
        console.error("Error handling update:", err);
    }
    res.status(200).send("OK");
});
async function handleUpdate(tg, update, geminiKey) {
    const msg = update.message;
    const cb = update.callback_query;
    if (cb) {
        await tg.answerCallback(cb.id);
        const chatId = cb.message.chat.id;
        const messageId = cb.message.message_id;
        const data = cb.data || "";
        const session = await getSession(chatId);
        if (!(await validateSession(chatId, session))) {
            await tg.editMessage(chatId, messageId, tt(session?.lang, "sessionExpired"));
            return;
        }
        const lang: BotLang = normalizeLang(session?.lang);
        // Language switch buttons (from /language).
        if (data === "lang:en" || data === "lang:ta") {
            const newLang: BotLang = data === "lang:ta" ? "ta" : "en";
            await setSession(chatId, { lang: newLang });
            await tg.editMessage(
                chatId,
                messageId,
                tt(newLang, newLang === "ta" ? "languageSetTa" : "languageSetEn"),
            );
            return;
        }
        // "Log now" button from the daily reminder — starts the normal log flow.
        if (data === "log") {
            await log.startLog(tg, chatId, session);
            return;
        }
        // ---- Site Engineer agent ----
        // Tapped a task from the agent's end-of-day worklist → drops into the
        // normal button-driven log flow (pick from master lists, no free text).
        if (data.startsWith("alog:")) {
            await log.pickTask(tg, chatId, messageId, session, data.slice(5));
            return;
        }
        // Morning plan: toggle a task in/out of today's plan, or save the plan.
        if (data.startsWith("ptog:")) {
            await agent.togglePlanTask(tg, chatId, messageId, session, data.slice(5));
            return;
        }
        if (data === "psav") {
            await agent.savePlan(tg, chatId, messageId, session);
            return;
        }
                if (data === "dt") {
            await log.showTaskPicker(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("ct:")) {
            const taskId = data.substring(3);
            await log.pickTask(tg, chatId, messageId, session, taskId);
            return;
        }
        if (data === "xx") {
            await clearStep(chatId);
            await tg.editMessage(chatId, messageId, tt(lang, "cancelled"));
            return;
        }
        if (data === "bk") {
            const s = await getSession(chatId);
            await log.showMenu(tg, chatId, messageId, s);
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
        if (data === "e") {
            await log.pickEquipment(tg, chatId, messageId, session);
            return;
        }
        if (data.startsWith("ei:")) {
            await log.askEquipmentUnit(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data.startsWith("eu:")) {
            await log.askEquipmentQty(tg, chatId, messageId, session, data.slice(3));
            return;
        }
        if (data === "ph") {
            await setSession(chatId, { step: "log:photo" });
            await tg.editMessage(chatId, messageId, tt(lang, "sendPhotoNow"));
            return;
        }
        if (data === "nt") {
            await setSession(chatId, { step: "log:note" });
            await tg.editMessage(chatId, messageId, tt(lang, "typeNote"));
            return;
        }
        if (data === "sv") {
            await log.saveLog(tg, chatId, messageId, session);
            return;
        }
        return;
    }
    // Photos arrive with msg.photo and no msg.text
    if (msg?.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        const chatId = msg.chat.id;
        const session = await getSession(chatId);
        if (!(await validateSession(chatId, session))) {
            await tg.sendMessage(chatId, tt(session?.lang, "notLinkedShort"));
            return;
        }
        if (session.step === "log:photo") {
            await log.handlePhoto(tg, chatId, session, msg.photo);
        } else {
            // Any other photo is treated as a vendor invoice to read + stage.
            await invoice.handleInvoicePhoto(tg, chatId, session, msg.photo, geminiKey);
        }
        return;
    }
    if (!msg?.text)
        return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    // ---------- /link CODE  or  /start CODE (one-tap deep link) ----------
    // A "Connect Telegram" deep link (t.me/<bot>?start=<code>) makes Telegram
    // send "/start <code>"; treat that payload exactly like /link. Bare /start
    // (no payload) falls through to the help message below.
    const isLinkCmd = text.startsWith("/link");
    const startPayload = text.startsWith("/start ") ? text.slice(7).trim() : "";
    if (isLinkCmd || startPayload) {
        const arg = (isLinkCmd ? text.slice(5) : startPayload).trim();
        // Delete the message immediately so the code never lingers in chat history.
        try {
            await tg.deleteMessage(chatId, msg.message_id);
        }
        catch {
            /* deletion can fail in some chat types; not fatal */
        }
        // Best-effort default language from the user's Telegram client until they
        // pick one with /language (Tamil clients start in Tamil).
        const clientLang: BotLang = msg.from?.language_code === "ta" ? "ta" : "en";
        if (!arg) {
            await tg.sendMessage(chatId, tt(clientLang, "askLinkCode"));
            return;
        }
        if (!(await checkRateLimit(chatId))) {
            await tg.sendMessage(chatId, tt(clientLang, "tooManyAttempts"));
            return;
        }
        const code = arg.replace(/[\s-]/g, "").toUpperCase();
        console.log("LINK ATTEMPT:", JSON.stringify({ chatId, rawInput: arg, normalizedCode: code }));
        const result = await redeemLinkCode(code, chatId);
        if (!result.ok) {
            // Deliberately vague — never reveal whether a code exists, is used, or expired.
            await tg.sendMessage(chatId, tt(clientLang, "codeInvalid"));
            return;
        }
        await setSession(chatId, {
            userId: result.userId,
            email: result.email,
            orgId: result.orgId,
            lang: clientLang,
            linkedAt: Date.now(),
        });
        await tg.sendMessage(chatId, tt(clientLang, "linkedAs", { email: result.email as string }));
        return;
    }
    // ---------- everything below requires a valid session ----------
    const session = await getSession(chatId);
    if (!(await validateSession(chatId, session))) {
        await tg.sendMessage(chatId, tt(session?.lang, "notLinked"));
        return;
    }
    const lang: BotLang = normalizeLang(session?.lang);
    if (text === "/unlink") {
        if (session?.userId) {
            await db.collection("users").doc(session.userId).update({
                telegramChatId: null,
                telegramLinkedAt: null
            });
            await tg.sendMessage(chatId, tt(lang, "unlinked"));
            await clearSession(chatId);
        }
        else {
            await tg.sendMessage(chatId, tt(lang, "notLinkedNow"));
        }
        return;
    }
    if (text === "/cancel") {
        await clearStep(chatId);
        await tg.sendMessage(chatId, tt(lang, "cancelled"));
        return;
    }
    if (text === "/language" || text === "/lang") {
        await tg.sendMessage(chatId, tt(lang, "chooseLanguage"), [[
            { text: tt(lang, "langEnglish"), callback_data: "lang:en" },
            { text: tt(lang, "langTamil"), callback_data: "lang:ta" },
        ]]);
        return;
    }
    if (text === "/help" || text === "/start") {
        await tg.sendMessage(chatId, tt(lang, "help"));
        return;
    }
    if (text === "/log") {
        await log.startLog(tg, chatId, session);
        return;
    }
    if (text === "/today") {
        await log.showToday(tg, chatId, session);
        return;
    }
    if (text === "/plan") {
        if (!session.activeProjectId) {
            await tg.sendMessage(chatId, tt(lang, "noActiveProject"));
            return;
        }
        const ok = await agent.sendPlanPrompt(tg, chatId, session);
        if (!ok) await tg.sendMessage(chatId, tt(lang, "noPlannableTasks"));
        return;
    }
    if (text === "/projects") {
        await projects.showProjects(tg, chatId, session);
        return;
    }
    const step = session.step;
    if (step === "log:progress") {
        const pct = parseInt(text, 10);
        if (isNaN(pct) || pct < 0 || pct > 100) {
            await tg.sendMessage(chatId, tt(lang, "enter0to100"));
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
            await tg.sendMessage(chatId, tt(lang, "enterQtyGt0"));
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
    if (step === "log:equipment_qty") {
        const qty = parseFloat(text);
        if (isNaN(qty) || qty <= 0) {
            await tg.sendMessage(chatId, tt(lang, "enterQtyGt0"));
            return;
        }
        const d = session.draft || {};
        const pe = d.pendingEquipment || {};
        const equipment = [
            ...(d.equipment || []),
            { equipmentId: pe.equipmentId, name: pe.name, unit: pe.unit || "hours", quantity: qty },
        ];
        const rest = { ...d };
        delete rest.pendingEquipment;
        await setSession(chatId, { draft: { ...rest, equipment } });
        const s = await getSession(chatId);
        await log.showMenu(tg, chatId, null, s);
        return;
    }
    if (step === "log:labour_count") {
        const n = parseInt(text, 10);
        if (isNaN(n) || n <= 0) {
            await tg.sendMessage(chatId, tt(lang, "enterHeadcountGt0"));
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
    await tg.sendMessage(chatId, tt(lang, "didntUnderstand"));
}
export const onUserUnlinked = onDocumentUpdated({
    document: "users/{userId}",
    region: "asia-southeast1",
    secrets: [BOT_TOKEN],
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const oldChatId = beforeData?.telegramChatId;
    const newChatId = afterData?.telegramChatId;
    if (oldChatId && !newChatId) {
        const tg = new TelegramApi(BOT_TOKEN.value());
        try {
            const s = await getSession(oldChatId);
            await tg.sendMessage(oldChatId, tt(normalizeLang(s?.lang), "unlinkedNotify"));
        }
        catch (err) {
            console.error("Failed to send unlink message:", err);
        }
    }
});

// Site Engineer agent — proactive end-of-day nudge at 5:00 PM IST, Mon–Sat.
// For each linked user it looks at their active project, finds tasks that still
// need today's log, and asks about those specifically (tap → describe → confirm
// → save). Users who are already caught up aren't pinged; users with no active
// project get a light nudge to pick one. Runs once a day.
export const dailyLogReminder = onSchedule({
    schedule: "0 17 * * 1-6", // 17:00 Mon–Sat (0=Sun) in the timezone below
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
    secrets: [BOT_TOKEN],
}, async () => {
    const tg = new TelegramApi(BOT_TOKEN.value());
    // Small user base; fetch all and keep the ones who have linked Telegram.
    const snap = await db.collection("users").get();
    const targets = snap.docs
        .map((d) => d.data())
        .filter((u: any) => u.telegramChatId);

    let nudged = 0;
    for (const u of targets) {
        try {
            const session = await getSession(u.telegramChatId);
            if (session?.activeProjectId) {
                const sent = await agent.sendAgentNudge(tg, u.telegramChatId, session);
                if (sent) nudged++;
                // No gaps → stay quiet (no noise for people already caught up).
            } else {
                await tg.sendMessage(
                    u.telegramChatId,
                    tt(normalizeLang(session?.lang), "endOfDayNoProject"),
                );
                nudged++;
            }
        }
        catch (err) {
            // A user may have blocked the bot; skip and keep going.
            console.error("Daily reminder failed for chat", u.telegramChatId, err);
        }
    }
    console.log(`Site Engineer agent nudged ${nudged}/${targets.length} linked users.`);
});

// Morning plan prompt at 10:00 AM IST, Mon–Sat. Asks each linked user (with an
// active project) to tap the tasks they'll work on today. The 5 PM actuals
// nudge then prioritises those tasks.
export const dailyPlanReminder = onSchedule({
    schedule: "0 10 * * 1-6", // 10:00 Mon–Sat in the timezone below
    timeZone: "Asia/Kolkata",
    region: "asia-southeast1",
    secrets: [BOT_TOKEN],
}, async () => {
    const tg = new TelegramApi(BOT_TOKEN.value());
    const snap = await db.collection("users").get();
    const targets = snap.docs
        .map((d) => d.data())
        .filter((u: any) => u.telegramChatId);

    let sent = 0;
    for (const u of targets) {
        try {
            const session = await getSession(u.telegramChatId);
            if (session?.activeProjectId) {
                const ok = await agent.sendPlanPrompt(tg, u.telegramChatId, session);
                if (ok) sent++;
            }
            // No active project → skip the morning prompt (the 5 PM nudge points
            // them to /projects).
        }
        catch (err) {
            console.error("Morning plan prompt failed for chat", u.telegramChatId, err);
        }
    }
    console.log(`Morning plan prompt sent to ${sent}/${targets.length} linked users.`);
});
