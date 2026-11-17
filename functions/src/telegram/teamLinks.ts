import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import { CALLABLE_OPTS } from "../callable";
import { db } from "../db";
import { TelegramApi } from "./api";
import { clearSession } from "./session";
import { newMemberCode } from "../bot/linkCode";

/**
 * Telegram for team members who never open the web app.
 *
 * An Owner or Admin makes a "Connect Telegram" link for one member and sends
 * it to them (WhatsApp, SMS). The member taps it, presses Start, and the bot
 * is connected as THEM, not as whoever made the link.
 *
 * - The code is long and random (made here, not in a browser), works once,
 *   and does not expire, as asked. Because whoever opens it first becomes
 *   that member in the bot, it can be revoked at any time, and making a new
 *   link revokes the old one, so only one is ever live per member.
 * - Unlink disconnects a member's Telegram on the spot.
 * The bot redeems these exactly like a member's own code (auth.ts).
 */

const BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const MANAGERS = ["Owner", "Admin"];

async function requireManagerOf(uid: string, orgIdIn: unknown, memberUid: unknown) {
  const orgId = String(orgIdIn || "").trim();
  const member = String(memberUid || "").trim();
  if (!orgId || !member) throw new HttpsError("invalid-argument", "Choose a member.");
  const org = await db.doc(`organizations/${orgId}`).get();
  const members = (org.data() as any)?.members || {};
  if (!org.exists || !MANAGERS.includes(members[uid])) {
    throw new HttpsError("permission-denied", "Only an Owner or Admin can manage team members' Telegram.");
  }
  if (!members[member]) throw new HttpsError("not-found", "That person is not a member of this organization.");
  return { orgId, member };
}

/** Every unused member link for this person in this org: revoked. */
async function revokeOpenLinks(orgId: string, member: string, by: string): Promise<number> {
  const open = await db.collection("bot_link_codes")
    .where("userId", "==", member).where("kind", "==", "member").where("used", "==", false).get();
  const mine = open.docs.filter((d) => (d.data() as any).orgId === orgId && !(d.data() as any).revoked);
  await Promise.all(mine.map((d) => d.ref.update({ revoked: true, revokedAt: Date.now(), revokedBy: by })));
  return mine.length;
}

let botUsername = "";
async function botName(): Promise<string> {
  if (botUsername) return botUsername;
  const me = await new TelegramApi(BOT_TOKEN.value()).getMe().catch(() => null);
  botUsername = String((me as any)?.result?.username || (me as any)?.username || "");
  return botUsername;
}

export const createMemberTelegramLink = onCall({ ...CALLABLE_OPTS, secrets: [BOT_TOKEN], timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const { orgId, member } = await requireManagerOf(uid, request.data?.orgId, request.data?.memberUid);
  await revokeOpenLinks(orgId, member, uid);
  const user = (await db.doc(`users/${member}`).get()).data() as any;
  const code = newMemberCode();
  await db.doc(`bot_link_codes/${code}`).set({
    kind: "member",
    userId: member,
    email: user?.email || "",
    orgId,
    createdAt: Date.now(),
    createdBy: uid,
    used: false,
    revoked: false,
    // No expiresAt: these links do not expire (auth.ts). Revoke instead.
  });
  const name = await botName();
  if (!name) throw new HttpsError("unavailable", "The bot could not be reached. Try again in a minute.");
  return { link: `https://t.me/${name}?start=${code}`, createdAt: Date.now() };
});

export const revokeMemberTelegramLink = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const { orgId, member } = await requireManagerOf(uid, request.data?.orgId, request.data?.memberUid);
  return { revoked: await revokeOpenLinks(orgId, member, uid) };
});

export const unlinkMemberTelegram = onCall({ ...CALLABLE_OPTS, secrets: [BOT_TOKEN], timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const { orgId, member } = await requireManagerOf(uid, request.data?.orgId, request.data?.memberUid);
  const ref = db.doc(`users/${member}`);
  const chatId = (await ref.get()).data()?.telegramChatId;
  await ref.update({ telegramChatId: FieldValue.delete(), telegramLinkedAt: FieldValue.delete() });
  await revokeOpenLinks(orgId, member, uid);
  if (chatId) {
    await clearSession(chatId).catch(() => {});
    await new TelegramApi(BOT_TOKEN.value())
      .sendMessage(chatId, "🔌 Your Telegram has been disconnected from Sitetru by your company's admin. Ask them for a new link if you need it again.")
      .catch(() => {});
  }
  return { unlinked: !!chatId };
});

/** Team panel: who is connected, and who has a link waiting. */
export const listTeamTelegram = onCall({ ...CALLABLE_OPTS, timeoutSeconds: 30 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const orgId = String(request.data?.orgId || "").trim();
  const org = await db.doc(`organizations/${orgId}`).get();
  const members = (org.data() as any)?.members || {};
  if (!org.exists || !MANAGERS.includes(members[uid])) throw new HttpsError("permission-denied", "Only an Owner or Admin can see this.");
  const uids = Object.keys(members).slice(0, 200);
  const out: Record<string, { linked: boolean; linkedAt?: number; pendingSince?: number }> = {};
  await Promise.all(uids.map(async (m) => {
    const [u, open] = await Promise.all([
      db.doc(`users/${m}`).get(),
      db.collection("bot_link_codes").where("userId", "==", m).where("kind", "==", "member").where("used", "==", false).get(),
    ]);
    const pending = open.docs.map((d) => d.data() as any).filter((d) => d.orgId === orgId && !d.revoked);
    out[m] = {
      linked: !!(u.data() as any)?.telegramChatId,
      ...((u.data() as any)?.telegramLinkedAt ? { linkedAt: Number((u.data() as any).telegramLinkedAt) } : {}),
      ...(pending.length ? { pendingSince: Math.max(...pending.map((p) => Number(p.createdAt) || 0)) } : {}),
    };
  }));
  return out;
});
