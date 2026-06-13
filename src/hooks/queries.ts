import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/react-query";
import { db, collection, query, orderBy, getDocs, handleFirestoreError, OperationType, onSnapshot, doc, getDoc } from "../firebase";
import { useEffect } from "react";
import { Project, Task } from "../types";
import { useAuthStore } from "../store";

export function useProjectDataQuery<T>(
  projectId: string,
  type: string,
  orderByField?: string,
  orderDirection: "asc" | "desc" = "desc"
) {
  const user = useAuthStore((state) => state.user);
  
  // Use organization boundary if set, otherwise fallback for local dev compatibility
  const tenantPath = user?.currentOrgId ? `organizations/${user.currentOrgId}` : "";
  const basePath = tenantPath ? `${tenantPath}/projects/${projectId}` : `projects/${projectId}`;

  return useQuery({
    queryKey: ['projectData', projectId, type, orderByField, orderDirection],
    queryFn: async () => {
      try {
        const path = `${basePath}/${type}`;
        let queryObj = query(collection(db, path));
        if (orderByField) {
          queryObj = query(collection(db, path), orderBy(orderByField, orderDirection));
        }

        const snapshot = await getDocs(queryObj);
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as T[];
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `${basePath}/${type}`);
        return [];
      }
    },
    enabled: !!projectId && !!type,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectsQuery() {
  const user = useAuthStore(state => state.user);

  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: async () => {
      if (!user) return [];
      const tenantPath = user.currentOrgId ? `organizations/${user.currentOrgId}/projects` : "projects";
      const snapshot = await getDocs(query(collection(db, tenantPath)));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Project);
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjectQuery(projectId: string) {
  const user = useAuthStore(state => state.user);

  return useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: async () => {
      if (!user || !projectId) return null;
      const tenantPath = user.currentOrgId ? `organizations/${user.currentOrgId}/projects` : "projects";
      const snapshot = await getDoc(doc(db, tenantPath, projectId));
      return { id: snapshot.id, ...snapshot.data() } as Project;
    },
    enabled: !!user && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTasksQuery(projectId: string) {
  const user = useAuthStore(state => state.user);

  return useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: async () => {
      if (!user || !projectId) return [];
      const tenantPath = user.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}/tasks` : `projects/${projectId}/tasks`;
      const snapshot = await getDocs(query(collection(db, tenantPath)));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Task);
    },
    enabled: !!user && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
