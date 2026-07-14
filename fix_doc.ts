import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/DocumentVault.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '  const { user } = useAuthStore();\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : basePath;\n',
  ''
);

content = content.replace(
  '  const user = useAuthStore((state) => state.user);',
  '  const user = useAuthStore((state) => state.user);\n  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;'
);

fs.writeFileSync(file, content, 'utf8');
