import { useState, useEffect } from "react";
import { query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { collection, db } from "../firebase";
import { useAuthStore } from "../store";

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
    if (!user || !projectId) {
      setLoading(false);
      return;
    }

    const tenantPath = user.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}/tasks` : `projects/${projectId}/tasks`;
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
