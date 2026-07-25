import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logAuditEvent } from "../audit/logEvent";
import { db } from "../db";

export const processApproval = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { approvalId, action, comments } = request.data;
  if (!approvalId || !["APPROVED", "REJECTED"].includes(action)) {
    throw new HttpsError("invalid-argument", "Valid approvalId and action (APPROVED/REJECTED) are required.");
  }

  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const approvalRef = db.collection("approvals").doc(approvalId);
      const doc = await transaction.get(approvalRef);
      
      if (!doc.exists) {
        throw new HttpsError("not-found", "Approval request not found.");
      }
      
      const data = doc.data();
      if (data?.status !== "PENDING") {
        throw new HttpsError("failed-precondition", "Approval is no longer pending.");
      }
      
      // RBAC: Verify user is the assigned approver
      if (data?.approverId !== request.auth!.uid) {
         throw new HttpsError("permission-denied", "You are not authorized to process this approval.");
      }
      
      transaction.update(approvalRef, {
        status: action,
        comments: comments || null,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: request.auth!.uid
      });
      
      // Cascading logic based on type (example: if approving a procurement order)
      if (action === "APPROVED" && data?.type === "PROCUREMENT") {
         const orderRef = db.collection("procurement").doc(data.referenceId);
         transaction.update(orderRef, { status: "APPROVED" });
      }
      
      return { status: action, referenceId: data?.referenceId };
    });

    await logAuditEvent({
      action: `APPROVAL_${action}`,
      userId: request.auth.uid,
      resourceId: approvalId,
    });

    return { success: true, result };
  } catch (error: any) {
    throw new HttpsError("internal", error.message);
  }
});
