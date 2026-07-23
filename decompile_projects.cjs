const fs = require('fs');
let js = fs.readFileSync('functions/lib/telegram/handlers/projects.js', 'utf-8');

js = js.replace(/\"use strict\";\n/g, '');
js = js.replace(/Object\.defineProperty\(exports, \"__esModule\", \{ value: true \}\);\n/g, '');
js = js.replace(/exports\.\w+ = void 0;\n/g, '');
js = js.replace(/const admin = require\(\"firebase-admin\"\);\n/g, 'import * as admin from "firebase-admin";\n');
js = js.replace(/const session_1 = require\(\"\.\.\/session\"\);\n/g, 'import { getSession, setSession, clearStep } from "../session";\n');
js = js.replace(/exports\.([a-zA-Z0-9_]+) = \1;/g, '');
js = js.replace(/async function ([a-zA-Z0-9_]+)\(tg, chatId, (.*?)\) {/g, 'export async function $1(tg: any, chatId: number, $2) {');
js = js.replace(/const db = admin\.firestore\(\);/g, 'const db = admin.firestore();');
js = js.replace(/\(0, session_1\.setSession\)/g, 'setSession');
js = js.replace(/\(0, session_1\.getSession\)/g, 'getSession');
js = js.replace(/\(0, session_1\.clearStep\)/g, 'clearStep');
js = js.replace(/\/\/# sourceMappingURL=projects\.js\.map/g, '');

fs.writeFileSync('src/server/telegram/handlers/projects.ts', js);
console.log("Decompiled projects.");
