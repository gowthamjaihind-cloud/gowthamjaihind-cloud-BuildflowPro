"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processApproval = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logEvent_1 = require("../audit/logEvent");
const db_1 = require("../db");
exports.processApproval = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const { approvalId, action, comments } = request.data;
    if (!approvalId || !["APPROVED", "REJECTED"].includes(action)) {
        throw new https_1.HttpsError("invalid-argument", "Valid approvalId and action (APPROVED/REJECTED) are required.");
    }
    try {
        const result = await db_1.db.runTransaction(async (transaction) => {
            const approvalRef = db_1.db.collection("approvals").doc(approvalId);
            const doc = await transaction.get(approvalRef);
            if (!doc.exists) {
                throw new https_1.HttpsError("not-found", "Approval request not found.");
            }
            const data = doc.data();
            if (data?.status !== "PENDING") {
                throw new https_1.HttpsError("failed-precondition", "Approval is no longer pending.");
            }
            // RBAC: Verify user is the assigned approver
            if (data?.approverId !== request.auth.uid) {
                throw new https_1.HttpsError("permission-denied", "You are not authorized to process this approval.");
            }
            transaction.update(approvalRef, {
                status: action,
                comments: comments || null,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
                processedBy: request.auth.uid
            });
            // Cascading logic based on type (example: if approving a procurement order)
            if (action === "APPROVED" && data?.type === "PROCUREMENT") {
                const orderRef = db_1.db.collection("procurement").doc(data.referenceId);
                transaction.update(orderRef, { status: "APPROVED" });
            }
            return { status: action, referenceId: data?.referenceId };
        });
        await (0, logEvent_1.logAuditEvent)({
            action: `APPROVAL_${action}`,
            userId: request.auth.uid,
            resourceId: approvalId,
        });
        return { success: true, result };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", error.message);
    }
});
//# sourceMappingURL=processApproval.js.map