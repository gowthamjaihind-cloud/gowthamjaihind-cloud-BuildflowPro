import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logAuditEvent } from "../audit/logEvent";

export const bulkUpdateTasks = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { projectId, taskIds, updates } = request.data;
  if (!projectId || !taskIds || !Array.isArray(taskIds) || !updates) {
    throw new HttpsError("invalid-argument", "Missing required fields: projectId, taskIds, or updates.");
  }
  
  // Validation limit
  if (taskIds.length > 500) {
    throw new HttpsError("invalid-argument", "Cannot update more than 500 tasks per request.");
  }

  const db = admin.firestore();

  // Validate Project Access
  const projectDoc = await db.collection("projects").doc(projectId).get();
  if (!projectDoc.exists) {
    throw new HttpsError("not-found", "Project not found.");
  }

  const batch = db.batch();
  for (const taskId of taskIds) {
    const taskRef = db.collection("projects").doc(projectId).collection("tasks").doc(taskId);
    batch.update(taskRef, updates);
  }

  try {
    await batch.commit();
    await logAuditEvent({
      action: "TASKS_BULK_UPDATED",
      userId: request.auth.uid,
      resourceId: projectId,
      metadata: { count: taskIds.length, updates }
    });
    return { success: true, updatedCount: taskIds.length };
  } catch (error: any) {
    throw new HttpsError("internal", "Bulk update transaction failed.", error.message);
  }
});
