"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSession = exports.clearStep = exports.setSession = exports.getSession = void 0;
const admin = require("firebase-admin");
const db_1 = require("../db");
const getSession = async (chatId) => {
    const snap = await db_1.db.collection("bot_sessions").doc(String(chatId)).get();
    return snap.exists ? snap.data() : null;
};
exports.getSession = getSession;
const setSession = async (chatId, data) => {
    await db_1.db.collection("bot_sessions").doc(String(chatId))
        .set({ ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};
exports.setSession = setSession;
const clearStep = async (chatId) => {
    await db_1.db.collection("bot_sessions").doc(String(chatId)).set({
        step: admin.firestore.FieldValue.delete(),
        draft: admin.firestore.FieldValue.delete(),
        saving: admin.firestore.FieldValue.delete(),
    }, { merge: true });
};
exports.clearStep = clearStep;
const clearSession = async (chatId) => {
    await db_1.db.collection("bot_sessions").doc(String(chatId)).delete();
};
exports.clearSession = clearSession;
//# sourceMappingURL=session.js.map