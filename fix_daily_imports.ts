import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/hooks/useDailyLogs.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { queryKeys } from "../lib/react-query";\nimport { runTransaction, collection, doc } from "firebase/firestore";',
  'import { queryKeys } from "../lib/react-query";\nimport { runTransaction } from "firebase/firestore";'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed useDailyLogs.ts imports");
