import re
with open("src/server/telegram/session.ts", "r") as f:
    text = f.read()

target = """export const setSession = async (chatId: number, data: Partial<BotSession>) => {
  await setDoc(doc(db, "bot_sessions", String(chatId)), { ...data, chatId, lastSeenAt: Date.now() }, { merge: true });
};"""

replacement = """export const setSession = async (chatId: number, data: Partial<BotSession>) => {
  const cleanData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));
  await setDoc(doc(db, "bot_sessions", String(chatId)), { ...cleanData, chatId, lastSeenAt: Date.now() }, { merge: true });
};"""

text = text.replace(target, replacement)

with open("src/server/telegram/session.ts", "w") as f:
    f.write(text)
