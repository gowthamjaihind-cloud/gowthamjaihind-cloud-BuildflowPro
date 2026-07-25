"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCostAnalysisData = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logEvent_1 = require("../audit/logEvent");
const db_1 = require("../db");
exports.processCostAnalysisData = (0, https_1.onCall)({ timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "User must be logged in.");
    }
    const { projectId } = request.data;
    if (!projectId) {
        throw new https_1.HttpsError("invalid-argument", "Missing projectId.");
    }
    const projectDoc = await db_1.db.collection("projects").doc(projectId).get();
    if (!projectDoc.exists) {
        throw new https_1.HttpsError("not-found", "Project not found.");
    }
    try {
        // 1. Bulk aggregate data on backend safely
        // 2. Format for AI Prompt
        // 3. Call AI endpoint (e.g. Gemini via vertex-ai)
        // Using mock data for architecture demonstration
        const mockInsight = "Cost variance detected in Material allocations. Labor efficiencies are nominal.";
        // 4. Save result
        await db_1.db.collection("projects").doc(projectId).collection("analytics").doc("latestInsights").set({
            insights: mockInsight,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            generatedBy: request.auth.uid
        });
        await (0, logEvent_1.logAuditEvent)({
            action: "AI_ANALYSIS_GENERATED",
            userId: request.auth.uid,
            resourceId: projectId
        });
        return { success: true, insights: mockInsight };
    }
    catch (error) {
        console.error("AI Workflow Error:", error);
        throw new https_1.HttpsError("internal", "AI Processing failed.", error.message);
    }
});
//# sourceMappingURL=processAIWorkflow.js.map