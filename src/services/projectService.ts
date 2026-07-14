import { useAuthStore } from "../store";
import {
  db,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { DependencyType, TaskDependency, Project, Task } from "../types";
import { getProjectBasePath, getProjectSubCollectionPath } from "../utils/projectPath";

export const projectService = {
  async createProject(newProject: any, userId: string) {
    const user = useAuthStore.getState().user;
    const path = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects` : "projects";
    try {
      const docRef = await addDoc(collection(db, path), {
        ...newProject,
        name: newProject.name.trim(),
        status: newProject.status,
        ownerId: userId,
        createdAt: new Date().toISOString(),
        orgId: user?.currentOrgId || null,
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async deleteProject(projectId: string) {
    const projectPath = getProjectBasePath(projectId);
    try {
      // First clear all sub-collections
      const collectionsToClear = [
        "tasks",
        "inventory",
        "costs",
        "documents",
        "suppliers",
        "receipts",
        "ledger",
        "labor_rate_cards",
        "labor_logs",
        "ra_bills",
        "material_issues",
      ];

      for (const colName of collectionsToClear) {
        const path = `${projectPath}/${colName}`;
        const snapshot = await getDocs(collection(db, path));

        if (snapshot.empty) continue;

        const docsList = snapshot.docs;
        const chunkSize = 500;
        for (let i = 0; i < docsList.length; i += chunkSize) {
          const chunk = docsList.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach((d) => {
            batch.delete(doc(db, path, d.id));
          });
          await batch.commit();
        }
      }

      // Finally delete the project document itself
      await deleteDoc(doc(db, projectPath));
    } catch (error) {
      console.error("Project deletion failed:", error);
      alert(
        "Failed to delete project. You may not have administrative permissions for this action.",
      );
      handleFirestoreError(
        error,
        OperationType.DELETE,
        projectPath,
      );
    }
  },

  async updateProject(projectId: string, updates: Partial<Project>) {
    const projectPath = getProjectBasePath(projectId);
    try {
      await updateDoc(doc(db, projectPath), updates);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        projectPath,
      );
    }
  },

  async updateProjectStatus(projectId: string, newStatus: string) {
    const projectPath = getProjectBasePath(projectId);
    try {
      await updateDoc(doc(db, projectPath), {
        status: newStatus,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        projectPath,
      );
    }
  },

  async updateProjectImage(projectId: string, imageUrl: string) {
    const projectPath = getProjectBasePath(projectId);
    try {
      await updateDoc(doc(db, projectPath), {
        imageUrl,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        projectPath,
      );
    }
  },

  async addDependency(
    projectId: string,
    fromId: string,
    toId: string,
    type: DependencyType,
    tasks: Task[],
  ) {
    if (fromId === toId) {
      alert("A task cannot depend on itself.");
      return;
    }

    // Circular dependency check
    const isCircular = (
      currentId: string,
      targetId: string,
      visited: Set<string> = new Set(),
    ): boolean => {
      if (currentId === targetId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const currentTask = tasks.find((t) => t.id === currentId);
      if (!currentTask) return false;

      const deps =
        currentTask.advancedDependencies ||
        (currentTask.dependencies || []).map((id) => ({
          id,
          type: "FS" as DependencyType,
          lag: 0,
        }));
      return deps.some((d) => isCircular(d.id, targetId, visited));
    };

    if (isCircular(fromId, toId)) {
      alert("Circular dependency detected! This link is not allowed.");
      return;
    }

    const taskToUpdate = tasks.find((t) => t.id === toId);
    if (!taskToUpdate) return;

    // Check if dependency already exists
    const exists = (taskToUpdate.advancedDependencies || []).some(
      (d) => d.id === fromId && d.type === type,
    );
    if (exists) return;

    const newDep: TaskDependency = { id: fromId, type, lag: 0 };
    const updatedDeps = [...(taskToUpdate.advancedDependencies || []), newDep];

    // Also update the legacy dependencies array for backward compatibility
    const updatedLegacyDeps = Array.from(
      new Set([...(taskToUpdate.dependencies || []), fromId]),
    );

    const tasksPath = getProjectSubCollectionPath(projectId, "tasks");
    try {
      await updateDoc(doc(db, tasksPath, toId), {
        advancedDependencies: updatedDeps,
        dependencies: updatedLegacyDeps,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${tasksPath}/${toId}`,
      );
    }
  },
};
