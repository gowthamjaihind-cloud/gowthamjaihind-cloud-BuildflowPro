import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/schedule/TabletWBSView.tsx');
let content = fs.readFileSync(file, 'utf8');

const insertStr = '\n  const user = useAuthStore(state => state.user);\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;';

content = content.replace(
  /(const TabletTaskSheet: React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/,
  '$1' + insertStr
);

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed TabletTaskSheet");
