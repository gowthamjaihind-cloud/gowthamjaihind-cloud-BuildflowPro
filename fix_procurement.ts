import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/ProcurementView.tsx');
let content = fs.readFileSync(file, 'utf8');

// Ensure useAuthStore is imported
if (!content.includes('useAuthStore')) {
  content = content.replace(
    'import { useProjectData } from "../hooks/useProjectData";',
    'import { useProjectData } from "../hooks/useProjectData";\nimport { useAuthStore } from "../store";'
  );
}

// Add user and basePath
if (!content.includes('const { user } = useAuthStore();')) {
  content = content.replace(
    'export const ProcurementView: React.FC<ProcurementViewProps> = ({ projectId }) => {',
    'export const ProcurementView: React.FC<ProcurementViewProps> = ({ projectId }) => {\n  const { user } = useAuthStore();\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
  );
}

// Replace all hardcoded paths
content = content.replace(/`projects\/\$\{projectId\}\/([^`]+)`/g, '`${basePath}/$1`');
// Also replace `projects/${projectId}` if it exists without trailing slash
content = content.replace(/`projects\/\$\{projectId\}`/g, 'basePath');

fs.writeFileSync(file, content, 'utf8');
console.log("Fixed procurement");
