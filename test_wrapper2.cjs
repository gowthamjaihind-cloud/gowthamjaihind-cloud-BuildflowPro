const fs = require("fs");
let content = fs.readFileSync("src/server/telegram/index.ts", "utf-8");
content = content.replace("console.log('Webhook received:', JSON.stringify(req.body));", "const fs2 = await import('fs'); fs2.appendFileSync('/tmp/webhook.log', JSON.stringify(req.body) + '\\n');");
content = content.replace("console.error(\"Error handling update:\", err);", "console.error(\"Error handling update:\", err); const fs3 = await import('fs'); fs3.appendFileSync('/tmp/webhook.log', 'ERROR: ' + String(err) + '\\n');");
fs.writeFileSync("src/server/telegram/index.ts", content);
