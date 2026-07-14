import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

// Remove duplicate useMemo
content = content.replace('import { useMemo } from "react";\n', '');

// Import DailyLogEntry and LaborLogLineItem properly
content = content.replace(
  'import {\n  Vendor,\n  LaborRateCard,\n',
  'import {\n  Vendor,\n  LaborRateCard,\n  DailyLogEntry,\n  LaborLogLineItem,\n'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed imports");
