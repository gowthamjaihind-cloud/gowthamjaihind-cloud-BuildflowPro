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

  // Skip if we already added basePath
  if (content.includes('const basePath = user?.currentOrgId')) return;

  // Add useAuthStore if missing
  if (!content.includes('useAuthStore')) {
    if (content.includes('import { useProjectData }')) {
      content = content.replace(
        'import { useProjectData }',
        'import { useAuthStore } from "../store";\nimport { useProjectData }'
      );
    } else if (content.includes('import { useQueryClient }')) {
       content = content.replace(
        'import { useQueryClient }',
        'import { useAuthStore } from "../store";\nimport { useQueryClient }'
      );
    } else {
      content = 'import { useAuthStore } from "../store";\n' + content;
    }
  }

  // Find the component definition line to insert basePath
  const componentRegex = /(export\s+const\s+\w+\s*:\s*React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/;
  const match = content.match(componentRegex);
  
  if (match) {
    let insertString = `\n  const { user } = useAuthStore();\n  const basePath = user?.currentOrgId ? \`organizations/\${user.currentOrgId}/projects/\${projectId}\` : \`projects/\${projectId}\`;\n`;
    // If it already has `const { user } = useAuthStore();`, don't add it again
    if (content.includes('const { user } = useAuthStore();')) {
      insertString = `\n  const basePath = user?.currentOrgId ? \`organizations/\${user.currentOrgId}/projects/\${projectId}\` : \`projects/\${projectId}\`;\n`;
    }
    content = content.replace(match[1], match[1] + insertString);
  }

  // Replace all hardcoded paths
  content = content.replace(/`projects\/\$\{projectId\}\/([^`]+)`/g, '`${basePath}/$1`');
  content = content.replace(/`projects\/\$\{projectId\}`/g, 'basePath');

  fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixed all components");
