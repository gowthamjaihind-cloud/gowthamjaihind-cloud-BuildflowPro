import fs from 'fs';
import path from 'path';

const filesToFix = [
  'src/store/projectDataStore.ts',
  'src/services/projectService.ts',
];

filesToFix.forEach(fileRel => {
  const file = path.join(process.cwd(), fileRel);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');

  // Replace all hardcoded paths
  content = content.replace(/`projects\/\$\{projectId\}\/([^`]+)`/g, '(useAuthStore.getState().user?.currentOrgId ? `organizations/${useAuthStore.getState().user?.currentOrgId}/projects/${projectId}/$1` : `projects/${projectId}/$1`)');
  content = content.replace(/`projects\/\$\{projectId\}`/g, '(useAuthStore.getState().user?.currentOrgId ? `organizations/${useAuthStore.getState().user?.currentOrgId}/projects/${projectId}` : `projects/${projectId}`)');

  fs.writeFileSync(file, content, 'utf8');
});

console.log("Fixed other");
