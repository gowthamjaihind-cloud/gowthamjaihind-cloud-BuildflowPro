const API = "https://api.telegram.org/bot";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramApi {
  constructor(private token: string) {}

  private async call(method: string, body: unknown): Promise<any> {
    const res = await fetch(`${API}${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`Telegram ${method} failed:`, json.description);
    }
    return json;
  }

  sendMessage(chatId: number, text: string, buttons?: InlineButton[][]) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  editMessage(chatId: number, messageId: number, text: string, buttons?: InlineButton[][]) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
    });
  }

  answerCallback(callbackId: string, text?: string) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackId,
      text,
    });
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }
}
