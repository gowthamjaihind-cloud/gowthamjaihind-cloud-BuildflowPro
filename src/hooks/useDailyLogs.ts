import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { DailyLogEntry, Task, AuditLog } from "../types";
import { queryKeys } from "../lib/react-query";
import { runTransaction } from "firebase/firestore";
import { getProjectSubCollectionPath } from "../utils/projectPath";

export const getTenantPath = (user: any, projectId: string, subPath: string) => {
  if (!user || !projectId) return null;
  return getProjectSubCollectionPath(projectId, subPath);
};

export const canEditOrDeleteLog = (user: any, log: DailyLogEntry) => {
  if (!user) return false;
  const isAdminOrManager = user.role === "Admin" || user.role === "Project Manager" || user.role === "Owner";
  if (isAdminOrManager) return true;
  
  if (log.createdByUid === user.uid) {
    const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (log.workDate === todayString) return true;
  }
  return false;
};

export const dailyLogKeys = {
  all: (projectId: string) => ["dailyLogs", projectId] as const,
  byTask: (projectId: string, taskId: string) => [...dailyLogKeys.all(projectId), "task", taskId] as const,
  byDate: (projectId: string, date: string) => [...dailyLogKeys.all(projectId), "date", date] as const,
  byDateRange: (projectId: string, start: string, end: string) => [...dailyLogKeys.all(projectId), "dateRange", start, end] as const,
};

export function useDailyLogsQuery(projectId: string, taskId: string) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: dailyLogKeys.byTask(projectId, taskId),
    queryFn: async () => {
      const parentPath = getTenantPath(user, projectId, "dailyLogs");
      if (!parentPath) return [];

      const q = query(
        collection(db, parentPath),
        where("taskId", "==", taskId)
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);
      return items.sort((a,b) => b.workDate.localeCompare(a.workDate) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    enabled: !!user && !!projectId && !!taskId,
  });
}

export function useProjectDailyLogsQuery(projectId: string, date?: string) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: date ? dailyLogKeys.byDate(projectId, date) : dailyLogKeys.all(projectId),
    queryFn: async () => {
      const parentPath = getTenantPath(user, projectId, "dailyLogs");
      if (!parentPath) return [];

      let q = query(collection(db, parentPath));
      if (date) {
        q = query(collection(db, parentPath), where("workDate", "==", date));
      }

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);
      return items.sort((a,b) => b.workDate.localeCompare(a.workDate) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    },
    enabled: !!user && !!projectId,
  });
}

export function useDateRangeLogsQuery(projectId: string, startDate?: string, endDate?: string) {
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: startDate && endDate ? dailyLogKeys.byDateRange(projectId, startDate, endDate) : dailyLogKeys.all(projectId),
    queryFn: async () => {
      const parentPath = getTenantPath(user, projectId, "dailyLogs");
      if (!parentPath) return [];

      let q = query(collection(db, parentPath));
      if (startDate && endDate) {
        q = query(
          collection(db, parentPath),
          where("workDate", ">=", startDate),
          where("workDate", "<=", endDate)
        );
      }

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyLogEntry);
      
      // Sort in memory to avoid needing a composite index
      return items.sort((a, b) => {
        const dateDiff = b.workDate.localeCompare(a.workDate);
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
    },
    enabled: !!user && !!projectId && !!startDate && !!endDate,
  });
}

export function useSaveDailyLog(projectId: string) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newEntry: Omit<DailyLogEntry, "id" | "createdAt" | "createdByUid" | "createdByName">) => {
      if (!user) throw new Error("Unauthenticated");
      
      const logsPath = getTenantPath(user, projectId, "dailyLogs");
      const inventoryPath = getTenantPath(user, projectId, "inventory");
      const issuesPath = getTenantPath(user, projectId, "material_issues");
      if (!logsPath || !inventoryPath || !issuesPath) throw new Error("Invalid path");
      
      const now = new Date().toISOString();
      const newLogRef = doc(collection(db, logsPath));
      
      const latestEntry: DailyLogEntry = {
        ...newEntry,
        id: newLogRef.id,
        createdAt: now,
        createdByUid: user.uid,
        createdByName: user.displayName || user.email || "Unknown",
      };

      await runTransaction(db, async (transaction) => {
        // All reads first
        const validMaterials = (newEntry.materials || []).filter(m => m.quantity > 0);
        const invDocs: Record<string, any> = {};
        for (const mat of validMaterials) {
            const invRef = doc(db, inventoryPath, mat.materialId);
            invDocs[mat.materialId] = await transaction.get(invRef);
        }

        // Now perform writes
        for (const mat of validMaterials) {
            const invDoc = invDocs[mat.materialId];
            if (invDoc && invDoc.exists()) {
                const invData = invDoc.data();
                const currentQty = invData.quantity || 0;
                const invRef = doc(db, inventoryPath, mat.materialId);
                transaction.update(invRef, {
                  quantity: Math.max(0, currentQty - mat.quantity)
                });
                
                const unitCost = invData.avgUnitCost || invData.unitCost || 0;
                const totalPrice = mat.quantity * unitCost;
                const issueRef = doc(collection(db, issuesPath));

                transaction.set(issueRef, {
                  id: issueRef.id,
                  projectId,
                  taskId: newEntry.taskId,
                  taskName: "",
                  issueDate: newEntry.workDate,
                  totalCost: totalPrice,
                  remarks: `Daily Progress: ${newEntry.taskId}`,
                  createdAt: now,
                  items: [
                    {
                      itemId: mat.materialId,
                      materialId: mat.materialId,
                      name: invData.name || mat.name || "Unknown Material",
                      quantity: mat.quantity,
                      unitCost: unitCost,
                      totalPrice: totalPrice,
                    }
                  ]
                });
            }
        }
        transaction.set(newLogRef, latestEntry);
      });

      // Update Task Progress
      if (newEntry.taskId) {
        const taskPath = getTenantPath(user, projectId, `tasks/${newEntry.taskId}`);
        if (taskPath) {
          const taskRef = doc(db, taskPath);
          const updates: any = {
            progress: newEntry.progressPercent,
          };
          if (newEntry.markComplete || newEntry.progressPercent === 100) {
            updates.status = "Completed";
            updates.actualEndDate = newEntry.workDate;
          } else if (newEntry.progressPercent > 0) {
            updates.status = "In Progress";
            updates.actualStartDate = newEntry.workDate;
          }
          await updateDoc(taskRef, updates);
        }
      }
      
      return latestEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.taskId) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'dailyLogs'] });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, variables.workDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });
    },
  });
}

export function useUpdateDailyLog(projectId: string) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates, oldLog }: { id: string, updates: Partial<DailyLogEntry>, oldLog: DailyLogEntry }) => {
      if (!user) throw new Error("Unauthenticated");
      if (!canEditOrDeleteLog(user, oldLog)) throw new Error("Permission denied");

      const logsPath = getTenantPath(user, projectId, "dailyLogs");
      const auditPath = getTenantPath(user, projectId, "audit_logs");
      if (!logsPath || !auditPath) throw new Error("Invalid path");

      const logRef = doc(db, logsPath, id);
            
      await updateDoc(logRef, updates);

      // Update Task Progress if changed
      if (updates.taskId || oldLog.taskId) {
        const targetTaskId = updates.taskId || oldLog.taskId;
        const taskPath = getTenantPath(user, projectId, `tasks/${targetTaskId}`);
        if (taskPath) {
          const taskRef = doc(db, taskPath);
          const taskUpdates: any = {};
          if (updates.progressPercent !== undefined) {
            taskUpdates.progress = updates.progressPercent;
            if (updates.markComplete || updates.progressPercent === 100) {
              taskUpdates.status = "Completed";
              taskUpdates.actualEndDate = updates.workDate || oldLog.workDate;
            } else if (updates.progressPercent > 0) {
              taskUpdates.status = "In Progress";
              // Don't overwrite actualStartDate for updates unless needed, but let's just set it
            }
          }
          if (Object.keys(taskUpdates).length > 0) {
            await updateDoc(taskRef, taskUpdates);
          }
        }
      }

      // Write audit log
      const changes = Object.keys(updates).map((key) => ({
        field: key,
        oldValue: (oldLog as any)[key],
        newValue: (updates as any)[key]
      }));

      const auditRef = doc(collection(db, auditPath));
      await setDoc(auditRef, {
        id: auditRef.id,
        reportId: id,
        projectId,
        userId: user.uid,
        userEmail: user.email || "",
        timestamp: new Date().toISOString(),
        action: "UPDATE",
        changes
      } as AuditLog);

      return { id, ...oldLog, ...updates };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, data.taskId) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'dailyLogs'] });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, data.workDate) });
      // Invalidate the old date if it changed
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });
      },
  });
}

export function useDeleteDailyLog(projectId: string) {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, oldLog }: { id: string, oldLog: DailyLogEntry }) => {
      if (!user) throw new Error("Unauthenticated");
      if (!canEditOrDeleteLog(user, oldLog)) throw new Error("Permission denied");

      const logsPath = getTenantPath(user, projectId, "dailyLogs");
      const auditPath = getTenantPath(user, projectId, "audit_logs");
      if (!logsPath || !auditPath) throw new Error("Invalid path");

      const logRef = doc(db, logsPath, id);
            
      await deleteDoc(logRef);

      // Write audit log
      const changes = Object.keys(oldLog).map((key) => ({
        field: key,
        oldValue: (oldLog as any)[key],
        newValue: null
      }));

      const auditRef = doc(collection(db, auditPath));
      await setDoc(auditRef, {
        id: auditRef.id,
        reportId: id,
        projectId,
        userId: user.uid,
        userEmail: user.email || "",
        timestamp: new Date().toISOString(),
        action: "DELETE",
        changes
      } as AuditLog);

      return oldLog;
    },
    onSuccess: (deletedLog) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, deletedLog.taskId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'dailyLogs'] });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, deletedLog.workDate) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectData', projectId, 'tasks'] });
      },
  });
}
