"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = void 0;
const admin = require("firebase-admin");
const db_1 = require("../db");
const logAuditEvent = async (event) => {
    try {
        await db_1.db.collection("audit_logs").add({
            ...event,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        console.error("Failed to log audit event:", error);
        // Best effort logging, don't throw to break main workflow typically
    }
};
exports.logAuditEvent = logAuditEvent;
//# sourceMappingURL=logEvent.js.map