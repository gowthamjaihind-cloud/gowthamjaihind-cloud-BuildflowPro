import { useEffect } from "react";
import {
  db,
  collection,
  query,
  onSnapshot,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { Project } from "../types";
import { useProjectStore, useAuthStore } from "../store";

export function useProjectsInit() {
  const user = useAuthStore((state) => state.user);
  const setProjects = useProjectStore((state) => state.setProjects);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const path = "projects";
    const q = query(collection(db, path));
    return onSnapshot(
      q,
      (snapshot) => {
        setProjects(
          snapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Project,
          ),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      },
    );
  }, [user, setProjects]);
}
