import { useAuthStore, useProjectStore } from "../store";

export function getProjectBasePath(projectId: string): string {
  const user = useAuthStore.getState().user;
  const activeProject = useProjectStore.getState().activeProject;
  
  // If this is the active project and it has an orgId, use that
  if (activeProject && activeProject.id === projectId) {
    if (activeProject.orgId) {
      return `organizations/${activeProject.orgId}/projects/${projectId}`;
    }
    // Check if the project document has an orgId field inside
    const anyProjectWithOrg = useProjectStore.getState().projects.find(p => p.id === projectId);
    if (anyProjectWithOrg?.orgId) {
      return `organizations/${anyProjectWithOrg.orgId}/projects/${projectId}`;
    }
    return `projects/${projectId}`;
  }
  
  // Look up in the loaded list of projects
  const foundProject = useProjectStore.getState().projects.find(p => p.id === projectId);
  if (foundProject?.orgId) {
    return `organizations/${foundProject.orgId}/projects/${projectId}`;
  }
  
  // Fallback to user's currentOrgId if set
  return user?.currentOrgId 
    ? `organizations/${user.currentOrgId}/projects/${projectId}` 
    : `projects/${projectId}`;
}

export function getProjectSubCollectionPath(projectId: string, subCollectionName: string): string {
  return `${getProjectBasePath(projectId)}/${subCollectionName}`;
}
