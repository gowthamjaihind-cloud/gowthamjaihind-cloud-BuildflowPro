"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProject = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logEvent_1 = require("../audit/logEvent");
exports.deleteProject = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const { projectId } = request.data;
    if (!projectId) {
        throw new https_1.HttpsError("invalid-argument", "Missing projectId.");
    }
    const db = admin.firestore();
    // RBAC Validation
    const projectRef = db.collection("projects").doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) {
        throw new https_1.HttpsError("not-found", "Project not found.");
    }
    const projectData = projectDoc.data();
    // Assume ownerId or admins array check
    if (projectData?.ownerId !== request.auth.uid) {
        const isAdmin = request.auth.token?.admin === true; // Check admin claims if needed
        if (!isAdmin) {
            throw new https_1.HttpsError("permission-denied", "Must be project owner to delete.");
        }
    }
    // Recursive deletion logic - use bulk writer for safety
    const bulkWriter = db.bulkWriter();
    try {
        await db.recursiveDelete(projectRef, bulkWriter);
        // Log the audit event
        await (0, logEvent_1.logAuditEvent)({
            action: "PROJECT_DELETED",
            userId: request.auth.uid,
            resourceId: projectId,
            metadata: { projectName: projectData?.name }
        });
        return { success: true, message: `Project ${projectId} deleted successfully.` };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", "Error deleting project.", error.message);
    }
});
//# sourceMappingURL=deleteProject.js.map