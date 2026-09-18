import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Everything that has to be right about an inbound WhatsApp webhook, kept pure
 * so it can be tested without standing up a function.
 *
 * Two of these are security or correctness traps rather than preferences:
 *
 * THE SIGNATURE IS OVER THE RAW BYTES. Meta signs the body exactly as sent.
 * Verifying `JSON.stringify(req.body)` instead passes in testing and fails in
 * production the moment Meta's serialisation differs from Node's by one space
 * or one unicode escape -- or, worse, appears to work while accepting forged
 * payloads if anything normalises the object in between. `req.rawBody` only.
 *
 * STATUS CALLBACKS ARE NOT MESSAGES. Meta posts delivery and read receipts to
 * the same webhook, in the same envelope shape, under `statuses` instead of
 * `messages`. Treating those as user input is how a bot ends up replying to its
 * own delivery receipt and then replying to the receipt for that reply.
 */

export interface InboundMessage {
  /** The sender's WhatsApp id -- a phone number in international form. */
  from: string;
  /** Meta's message id, needed to mark it read. */
  messageId: string;
  kind: "text" | "reply" | "image" | "document" | "audio" | "unsupported";
  /** Body text for `text`, or the visible title of a tapped option. */
  text?: string;
  /** For `reply`: the id of the button or list row, i.e. Telegram callback_data. */
  replyId?: string;
  mediaId?: string;
  mimeType?: string;
  /** Meta's own display name for the sender, when the envelope carries it. */
  profileName?: string;
}

/**
 * Constant-time check of `X-Hub-Signature-256` against the app secret.
 *
 * Returns false rather than throwing on a malformed header, because a bad
 * signature and a missing one deserve the same answer.
 */
export function verifySignature(
  rawBody: Buffer | string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const [scheme, given] = header.split("=");
  if (scheme !== "sha256" || !given) return false;

  const expected = createHmac("sha256", appSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8"))
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(given, "hex");
  } catch {
    return false;
  }
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The GET handshake Meta performs when the webhook URL is first saved. */
export function verifyChallenge(
  query: Record<string, unknown>,
  verifyToken: string,
): string | null {
  const mode = String(query["hub.mode"] ?? "");
  const token = String(query["hub.verify_token"] ?? "");
  const challenge = query["hub.challenge"];
  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge != null) {
    return String(challenge);
  }
  return null;
}

/**
 * Pull the user messages out of a webhook payload.
 *
 * Returns an empty array for status callbacks, unknown fields and anything
 * malformed -- the caller should treat "nothing to do" as the normal case,
 * since receipts outnumber messages.
 */
export function parseInbound(payload: any): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field && change.field !== "messages") continue;
      const value = change?.value;
      // Delivery/read receipts land here too. They are not input.
      if (!value || !Array.isArray(value.messages)) continue;

      const profileName = value?.contacts?.[0]?.profile?.name;

      for (const m of value.messages) {
        if (!m?.from || !m?.id) continue;
        const base = { from: String(m.from), messageId: String(m.id), profileName };

        switch (m.type) {
          case "text":
            out.push({ ...base, kind: "text", text: m.text?.body ?? "" });
            break;
          case "interactive": {
            const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
            if (r?.id) out.push({ ...base, kind: "reply", replyId: String(r.id), text: r.title });
            else out.push({ ...base, kind: "unsupported" });
            break;
          }
          case "button":
            // A tap on a template's quick-reply button.
            out.push({ ...base, kind: "reply", replyId: String(m.button?.payload ?? m.button?.text ?? ""), text: m.button?.text });
            break;
          case "image":
            out.push({ ...base, kind: "image", mediaId: m.image?.id, mimeType: m.image?.mime_type, text: m.image?.caption });
            break;
          case "document":
            out.push({ ...base, kind: "document", mediaId: m.document?.id, mimeType: m.document?.mime_type, text: m.document?.caption });
            break;
          case "audio":
            out.push({ ...base, kind: "audio", mediaId: m.audio?.id, mimeType: m.audio?.mime_type });
            break;
          default:
            out.push({ ...base, kind: "unsupported" });
        }
      }
    }
  }
  return out;
}

/**
 * Session key for a WhatsApp user.
 *
 * Namespaced because `bot_sessions` is keyed by Telegram's numeric chat id, and
 * a bare phone number could in principle collide with one. Keeping both
 * channels in one collection is deliberate: a person linked on both should get
 * the same active project and language.
 */
export const waSessionKey = (waId: string) => `wa:${waId}`;
