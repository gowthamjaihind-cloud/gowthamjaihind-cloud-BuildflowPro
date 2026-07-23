import { doc, getDoc, setDoc, deleteField } from "firebase/firestore";
import { db } from "../firebase_client.ts";

export interface BotSession {
  chatId: number;
  userId?: string;
  email?: string;
  orgId?: string;
  activeProjectId?: string;
  step?: string | null;
  draft?: Record<string, any>;
  recentTaskIds?: string[];
  saving?: boolean;
  linkedAt?: number;
  lastSeenAt?: number;
}

export const getSession = async (chatId: number): Promise<BotSession | null> => {
  const snap = await getDoc(doc(db, "bot_sessions", String(chatId)));
  return snap.exists() ? (snap.data() as BotSession) : null;
};

export const setSession = async (chatId: number, data: Partial<BotSession>) => {
  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
  await setDoc(doc(db, "bot_sessions", String(chatId)), { ...cleanData, chatId, lastSeenAt: Date.now() }, { merge: true });
};

export const clearStep = async (chatId: number) => {
  await setDoc(doc(db, "bot_sessions", String(chatId)), {
    step: deleteField(),
    draft: deleteField(),
    saving: deleteField(),
  }, { merge: true });
};
export async function clearSession(chatId: number): Promise<void> {
  await setDoc(doc(db, "bot_sessions", String(chatId)), { userId: deleteField(), email: deleteField(), orgId: deleteField() }, { merge: true });
}
