import { create } from "zustand";
import { Project } from "../types";
import { projectService } from "../services/projectService";

interface ProjectState {
  projects: Project[];
  activeProject: Project | null;
  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  deleteProject: (projectId: string) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  updateProjectStatus: (projectId: string, newStatus: string) => Promise<void>;
  updateProjectImage: (projectId: string, imageUrl: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project }),
  deleteProject: async (projectId) => {
    await projectService.deleteProject(projectId);
    if (get().activeProject?.id === projectId) {
      set({ activeProject: null });
    }
  },
  updateProject: async (projectId, updates) => {
    await projectService.updateProject(projectId, updates);
    const { activeProject } = get();
    if (activeProject && activeProject.id === projectId) {
      set({ activeProject: { ...activeProject, ...updates } });
    }
  },
  updateProjectStatus: async (projectId, newStatus) => {
    await projectService.updateProjectStatus(projectId, newStatus);
    const { activeProject } = get();
    if (activeProject && activeProject.id === projectId) {
      set({ activeProject: { ...activeProject, status: newStatus as any } });
    }
  },
  updateProjectImage: async (projectId, imageUrl) => {
    await projectService.updateProjectImage(projectId, imageUrl);
    const { activeProject } = get();
    if (activeProject && activeProject.id === projectId) {
      set({ activeProject: { ...activeProject, imageUrl } });
    }
  },
}));
