import { toInteractive, toCloudApiPayload, type InlineButton } from "./interactive";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * WhatsApp Cloud API client, shaped to match `TelegramApi` on purpose.
 *
 * The handlers in `telegram/handlers/*` are the product: the log flow, the task
 * picker, the morning plan. Giving this class the same method names lets those
 * flows be driven over either channel instead of being written twice and
 * drifting. Where WhatsApp genuinely cannot do what Telegram does, the method
 * still exists and does the closest honest thing, documented at the method.
 */
export class WhatsAppApi {
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  private async call(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Meta returns 400 with the offending field buried in error.error_data.
      // Log the whole thing: the interactive-message limits are easy to breach
      // and the top-level message alone does not say which one.
      console.error(`WhatsApp ${path} failed:`, res.status, JSON.stringify(json));
    }
    return json;
  }

  /**
   * `buttons` is a Telegram-shaped grid; `interactive.ts` reduces it to
   * whatever WhatsApp will accept. `page` selects a slice when the options
   * overflow a single list.
   */
  sendMessage(to: string | number, text: string, buttons?: InlineButton[][], page?: number) {
    const shape = toInteractive(text, buttons, { page });
    return this.call(`${this.phoneNumberId}/messages`, toCloudApiPayload(String(to), shape));
  }

  /**
   * WhatsApp has NO equivalent of editMessageText. A sent message cannot be
   * changed, so a flow that edits one card in place on Telegram necessarily
   * becomes a thread of messages here.
   *
   * This sends a new message rather than failing, so shared handlers work
   * unmodified; `messageId` is accepted and ignored to keep the signature.
   */
  editMessage(to: string | number, _messageId: unknown, text: string, buttons?: InlineButton[][]) {
    return this.sendMessage(to, text, buttons);
  }

  /** Telegram shows a toast on the tapped button. WhatsApp has no such thing. */
  answerCallback(_callbackId: string, _text?: string) {
    return Promise.resolve({ ok: true });
  }

  /** Blue ticks, so the engineer can see the bot picked the message up. */
  markRead(messageId: string) {
    return this.call(`${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  /**
   * A business-initiated message. Outside the 24-hour customer-service window
   * WhatsApp will not deliver free-form text at all, so anything the product
   * sends first -- the daily log reminder above all -- has to go through a
   * template Meta has approved, and is billed per conversation.
   */
  sendTemplate(to: string | number, name: string, lang = "en", components?: unknown[]) {
    return this.call(`${this.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: String(to),
      type: "template",
      template: { name, language: { code: lang }, ...(components ? { components } : {}) },
    });
  }

  /**
   * Media arrives as an id, not a URL: resolve it, then fetch the bytes with
   * the same bearer token. The resolved URL is short-lived and useless without
   * the header, which is why this returns the buffer rather than a link.
   */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const meta = await metaRes.json();
      if (!meta?.url) {
        console.error("WhatsApp media lookup returned no url:", JSON.stringify(meta));
        return null;
      }
      const binRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!binRes.ok) {
        console.error("WhatsApp media download failed:", binRes.status);
        return null;
      }
      const buffer = Buffer.from(await binRes.arrayBuffer());
      return { buffer, mimeType: meta.mime_type || "image/jpeg" };
    } catch (err) {
      console.error("WhatsApp media download threw:", err);
      return null;
    }
  }

  /**
   * The counterpart of `TelegramApi.fetchPhotoBytes`, so the daily-log and
   * invoice handlers work unchanged over either channel. Here the reference is
   * a single media id rather than an array of renditions -- WhatsApp sends one
   * image and leaves the sizing to the sender.
   */
  async fetchPhotoBytes(
    mediaId: string,
  ): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; reason: "fetch" | "download" }> {
    const got = await this.downloadMedia(mediaId);
    if (!got) return { ok: false, reason: "download" };
    return { ok: true, buffer: got.buffer, mimeType: got.mimeType };
  }

  /** Mirrors TelegramApi.getMe for the app's "Bot Online" badge. */
  async getMe(): Promise<any> {
    try {
      const res = await fetch(`${GRAPH}/${this.phoneNumberId}?fields=verified_name,display_phone_number`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      const json = await res.json();
      return res.ok ? { ok: true, result: json } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
}
