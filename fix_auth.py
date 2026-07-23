with open("server.ts", "r") as f:
    content = f.read()

target = """        if (!userDoc) {
            botInstance.sendMessage(chatId, `No platform user found for email: ${email}Please ask your administrator to create your account.`);
            return;
        }

        const userData = userDoc.data();"""

replacement = """        if (!userDoc) {
            botInstance.sendMessage(chatId, `No platform user found for email: ${email}Please ask your administrator to create your account.`);
            return;
        }

        const userData = userDoc.data();
        if (userData.telegramChatId !== chatId) {
            botInstance.sendMessage(chatId, "⚠️ Authentication required.\\nPlease link your platform account using the command:\\n`/link ABCD-EFGH`", { parse_mode: 'Markdown' });
            await db.collection("bot_sessions").doc(chatId.toString()).delete();
            sessionCache.delete(chatId);
            return;
        }"""

content = content.replace(target, replacement)
with open("server.ts", "w") as f:
    f.write(content)

