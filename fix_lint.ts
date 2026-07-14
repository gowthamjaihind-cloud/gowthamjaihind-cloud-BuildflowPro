import fs from 'fs';
import path from 'path';

const componentsToFix = [
  'CostManagement.tsx',
  'WBSView.tsx',
  'InventoryView.tsx',
  'schedule/MobileWBSView.tsx',
  'schedule/TabletWBSView.tsx',
];

componentsToFix.forEach(comp => {
  const file = path.join(process.cwd(), `src/components/${comp}`);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');

  // Check if basePath is declared
  if (!content.includes('const basePath =')) {
    const componentRegex = /(export\s+const\s+\w+\s*:\s*React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/;
    const match = content.match(componentRegex);
    if (match) {
      // make sure `user` is declared before it
      let insertStr = '';
      if (!content.includes('const { user } = useAuthStore();') && !content.includes('const user = useAuthStore')) {
        insertStr += '\n  const { user } = useAuthStore();';
      }
      insertStr += '\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;';
      
      content = content.replace(match[1], match[1] + insertStr);
    }
  }

  // MobileWBSView and TabletWBSView have import errors: Cannot find module '../store'
  // Actually Mobile/Tablet are inside `src/components/schedule/` so they should import from `../../store`
  if (comp.includes('schedule/')) {
    content = content.replace(/import \{ useAuthStore \} from "\.\.\/store"/g, 'import { useAuthStore } from "../../store"');
  }

  fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixed lint");
