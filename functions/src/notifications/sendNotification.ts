import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { db, FIRESTORE_DATABASE_ID } from "../db";

// Example of a background trigger function for notifications
// Bound to the app's NAMED Firestore database; without `database` a v2
// trigger listens on "(default)", where no approval is ever written.
export const onApprovalCreated = onDocumentCreated(
  { document: "approvals/{approvalId}", database: FIRESTORE_DATABASE_ID },
  async (event) => {
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
