const API = "https://api.telegram.org/bot";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramApi {
  constructor(private readonly token: string) {}

  public async call(method: string, body: unknown): Promise<any> {
    const res = await fetch(`${API}${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      const desc = json.description || "";
      if (method === "getUpdates" && desc.includes("Conflict")) {
        return { result: [] };
      }
      
      const isIgnorable = 
        desc.includes("message to delete not found") ||
        desc.includes("message is not modified") ||
        desc.includes("chat not found") ||
        desc.includes("bot was blocked") ||
        desc.includes("bot was kicked") ||
        desc.includes("user is deactivated") ||
        desc.includes("message to edit not found") ||
        desc.includes("message can't be edited");

      if (isIgnorable) {
        return json;
      }

      console.error(`Telegram ${method} failed:`, desc);
      throw new Error(desc || "Unknown Telegram API Error");
    }
    return json;
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]) {
    return this.call("sendMessage", {
      chat_id: chatId, text, parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  async editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]) {
    try {
      return await this.call("editMessageText", {
        chat_id: chatId, message_id: messageId, text, parse_mode: "HTML",
        reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
      });
    } catch (err: any) {
      if (err?.message?.includes("message is not modified") || err?.message?.includes("message can't be edited")) {
        return { ok: true };
      }
      throw err;
    }
  }

  answerCallback(callbackId: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: callbackId, text });
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  getFile(fileId: string): Promise<string | null> {
    return this.call("getFile", { file_id: fileId }).then((j) => j?.result?.file_path || null);
  }

  getMe(): Promise<any> {
    return this.call("getMe", {});
  }

  get botToken(): string {
    return this.token;
  }
  getUpdates(offset: number, timeout: number): Promise<any[]> {
    return this.call("getUpdates", { offset, timeout }).then((j) => j?.result || []);
  }
}
