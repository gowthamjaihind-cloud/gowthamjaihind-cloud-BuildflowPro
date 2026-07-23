import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase_client.ts";
import { BotSession } from "./session.ts";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

export const checkRateLimit = async (chatId: number): Promise<boolean> => {
  const ref = doc(db, "bot_rate_limits", String(chatId));
  const now = Date.now();
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data()! : null;
    if (!data || now > (data.resetAt || 0)) {
      tx.set(ref, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if ((data.count || 0) >= MAX_ATTEMPTS) return false;
    tx.update(ref, { count: (data.count || 0) + 1 });
    return true;
  });
};

export interface RedeemResult { ok: boolean; email?: string; userId?: string; orgId?: string; }

export const redeemLinkCode = async (code: string, chatId: number): Promise<RedeemResult> => {
  const ref = doc(db, "bot_link_codes", code);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false };
    const data = snap.data()!;
    if (data.used) return { ok: false };
    if (Date.now() > (data.expiresAt || 0)) return { ok: false };

    // Read user document before any write operations
    const userRef = doc(db, "users", data.userId);
    const userSnap = await tx.get(userRef);
    const orgId = userSnap.exists() ? userSnap.data()?.currentOrgId : undefined;

    if (userSnap.exists()) {
      tx.update(userRef, {
        telegramChatId: chatId,
        telegramLinkedAt: Date.now(),
      });
    } else {
      tx.set(userRef, {
        uid: data.userId,
        email: data.email || "",
        telegramChatId: chatId,
        telegramLinkedAt: Date.now(),
        role: "Viewer"
      }, { merge: true });
    }

    return { ok: true, email: data.email, userId: data.userId, orgId };
  });
};

export const validateSession = async (chatId: number, session: BotSession | null): Promise<boolean> => {
  if (!session?.userId) return false;
  const snap = await getDoc(doc(db, "users", session.userId));
  if (!snap.exists()) return false;
  const u = snap.data()!;
  if (u.disabled === true || u.disabled === "true") return false;
  if (String(u.telegramChatId) !== String(chatId)) return false;
  return true;
};
