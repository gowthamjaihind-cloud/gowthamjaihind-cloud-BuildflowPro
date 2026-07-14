import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const vendorRef = doc(db, `${basePath}/suppliers/${vendor.id}`);',
  'const vendorRef = doc(db, `${basePath}/suppliers/${vendor.id}`);\n        console.log("Checking vendorRef:", vendorRef.path, vendor);'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched LaborTrackingView test");
