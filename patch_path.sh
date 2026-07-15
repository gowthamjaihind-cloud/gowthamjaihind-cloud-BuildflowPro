cat << 'INNER_EOF' > src/utils/projectPath.ts
import { useAuthStore, useProjectStore } from "../store";

export function getProjectBasePath(projectId: string): string {
  const user = useAuthStore.getState().user;
  
  if (user?.currentOrgId) {
    return \`organizations/\${user.currentOrgId}/projects/\${projectId}\`;
  }
  
  return \`projects/\${projectId}\`;
}

export function getProjectSubCollectionPath(projectId: string, subCollectionName: string): string {
  return \`\${getProjectBasePath(projectId)}/\${subCollectionName}\`;
}
INNER_EOF
