import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/react-query";
import { db, collection, query, orderBy, getDocs, handleFirestoreError, OperationType, onSnapshot, doc, getDoc } from "../firebase";
import { useEffect } from "react";
import { Project, Task } from "../types";
import { useAuthStore } from "../store";
import { getProjectBasePath, getProjectSubCollectionPath } from "../utils/projectPath";
import { demoRequested } from "../demo";
import { demoCollections, demoProjects, demoTasks, DEMO_PROJECT_ID } from "@demo";

export function useProjectDataQuery<T>(
  projectId: string,
  type: string,
  orderByField?: string,
  orderDirection: "asc" | "desc" = "desc"
) {
  const user = useAuthStore((state) => state.user);
  const basePath = getProjectBasePath(projectId);

  return useQuery({
    queryKey: ['projectData', projectId, type, orderByField, orderDirection],
    queryFn: async () => {
      if (__DEMO__ && demoRequested()) return (demoCollections[type] || []) as T[];
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
      if (__DEMO__ && demoRequested()) return demoProjects as any as Project[];
      if (!user) return [];
      
      const projectsList: Project[] = [];
      const seenIds = new Set<string>();

      // 1. Always fetch from root projects collection
      try {
        const rootSnapshot = await getDocs(query(collection(db, "projects")));
        rootSnapshot.docs.forEach(doc => {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            projectsList.push({ id: doc.id, ...doc.data() } as Project);
          }
        });
      } catch (err) {
        console.error("Failed to fetch root projects:", err);
      }

      // 2. Fetch from tenant projects if orgId is set
      if (user.currentOrgId) {
        try {
          const tenantPath = `organizations/${user.currentOrgId}/projects`;
          const tenantSnapshot = await getDocs(query(collection(db, tenantPath)));
          tenantSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const projectObj = { id: doc.id, orgId: user.currentOrgId, ...data } as any as Project;
            
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              projectsList.push(projectObj);
            } else {
              // If already added from root but this is tenant-scoped, prefer the tenant-scoped details
              const idx = projectsList.findIndex(p => p.id === doc.id);
              if (idx !== -1) {
                projectsList[idx] = projectObj;
              }
            }
          });
        } catch (err) {
          console.error(`Failed to fetch tenant projects for ${user.currentOrgId}:`, err);
        }
      }

      return projectsList;
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
      if (__DEMO__ && demoRequested()) {
        return (demoProjects.find((p) => p.id === projectId) || demoProjects[0]) as any as Project;
      }
      if (!user || !projectId) return null;
      
      // Try tenant path first if user has currentOrgId
      if (user.currentOrgId) {
        try {
          const tenantPath = `organizations/${user.currentOrgId}/projects`;
          const snapshot = await getDoc(doc(db, tenantPath, projectId));
          if (snapshot.exists()) {
            return { id: snapshot.id, orgId: user.currentOrgId, ...snapshot.data() } as any as Project;
          }
        } catch (err) {
          console.error("Failed to fetch project from tenant path:", err);
        }
      }

      // Fallback to root projects collection
      const snapshot = await getDoc(doc(db, "projects", projectId));
      if (snapshot.exists()) {
        const data = snapshot.data();
        return { id: snapshot.id, orgId: data.orgId || undefined, ...data } as any as Project;
      }

      return null;
    },
    enabled: !!user && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTasksQuery(projectId: string) {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();

  // Live subscription: keep the tasks cache in sync with Firestore in real
  // time. This means adds/edits/deletes/drag-drops (from this client or any
  // other) reflect immediately — the initial getDocs below just paints fast
  // from cache on mount, then the snapshot takes over and never goes stale.
  useEffect(() => {
    if (__DEMO__ && demoRequested()) return; // no Firestore subscription in demo mode
    if (!user || !projectId) return;
    const tenantPath = getProjectSubCollectionPath(projectId, "tasks");
    const unsubscribe = onSnapshot(
      query(collection(db, tenantPath)),
      (snapshot) => {
        const tasks = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Task,
        );
        queryClient.setQueryData(queryKeys.tasks(projectId), tasks);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, tenantPath),
    );
    return () => unsubscribe();
  }, [user, projectId, queryClient]);

  return useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: async () => {
      if (__DEMO__ && demoRequested()) {
        return (projectId === DEMO_PROJECT_ID ? demoTasks : []) as any as Task[];
      }
      if (!user || !projectId) return [];
      const tenantPath = getProjectSubCollectionPath(projectId, "tasks");
      const snapshot = await getDocs(query(collection(db, tenantPath)));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Task);
    },
    enabled: !!user && !!projectId,
    staleTime: 5 * 60 * 1000,
  });
}
