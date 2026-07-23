import * as admin from "firebase-admin";
import { BotSession } from "./session";

const db = admin.firestore();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

export const checkRateLimit = async (chatId: number): Promise<boolean> => {
  const ref = db.collection("bot_rate_limits").doc(String(chatId));
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : null;
    if (!data || now > (data.resetAt || 0)) {
      tx.set(ref, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if ((data.count || 0) >= MAX_ATTEMPTS) return false;
    tx.update(ref, { count: (data.count || 0) + 1 });
    return true;
  });
};

export interface RedeemResult { ok: boolean; email?: string; userId?: string; }

export const redeemLinkCode = async (code: string, chatId: number): Promise<RedeemResult> => {
  const ref = db.collection("bot_link_codes").doc(code);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false };
    const data = snap.data()!;
    if (data.used) return { ok: false };
    if (Date.now() > (data.expiresAt || 0)) return { ok: false };
    tx.update(ref, { used: true, usedAt: Date.now(), usedByChatId: chatId });
    tx.update(db.collection("users").doc(data.userId), {
      telegramChatId: chatId,
      telegramLinkedAt: Date.now(),
    });
    return { ok: true, email: data.email, userId: data.userId };
  });
};

export const validateSession = async (chatId: number, session: BotSession | null): Promise<boolean> => {
  if (!session?.userId) return false;
  const snap = await db.collection("users").doc(session.userId).get();
  if (!snap.exists) return false;
  const u = snap.data()!;
  if (u.disabled === true || u.disabled === "true") return false;
  if (u.telegramChatId !== chatId) return false;
  return true;
};
