import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'if (!vendorDoc.exists()) return;',
  'if (!vendorDoc.exists()) { console.error("Vendor not found at path:", vendorRef.path); return; }'
);

content = content.replace(
  'alert(`RA Bill ${billNumber} generated successfully!`);',
  'console.log("RA Bill generated", billNumber);\n      alert(`RA Bill ${billNumber} generated successfully!`);'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched labor debug");
