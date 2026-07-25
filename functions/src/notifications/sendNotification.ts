import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db } from "../db";

// Example of a background trigger function for notifications
export const onApprovalCreated = onDocumentCreated("approvals/{approvalId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const approvalData = snapshot.data();
  const approverId = approvalData.approverId;
  
  if (!approverId) return;

  // Here we would lookup the user's FCM tokens
  const userDoc = await db.collection("users").doc(approverId).get();
  const fcmTokens = userDoc.data()?.fcmTokens;

  if (fcmTokens && Array.isArray(fcmTokens) && fcmTokens.length > 0) {
    const payload = {
      notification: {
        title: "New Approval Required",
        body: `You have a new pending approval for: ${approvalData.type}`,
      },
      data: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        approvalId: event.params.approvalId,
      }
    };

    try {
      await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        ...payload
      });
      console.log(`Notification sent to ${approverId}`);
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }

  // Also create in-app notification doc
  await db.collection("notifications").add({
    userId: approverId,
    title: "New Approval Required",
    message: `You have a new pending approval.`,
    isRead: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    linkId: event.params.approvalId,
    type: "APPROVAL_REQUEST"
  });
});
