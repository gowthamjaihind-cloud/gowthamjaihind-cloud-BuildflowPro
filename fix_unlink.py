import re
with open("server.ts", "r") as f:
    content = f.read()

old_unlink = """    botInstance.onText(/\/unlink/, async (msg) => {
      const chatId = msg.chat.id;
      const session = await getSession(chatId);
      if (session?.userId) {
        await db.collection("users").doc(session.userId).update({
          telegramChatId: null,
          telegramLinkedAt: null
        });
        await clearSession(chatId);
        botInstance.sendMessage(chatId, "Your Telegram account has been unlinked from BuildFlow.");
      } else {
        botInstance.sendMessage(chatId, "You are not currently linked.");
      }
    });"""

new_unlink = """    botInstance.onText(/\/unlink/, async (msg) => {
      const chatId = msg.chat.id;
      const session = await getSession(chatId);
      if (session?.userId) {
        await db.collection("users").doc(session.userId).update({
          telegramChatId: null,
          telegramLinkedAt: null
        });
        await db.collection("bot_sessions").doc(chatId.toString()).delete();
        sessionCache.delete(chatId);
        botInstance.sendMessage(chatId, "Your Telegram account has been unlinked from BuildFlow.");
      } else {
        botInstance.sendMessage(chatId, "You are not currently linked.");
      }
    });"""

content = content.replace(old_unlink, new_unlink)
with open("server.ts", "w") as f:
    f.write(content)

