import { useEffect } from "react";
import {
  db,
  collection,
  query,
  onSnapshot,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import { Task } from "../types";
import { useTaskStore, useProjectStore } from "../store";

export function useTasksInit() {
  const activeProject = useProjectStore((state) => state.activeProject);
  const setTasks = useTaskStore((state) => state.setTasks);

  useEffect(() => {
    if (!activeProject?.id) {
      setTasks([]);
      return;
    }
    const path = `projects/${activeProject.id}/tasks`;
    const q = query(collection(db, path));
    return onSnapshot(
      q,
      (snapshot) => {
        setTasks(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Task),
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      },
    );
  }, [activeProject?.id, setTasks]);
}
