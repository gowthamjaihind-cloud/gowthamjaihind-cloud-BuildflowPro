import { useState, useEffect } from "react";
import { demoRequested } from "../demo";
import { demoTasks, DEMO_PROJECT_ID } from "@demo";
import { query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { collection, db } from "../firebase";
import { useAuthStore } from "../store";
import { getProjectSubCollectionPath } from "../utils/projectPath";

export type TaskStatus = 'scheduled' | 'in_progress' | 'blocked' | 'done';

export interface ScheduleTask {
  id: string;
  projectId: string;
  phaseId: string;
  title: string;
  assigneeName?: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  status: TaskStatus;
  blockedReason?: string;
  blockedByPoId?: string;
  dependsOnTaskIds: string[];
  rawTask: any; // Keep the original for Desktop Gantt
}

export interface Phase {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  unitsLabel: string;
  scheduleHealth: 'ahead' | 'on_schedule' | 'behind';
  healthLabel: string;
}

export function useScheduleData(projectId: string) {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    if (__DEMO__ && demoRequested()) {
      // Build the same ScheduleTask shape the Firestore parser produces —
      // including rawTask, which ScheduleView hands straight to the Gantt.
      setTasks(
        (projectId === DEMO_PROJECT_ID ? demoTasks : [])
          .filter((t: any) => !t.isSystemGenerated)
          .map((t: any) => {
            let status: TaskStatus = "scheduled";
            if (t.status === "Completed" || t.progress === 100) status = "done";
            else if (t.status === "Delayed" || t.status === "Blocked") status = "blocked";
            else if (t.progress > 0 || t.status === "In Progress") status = "in_progress";
            return {
              id: t.id,
              projectId: t.projectId || projectId,
              phaseId: t.phase || "Phase 1",
              title: t.name || "Unnamed Task",
              assigneeName: t.assignedTo,
              startDate: new Date(t.startDate),
              endDate: new Date(t.endDate),
              progress: t.progress || 0,
              status,
              blockedReason: undefined,
              dependsOnTaskIds: t.dependencies || [],
              rawTask: t,
            };
          }) as any,
      );
      // Phases are grouped the same way the live parser groups them, so the
      // phase strip and the Gantt agree.
      const demoParsed = (projectId === DEMO_PROJECT_ID ? demoTasks : []).filter(
        (t: any) => !t.isSystemGenerated,
      );
      const groups = demoParsed.reduce((acc: Record<string, any[]>, t: any) => {
        const pid = t.phase || "Phase 1";
        (acc[pid] ||= []).push(t);
        return acc;
      }, {});
      setPhases(
        Object.keys(groups).map((phaseName) => {
          const pt = groups[phaseName];
          const minStart = new Date(Math.min(...pt.map((t: any) => new Date(t.startDate).getTime())));
          const maxEnd = new Date(Math.max(...pt.map((t: any) => new Date(t.endDate).getTime())));
          const totalProg = pt.reduce((sum: number, t: any) => sum + (t.progress || 0), 0) / (pt.length || 1);
          const behind = totalProg < 30 && minStart < new Date();
          return {
            id: phaseName,
            name: phaseName,
            startDate: minStart,
            endDate: maxEnd,
            progress: Math.round(totalProg),
            unitsLabel: "All Units",
            scheduleHealth: behind ? "behind" : "on_schedule",
            healthLabel: behind ? "Behind Schedule" : "On Track",
          };
        }) as any,
      );
      setLoading(false);
      return;
    }
    if (!user || !projectId) {
      setLoading(false);
      return;
    }

    const tenantPath = getProjectSubCollectionPath(projectId, "tasks");
    const tasksQuery = query(collection(db, tenantPath));

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const parsedTasks: ScheduleTask[] = snapshot.docs
        .filter(doc => !doc.data().isSystemGenerated)
        .map(doc => {
        const data = doc.data();
        
        let status: TaskStatus = 'scheduled';
        if (data.status === 'Completed' || data.progress === 100) status = 'done';
        else if (data.status === 'Delayed' || data.status === 'Blocked') status = 'blocked';
        else if (data.progress > 0 || data.status === 'In Progress') status = 'in_progress';

        const parseDate = (val: any) => {
          if (!val) return new Date();
          if (val instanceof Date) return val;
          if (typeof val.toDate === 'function') return val.toDate();
          return new Date(val);
        };

        const sDate = parseDate(data.startDate);
        const eDate = parseDate(data.endDate);

        return {
          id: doc.id,
          projectId: data.projectId || projectId,
          phaseId: data.phase || 'Phase 1',
          title: data.name || 'Unnamed Task',
          assigneeName: data.assignedTo,
          startDate: sDate,
          endDate: eDate,
          progress: data.progress || 0,
          status: status,
          blockedReason: data.lastRemarks || (status === 'blocked' ? 'Delayed' : undefined),
          blockedByPoId: data.blockedByPoId,
          dependsOnTaskIds: data.dependencies || [],
          rawTask: { id: doc.id, ...data } // Preserve for Gantt legacy
        };
      });

      const phaseGroups = parsedTasks.reduce((acc, t) => {
        const pid = t.phaseId || 'Unknown Phase';
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(t);
        return acc;
      }, {} as Record<string, ScheduleTask[]>);

      const parsedPhases: Phase[] = Object.keys(phaseGroups).map(phaseName => {
        const phaseTasks = phaseGroups[phaseName];
        const minStart = new Date(Math.min(...phaseTasks.map(t => t.startDate.getTime())));
        const maxEnd = new Date(Math.max(...phaseTasks.map(t => t.endDate.getTime())));
        const totalProg = phaseTasks.reduce((sum, t) => sum + t.progress, 0) / (phaseTasks.length || 1);
        
        return {
          id: phaseName,
          name: phaseName,
          startDate: minStart,
          endDate: maxEnd,
          progress: Math.round(totalProg),
          unitsLabel: "All Units",
          scheduleHealth: totalProg < 30 && minStart < new Date() ? 'behind' : 'on_schedule',
          healthLabel: totalProg < 30 && minStart < new Date() ? 'Behind Schedule' : 'On Track'
        };
      });

      setTasks(parsedTasks);
      setPhases(parsedPhases);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId, user]);

  return { tasks, phases, loading };
}
