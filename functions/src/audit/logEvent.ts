import * as admin from "firebase-admin";

interface AuditEvent {
  action: string;
  userId: string;
  resourceId: string;
  metadata?: any;
}

export const logAuditEvent = async (event: AuditEvent) => {
  const db = admin.firestore();
  try {
    await db.collection("audit_logs").add({
      ...event,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
    // Best effort logging, don't throw to break main workflow typically
  }
};
