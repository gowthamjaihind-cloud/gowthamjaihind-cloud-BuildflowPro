import fs from 'fs';
import path from 'path';

const componentsToFix = [
  'CostManagement.tsx',
  'WBSView.tsx',
  'InventoryView.tsx',
  'DocumentVault.tsx',
  'ClientPaymentsView.tsx',
  'schedule/MobileWBSView.tsx',
  'schedule/TabletWBSView.tsx',
];

componentsToFix.forEach(comp => {
  const file = path.join(process.cwd(), `src/components/${comp}`);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');

  // Fix the double basePath
  content = content.replace(
    '  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;',
    '  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
  );

  fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixed double basePath");
