"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramApi = void 0;
const API = "https://api.telegram.org/bot";
class TelegramApi {
    constructor(token) {
        this.token = token;
    }
    get botToken() {
        return this.token;
    }
    async call(method, body) {
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
    sendMessage(chatId, text, buttons) {
        return this.call("sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
        });
    }
    editMessage(chatId, messageId, text, buttons) {
        return this.call("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: "HTML",
            reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
        });
    }
    answerCallback(callbackId, text) {
        return this.call("answerCallbackQuery", {
            callback_query_id: callbackId,
            text,
        });
    }
    deleteMessage(chatId, messageId) {
        return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
    }
    async getFile(fileId) {
        const json = await this.call("getFile", { file_id: fileId });
        return json?.result?.file_path || null;
    }
}
exports.TelegramApi = TelegramApi;
//# sourceMappingURL=api.js.map