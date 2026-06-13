import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logAuditEvent } from "../audit/logEvent";

export const deleteProject = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { projectId } = request.data;
  if (!projectId) {
    throw new HttpsError("invalid-argument", "Missing projectId.");
  }

  const db = admin.firestore();
  
  // RBAC Validation
  const projectRef = db.collection("projects").doc(projectId);
  const projectDoc = await projectRef.get();
  
  if (!projectDoc.exists) {
    throw new HttpsError("not-found", "Project not found.");
  }
  
  const projectData = projectDoc.data();
  // Assume ownerId or admins array check
  if (projectData?.ownerId !== request.auth.uid) {
    const isAdmin = request.auth.token?.admin === true; // Check admin claims if needed
    if (!isAdmin) {
      throw new HttpsError("permission-denied", "Must be project owner to delete.");
    }
  }

  // Recursive deletion logic - use bulk writer for safety
  const bulkWriter = db.bulkWriter();
  
  try {
    await db.recursiveDelete(projectRef, bulkWriter);
    
    // Log the audit event
    await logAuditEvent({
      action: "PROJECT_DELETED",
      userId: request.auth.uid,
      resourceId: projectId,
      metadata: { projectName: projectData?.name }
    });

    return { success: true, message: `Project ${projectId} deleted successfully.` };
  } catch (error: any) {
    throw new HttpsError("internal", "Error deleting project.", error.message);
  }
});
