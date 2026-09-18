/**
 * Which channel a session belongs to, and what follows from that.
 *
 * Deliberately PURE -- no Firestore, no firebase-functions, nothing that needs
 * an initialised admin app. These rules decide whether a person's Telegram link
 * survives them linking WhatsApp, and whether a reminder arrives at all, so
 * they have to be testable without standing up a runtime. `session.ts` imports
 * `db`, which calls `getFirestore()` at module load; anything that imports it
 * cannot be unit tested, which is how this policy ended up untested the first
 * time round.
 */

/**
 * Who a session belongs to.
 *
 * Telegram gives a numeric chat id; WhatsApp gives a phone number, namespaced
 * with `WA_PREFIX`. Both are only ever stringified on the way to Firestore and
 * handed back to their own API, so one widened type lets a single set of
 * handlers drive both channels rather than the log flow being written twice.
 */
export type ChatId = string | number;

export type Channel = "telegram" | "whatsapp";

/** WhatsApp session keys carry this; Telegram keys are bare numbers. */
export const WA_PREFIX = "wa:";

/**
 * The channel is derived from the key rather than passed beside it, because a
 * parameter can be forgotten and a prefix cannot.
 */
export const channelOf = (chatId: ChatId): Channel =>
  typeof chatId === "string" && chatId.startsWith(WA_PREFIX) ? "whatsapp" : "telegram";

/**
 * The user-document fields a channel links through.
 *
 * Writing a WhatsApp id into `telegramChatId` silently unlinks that person's
 * Telegram: their session stops validating, and the 5 PM Telegram reminder then
 * tries to send to "wa:9190...". Nothing throws; the bot just goes quiet.
 */
export const linkFields = (channel: Channel) =>
  channel === "whatsapp"
    ? { id: "whatsappId" as const, at: "whatsappLinkedAt" as const }
    : { id: "telegramChatId" as const, at: "telegramLinkedAt" as const };

/** Strip the namespace to get the bare number the Cloud API wants. */
export const toPhone = (waId: string) =>
  waId.startsWith(WA_PREFIX) ? waId.slice(WA_PREFIX.length) : waId;

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Is this person still inside WhatsApp's 24-hour customer-service window?
 *
 * Telegram will deliver a bot message to anyone who ever started the bot, at
 * any time, for nothing. WhatsApp will not: free-form messages only land within
 * 24 hours of the person's last message to the business, and outside that the
 * only thing that arrives is a template Meta approved in advance, billed per
 * conversation.
 *
 * `lastSeenAt` is written by `setSession` on every inbound message -- exactly
 * the event that opens the window -- so it is the right clock. Unknown is
 * treated as CLOSED: guessing open sends free-form text that Meta silently
 * drops, and a reminder nobody receives is worse than a paid one that arrives.
 */
export function withinServiceWindow(
  session: { lastSeenAt?: number } | null,
  now = Date.now(),
): boolean {
  if (!session?.lastSeenAt) return false;
  return now - session.lastSeenAt < SERVICE_WINDOW_MS;
}
