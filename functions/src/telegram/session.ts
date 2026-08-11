import * as admin from "firebase-admin";
import { db } from "../db";

export interface BotSession {
  chatId: number;
  userId?: string;
  email?: string;
  orgId?: string;
  activeProjectId?: string;
  step?: string | null;
  draft?: Record<string, any>;
  planDraft?: Record<string, any> | null; // morning plan being assembled
  recentTaskIds?: string[];
  saving?: boolean;          // idempotency guard against double-tap on Save
  linkedAt?: number;
  lastSeenAt?: number;
}

export const getSession = async (chatId: number): Promise<BotSession | null> => {
  const snap = await db.collection("bot_sessions").doc(String(chatId)).get();
  return snap.exists ? (snap.data() as BotSession) : null;
};

export const setSession = async (chatId: number, data: Partial<BotSession>) => {
  await db.collection("bot_sessions").doc(String(chatId))
    .set({ ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};

export const clearStep = async (chatId: number) => {
  await db.collection("bot_sessions").doc(String(chatId)).set(
    {
      step: admin.firestore.FieldValue.delete(),
      draft: admin.firestore.FieldValue.delete(),
      saving: admin.firestore.FieldValue.delete(),
    } as any,
    { merge: true }
  );
};

export const clearSession = async (chatId: number) => {
  await db.collection("bot_sessions").doc(String(chatId)).delete();
};
