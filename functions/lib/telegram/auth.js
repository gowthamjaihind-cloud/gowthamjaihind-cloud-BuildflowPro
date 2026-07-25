"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSession = exports.redeemLinkCode = exports.checkRateLimit = void 0;
const db_1 = require("../db");
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;
const checkRateLimit = async (chatId) => {
    const ref = db_1.db.collection("bot_rate_limits").doc(String(chatId));
    const now = Date.now();
    return db_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        if (!data || now > (data.resetAt || 0)) {
            tx.set(ref, { count: 1, resetAt: now + WINDOW_MS });
            return true;
        }
        if ((data.count || 0) >= MAX_ATTEMPTS)
            return false;
        tx.update(ref, { count: (data.count || 0) + 1 });
        return true;
    });
};
exports.checkRateLimit = checkRateLimit;
const redeemLinkCode = async (code, chatId) => {
    const ref = db_1.db.collection("bot_link_codes").doc(code);
    return db_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            return { ok: false };
        const data = snap.data();
        if (data.used)
            return { ok: false };
        if (Date.now() > (data.expiresAt || 0))
            return { ok: false };
        tx.update(ref, { used: true, usedAt: Date.now(), usedByChatId: chatId });
        tx.update(db_1.db.collection("users").doc(data.userId), {
            telegramChatId: chatId,
            telegramLinkedAt: Date.now(),
        });
        return { ok: true, email: data.email, userId: data.userId, orgId: data.orgId };
    });
};
exports.redeemLinkCode = redeemLinkCode;
const validateSession = async (chatId, session) => {
    if (!session?.userId)
        return false;
    const snap = await db_1.db.collection("users").doc(session.userId).get();
    if (!snap.exists)
        return false;
    const u = snap.data();
    if (u.disabled === true || u.disabled === "true")
        return false;
    if (u.telegramChatId !== chatId)
        return false;
    return true;
};
exports.validateSession = validateSession;
//# sourceMappingURL=auth.js.map