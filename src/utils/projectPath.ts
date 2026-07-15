import { useAuthStore, useProjectStore } from "../store";

export function getProjectBasePath(projectId: string): string {
  const user = useAuthStore.getState().user;
  const activeProject = useProjectStore.getState().activeProject;
  
  // If we have an active project loaded, check its orgId first.
  if (activeProject && activeProject.id === projectId && activeProject.orgId) {
    return `organizations/${activeProject.orgId}/projects/${projectId}`;
  }
  
  // Check loaded projects array
  const anyProject = useProjectStore.getState().projects.find(p => p.id === projectId);
  if (anyProject && anyProject.orgId) {
    return `organizations/${anyProject.orgId}/projects/${projectId}`;
  }
  
  // Fall back to current user's org
  if (user?.currentOrgId) {
    return `organizations/${user.currentOrgId}/projects/${projectId}`;
  }
  
  return `projects/${projectId}`;
}

export function getProjectSubCollectionPath(projectId: string, subCollectionName: string): string {
  return `${getProjectBasePath(projectId)}/${subCollectionName}`;
}
