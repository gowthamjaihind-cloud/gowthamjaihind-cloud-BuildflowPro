import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const raBillsSummary = vendors',
  'console.log("LaborLogs", laborLogs); console.log("Vendors", vendors); const raBillsSummary = vendors'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched LaborTrackingView debug");
