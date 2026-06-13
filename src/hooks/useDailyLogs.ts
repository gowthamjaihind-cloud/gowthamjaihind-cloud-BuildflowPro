import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { DailyLogEntry, Task, AuditLog } from "../types";
import { queryKeys } from "../lib/react-query";

export const getTenantPath = (user: any, projectId: string, subPath: string) => {
  if (!user || !projectId) return null;
  return user.currentOrgId 
    ? `organizations/${user.currentOrgId}/projects/${projectId}/${subPath}` 
    : `projects/${projectId}/${subPath}`;
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
      if (!logsPath) throw new Error("Invalid path");

      const { setDoc } = await import("firebase/firestore");

      const newLogRef = doc(collection(db, logsPath));
      const now = new Date().toISOString();
      
      const latestEntry: DailyLogEntry = {
        ...newEntry,
        id: newLogRef.id,
        createdAt: now,
        createdByUid: user.uid,
        createdByName: user.displayName || user.email || "Unknown",
      };

      await setDoc(newLogRef, latestEntry);
      
      return latestEntry;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byTask(projectId, variables.taskId) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, variables.workDate) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
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
      const { updateDoc, setDoc } = await import("firebase/firestore");
      
      await updateDoc(logRef, updates);

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
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, data.workDate) });
      // Invalidate the old date if it changed
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
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
      const { deleteDoc, setDoc } = await import("firebase/firestore");
      
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
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.byDate(projectId, deletedLog.workDate) });
      queryClient.invalidateQueries({ queryKey: dailyLogKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
    },
  });
}
