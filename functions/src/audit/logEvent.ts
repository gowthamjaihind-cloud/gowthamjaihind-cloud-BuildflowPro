import { db } from "../db";
import { FieldValue } from "firebase-admin/firestore";

interface AuditEvent {
  action: string;
  userId: string;
  resourceId: string;
  metadata?: any;
}

export const logAuditEvent = async (event: AuditEvent) => {
  try {
    await db.collection("audit_logs").add({
      ...event,
      timestamp: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log audit event:", error);
    // Best effort logging, don't throw to break main workflow typically
  }
};
