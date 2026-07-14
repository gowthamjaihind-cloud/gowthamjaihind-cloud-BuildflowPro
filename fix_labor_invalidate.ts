import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /await addDoc\(collection\(db, path\), billData\);\n      alert\(`RA Bill \$\{billNumber\} generated successfully!`\);/g,
  'await addDoc(collection(db, path), billData);\n      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });\n      alert(`RA Bill ${billNumber} generated successfully!`);'
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed labor invalidation");
