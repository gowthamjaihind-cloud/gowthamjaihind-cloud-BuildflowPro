import fs from 'fs';
import path from 'path';

function fixFile(fileRel) {
  const file = path.join(process.cwd(), fileRel);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');

  // Replace `${basePath}` with `(useAuthStore.getState().user?.currentOrgId ? \`organizations/\${useAuthStore.getState().user?.currentOrgId}/projects/\${projectId}\` : \`projects/\${projectId}\`)` in MobileTaskSheet and TabletTaskPanel
  // Actually, wait, since it's inside React component we can just insert `const basePath = ...` 
  // Let's do it simply by injecting inside the subcomponents:
  
  const insertStr = '\n  const user = useAuthStore(state => state.user);\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;';

  content = content.replace(
    /(const MobileTaskSheet: React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/,
    '$1' + insertStr
  );
  
  content = content.replace(
    /(const TabletTaskSidePanel: React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/,
    '$1' + insertStr
  );
  
  // also TabletTaskSidePanel might be named something else
  content = content.replace(
    /(const TaskDetailsSidePanel: React\.FC<[^>]+>\s*=\s*\([^)]*\)\s*=>\s*\{)/,
    '$1' + insertStr
  );

  fs.writeFileSync(file, content, 'utf8');
}

fixFile('src/components/schedule/MobileWBSView.tsx');
fixFile('src/components/schedule/TabletWBSView.tsx');

console.log("Fixed subcomponents");
