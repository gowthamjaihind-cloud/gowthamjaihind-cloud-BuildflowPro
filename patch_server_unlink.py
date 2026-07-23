with open("server.ts", "r") as f:
    content = f.read()

unlink_code = """
    botInstance.onText(/\\/unlink/, async (msg) => {
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
    });
"""

if 'botInstance.onText(/\\/unlink/' not in content:
    content = content.replace('botInstance.onText(/\\/log/, (msg) => handleLogCommand(msg.chat.id));', unlink_code + '\\n    botInstance.onText(/\\/log/, (msg) => handleLogCommand(msg.chat.id));')

with open("server.ts", "w") as f:
    f.write(content)
