import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logAuditEvent } from "../audit/logEvent";
import { db } from "../db";

export const processCostAnalysisData = onCall({ timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { projectId } = request.data;
  if (!projectId) {
    throw new HttpsError("invalid-argument", "Missing projectId.");
  }

  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) {
    throw new HttpsError("not-found", "Project not found.");
  }

  try {
    // 1. Bulk aggregate data on backend safely
    // 2. Format for AI Prompt
    // 3. Call AI endpoint (e.g. Gemini via vertex-ai)
    
    // Using mock data for architecture demonstration
    const mockInsight = "Cost variance detected in Material allocations. Labor efficiencies are nominal.";

    // 4. Save result
    await db.collection("projects").doc(projectId).collection("analytics").doc("latestInsights").set({
      insights: mockInsight,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: request.auth.uid
    });

    await logAuditEvent({
      action: "AI_ANALYSIS_GENERATED",
      userId: request.auth.uid,
      resourceId: projectId
    });

    return { success: true, insights: mockInsight };
  } catch (error: any) {
    console.error("AI Workflow Error:", error);
    throw new HttpsError("internal", "AI Processing failed.", error.message);
  }
});
