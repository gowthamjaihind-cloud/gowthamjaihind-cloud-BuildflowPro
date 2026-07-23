"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearStep = exports.clearSession = exports.setSession = exports.getSession = void 0;
const admin = require("firebase-admin");
const db = admin.firestore();
const getSession = async (chatId) => {
    const snap = await db.collection("bot_sessions").doc(String(chatId)).get();
    return snap.exists ? snap.data() : null;
};
exports.getSession = getSession;
const setSession = async (chatId, data) => {
    await db
        .collection("bot_sessions")
        .doc(String(chatId))
        .set({ ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};
exports.setSession = setSession;
const clearSession = async (chatId) => {
    await db.collection("bot_sessions").doc(String(chatId)).delete();
};
exports.clearSession = clearSession;
// Clears only the in-progress flow, keeps the login + active project.
const clearStep = async (chatId) => {
    await db.collection("bot_sessions").doc(String(chatId)).set({
        step: admin.firestore.FieldValue.delete(),
        draft: admin.firestore.FieldValue.delete(),
    }, { merge: true });
};
exports.clearStep = clearStep;
//# sourceMappingURL=session.js.map