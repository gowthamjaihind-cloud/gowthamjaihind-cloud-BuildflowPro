import type { ChatId } from "./session";

const API = "https://api.telegram.org/bot";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramApi {
  constructor(private readonly token: string) {}

  private async call(method: string, body: unknown): Promise<any> {
    const res = await fetch(`${API}${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) console.error(`Telegram ${method} failed:`, json.description);
    return json;
  }

  sendMessage(chatId: ChatId, text: string, buttons?: InlineButton[][]) {
    return this.call("sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  editMessage(chatId: ChatId, messageId: number, text: string, buttons?: InlineButton[][]) {
    return this.call("editMessageText", {
      chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  answerCallback(callbackId: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: callbackId, text });
  }

  deleteMessage(chatId: ChatId, messageId: number) {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  getFile(fileId: string): Promise<string | null> {
    return this.call("getFile", { file_id: fileId }).then((j) => j?.result?.file_path || null);
  }

  /**
   * Resolve whatever the channel calls a photo reference into bytes.
   *
   * Both the daily-log and the invoice handler used to do this inline, eight
   * identical lines each, reaching into `tg.botToken` to build a file URL. That
   * is the only genuinely Telegram-shaped step in either flow, so it lives here
   * and `WhatsAppApi` offers the same method over media ids -- which is what
   * lets one set of handlers serve both channels.
   */
  async fetchPhotoBytes(
    photoSizes: { file_id: string }[],
  ): Promise<{ ok: true; buffer: Buffer; mimeType: string } | { ok: false; reason: "fetch" | "download" }> {
    // Telegram sends several resolutions; the last is the largest.
    const largest = photoSizes[photoSizes.length - 1];
    const filePath = await this.getFile(largest.file_id);
    if (!filePath) return { ok: false, reason: "fetch" };
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
    if (!res.ok) return { ok: false, reason: "download" };
    return { ok: true, buffer: Buffer.from(await res.arrayBuffer()), mimeType: "image/jpeg" };
  }

  getMe(): Promise<any> {
    return this.call("getMe", {});
  }

  get botToken(): string {
    return this.token;
  }
}
