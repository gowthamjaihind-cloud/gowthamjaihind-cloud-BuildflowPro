import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/ProcurementView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'setLedger(',
  'console.log("Fetched ledger:", snapshot.docs.map((d) => d.data())); setLedger('
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched ProcurementView debug");
