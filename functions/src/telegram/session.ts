import * as admin from "firebase-admin";

const db = admin.firestore();

export interface BotSession {
  chatId: number;
  userId?: string;
  email?: string;
  activeProjectId?: string;
  step?: string | null;
  draft?: Record<string, any>;     // in-progress log data
  recentTaskIds?: string[];        // for the Phase B "recent tasks" shortcut
  linkedAt?: number;
  lastSeenAt?: number;
}

export const getSession = async (chatId: number): Promise<BotSession | null> => {
  const snap = await db.collection("bot_sessions").doc(String(chatId)).get();
  return snap.exists ? (snap.data() as BotSession) : null;
};

export const setSession = async (chatId: number, data: Partial<BotSession>) => {
  await db
    .collection("bot_sessions")
    .doc(String(chatId))
    .set({ ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};

export const clearSession = async (chatId: number) => {
  await db.collection("bot_sessions").doc(String(chatId)).delete();
};

// Clears only the in-progress flow, keeps the login + active project.
export const clearStep = async (chatId: number) => {
  await db.collection("bot_sessions").doc(String(chatId)).set(
    {
      step: admin.firestore.FieldValue.delete(),
      draft: admin.firestore.FieldValue.delete(),
    } as any,
    { merge: true }
  );
};
