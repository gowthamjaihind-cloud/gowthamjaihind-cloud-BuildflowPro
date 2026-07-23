"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUpdateTasks = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logEvent_1 = require("../audit/logEvent");
exports.bulkUpdateTasks = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const { projectId, taskIds, updates } = request.data;
    if (!projectId || !taskIds || !Array.isArray(taskIds) || !updates) {
        throw new https_1.HttpsError("invalid-argument", "Missing required fields: projectId, taskIds, or updates.");
    }
    // Validation limit
    if (taskIds.length > 500) {
        throw new https_1.HttpsError("invalid-argument", "Cannot update more than 500 tasks per request.");
    }
    const db = admin.firestore();
    // Validate Project Access
    const projectDoc = await db.collection("projects").doc(projectId).get();
    if (!projectDoc.exists) {
        throw new https_1.HttpsError("not-found", "Project not found.");
    }
    const batch = db.batch();
    for (const taskId of taskIds) {
        const taskRef = db.collection("projects").doc(projectId).collection("tasks").doc(taskId);
        batch.update(taskRef, updates);
    }
    try {
        await batch.commit();
        await (0, logEvent_1.logAuditEvent)({
            action: "TASKS_BULK_UPDATED",
            userId: request.auth.uid,
            resourceId: projectId,
            metadata: { count: taskIds.length, updates }
        });
        return { success: true, updatedCount: taskIds.length };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", "Bulk update transaction failed.", error.message);
    }
});
//# sourceMappingURL=bulkTaskOperations.js.map