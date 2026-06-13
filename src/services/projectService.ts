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

export const projectService = {
  async createProject(newProject: any, userId: string) {
    const path = "projects";
    try {
      const docRef = await addDoc(collection(db, path), {
        ...newProject,
        name: newProject.name.trim(),
        status: newProject.status,
        ownerId: userId,
        createdAt: new Date().toISOString(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async deleteProject(projectId: string) {
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
        const path = `projects/${projectId}/${colName}`;
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
      await deleteDoc(doc(db, "projects", projectId));
    } catch (error) {
      console.error("Project deletion failed:", error);
      alert(
        "Failed to delete project. You may not have administrative permissions for this action.",
      );
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `projects/${projectId}`,
      );
    }
  },

  async updateProject(projectId: string, updates: Partial<Project>) {
    try {
      await updateDoc(doc(db, "projects", projectId), updates);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `projects/${projectId}`,
      );
    }
  },

  async updateProjectStatus(projectId: string, newStatus: string) {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: newStatus,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `projects/${projectId}`,
      );
    }
  },

  async updateProjectImage(projectId: string, imageUrl: string) {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        imageUrl,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `projects/${projectId}`,
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

    try {
      await updateDoc(doc(db, `projects/${projectId}/tasks`, toId), {
        advancedDependencies: updatedDeps,
        dependencies: updatedLegacyDeps,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `projects/${projectId}/tasks/${toId}`,
      );
    }
  },
};
