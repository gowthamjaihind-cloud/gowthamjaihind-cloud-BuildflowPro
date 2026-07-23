"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSession = exports.redeemLinkCode = exports.checkRateLimit = void 0;
const admin = require("firebase-admin");
const db = admin.firestore();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const checkRateLimit = async (chatId) => {
    const ref = db.collection("bot_rate_limits").doc(String(chatId));
    const now = Date.now();
    return db.runTransaction(async (tx) => {
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
// Consumes a one-time code inside a transaction so it can NEVER be redeemed twice.
const redeemLinkCode = async (code, chatId) => {
    const ref = db.collection("bot_link_codes").doc(code);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
            console.log("LINK FAIL: code not found in bot_link_codes:", code);
            return { ok: false };
        }
        const data = snap.data();
        if (data.used) {
            console.log("LINK FAIL: code already used:", code, "usedAt:", data.usedAt);
            return { ok: false };
        }
        if (Date.now() > (data.expiresAt || 0)) {
            console.log("LINK FAIL: code expired:", code, "expiresAt:", data.expiresAt, "now:", Date.now(), "expired by ms:", Date.now() - data.expiresAt);
            return { ok: false };
        }
        console.log("LINK SUCCESS:", code, "for user:", data.userId);
        tx.update(ref, { used: true, usedAt: Date.now(), usedByChatId: chatId });
        const userRef = db.collection("users").doc(data.userId);
        const userSnap = await tx.get(userRef);
        const orgId = userSnap.data()?.currentOrgId;
        tx.update(userRef, {
            telegramChatId: chatId,
            telegramLinkedAt: Date.now(),
        });
        return { ok: true, email: data.email, userId: data.userId, orgId };
    });
};
exports.redeemLinkCode = redeemLinkCode;
// Every authenticated command must call this. It enforces admin revocation:
// if the admin clears telegramChatId, the session dies on the next message.
const validateSession = async (chatId, session) => {
    if (!session?.userId)
        return false;
    const snap = await db.collection("users").doc(session.userId).get();
    if (!snap.exists)
        return false;
    const u = snap.data();
    if (u.disabled === true || u.disabled === "true")
        return false;
    if (u.telegramChatId !== chatId)
        return false;
    if (u.currentOrgId !== session?.orgId) {
        await db.collection("bot_sessions").doc(String(chatId)).update({ orgId: u.currentOrgId || null });
        if (session)
            session.orgId = u.currentOrgId;
    }
    return true;
};
exports.validateSession = validateSession;
//# sourceMappingURL=auth.js.map