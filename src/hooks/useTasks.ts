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
import { demoRequested } from "../demo";
import { demoTasks, DEMO_PROJECT_ID } from "@demo";

export function useTasksInit() {
  const activeProject = useProjectStore((state) => state.activeProject);
  const setTasks = useTaskStore((state) => state.setTasks);

  useEffect(() => {
    if (__DEMO__ && demoRequested()) {
      setTasks((activeProject?.id === DEMO_PROJECT_ID ? demoTasks : []) as any as Task[]);
      return;
    }
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
