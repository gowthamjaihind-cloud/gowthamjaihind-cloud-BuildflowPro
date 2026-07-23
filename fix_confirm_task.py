import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('''    const d = session.draft || {};
    
    try {''', '''    const d = session.draft || {};
    await setSession(chatId, { draft: { ...d, workDate } });
    
    try {''')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
