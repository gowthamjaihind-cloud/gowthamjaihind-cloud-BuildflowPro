with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()

text = text.replace("const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;", "const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'buildflow_secret_123';")

with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)
