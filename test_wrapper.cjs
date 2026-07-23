const fs = require("fs");
let content = fs.readFileSync("src/server/telegram/index.ts", "utf-8");
content = content.replace("export const handleTelegramWebhook = async (req: Request, res: Response) => {", "export const handleTelegramWebhook = async (req: Request, res: Response) => {\n  console.log('Webhook received:', JSON.stringify(req.body));");
fs.writeFileSync("src/server/telegram/index.ts", content);
