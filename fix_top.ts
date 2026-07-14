import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/WBSView.tsx');
let content = fs.readFileSync(file, 'utf8');

const match = content.match(/import React/);
if (match) {
  content = content.substring(match.index);
}

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed top");
