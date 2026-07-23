import os

with open("src/server/telegram/session.ts", "r") as f:
    text = f.read()

text = text.replace("import { store } from \"./session\";\n  const sessions = (store as any).sessions || {};\n  delete sessions[chatId];", "await setDoc(doc(db, \"bot_sessions\", String(chatId)), { userId: deleteField(), email: deleteField(), orgId: deleteField() }, { merge: true });")

with open("src/server/telegram/session.ts", "w") as f:
    f.write(text)

