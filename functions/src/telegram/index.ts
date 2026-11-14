import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { CALLABLE_OPTS } from "../callable";
import { assertSuperAdmin } from "../razorpay";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
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
import * as aiLog from "./handlers/aiLog";
import { db, FIRESTORE_DATABASE_ID } from "../db";
import { looksLikeLogText } from "../bot/aiLog";
import { recordBotError, recentBotErrors } from "./botErrors";
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
    // NO warm instance. This used to be minInstances: 1, which reserves a Cloud
    // Run instance 24/7 and bills its CPU and memory whether or not a request
    // ever arrives -- the one cost in this project with no free tier. It ran
    // continuously on an unlaunched app, for a status badge, and was the largest
    // line on the bill.
    //
    // The cold start it was hiding was only ever felt by that badge, which no
    // longer polls: it is rendered once in the Telegram settings panel with a
    // refresh button, rather than every 15 seconds from the app shell.
    minInstances: 0,
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
/**
 * Why is the bot silent? Operator-only.
 *
 * The bot only hears a message if Telegram has been told to send it to OUR
 * webhook, with OUR secret. Both live on Telegram's side and nothing in the
 * app showed them, so a bot that stopped replying gave no clue why: a webhook
 * never registered, one pointing at an old address, or one registered before
 * the secret was set or changed (every call then gets 401 and is dropped) all
 * look identical from a phone. This reports what Telegram itself says.
 */
const expectedWebhookUrl = () =>
    `https://asia-southeast1-${process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT}.cloudfunctions.net/telegramWebhook`;

async function botDiagnostics(tg: TelegramApi, secret: string) {
    const [me, info] = await Promise.all([tg.getMe(), tg.getWebhookInfo()]);
    const w = info?.result || {};
    const expectedUrl = expectedWebhookUrl();
    const problems: string[] = [];
    if (!me?.ok) problems.push("Telegram does not accept the bot token. Check the TELEGRAM_BOT_TOKEN secret.");
    if (me?.ok && !w.url) problems.push("Telegram has no webhook set for this bot, so messages are not being sent to Sitetru at all.");
    if (w.url && w.url !== expectedUrl) problems.push("Telegram is sending messages to a different address than this app's webhook.");
    if (!secret) problems.push("No webhook secret is configured (TELEGRAM_WEBHOOK_SECRET).");
    if (secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) problems.push("The webhook secret contains characters Telegram does not allow (only letters, digits, _ and -).");
    if (w.last_error_message) problems.push(`Telegram's last delivery failed: ${String(w.last_error_message).slice(0, 200)}`);
    return {
        tokenOk: !!me?.ok,
        botUsername: me?.result?.username || null,
        webhookUrl: w.url || null,
        expectedUrl,
        urlMatches: !!w.url && w.url === expectedUrl,
        pendingUpdates: Number(w.pending_update_count) || 0,
        lastErrorAt: w.last_error_date ? Number(w.last_error_date) * 1000 : null,
        lastErrorMessage: w.last_error_message ? String(w.last_error_message).slice(0, 300) : null,
        secretConfigured: !!secret,
        problems,
        // Why AI reads failed recently: the engineer only sees "couldn't read that".
        recentErrors: await recentBotErrors(5).catch(() => []),
    };
}

export const telegramDiagnostics = onCall({ ...CALLABLE_OPTS, secrets: [BOT_TOKEN, WEBHOOK_SECRET], timeoutSeconds: 30 }, async (request) => {
    assertSuperAdmin(request);
    return botDiagnostics(new TelegramApi(BOT_TOKEN.value()), WEBHOOK_SECRET.value() || "");
});

/**
 * Operator-only: why does the AI read fail? Sends the bot's real request (the
 * operator's own active project, a sample sentence) to every model, one try
 * each, and reports how long each took and what came back. One press shows
 * whether the problem is the key, the network, a retired model, or a request
 * that is too heavy -- the live failure log only ever shows the last attempt.
 */
export const telegramAiSelfTest = onCall({ ...CALLABLE_OPTS, secrets: [GEMINI_API_KEY], timeoutSeconds: 180 }, async (request) => {
    assertSuperAdmin(request);
    const key = GEMINI_API_KEY.value();
    if (!key) return { keySet: false, results: [] };
    const userSnap = await db.doc(`users/${request.auth!.uid}`).get();
    const chatId = (userSnap.data() as any)?.telegramChatId;
    const session: any = chatId ? await getSession(chatId) : null;
    let ctx: any = null;
    if (session?.activeProjectId) {
        const base = session.orgId ? `organizations/${session.orgId}/projects/${session.activeProjectId}` : `projects/${session.activeProjectId}`;
        ctx = { ...(await aiLog.loadContext(base)), today: new Date(Date.now() + 5.5 * 3600_000).toISOString().split("T")[0] };
    }
    const sample = String(request.data?.text || "Block work south side. Mason 2 no, MC 1 no, FC 1 no").slice(0, 600);
    const tiny = { contents: [{ role: "user", parts: [{ text: 'Reply with this JSON exactly: {"ok":true}' }] }], generationConfig: { responseMimeType: "application/json" } };
    const real = ctx ? aiLog.botLogRequest(sample, ctx) : null;
    // Nothing returned may carry the key, whatever the service echoes back.
    const scrub = (v: string) => v.split(key).join("[key]");
    const once = async (model: string, body: any) => {
        const t0 = Date.now();
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
            });
            const raw = await res.text();
            let out = raw;
            try { out = JSON.parse(raw)?.candidates?.[0]?.content?.parts?.[0]?.text ?? raw; } catch { /* keep raw */ }
            return { status: res.status, seconds: Math.round((Date.now() - t0) / 100) / 10, sample: scrub(String(out).replace(/\s+/g, " ").slice(0, 160)) };
        } catch (e: any) {
            return { status: e?.name === "TimeoutError" ? "timed out" : scrub(`error: ${String(e?.message || e).slice(0, 80)}`), seconds: Math.round((Date.now() - t0) / 100) / 10, sample: "" };
        }
    };
    const models = [...new Set([...aiLog.BOT_LOG_MODELS, "gemini-2.0-flash", "gemini-2.0-flash-lite"])];
    const results = await Promise.all(models.map(async (model) => ({
        model,
        tiny: await once(model, tiny),
        real: real ? await once(model, real.forModel(model, real.body)) : null,
    })));
    return {
        keySet: true,
        project: ctx ? { tasks: ctx.tasks.length, materials: ctx.materials.length, roles: ctx.roles.length, equipment: ctx.equipment.length } : null,
        promptChars: real ? JSON.stringify(real.body).length : 0,
        results,
    };
});

/** Operator-only: (re)register this app's webhook with Telegram, using the current secret. */
export const telegramReconnect = onCall({ ...CALLABLE_OPTS, secrets: [BOT_TOKEN, WEBHOOK_SECRET], timeoutSeconds: 30 }, async (request) => {
    assertSuperAdmin(request);
    const tg = new TelegramApi(BOT_TOKEN.value());
    const secret = WEBHOOK_SECRET.value() || "";
    const res = await tg.setWebhook(expectedWebhookUrl(), secret);
    if (!res?.ok) {
        throw new HttpsError("failed-precondition", `Telegram refused the connection: ${String(res?.description || "unknown reason").slice(0, 200)}`);
    }
    return botDiagnostics(tg, secret);
});

export const telegramWebhook = onRequest({
    region: "asia-southeast1",
    secrets: [BOT_TOKEN, WEBHOOK_SECRET, GEMINI_API_KEY],
    cors: false,
    // Reads invoices with Gemini; capped like the AI callables (ai/access.ts).
    maxInstances: 10,
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
    // Never log the secret itself: this line used to print whatever arrived,
    // which put the real webhook secret into the function logs on every call.
    if (expected && received !== expected) {
        console.warn("Rejected unauthenticated webhook request");
        res.status(401).send("Unauthorized");
        return;
    }
    // The work is done BEFORE responding: on Cloud Run the CPU is throttled
    // the instant the response is sent, so anything awaited after res.send()
    // crawls. That is only safe for work that takes a second or two. Anything
    // that waits on the AI (a typed work report, an invoice photo) is handed
    // to a queue instead -- see enqueueBotJob below. Waiting on it here made
    // Telegram time out ("Read timeout expired"), re-send the same message,
    // and hold every later message behind it.
    const tg = new TelegramApi(BOT_TOKEN.value());
    const update = req.body;
    // Telegram re-sends an update it did not see answered in time. Remember
    // each one so a re-send is acknowledged and dropped, never run twice: a
    // second run would charge the AI allowance again and reply twice.
    if (update?.update_id !== undefined) {
        try {
            await db.collection("bot_updates_seen").doc(String(update.update_id)).create({
                at: Date.now(),
                expireAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            });
        }
        catch (e: any) {
            if (e?.code === 6 || /ALREADY_EXISTS/i.test(String(e?.message))) {
                res.status(200).send("OK");
                return;
            }
            // Any other failure: better to handle the message than to drop it.
            console.error("Update de-duplication failed:", e);
        }
    }
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
            // Reading it takes the AI several seconds, so it is queued.
            await enqueueBotJob({ kind: "invoice", chatId, photo: msg.photo });
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
    // One implementation, two channels: the WhatsApp lane routes free text
    // through the same function. It returns false when the text belongs to
    // no step, so the fallback below still fires.
    if (await log.handleStepText(tg, chatId, session, text)) return;
    // A sentence with no command and no step in progress: read it as a work
    // report. Returns false when it is not one, so the reply below still fires.
    if (looksLikeLogText(text) && geminiKey) {
        // Say something at once: the reading takes a few seconds and silence
        // reads as a bot that is not working.
        await tg.sendMessage(chatId, tt(lang, "aiReading"));
        await enqueueBotJob({ kind: "aiText", chatId, text });
        return;
    }
    await tg.sendMessage(chatId, tt(lang, "didntUnderstand"));
}
/** Hand slow, AI-backed work to the queue worker below. */
async function enqueueBotJob(job: { kind: "aiText"; chatId: any; text: string } | { kind: "invoice"; chatId: any; photo: any }) {
    await db.collection("bot_jobs").add({ ...job, createdAt: Date.now() });
}

/**
 * Does the slow half of a bot message: reading a typed work report or an
 * invoice photo with the AI. A Firestore trigger rather than more work in the
 * webhook, because the webhook must answer Telegram within seconds and a
 * trigger runs with full CPU for as long as the AI takes. Not retried on
 * failure, so a failed read is reported once rather than charged twice.
 */
export const onBotJobCreated = onDocumentCreated({
    document: "bot_jobs/{jobId}",
    database: FIRESTORE_DATABASE_ID,
    secrets: [BOT_TOKEN, GEMINI_API_KEY],
    timeoutSeconds: 120,
    maxInstances: 10,
}, async (event: any) => {
    const job: any = event.data?.data();
    if (!job?.chatId) return;
    const tg = new TelegramApi(BOT_TOKEN.value());
    const chatId = job.chatId;
    try {
        const session = await getSession(chatId);
        if (!(await validateSession(chatId, session))) {
            await tg.sendMessage(chatId, tt(session?.lang, "notLinkedShort"));
            return;
        }
        const lang: BotLang = normalizeLang(session?.lang);
        if (job.kind === "invoice") {
            await invoice.handleInvoicePhoto(tg, chatId, session, job.photo, GEMINI_API_KEY.value());
        } else if (job.kind === "aiText") {
            const handled = await aiLog.handleFreeText(tg, chatId, session, String(job.text || ""), GEMINI_API_KEY.value());
            if (!handled) await tg.sendMessage(chatId, tt(lang, "didntUnderstand"));
        }
    }
    catch (err) {
        console.error("Bot job failed:", job.kind, err);
        await recordBotError(job.kind || "job", err);
        try {
            const s = await getSession(chatId);
            await tg.sendMessage(chatId, tt(normalizeLang(s?.lang), "aiBusy"), [[{ text: tt(normalizeLang(s?.lang), "aiBtnLogWithButtons"), callback_data: "log" }]]);
        }
        catch { /* the user may have blocked the bot */ }
    }
    finally {
        await event.data?.ref?.delete().catch(() => {});
    }
});

export const onUserUnlinked = onDocumentUpdated({
    document: "users/{userId}",
    // Without this the trigger listens on "(default)" and never fires.
    database: FIRESTORE_DATABASE_ID,
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
