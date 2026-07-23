import re

with open("server.ts", "r") as f:
    content = f.read()

# Remove import
content = re.sub(r'import TelegramBot from "node-telegram-bot-api";\n', '', content)

# Remove startServer arguments? The bot was initialized globally or inside startServer?
# Let's see:
# const bot = new TelegramBot...
content = re.sub(r'  const token = process\.env\.TELEGRAM_BOT_TOKEN;\n  const webhookUrl = process\.env\.TELEGRAM_WEBHOOK_URL;\n  const webhookSecret = process\.env\.TELEGRAM_WEBHOOK_SECRET_TOKEN;\n\n  let bot: TelegramBot \| null = null;\n[\s\S]*?app\.post\(\"/api/telegram-unlink\", async \(req, res\) => \{[\s\S]*?\}\);\n', '', content)

with open("server.ts", "w") as f:
    f.write(content)
