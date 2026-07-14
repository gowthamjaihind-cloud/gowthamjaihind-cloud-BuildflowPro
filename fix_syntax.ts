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

  // Fix the double user declaration issue
  content = content.replace(
    '  const { user } = useAuthStore();\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : basePath;\n',
    ''
  );

  content = content.replace(
    '  const user = useAuthStore((state) => state.user);',
    '  const user = useAuthStore((state) => state.user);\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
  );

  // Fix the fallback basePath syntax error (for those that had user imported as const { user } = useAuthStore();)
  content = content.replace(
    /const basePath = user\?\.currentOrgId \? `organizations\/\$\{user\.currentOrgId\}\/projects\/\$\{projectId\}` : basePath;/g,
    'const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
  );

  fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixed syntax");
