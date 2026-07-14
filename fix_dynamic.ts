import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const \{ setDoc \} = await import\("firebase\/firestore"\);\n/g, '');
content = content.replace(/const \{ updateDoc, setDoc \} = await import\("firebase\/firestore"\);\n/g, '');
content = content.replace(/const \{ deleteDoc, setDoc \} = await import\("firebase\/firestore"\);\n/g, '');

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed dynamic");
