import fs from 'fs';
import path from 'path';

// Fix LaborTrackingView.tsx
const laborFile = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let laborContent = fs.readFileSync(laborFile, 'utf8');
laborContent = laborContent.replace(
  'const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : basePath;',
  'const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
);
fs.writeFileSync(laborFile, laborContent, 'utf8');

// Fix ProcurementView.tsx
const procFile = path.join(process.cwd(), 'src/components/ProcurementView.tsx');
let procContent = fs.readFileSync(procFile, 'utf8');
procContent = procContent.replace(
  '  const { user } = useAuthStore();\n  const isAdminOrOwner',
  '  const { user } = useAuthStore();\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;\n  const isAdminOrOwner'
);
fs.writeFileSync(procFile, procContent, 'utf8');

console.log("Fixed errors");
