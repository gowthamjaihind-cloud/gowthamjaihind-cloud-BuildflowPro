const fs = require('fs');
let js = fs.readFileSync('functions/lib/telegram/index.js', 'utf-8');

js = js.replace(/\"use strict\";\n/g, '');
js = js.replace(/Object\.defineProperty\(exports, \"__esModule\", \{ value: true \}\);\n/g, '');
js = js.replace(/exports\.\w+ = void 0;\n/g, '');
js = js.replace(/const https_1 = require\(\"firebase-functions\/v2\/https\"\);\n/g, 'import { onRequest } from "firebase-functions/v2/https";\n');
js = js.replace(/const params_1 = require\(\"firebase-functions\/params\"\);\n/g, 'import { defineSecret } from "firebase-functions/params";\n');
js = js.replace(/const api_1 = require\(\"\.\/api\"\);\n/g, 'import { TelegramApi } from "./api";\n');
js = js.replace(/const session_1 = require\(\"\.\/session\"\);\n/g, 'import { getSession, setSession, clearStep } from "./session";\n');
js = js.replace(/const auth_1 = require\(\"\.\/auth\"\);\n/g, 'import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";\n');
js = js.replace(/const log_1 = require\(\"\.\/handlers\/log\"\);\n/g, 'import * as log from "./handlers/log";\n');

js = js.replace(/exports\.([a-zA-Z0-9_]+) = \1;/g, 'export { $1 };');
js = js.replace(/exports\.telegramWebhook = /g, 'export const telegramWebhook = ');
js = js.replace(/\(0, https_1\.onRequest\)/g, 'onRequest');
js = js.replace(/\(0, params_1\.defineSecret\)/g, 'defineSecret');

js = js.replace(/\(0, session_1\.getSession\)/g, 'getSession');
js = js.replace(/\(0, session_1\.setSession\)/g, 'setSession');
js = js.replace(/\(0, session_1\.clearStep\)/g, 'clearStep');

js = js.replace(/\(0, auth_1\.checkRateLimit\)/g, 'checkRateLimit');
js = js.replace(/\(0, auth_1\.redeemLinkCode\)/g, 'redeemLinkCode');
js = js.replace(/\(0, auth_1\.validateSession\)/g, 'validateSession');

js = js.replace(/\(0, log_1\.(\w+)\)/g, 'log.$1');

js = js.replace(/\/\/# sourceMappingURL=index\.js\.map/g, '');

fs.writeFileSync('functions/src/telegram/index.ts', js);
console.log("Decompiled index.");
