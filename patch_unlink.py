with open("functions/src/telegram/index.ts", "r") as f:
    content = f.read()

unlink_code = """
  if (text === "/unlink") {
    if (session?.userId) {
      await admin.firestore().collection("users").doc(session.userId).update({
        telegramChatId: null,
        telegramLinkedAt: null
      });
      await tg.sendMessage(chatId, "Your Telegram account has been unlinked.");
      await setSession(chatId, null as any);
    } else {
      await tg.sendMessage(chatId, "You are not currently linked.");
    }
    return;
  }
"""

if 'if (text === "/unlink")' not in content:
    content = content.replace('  if (text === "/cancel") {', unlink_code + '\\n  if (text === "/cancel") {')

if 'import * as admin from "firebase-admin"' not in content:
    content = 'import * as admin from "firebase-admin";\\n' + content

with open("functions/src/telegram/index.ts", "w") as f:
    f.write(content)

print("Patched.")
