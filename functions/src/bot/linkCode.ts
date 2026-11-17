import * as crypto from "crypto";

/** Telegram link codes: pure, so they are tested without Firestore. */

/** 20 characters from A–Z and 0–9 (about 103 bits): /start accepts these as they are. */
export function newMemberCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(20);
  let out = "";
  for (const b of bytes) out += alphabet[b % 36];
  return out;
}

/**
 * Whether a link code can still be redeemed. Used and revoked codes never
 * can. A member link made by an admin (teamLinks.ts) has no expiry and is
 * revoked instead; every other code expires.
 */
export function codeUsable(data: any, now: number): boolean {
  if (!data || data.used || data.revoked) return false;
  if (data.kind === "member" && data.expiresAt === undefined) return true;
  return now <= (Number(data.expiresAt) || 0);
}
