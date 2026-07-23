const fs = require('fs');
let js = fs.readFileSync('functions/lib/telegram/index.js', 'utf-8');

js = js.replace(/\"use strict\";\n/g, '');
js = js.replace(/Object\.defineProperty\(exports, \"__esModule\", \{ value: true \}\);\n/g, '');
js = js.replace(/exports\.\w+ = void 0;\n/g, '');
js = js.replace(/const https_1 = require\(\"firebase-functions\/v2\/https\"\);\n/g, 'import { Request, Response } from "express";\n');
js = js.replace(/const params_1 = require\(\"firebase-functions\/params\"\);\n/g, '');
js = js.replace(/const api_1 = require\(\"\.\/api\"\);\n/g, 'import { TelegramApi } from "./api";\n');
js = js.replace(/const session_1 = require\(\"\.\/session\"\);\n/g, 'import { getSession, setSession, clearStep } from "./session";\n');
js = js.replace(/const auth_1 = require\(\"\.\/auth\"\);\n/g, 'import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";\n');
js = js.replace(/const log_1 = require\(\"\.\/handlers\/log\"\);\n/g, 'import * as log from "./handlers/log";\n');
js = js.replace(/const projects_1 = require\(\"\.\/handlers\/projects\"\);\n/g, 'import * as projects from "./handlers/projects";\n');

js = js.replace(/exports\.([a-zA-Z0-9_]+) = \1;/g, 'export { $1 };');

js = js.replace(/\(0, session_1\.getSession\)/g, 'getSession');
js = js.replace(/\(0, session_1\.setSession\)/g, 'setSession');
js = js.replace(/\(0, session_1\.clearStep\)/g, 'clearStep');

js = js.replace(/\(0, auth_1\.checkRateLimit\)/g, 'checkRateLimit');
js = js.replace(/\(0, auth_1\.redeemLinkCode\)/g, 'redeemLinkCode');
js = js.replace(/\(0, auth_1\.validateSession\)/g, 'validateSession');

js = js.replace(/\(0, log_1\.(\w+)\)/g, 'log.$1');
js = js.replace(/\(0, projects_1\.(\w+)\)/g, 'projects.$1');

js = js.replace(/\/\/# sourceMappingURL=index\.js\.map/g, '');

// Clean up exports
let lines = js.split('\n');
lines = lines.filter(l => !l.startsWith('export {'));

// Find the telegramWebhook and handleUpdate definitions and rip them out
let new_js = lines.join('\n');

// Find the handleUpdate implementation and extract it
let handleUpdateMatch = new_js.match(/async function handleUpdate\(tg, update\) \{[\s\S]*?\n\}/);
let handleUpdateCode = handleUpdateMatch[0];
handleUpdateCode = handleUpdateCode.replace("async function handleUpdate(tg, update)", "export async function handleUpdate(tg: TelegramApi, update: any)");
handleUpdateCode = handleUpdateCode.replace("messageId, session, data.slice(4)", "messageId, session, data.slice(4))");
// I'll just write it with Python, it's easier.

fs.writeFileSync('temp_index.ts', new_js);
