"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onApprovalCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
// Example of a background trigger function for notifications
exports.onApprovalCreated = (0, firestore_1.onDocumentCreated)("approvals/{approvalId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const approvalData = snapshot.data();
    const approverId = approvalData.approverId;
    if (!approverId)
        return;
    const db = admin.firestore();
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
        }
        catch (error) {
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
//# sourceMappingURL=sendNotification.js.map