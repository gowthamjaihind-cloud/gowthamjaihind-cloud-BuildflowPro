import * as admin from "firebase-admin";
import { db } from "../db";

/**
 * Who a session belongs to.
 *
 * Telegram gives a numeric chat id; WhatsApp gives a phone number, namespaced
 * as `wa:<number>` (see whatsapp/inbound.ts). Both only ever get stringified on
 * the way to Firestore and passed back to their own API, so one widened type
 * lets a single set of handlers drive both channels rather than the log flow
 * being written twice and drifting apart.
 */
export type ChatId = string | number;

export interface BotSession {
  chatId: ChatId;
  userId?: string;
  email?: string;
  orgId?: string;
  activeProjectId?: string;
  step?: string | null;
  draft?: Record<string, any>;
  planDraft?: Record<string, any> | null; // morning plan being assembled
  recentTaskIds?: string[];
  saving?: boolean;          // idempotency guard against double-tap on Save
  lang?: "en" | "ta";        // per-user bot language preference
  linkedAt?: number;
  lastSeenAt?: number;
}

export const getSession = async (chatId: ChatId): Promise<BotSession | null> => {
  const snap = await db.collection("bot_sessions").doc(String(chatId)).get();
  return snap.exists ? (snap.data() as BotSession) : null;
};

export const setSession = async (chatId: ChatId, data: Partial<BotSession>) => {
  await db.collection("bot_sessions").doc(String(chatId))
    .set({ ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};

export const clearStep = async (chatId: ChatId) => {
  await db.collection("bot_sessions").doc(String(chatId)).set(
    {
      step: admin.firestore.FieldValue.delete(),
      draft: admin.firestore.FieldValue.delete(),
      saving: admin.firestore.FieldValue.delete(),
    } as any,
    { merge: true }
  );
};

export const clearSession = async (chatId: ChatId) => {
  await db.collection("bot_sessions").doc(String(chatId)).delete();
};
