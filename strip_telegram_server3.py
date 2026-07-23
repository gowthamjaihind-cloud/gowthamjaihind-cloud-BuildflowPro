import re

with open("server.ts", "r") as f:
    content = f.read()

# remove bot initialization
content = re.sub(r'  let bot: TelegramBot \| null = null;\n[\s\S]*?bot = new TelegramBot[\s\S]*?\}\);\n', '', content)

# remove everything inside server.ts related to bot messages
content = re.sub(r'  const token = process.env.TELEGRAM_BOT_TOKEN;[\s\S]*?// --- Native Express Middleware ---', '  // --- Native Express Middleware ---', content)

content = re.sub(r'  app\.post\("/api/telegram-unlink", async \(req, res\) => \{[\s\S]*?\}\);\n', '', content)
content = re.sub(r'  app\.get\("/api/bot-ping", async \(req, res\) => \{[\s\S]*?\}\);\n', '', content)

content = content.replace(', botActive: !!bot', '')

with open("server.ts", "w") as f:
    f.write(content)
