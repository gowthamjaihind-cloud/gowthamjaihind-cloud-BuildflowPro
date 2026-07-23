import re
with open("src/server/telegram/index.ts", "r") as f:
    text = f.read()

text = text.replace("export const handleTelegramWebhook = async (req: Request, res: Response) => {", "export const handleTelegramWebhook = async (req: Request, res: Response) => {\n  await authPromise;")

with open("src/server/telegram/index.ts", "w") as f:
    f.write(text)
