import { Task, TaskDependency, DependencyType } from "../types";
import { addDays, differenceInDays, format, parseISO } from "date-fns";

const safeParseDate = (dateStr: string | undefined): Date => {
  if (!dateStr) return new Date(NaN);
  try {
    return parseISO(dateStr);
  } catch (e) {
    return new Date(NaN);
  }
};

export const calculateCPM = (tasks: Task[]): Task[] => {
  if (tasks.length === 0) return [];

  const defaultDateStr = new Date().toISOString().split("T")[0];
  const safeTasks = tasks.map(t => ({
    ...t,
    startDate: t.startDate || defaultDateStr,
    endDate: t.endDate || defaultDateStr,
    duration: typeof t.duration === 'number' && !isNaN(t.duration) ? t.duration : 1,
  }));

  // 1. First, calculate hierarchical roll-ups (Dates, Progress, Costs, Resources)
  let processedTasks = calculateHierarchicalData(safeTasks);

  const taskMap = new Map<string, Task>(
    processedTasks.map((t) => [t.id, { ...t }]),
  );
  const adjList = new Map<string, string[]>();

  // Build adjacency lists for dependencies
  processedTasks.forEach((task) => {
    const deps = task.advancedDependencies || [];
    deps.forEach((dep) => {
      if (!adjList.has(dep.id)) adjList.set(dep.id, []);
      adjList.get(dep.id)!.push(task.id);
    });
  });

  // Forward Pass
  const sortedIds = topologicalSort(processedTasks, adjList);
  sortedIds.forEach((id) => {
    const task = taskMap.get(id)!;
    const predecessors = task.advancedDependencies || [];

    if (predecessors.length === 0) {
      task.earlyStart = task.startDate;
      task.earlyFinish = task.endDate;
    } else {
      let maxES = new Date(0);
      predecessors.forEach((dep) => {
        const pred = taskMap.get(dep.id);
        if (!pred) return;

        let potentialES: Date;
        const predES = safeParseDate(pred.earlyStart || pred.startDate);
        const predEF = safeParseDate(pred.earlyFinish || pred.endDate);

        if (isNaN(predES.getTime()) || isNaN(predEF.getTime())) return;

        switch (dep.type) {
          case "FS":
            potentialES = addDays(predEF, dep.lag + 1);
            break;
          case "SS":
            potentialES = addDays(predES, dep.lag);
            break;
          case "FF":
            potentialES = addDays(addDays(predEF, dep.lag + 1), -task.duration);
            break;
          case "SF":
            potentialES = addDays(addDays(predES, dep.lag + 1), -task.duration);
            break;
          default:
            potentialES = addDays(predEF, dep.lag + 1);
        }

        if (potentialES > maxES) maxES = potentialES;
      });

      task.earlyStart = format(maxES, "yyyy-MM-dd");
      task.earlyFinish = format(
        addDays(maxES, task.duration - 1),
        "yyyy-MM-dd",
      );
    }
  });

  // Backward Pass
  const validEarlyFinishes = Array.from(taskMap.values())
    .map((t) => (t.earlyFinish ? safeParseDate(t.earlyFinish).getTime() : NaN))
    .filter((time) => !isNaN(time));

  const projectFinish = validEarlyFinishes.length > 0 
    ? new Date(Math.max(...validEarlyFinishes)) 
    : new Date();
    
  sortedIds.reverse().forEach((id) => {
    const task = taskMap.get(id)!;
    const successors = adjList.get(id) || [];

    if (successors.length === 0) {
      task.lateFinish = format(projectFinish, "yyyy-MM-dd");
      task.lateStart = format(
        addDays(projectFinish, -(task.duration - 1)),
        "yyyy-MM-dd",
      );
    } else {
      let minLF = new Date(8640000000000000);
      successors.forEach((succId) => {
        const succ = taskMap.get(succId)!;
        const dep = (succ.advancedDependencies || []).find((d) => d.id === id)!;

        let potentialLF: Date;
        const succLS = safeParseDate(succ.lateStart || succ.earlyStart);
        const succLF = safeParseDate(succ.lateFinish || succ.earlyFinish);

        if (isNaN(succLS.getTime()) || isNaN(succLF.getTime())) return;

        switch (dep.type) {
          case "FS":
            potentialLF = addDays(succLS, -dep.lag - 1);
            break;
          case "SS":
            potentialLF = addDays(addDays(succLS, -dep.lag), task.duration - 1);
            break;
          case "FF":
            potentialLF = addDays(succLF, -dep.lag);
            break;
          case "SF":
            potentialLF = addDays(succLF, -dep.lag);
            break;
          default:
            potentialLF = addDays(succLS, -dep.lag - 1);
        }

        if (potentialLF < minLF) minLF = potentialLF;
      });
      task.lateFinish = format(minLF, "yyyy-MM-dd");
      task.lateStart = format(
        addDays(minLF, -(task.duration - 1)),
        "yyyy-MM-dd",
      );
    }

    // Float & Critical Path
    const es = safeParseDate(task.earlyStart);
    const ls = safeParseDate(task.lateStart);
    task.totalFloat = (!isNaN(ls.getTime()) && !isNaN(es.getTime())) 
      ? Math.max(0, differenceInDays(ls, es)) 
      : 0;
    task.isCritical = task.totalFloat === 0;
  });

  return Array.from(taskMap.values());
};

const calculateHierarchicalData = (tasks: Task[]): Task[] => {
  const taskMap = new Map<string, Task>(tasks.map((t) => [t.id, { ...t }]));
  const childrenMap = new Map<string, string[]>();

  tasks.forEach((t) => {
    if (t.parentId) {
      if (!childrenMap.has(t.parentId)) childrenMap.set(t.parentId, []);
      childrenMap.get(t.parentId)!.push(t.id);
    }
  });

  const processTask = (id: string) => {
    const task = taskMap.get(id)!;
    const children = childrenMap.get(id) || [];

    if (children.length > 0) {
      children.forEach(processTask);
      const childTasks = children.map((cid) => taskMap.get(cid)!);

      // 1. Dates Roll-up
      const startDates = childTasks
        .map((ct) => safeParseDate(ct.startDate).getTime())
        .filter((t) => !isNaN(t));
      const endDates = childTasks
        .map((ct) => safeParseDate(ct.endDate).getTime())
        .filter((t) => !isNaN(t));
      
      const minStart = startDates.length > 0 ? new Date(Math.min(...startDates)) : new Date();
      const maxEnd = endDates.length > 0 ? new Date(Math.max(...endDates)) : new Date();

      task.startDate = format(minStart, "yyyy-MM-dd");
      task.endDate = format(maxEnd, "yyyy-MM-dd");
      task.duration = Math.max(1, differenceInDays(maxEnd, minStart) + 1);

      // 2. Progress Roll-up (Weighted by duration)
      const totalDuration = childTasks.reduce(
        (acc, ct) => acc + ct.duration,
        0,
      );
      if (totalDuration > 0) {
        const weightedProgress = childTasks.reduce(
          (acc, ct) => acc + ct.progress * ct.duration,
          0,
        );
        task.progress = Math.round(weightedProgress / totalDuration);
      } else {
        task.progress = Math.round(
          childTasks.reduce((acc, ct) => acc + ct.progress, 0) /
            childTasks.length,
        );
      }

      // 3. Cost Roll-up
      task.budgetedCost = childTasks.reduce(
        (acc, ct) => acc + (ct.budgetedCost || 0),
        0,
      );
      task.actualCost = childTasks.reduce(
        (acc, ct) => acc + (ct.actualCost || 0),
        0,
      );

      // 4. Resource Roll-up
      const resourceMap = new Map<string, any>();
      childTasks.forEach((ct) => {
        ct.resources?.forEach((res) => {
          const key = `${res.name}-${res.unit}`;
          if (resourceMap.has(key)) {
            resourceMap.get(key).quantity += res.quantity;
          } else {
            resourceMap.set(key, { ...res });
          }
        });
      });
      task.resources = Array.from(resourceMap.values());

      // Mark as Summary if it has children
      task.type = "Summary";
    }
  };

  tasks.forEach((t) => {
    if (!t.parentId || !taskMap.has(t.parentId)) {
      processTask(t.id);
    }
  });

  return Array.from(taskMap.values());
};

const topologicalSort = (
  tasks: Task[],
  adjList: Map<string, string[]>,
): string[] => {
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const neighbors = adjList.get(id) || [];
    neighbors.forEach(visit);
    stack.push(id);
  };

  tasks.forEach((t) => visit(t.id));
  return stack.reverse();
};

export const autoShiftTasks = (tasks: Task[]): Task[] => {
  const cpmTasks = calculateCPM(tasks);
  return cpmTasks.map((task) => ({
    ...task,
    startDate: task.earlyStart || task.startDate,
    endDate: task.earlyFinish || task.endDate,
  }));
};
