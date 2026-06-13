import { create } from "zustand";
import { Task, DependencyType } from "../types";
import { projectService } from "../services/projectService";

interface TaskState {
  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  addDependency: (
    projectId: string,
    fromId: string,
    toId: string,
    type: DependencyType,
  ) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addDependency: async (
    projectId: string,
    fromId: string,
    toId: string,
    type: DependencyType,
  ) => {
    const { tasks } = get();
    await projectService.addDependency(projectId, fromId, toId, type, tasks);
  },
}));
