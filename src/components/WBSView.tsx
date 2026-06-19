import React, { useState, useEffect, useMemo } from "react";
import {
  db,
  collection,
  onSnapshot,
  query,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  handleFirestoreError,
  OperationType,
  getDoc,
} from "../firebase";
import {
  Task,
  TaskDependency,
  DependencyType,
  ResourceAllocation,
  InventoryItem,
  LaborRateCard,
  Vendor,
  MaterialAllocation,
  CostEntry,
  ProjectDocument,
} from "../types";
import {
  ListTree,
  Plus,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Trash2,
  Calendar,
  Link as LinkIcon,
  Edit2,
  X,
  MapPin,
  Layers,
  Tag,
  Package,
  IndianRupee,
  Activity,
  RefreshCw,
  Users,
  Box,
  FileText,
  ExternalLink,
  Flame,
  AlertCircle,
  PauseCircle,
  ArrowUpFromLine,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";

const safeParseDate = (dateStr: string | undefined | null): Date => {
  if (!dateStr) return new Date();
  try {
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    return new Date();
  }
};
import { motion, AnimatePresence } from "motion/react";
import { calculateCPM, autoShiftTasks } from "../services/schedulingService";
import { RoleGuard } from "./RoleGuard";
import { useTaskStore, useProjectDataStore } from "../store";
import { useTasksQuery } from "../hooks/queries";

import { useProjectData } from "../hooks/useProjectData";
import { MobileWBSView } from "./schedule/MobileWBSView";
import { DailyLogEntryScreen } from "./DailyLogEntryScreen";
import { DailyLogHistory } from "./DailyLogHistory";

interface WBSViewProps {
  projectId: string;
}

export const WBSView: React.FC<WBSViewProps> = ({ projectId }) => {
  const { data: rawTasks = [] } = useTasksQuery(projectId);
  const tasks = useMemo(() => calculateCPM(rawTasks.filter(t => !t.isSystemGenerated)), [rawTasks]);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const { data: entries } = useProjectData<CostEntry>(projectId, "costs");
  const { data: inventory } = useProjectData<InventoryItem>(
    projectId,
    "inventory",
  );
  const { data: rateCards } = useProjectData<LaborRateCard>(
    projectId,
    "labor_rate_cards",
  );
  const { data: vendors } = useProjectData<Vendor>(projectId, "suppliers");
  const { data: docs } = useProjectData<ProjectDocument>(
    projectId,
    "documents",
  );

  const { data: materialIssues = [] } = useProjectData<any>(projectId, "material_issues");
  const { data: laborLogs = [] } = useProjectData<any>(projectId, "labor_logs");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedLocations, setExpandedLocations] = useState<
    Record<string, boolean>
  >({});
  const [isAdding, setIsAdding] = useState<string | null>(null); // parentId or 'root'

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [phaseToDelete, setPhaseToDelete] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string>("");
  const [autoSchedule, setAutoSchedule] = useState<boolean>(false);
  const [dailyLogTaskId, setDailyLogTaskId] = useState<string | null>(null);

  const [newTask, setNewTask] = useState<Partial<Task>>({
    name: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: addDaysToDate(new Date(), 5),
    type: "Task",
    progress: 0,
    dependencies: [],
    advancedDependencies: [],
    activityCodes: [],
    resources: [],
    materialAllocations: [],
    plannedOtherCost: 0,
    phase: "",
    location: "",
  });

  const DEFAULT_PHASES = [
    "Pre-construction",
    "Substructure",
    "Superstructure",
    "Finishes",
    "MEP",
    "External Works",
    "Landscaping",
  ];
  const DEFAULT_LOCATIONS = [
    "Site-wide",
    "Block A",
    "Block B",
    "Basement",
    "Ground Floor",
    "First Floor",
    "Terrace",
  ];
  const DEFAULT_ACTIVITY_CODES = [
    "CONC",
    "BRICK",
    "PLAST",
    "ELECT",
    "PLUMB",
    "TILE",
    "PAINT",
    "HVAC",
    "EXCAV",
    "STEEL",
  ];

  const projectPhases = useMemo(() => {
    const phases = new Set(DEFAULT_PHASES);
    tasks.forEach((t) => t.phase && phases.add(t.phase));
    return Array.from(phases).sort();
  }, [tasks]);

  const projectLocations = useMemo(() => {
    const locations = new Set(DEFAULT_LOCATIONS);
    tasks.forEach((t) => t.location && locations.add(t.location));
    return Array.from(locations).sort();
  }, [tasks]);

  const projectActivityCodes = useMemo(() => {
    const codes = new Set(DEFAULT_ACTIVITY_CODES);
    tasks.forEach((t) => t.activityCodes?.forEach((c) => codes.add(c)));
    return Array.from(codes).sort();
  }, [tasks]);

  const validParents = useMemo(() => {
    const currentTaskId = editingTask?.id;
    if (!currentTaskId) return tasks;
    const getDescendants = (id: string, all: Task[]): string[] => {
      const children = all.filter((t) => t.parentId === id).map((t) => t.id);
      return children.reduce(
        (acc, child) => [...acc, ...getDescendants(child, all)],
        children,
      );
    };
    const descendants = getDescendants(currentTaskId, tasks);
    return tasks.filter(
      (t) => t.id !== currentTaskId && !descendants.includes(t.id),
    );
  }, [tasks, editingTask]);

  function addDaysToDate(date: Date, days: number) {
    let result = new Date(date);
    if (isNaN(result.getTime())) {
      result = new Date();
    }
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  }

  useEffect(() => {
    // Replaced listeners with useProjectData
  }, [projectId]);



  useEffect(() => {
    if (isAdding && isAdding !== "root") {
      const parentTask = tasks.find((t) => t.id === isAdding);
      if (parentTask) {
        setNewTask((prev) => ({
          ...prev,
          phase: parentTask.phase || "",
          location: parentTask.location || "",
        }));
      }
    } else if (isAdding === "root") {
      setNewTask((prev) => ({
        ...prev,
        phase: "",
        location: "",
      }));
    }
  }, [isAdding, tasks]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `projects/${projectId}/tasks`;
    try {
      const start = newTask.startDate ? safeParseDate(newTask.startDate) : new Date();
      const end = newTask.endDate ? safeParseDate(newTask.endDate) : new Date();
      const duration = differenceInDays(end, start) + 1;
      const laborCost = (newTask.resources || []).reduce(
        (acc, curr) => acc + curr.quantity * curr.costPerUnit,
        0,
      );
      const materialCost = (newTask.materialAllocations || []).reduce(
        (acc, curr) => {
          const invItem = inventory.find((i) => i.id === curr.inventoryItemId);
          return acc + curr.quantity * (invItem?.unitCost || 0);
        },
        0,
      );
      const otherCost = newTask.plannedOtherCost || 0;

      const budgetedCost = laborCost + materialCost + otherCost;

      const taskData = {
        ...newTask,
        projectId,
        parentId: isAdding === "root" ? null : isAdding,
        duration,
        budgetedCost,
        plannedLaborCost: laborCost,
        plannedMaterialCost: materialCost,
        plannedOtherCost: otherCost,
      };

      await addDoc(collection(db, path), taskData);

      if (
        newTask.materialAllocations &&
        newTask.materialAllocations.length > 0
      ) {
        // Material allocations are no longer deducted from inventory on task creation
      }

      setIsAdding(null);
      setNewTask({
        name: "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: addDaysToDate(new Date(), 5),
        type: "Task",
        progress: 0,
        dependencies: [],
        advancedDependencies: [],
        activityCodes: [],
        resources: [],
        materialAllocations: [],
        plannedOtherCost: 0,
        phase: "",
        location: "",
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    const path = `projects/${projectId}/tasks/${editingTask.id}`;
    try {
      const originalTask = tasks.find((t) => t.id === editingTask.id);
      const safeStart = editingTask.startDate || new Date().toISOString().split("T")[0];
      const safeEnd = editingTask.endDate || addDaysToDate(new Date(safeStart), 5);
      const start = safeStart ? safeParseDate(safeStart) : new Date();
      const end = safeEnd ? safeParseDate(safeEnd) : new Date();
      const duration = differenceInDays(end, start) + 1;
      const laborCost = (editingTask.resources || []).reduce(
        (acc, curr) => acc + curr.quantity * curr.costPerUnit,
        0,
      );
      const materialCost = (editingTask.materialAllocations || []).reduce(
        (acc, curr) => {
          const invItem = inventory.find((i) => i.id === curr.inventoryItemId);
          return acc + curr.quantity * (invItem?.unitCost || 0);
        },
        0,
      );
      const otherCost = editingTask.plannedOtherCost || 0;

      const budgetedCost = laborCost + materialCost + otherCost;

      const updatedTask = {
        ...editingTask,
        duration,
        budgetedCost,
        plannedLaborCost: laborCost,
        plannedMaterialCost: materialCost,
        plannedOtherCost: otherCost,
      };

      // Removed updating inventory stock on task edit since planning shouldn't affect physical stock

      if (autoSchedule) {
        const allTasksUpdated = tasks.map((t) =>
          t.id === updatedTask.id ? updatedTask : t,
        );
        const shiftedTasks = autoShiftTasks(allTasksUpdated);
        const batchPromises = shiftedTasks.map((t) =>
          updateDoc(doc(db, `projects/${projectId}/tasks`, t.id), { ...t }),
        );
        await Promise.all(batchPromises);
      } else {
        await updateDoc(
          doc(db, `projects/${projectId}/tasks`, editingTask.id),
          updatedTask,
        );
      }

      setEditingTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleRecalculate = async () => {
    try {
      const shiftedTasks = autoShiftTasks(tasks);
      const batchPromises = shiftedTasks.map((t) => {
        return updateDoc(doc(db, `projects/${projectId}/tasks`, t.id), {
          ...t,
        });
      });
      await Promise.all(batchPromises);
    } catch (error) {
      console.error("Failed to recalculate schedule", error);
    }
  };

  const handleDeleteTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      setTaskToDelete(task);
    }
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const id = taskToDelete.id;

    const getDescendants = (taskId: string): Task[] => {
      const children = tasks.filter((t) => t.parentId === taskId);
      const descendants = children.flatMap((c) => getDescendants(c.id));
      const current = tasks.find((t) => t.id === taskId);
      return current ? [current, ...descendants] : descendants;
    };

    const tasksToDelete = getDescendants(id);

    try {
      for (const task of tasksToDelete) {
        // Material allocations are no longer deducted from inventory on task edit/delete
        await deleteDoc(doc(db, `projects/${projectId}/tasks`, task.id));
      }
      setTaskToDelete(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `projects/${projectId}/tasks/${id}`,
      );
    }
  };

  // Grouping logic for WBS
  const groupedTasks = useMemo(() => {
    const filtered = filterTag
      ? tasks.filter((t) => t.activityCodes?.includes(filterTag))
      : tasks;

    const phases: Record<string, Record<string, Task[]>> = {};

    filtered.forEach((task) => {
      const phase = task.phase || "Unassigned Phase";
      const location = task.location || "Unassigned Location";

      if (filterTag || !task.parentId) {
        if (!phases[phase]) phases[phase] = {};
        if (!phases[phase][location]) phases[phase][location] = [];
        phases[phase][location].push(task);
      }
    });

    // Sort tasks in each location by startDate
    Object.values(phases).forEach((locations) => {
      Object.values(locations).forEach((taskArray) => {
        taskArray.sort((a, b) =>
          (a.startDate || "").localeCompare(b.startDate || ""),
        );
      });
    });

    return phases;
  }, [tasks, filterTag]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tasks.forEach((t) => t.activityCodes?.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [tasks]);

  const taskTotals = useMemo(() => {
    const totals: Record<string, { budgeted: number; actual: number }> = {};

    const calculateTotals = (
      taskId: string,
    ): { budgeted: number; actual: number } => {
      if (totals[taskId]) return totals[taskId];

      const task = tasks.find((t) => t.id === taskId);
      if (!task) return { budgeted: 0, actual: 0 };

      const children = tasks.filter((t) => t.parentId === taskId);

      // If task has children, rollup their budgets.
      // If user enters a budget on a summary task, it might be doubled if we add it.
      // According to user: "if i enter the lumpsum amount in the budget the value gets doubled in the main task"
      // Fix: If children exist, the summary budget IS the sum of children.
      let budgeted = 0;
      let actual = 0;

      if (children.length > 0) {
        // If user explicitly entered a cost on summary task, we should count it as "Additional/Fixed" cost
        // However, user prompt says it's doubling, which means they want summary to ONLY show rollup
        // or they are entering it in both.
        // We will sum only children if children exist.
        children.forEach((child) => {
          const childTotals = calculateTotals(child.id);
          budgeted += childTotals.budgeted;
          actual += childTotals.actual;
        });
      } else {
        const budgetEntries = entries?.filter(e => e.taskId === taskId && e.type === "Budget") || [];
        const actualEntries = entries?.filter(e => e.taskId === taskId && e.type === "Actual") || [];

        const budgetMat = budgetEntries.filter(e => e.category === "Material").reduce((sum, e) => sum + e.amount, 0);
        const budgetLab = budgetEntries.filter(e => e.category === "Labor").reduce((sum, e) => sum + e.amount, 0);
        const budgetOther = budgetEntries.filter(e => e.category !== "Material" && e.category !== "Labor").reduce((sum, e) => sum + e.amount, 0);

        budgeted = (task.plannedMaterialCost || 0) + budgetMat +
                   (task.plannedLaborCost || 0) + budgetLab +
                   (task.plannedOtherCost || 0) + budgetOther;

        const entryMat = actualEntries.filter((e) => e.category === "Material").reduce((sum, e) => sum + e.amount, 0);
        const issueMat = materialIssues.filter((i: any) => i.taskId === taskId).reduce((sum: number, i: any) => sum + (i.items || []).reduce((s: number, it: any) => s + (it.totalPrice || 0), 0), 0);
        const actualMaterial = entryMat + issueMat;

        const entryLab = actualEntries.filter((e) => e.category === "Labor").reduce((sum, e) => sum + e.amount, 0);
        const logLab = laborLogs.filter((log: any) => (log.items || []).some((item: any) => item.taskId === taskId)).reduce((sum: number, log: any) => sum + log.items.filter((item: any) => item.taskId === taskId).reduce((s: number, i: any) => s + (i.cost || 0), 0), 0);
        const actualLabor = entryLab + logLab;

        const actualOther = actualEntries.filter((e) => e.category !== "Material" && e.category !== "Labor").reduce((sum, e) => sum + e.amount, 0);

        actual = actualMaterial + actualLabor + actualOther;
      }

      const result = { budgeted, actual };
      totals[taskId] = result;
      return result;
    };

    tasks.forEach((task) => {
      if (!totals[task.id]) {
        calculateTotals(task.id);
      }
    });

    return totals;
  }, [tasks, entries, materialIssues, laborLogs]);

  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const [draggedTaskInfo, setDraggedTaskInfo] = useState<Task | null>(null);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData("taskId", task.id);
    e.dataTransfer.effectAllowed = "move";
    // We must use setTimeout because dragging immediately hides the element if we trigger a re-render that moves it, 
    // but here we just set state so it's fine, though setTimeout is a common workaround for drag ghost image issues.
    setTimeout(() => setDraggedTaskInfo(task), 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedTaskInfo(null);
    setDragOverTaskId(null);
  };

  const handleDragOver = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault();
    if (dragOverTaskId !== targetTaskId) {
      setDragOverTaskId(targetTaskId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTaskId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    setDragOverTaskId(null);
    const draggedTaskId = e.dataTransfer.getData("taskId");
    if (!draggedTaskId || draggedTaskId === targetTask.id) return;
    
    // Prevent cycles
    const getAncestors = (taskId: string): string[] => {
      const parent = tasks.find(t => t.id === taskId);
      if (!parent || !parent.parentId) return [];
      return [parent.parentId, ...getAncestors(parent.parentId)];
    };
    if (getAncestors(targetTask.id).includes(draggedTaskId)) {
      console.warn("Cannot drop a task inside its own child.");
      return;
    }

    try {
      const taskRef = doc(db, `projects/${projectId}/tasks`, draggedTaskId);
      await updateDoc(taskRef, { 
        parentId: targetTask.id,
        phase: targetTask.phase || "",
        location: targetTask.location || ""
      });
      if (targetTask.type !== "Summary") {
         const targetRef = doc(db, `projects/${projectId}/tasks`, targetTask.id);
         await updateDoc(targetRef, { type: "Summary" });
      }
    } catch(error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${draggedTaskId}`);
    }
  };

  const handleDropToLocation = async (e: React.DragEvent, targetPhase: string, targetLocation: string) => {
    e.preventDefault();
    setDragOverTaskId(null);
    const draggedTaskId = e.dataTransfer.getData("taskId");
    if (!draggedTaskId) return;

    try {
      const taskRef = doc(db, `projects/${projectId}/tasks`, draggedTaskId);
      await updateDoc(taskRef, { 
        parentId: null,
        phase: targetPhase,
        location: targetLocation
      });
    } catch(error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${draggedTaskId}`);
    }
  };

  const handleDropToUnnest = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTaskId(null);
    const draggedTaskId = e.dataTransfer.getData("taskId");
    if (!draggedTaskId) return;

    try {
      const taskRef = doc(db, `projects/${projectId}/tasks`, draggedTaskId);
      await updateDoc(taskRef, { 
        parentId: null
      });
    } catch(error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${draggedTaskId}`);
    }
  };

  const renderTaskRow = (task: Task, level: number = 0) => {
    const children = tasks
      .filter((t) => t.parentId === task.id)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    const isExpanded = expanded[task.id];
    const { budgeted: taskBudgetedCost, actual: taskActualCost } = taskTotals[
      task.id
    ] || { budgeted: 0, actual: 0 };
    const taskDocs = docs.filter((d) => d.taskId === task.id);

    return (
      <React.Fragment key={task.id}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, task)}
          onDragOver={(e) => handleDragOver(e, task.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, task)}
          className={`group flex items-center border-b border-slate-50 hover:bg-panel/50 apple-transition ${dragOverTaskId === task.id ? "bg-indigo-50/50 ring-2 ring-indigo-400 z-10" : ""} ${task.isCritical ? "bg-red-50/10" : ""}`}
          style={{
            paddingLeft:
              windowWidth < 480
                ? level * 8 + 8
                : windowWidth < 768
                  ? level * 14 + 12
                  : level * 28 + 24,
          }}
        >
          <div className="flex items-center gap-1.5 sm:gap-3 py-3 md:py-5 flex-1 min-w-0">
            <div className="flex items-center justify-center min-w-[14px] md:min-w-[24px]">
              {children.length > 0 && !filterTag ? (
                <button
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [task.id]: !prev[task.id],
                    }))
                  }
                  className="p-1 hover:bg-surface hover:shadow-md rounded-lg md:rounded-xl apple-transition text-ink-muted hover:text-ink active:scale-90"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 md:w-4" />
                  ) : (
                    <ChevronRight className="w-3 md:w-4" />
                  )}
                </button>
              ) : (
                <div className="w-4 md:w-6" />
              )}
            </div>

            <div
              className={`w-1.5 md:w-3 h-1.5 md:h-3 rounded-full shrink-0 shadow-inner ${
                task.isCritical
                  ? "bg-red-500 ring-2 md:ring-4 ring-red-50"
                  : task.type === "Milestone"
                    ? "bg-amber-500 rotate-45 scale-90"
                    : task.type === "Summary"
                      ? "bg-slate-900 ring-2 md:ring-4 ring-slate-100"
                      : "bg-surface ring-2 ring-slate-200"
              }`}
            />

            <div className="flex flex-col min-w-0 flex-1 ml-0.5 md:ml-1">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    title={task.name}
                    className={`leading-tight tracking-tight text-[11px] md:text-sm font-bold truncate ${task.type === "Summary" ? "text-ink border-b-2 border-slate-900/10" : "text-ink/80"} transition-colors`}
                  >
                    {task.name || "Unit Missing"}
                  </span>
                  {task.status && (
                    <div
                      title={task.status}
                      className={`${
                        task.status === "Completed"
                          ? "text-emerald-500"
                          : task.status === "In Progress"
                            ? "text-amber-500"
                            : task.status === "Delayed"
                              ? "text-red-500"
                              : task.status === "On Hold"
                                ? "text-ink-muted"
                                : "text-ink-muted"
                      }`}
                    >
                      {task.status === "Completed" && (
                        <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                      {task.status === "In Progress" && (
                        <Activity className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                      {task.status === "Delayed" && (
                        <AlertCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                      {task.status === "On Hold" && (
                        <PauseCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                      {(task.status === "Pending" ||
                        ![
                          "Completed",
                          "In Progress",
                          "Delayed",
                          "On Hold",
                        ].includes(task.status)) && (
                        <Circle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      )}
                    </div>
                  )}

                  {task.isCritical && (
                    <div
                      title="Critical Path Indicator"
                      className="text-red-500 flex items-center"
                    >
                      <Flame className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </div>
                  )}
                </div>
              </div>

              {/* Resource Detail Row */}
              {task.type !== "Summary" &&
              (task.resources?.length || task.materialAllocations?.length) ? (
                <div className="flex items-center gap-3 mt-1 overflow-x-auto no-scrollbar pb-1">
                  {task.resources?.slice(0, 3).map((res, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 bg-indigo-50/50 px-1.5 py-0.5 rounded-md border border-indigo-100 shrink-0"
                    >
                      <Users className="w-2 h-2 text-indigo-500" />
                      <span className="text-[7px] font-bold text-indigo-700 uppercase tracking-tight">
                        {res.name.split(":")[1] || res.name} ({res.quantity})
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Activity Insights: Remarks and Critical Badge Below */}
              <div className="flex flex-col gap-1 mt-1 mb-1 px-1">
                {task.type !== "Summary" && task.lastRemarks && (
                  <p className="text-[7px] md:text-[8px] font-medium text-ink-muted italic line-clamp-1 border-l-2 border-divider pl-2">
                    "{task.lastRemarks}"
                  </p>
                )}
                {task.isCritical && (
                  <div className="flex">
                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[6px] md:text-[8px] font-black rounded-md uppercase tracking-widest shadow-sm shadow-red-100">
                      CRITICAL NODE
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 mt-0.5 flex-wrap overflow-hidden h-3 md:h-4">
                {task.activityCodes?.slice(0, 1).map((tag, idx) => (
                  <span
                    key={`${tag}-${idx}`}
                    className="text-[7px] md:text-[8px] px-1 md:px-2 py-0.5 bg-panel text-ink-muted rounded-full font-bold tracking-widest uppercase truncate max-w-10 md:max-w-80px"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-8 lg:gap-10 px-1 md:px-6 shrink-0 justify-end">
            <div className="w-24 hidden xl:flex flex-col shrink-0 text-left">
              <span className="text-[10px] font-bold text-ink">{formatDate(task.startDate)}</span>
              <span className="text-[9px] font-bold text-ink-muted">{formatDate(task.endDate)} ({task.duration}d)</span>
            </div>
            <div className="w-16 hidden lg:block text-center shrink-0">
              <span className={`text-[11px] font-black ${task.freeFloat === 0 ? "text-red-500" : "text-emerald-500"}`}>{task.freeFloat || 0}d</span>
            </div>
            <div className="w-auto sm:w-24 md:w-28 flex flex-col items-end shrink-0">
              <span className="text-[8px] sm:text-xs font-black text-ink tracking-tighter">
                ₹
                {taskBudgetedCost >= 1000
                  ? (taskBudgetedCost / 1000).toFixed(1) + "k"
                  : taskBudgetedCost}
              </span>
              <span className="text-[6px] md:text-[8px] font-black text-ink-muted uppercase tracking-widest leading-none">
                Budg
              </span>
            </div>

            <div className="w-auto sm:w-24 md:w-28 flex flex-col items-end shrink-0">
              <span
                className={`text-[8px] sm:text-xs font-black tracking-tighter ${taskActualCost > taskBudgetedCost ? "text-red-600" : "text-emerald-600"}`}
              >
                ₹
                {taskActualCost >= 1000
                  ? (taskActualCost / 1000).toFixed(1) + "k"
                  : taskActualCost}
              </span>
              <span className="text-[6px] md:text-[8px] font-black text-ink-muted uppercase tracking-widest leading-none">
                Act
              </span>
            </div>

            <div className="w-10 sm:w-28 md:w-32 flex flex-col items-end gap-1.5 shrink-0">
              <div className="flex-1 h-1.5 w-full bg-panel rounded-full overflow-hidden shadow-inner ring-1 ring-slate-100 hidden sm:block relative">
                <div
                  className={`h-full transition-all duration-1000 ${task.progress === 100 ? "bg-emerald-500" : "bg-indigo-600"}`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center w-full">
                <span
                  className={`text-[9px] md:text-[11px] font-black min-w-[20px] md:min-w-[32px] text-left ${task.progress === 100 ? "text-emerald-500" : "text-ink"}`}
                >
                  {task.progress}%
                </span>
                {task.type !== "Summary" && (
                   <button 
                     onClick={() => setDailyLogTaskId(task.id)}
                     className="text-[8px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded focus:outline-none focus:ring-1 hover:bg-indigo-100 transition"
                   >
                     Log Work
                   </button>
                )}
              </div>
            </div>

            <div className="w-12 md:w-24 flex items-center justify-center gap-0.5 md:gap-1 shrink-0">
              <div className="flex md:gap-1">
                <button
                  onClick={() => setEditingTask(task)}
                  className="p-1 md:p-2.5 text-ink-muted hover:text-ink hover:bg-surface hover:shadow-md rounded-lg md:rounded-2xl apple-transition active:scale-95"
                >
                  <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                </button>
                <button
                  onClick={() => setIsAdding(task.id)}
                  className="p-1 md:p-2.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg md:rounded-2xl apple-transition active:scale-90"
                >
                  <Plus className="w-3.5 h-3.5 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        {isExpanded && !filterTag && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 w-px bg-panel"
              style={{
                left:
                  windowWidth < 480
                    ? level * 8 + 15
                    : windowWidth < 768
                      ? level * 14 + 21
                      : level * 28 + 36,
              }}
            />
            {children.map((child) => renderTaskRow(child, level + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  const confirmDeletePhase = async () => {
    if (!phaseToDelete) return;

    const tasksInPhase = tasks.filter(
      (t) => (t.phase || "Unassigned Phase") === phaseToDelete,
    );

    try {
      for (const task of tasksInPhase) {
        // Check if task still exists (might have been deleted as a descendant of a previous task in the loop)
        const taskRef = doc(db, `projects/${projectId}/tasks`, task.id);
        const taskDoc = await getDoc(taskRef);
        if (taskDoc.exists()) {
          // Re-use the logic for deleting a task and its descendants
          const getDescendants = (taskId: string, allTasks: Task[]): Task[] => {
            const children = allTasks.filter((t) => t.parentId === taskId);
            const descendants = children.flatMap((c) =>
              getDescendants(c.id, allTasks),
            );
            const current = allTasks.find((t) => t.id === taskId);
            return current ? [current, ...descendants] : descendants;
          };

          const tasksToDelete = getDescendants(task.id, tasks);
          for (const t of tasksToDelete) {
            // Material allocations are no longer deducted from inventory
            await deleteDoc(doc(db, `projects/${projectId}/tasks`, t.id));
          }
        }
      }
      setPhaseToDelete(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `projects/${projectId}/tasks`,
      );
    }
  };

  const formatDate = (d: string | undefined) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-10">
      {windowWidth < 768 ? (
        <MobileWBSView 
          projectId={projectId} 
          onOpenFullForm={(t, pid) => {
             if (t) setEditingTask(t);
             else setIsAdding(pid || "root");
          }}
          onOpenDailyLog={(id) => setDailyLogTaskId(id)}
        />
      ) : (
      <>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface/70 backdrop-blur-xl p-6 rounded-[32px] border border-white/20 shadow-[0_10px_40px_rgba(0,0,0,0.03)] gap-6">
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          <div className="bg-indigo-50 p-3 rounded-2xl">
            <ListTree className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-ink tracking-tight leading-none mb-1">
              WBS
            </h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
              Project Breakdown Structure
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 ml-0 md:ml-6">
            <div className="flex items-center gap-2 bg-panel px-4 py-2 rounded-2xl border border-divider shadow-inner">
              <Tag className="w-3.5 h-3.5 text-ink-muted" />
              <select
                className="bg-transparent text-[11px] font-bold outline-none text-ink"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              >
                <option value="">Full Inventory</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-panel px-4 py-2 rounded-2xl border border-divider shadow-inner group apple-transition hover:bg-indigo-50/50">
              <input
                type="checkbox"
                id="autoSchedule"
                checked={autoSchedule}
                onChange={(e) => setAutoSchedule(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-lg border-divider focus:ring-indigo-500 apple-transition"
              />
              <label
                htmlFor="autoSchedule"
                className="text-[11px] font-black text-ink-muted cursor-pointer uppercase tracking-widest"
              >
                Auto-Shift
              </label>
            </div>
            <button
              onClick={handleRecalculate}
              className="p-2 text-ink-muted hover:text-indigo-600 hover:bg-surface hover:shadow-sm rounded-xl transition-all"
              title="Recalculate all dates"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <RoleGuard
          allowedRoles={["Project Manager", "Site Engineer"]}
          projectId={projectId}
          requireWriteAccess
          fallback={
            <button
              disabled
              className="w-full md:w-auto bg-divider text-ink-muted px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 font-bold text-sm cursor-not-allowed cursor-help"
              title="You don't have permission to add tasks"
            >
              <Plus className="w-5 h-5" /> <span>Add Task</span>
            </button>
          }
        >
          <button
            onClick={() => setIsAdding("root")}
            className="w-full md:w-auto bg-surface-dark text-white px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 hover:bg-black apple-transition shadow-2xl shadow-slate-200 font-bold text-sm"
          >
            <Plus className="w-5 h-5" /> <span>Add Task</span>
          </button>
        </RoleGuard>
      </div>

      <div className="bg-surface rounded-[40px] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-slate-50 overflow-hidden">
        <div className="bg-surface-dark text-white/40 flex items-center px-4 md:px-10 py-5 md:py-6 text-[10px] font-black uppercase tracking-[0.1em] md:tracking-[0.3em] border-b border-white/5">
          <div className="flex-1 min-w-[100px] md:min-w-[200px] text-white/80">
            WBS
          </div>
          <div className="flex items-center gap-1.5 md:gap-8 lg:gap-10 px-1.5 md:px-6 shrink-0">
            <div className="w-24 hidden xl:block">Timeline</div>
            <div className="w-16 hidden lg:block text-center">Float</div>
            <div className="w-14 sm:w-24 md:w-28 text-right">Budget</div>
            <div className="w-14 sm:w-24 md:w-28 text-right">Actual</div>
            <div className="w-14 sm:w-28 md:w-32 text-center text-white/80">
              Progress
            </div>
            <div className="w-16 md:w-24 text-center">Ops</div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {Object.entries(groupedTasks).map(([phase, locations], phaseIdx) => {
            const phaseExpanded = expandedPhases[phase] !== false; // Default expanded
            return (
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: phaseIdx * 0.1 }}
                className="bg-surface"
              >
                <div
                  className="bg-panel/50 backdrop-blur-sm py-4 md:py-6 flex items-center justify-between border-b border-divider cursor-pointer hover:bg-panel apple-transition"
                  style={{
                    paddingLeft:
                      windowWidth < 480 ? 8 : windowWidth < 768 ? 12 : 24,
                  }}
                  onClick={() =>
                    setExpandedPhases((prev) => ({
                      ...prev,
                      [phase]: !phaseExpanded,
                    }))
                  }
                >
                  <div className="flex items-center gap-3 md:gap-5 min-w-0">
                    <div className="p-1 md:p-2 hover:bg-surface rounded-lg apple-transition text-indigo-500">
                      {phaseExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 md:w-5 md:h-5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 md:w-5 md:h-5" />
                      )}
                    </div>
                    <div className="p-1 md:p-2 bg-surface-dark text-white rounded-lg md:rounded-xl shadow-lg shrink-0">
                      <Layers className="w-3.5 h-3.5 opacity-80" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-indigo-500 block leading-none mb-1">
                        Phase
                      </span>
                      <span className="text-xs md:text-base font-bold text-ink leading-tight tracking-tight truncate block">
                        {phase}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhaseToDelete(phase);
                    }}
                    className="p-2 md:p-3 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-xl apple-transition shrink-0"
                    title="Delete entire phase"
                  >
                    <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
                {phaseExpanded &&
                  Object.entries(locations).map(
                    ([location, locTasks], locIdx) => {
                      const locExpanded =
                        expandedLocations[`${phase}-${location}`] !== false; // Default expanded
                      return (
                        locTasks.length > 0 && (
                          <div
                            key={location}
                            className={`border-b last:border-b-0 border-divider ${dragOverTaskId === `loc-${phase}-${location}` ? "bg-indigo-50/50 ring-2 ring-indigo-400 z-10" : ""}`}
                            onDragOver={(e) => handleDragOver(e, `loc-${phase}-${location}`)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDropToLocation(e, phase, location)}
                          >
                            <div
                              className="bg-surface/50 py-3 md:py-5 flex items-center gap-3 md:gap-4 border-b border-slate-50 overflow-hidden cursor-pointer hover:bg-panel apple-transition"
                              style={{
                                paddingLeft:
                                  windowWidth < 480
                                    ? 16
                                    : windowWidth < 768
                                      ? 24
                                      : 56,
                              }}
                              onClick={() =>
                                setExpandedLocations((prev) => ({
                                  ...prev,
                                  [`${phase}-${location}`]: !locExpanded,
                                }))
                              }
                            >
                              <div className="p-1 hover:bg-surface rounded-lg apple-transition text-indigo-400">
                                {locExpanded ? (
                                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 md:w-4 md:h-4" />
                                )}
                              </div>
                              <div className="w-1.5 md:w-2.5 h-1.5 md:h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.4)] shrink-0" />
                              <span className="text-xs md:text-sm font-bold text-ink truncate">
                                {windowWidth < 480
                                  ? location
                                  : `Location: ${location}`}
                              </span>
                            </div>
                            {locExpanded && (
                              <div className="divide-y divide-slate-50">
                                {locTasks.map((task) => renderTaskRow(task, 2))}
                              </div>
                            )}
                          </div>
                        )
                      );
                    },
                  )}
              </motion.div>
            );
          })}

          {tasks.length === 0 && (
            <div className="p-20 text-center">
              <div className="bg-panel w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <ListTree className="w-8 h-8 text-ink-muted" />
              </div>
              <p className="text-ink-muted text-sm italic">
                No tasks defined. Start by adding a task with Phase and
                Location.
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {draggedTaskInfo && draggedTaskInfo.parentId && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 p-4 md:p-6 rounded-3xl border-2 shadow-2xl z-[100] transition-all flex items-center gap-4 ${dragOverTaskId === "unnest-task" ? "border-indigo-500 bg-indigo-50 scale-105 shadow-[0_20px_60px_rgba(79,70,229,0.2)]" : "border-dashed border-indigo-300 bg-surface/90 backdrop-blur"}`}
            onDragOver={(e) => handleDragOver(e, "unnest-task")}
            onDragLeave={handleDragLeave}
            onDrop={handleDropToUnnest}
          >
               <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                  <ArrowUpFromLine className="w-6 h-6" />
               </div>
               <div>
                 <p className="font-bold text-ink text-sm md:text-base tracking-tight">Drop here to Un-nest task</p>
                 <p className="text-xs text-ink-muted">Moves this task to the top level</p>
               </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}

      {/* Modals for Add/Edit/Delete */}
      <AnimatePresence>
        {phaseToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Layers className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-2">
                  Delete Entire Phase?
                </h3>
                <p className="text-ink-muted text-sm mb-6">
                  Are you sure you want to delete the phase{" "}
                  <strong>{phaseToDelete}</strong>? This will delete all tasks
                  and subtasks assigned to this phase. This action cannot be
                  undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPhaseToDelete(null)}
                    className="flex-1 px-4 py-3 bg-panel text-ink/80 rounded-xl font-bold hover:bg-divider transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDeletePhase}
                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                  >
                    Delete Phase
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {taskToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-ink mb-2">
                  Confirm Task Deletion
                </h3>
                <p className="text-ink-muted text-sm mb-6">
                  Are you sure you want to delete{" "}
                  <strong>{taskToDelete.name}</strong>? This will also delete
                  all its subtasks. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setTaskToDelete(null)}
                    className="flex-1 px-4 py-3 bg-panel text-ink/80 rounded-xl font-bold hover:bg-divider transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                  >
                    Delete Task
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {(isAdding || editingTask) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="bg-slate-900 text-white p-6 flex justify-between items-center shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  {editingTask ? (
                    <Edit2 className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <Plus className="w-5 h-5 text-indigo-400" />
                  )}
                  {editingTask
                    ? `Edit Task: ${editingTask.name}`
                    : "Create New Task"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(null);
                    setEditingTask(null);
                  }}
                  className="p-2 hover:bg-surface/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={editingTask ? handleUpdateTask : handleAddTask}
                className="p-0 overflow-hidden flex flex-col h-full bg-panel"
              >
                <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-8 md:space-y-12">
                  {/* Identity & Classification */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
                    <div className="md:col-span-2 space-y-6 md:space-y-8">
                      <div className="space-y-2 md:space-y-3">
                        <label className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.3em] text-indigo-600 block mb-1">
                          Activity Designation
                        </label>
                        <div className="relative">
                          <input
                            required
                            className="w-full bg-surface border-2 border-divider rounded-xl md:rounded-[24px] px-4 md:px-8 py-4 md:py-6 focus:ring-4 md:ring-8 focus:ring-indigo-500/5 focus:border-indigo-600 outline-none transition-all font-black text-ink text-xl md:text-3xl shadow-md placeholder:text-ink-muted"
                            placeholder="Activity Identification"
                            value={
                              editingTask ? editingTask.name : newTask.name
                            }
                            onChange={(e) =>
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    name: e.target.value,
                                  })
                                : setNewTask({
                                    ...newTask,
                                    name: e.target.value,
                                  })
                            }
                          />
                          <div className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 p-1.5 md:p-2 bg-panel rounded-lg md:rounded-xl">
                            <Edit2 className="w-4 h-4 md:w-5 md:h-5 text-ink-muted" />
                          </div>
                        </div>
                        <div className="flex gap-2 items-center px-2 md:px-4">
                          <div
                            className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${editingTask ? "bg-indigo-500" : "bg-emerald-500"}`}
                          />
                          <span className="text-[8px] md:text-[9px] font-bold text-ink-muted uppercase tracking-widest">
                            {editingTask
                              ? `REFINING UNIT: ${editingTask.id}`
                              : "INITIALIZING NEW WORK UNIT"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
                            Work Phase
                          </label>
                          <select
                            className="w-full bg-surface border-2 border-divider rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 font-bold text-ink/80 focus:border-indigo-500 outline-none shadow-sm disabled:bg-panel disabled:text-ink-muted text-sm md:text-base"
                            value={
                              editingTask ? editingTask.phase : newTask.phase
                            }
                            disabled={!!(isAdding && isAdding !== "root")}
                            onChange={(e) => {
                              let val = e.target.value;
                              if (val === "CUSTOM_PHASE") {
                                val = prompt("Enter Phase name:") || "";
                                if (!val) return;
                              }
                              editingTask
                                ? setEditingTask({ ...editingTask, phase: val })
                                : setNewTask({ ...newTask, phase: val });
                            }}
                          >
                            <option value="">Select Phase</option>
                            {projectPhases.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                            <option value="CUSTOM_PHASE">+ Add New...</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
                            Location
                          </label>
                          <select
                            className="w-full bg-surface border-2 border-divider rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 font-bold text-ink/80 focus:border-indigo-500 outline-none shadow-sm disabled:bg-panel disabled:text-ink-muted text-sm md:text-base"
                            value={
                              editingTask
                                ? editingTask.location
                                : newTask.location
                            }
                            disabled={!!(isAdding && isAdding !== "root")}
                            onChange={(e) => {
                              let val = e.target.value;
                              if (val === "CUSTOM_LOCATION") {
                                val = prompt("Enter Location name:") || "";
                                if (!val) return;
                              }
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    location: val,
                                  })
                                : setNewTask({ ...newTask, location: val });
                            }}
                          >
                            <option value="">Select Location</option>
                            {projectLocations.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                            <option value="CUSTOM_LOCATION">
                              + Add New...
                            </option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
                            Parent Task
                          </label>
                          <select
                            className="w-full bg-surface border-2 border-divider rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 font-bold text-ink/80 focus:border-indigo-500 outline-none shadow-sm disabled:bg-panel disabled:text-ink-muted text-sm md:text-base truncate"
                            value={
                              editingTask ? (editingTask.parentId || "") : (newTask.parentId || "")
                            }
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : e.target.value;
                              editingTask
                                ? setEditingTask({ ...editingTask, parentId: val })
                                : setNewTask({ ...newTask, parentId: val });
                            }}
                          >
                            <option value="">-- Root (No Parent) --</option>
                            {validParents.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 md:space-y-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
                          Activity Type
                        </label>
                        <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
                          {["Task", "Summary", "Milestone"].map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                editingTask
                                  ? setEditingTask({
                                      ...editingTask,
                                      type: type as any,
                                    })
                                  : setNewTask({
                                      ...newTask,
                                      type: type as any,
                                    })
                              }
                              className={`px-2 md:px-4 py-2.5 md:py-3 rounded-lg md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-widest text-center md:text-left border-2 transition-all ${
                                (editingTask
                                  ? editingTask.type
                                  : newTask.type) === type
                                  ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100"
                                  : "bg-surface border-divider text-ink-muted hover:border-divider"
                              }`}
                            >
                              {type === "Summary" && window.innerWidth < 640
                                ? "Summ"
                                : type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted">
                          Activity Codes
                        </label>
                        <div className="flex flex-wrap gap-1.5 md:gap-2">
                          {(
                            editingTask?.activityCodes ||
                            newTask.activityCodes ||
                            []
                          ).map((code) => (
                            <span
                              key={code}
                              className="px-2 py-0.5 md:px-3 md:py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] md:text-[10px] font-black flex items-center gap-1.5 md:gap-2 group"
                            >
                              {code}
                              <button
                                type="button"
                                onClick={() => {
                                  const codes = (
                                    editingTask?.activityCodes ||
                                    newTask.activityCodes ||
                                    []
                                  ).filter((c) => c !== code);
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        activityCodes: codes,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        activityCodes: codes,
                                      });
                                }}
                                className="hover:text-red-500"
                              >
                                <X className="w-2.5 h-2.5 md:w-3 md:h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <select
                          className="w-full bg-surface border-2 border-divider rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-3.5 font-bold text-ink/80 focus:border-indigo-500 outline-none shadow-sm text-sm"
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const codes = [
                              ...(editingTask?.activityCodes ||
                                newTask.activityCodes ||
                                []),
                            ];
                            if (!codes.includes(e.target.value)) {
                              codes.push(e.target.value);
                            }
                            editingTask
                              ? setEditingTask({
                                  ...editingTask,
                                  activityCodes: codes,
                                })
                              : setNewTask({
                                  ...newTask,
                                  activityCodes: codes,
                                });
                            e.target.value = "";
                          }}
                        >
                          <option value="">+ Assign Code</option>
                          {DEFAULT_ACTIVITY_CODES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Scheduling Section */}
                  <div className="bg-surface rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-divider/60 shadow-sm space-y-6 md:space-y-8">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="p-2 md:p-3 bg-amber-50 text-amber-600 rounded-lg md:rounded-[20px] shadow-sm">
                        <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs md:text-sm font-black text-ink leading-none">
                          Scheduling
                        </h4>
                        <p className="text-[9px] md:text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1">
                          Timeline & Dependencies
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                      {/* Planned Dates */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Plan Start
                          </label>
                          <input
                            type="date"
                            required
                            className="w-full bg-panel border border-divider rounded-xl px-3 py-2.5 font-bold text-ink outline-none focus:border-amber-400 text-sm"
                            value={
                              editingTask
                                ? editingTask.startDate
                                : newTask.startDate
                            }
                            onChange={(e) =>
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    startDate: e.target.value,
                                  })
                                : setNewTask({
                                    ...newTask,
                                    startDate: e.target.value,
                                  })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            Plan Finish
                          </label>
                          <input
                            type="date"
                            required
                            className="w-full bg-panel border border-divider rounded-xl px-3 py-2.5 font-bold text-ink outline-none focus:border-amber-400 text-sm"
                            value={
                              editingTask
                                ? editingTask.endDate
                                : newTask.endDate
                            }
                            onChange={(e) =>
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    endDate: e.target.value,
                                  })
                                : setNewTask({
                                    ...newTask,
                                    endDate: e.target.value,
                                  })
                            }
                          />
                        </div>
                      </div>

                      {/* Actual Dates */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            Actual Start
                          </label>
                          <input
                            type="date"
                            className="w-full bg-indigo-50/30 border border-indigo-100 rounded-xl px-3 py-2.5 font-bold text-ink outline-none focus:border-indigo-400 text-sm"
                            value={
                              editingTask
                                ? editingTask.actualStartDate || ""
                                : newTask.actualStartDate || ""
                            }
                            onChange={(e) =>
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    actualStartDate: e.target.value,
                                  })
                                : setNewTask({
                                    ...newTask,
                                    actualStartDate: e.target.value,
                                  })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                            Actual Finish
                          </label>
                          <input
                            type="date"
                            className="w-full bg-indigo-50/30 border border-indigo-100 rounded-xl px-3 py-2.5 font-bold text-ink outline-none focus:border-indigo-400 text-sm"
                            value={
                              editingTask
                                ? editingTask.actualEndDate || ""
                                : newTask.actualEndDate || ""
                            }
                            onChange={(e) =>
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    actualEndDate: e.target.value,
                                  })
                                : setNewTask({
                                    ...newTask,
                                    actualEndDate: e.target.value,
                                  })
                            }
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-1 space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted block">
                          Progress & Status
                        </label>
                        <div className="space-y-4">
                          <div className="bg-panel p-4 rounded-xl border border-divider">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-bold text-ink-muted uppercase tracking-wider">
                                Progress
                              </span>
                              <span className="text-sm font-black text-ink">
                                {editingTask
                                  ? editingTask.progress
                                  : newTask.progress}
                                %
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              className="w-full accent-indigo-600 h-1.5 rounded-lg appearance-none bg-divider cursor-pointer"
                              value={
                                editingTask
                                  ? editingTask.progress
                                  : newTask.progress
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                editingTask
                                  ? setEditingTask({
                                      ...editingTask,
                                      progress: val,
                                    })
                                  : setNewTask({ ...newTask, progress: val });
                              }}
                            />
                          </div>

                          <select
                            className="w-full bg-surface border border-divider focus:border-indigo-500 rounded-xl p-3 text-xs font-bold shadow-sm"
                            value={
                              editingTask
                                ? editingTask.status || ""
                                : newTask.status || ""
                            }
                            onChange={(e) => {
                              const val = e.target.value as any;
                              editingTask
                                ? setEditingTask({
                                    ...editingTask,
                                    status: val,
                                  })
                                : setNewTask({ ...newTask, status: val });
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Delayed">Delayed</option>
                            <option value="On Hold">On Hold</option>
                          </select>
                        </div>
                      </div>
                      <div className="sm:col-span-1 space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-muted block">
                          Precedence Links
                        </label>
                        <div className="space-y-2">
                          <select
                            className="w-full bg-panel border-2 border-divider rounded-xl px-3 md:px-4 py-2.5 md:py-3 font-bold text-indigo-600 outline-none cursor-pointer text-sm"
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const dep: TaskDependency = {
                                id: e.target.value,
                                type: "FS",
                                lag: 0,
                              };
                              if (editingTask) {
                                setEditingTask({
                                  ...editingTask,
                                  advancedDependencies: [
                                    ...(editingTask.advancedDependencies || []),
                                    dep,
                                  ],
                                });
                              } else {
                                setNewTask({
                                  ...newTask,
                                  advancedDependencies: [
                                    ...(newTask.advancedDependencies || []),
                                    dep,
                                  ],
                                });
                              }
                              e.target.value = "";
                            }}
                          >
                            <option value="">+ Add Dependency...</option>
                            {tasks
                              .filter((t) => t.id !== (editingTask?.id || ""))
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                          <div className="space-y-2 max-h-[150px] overflow-y-auto">
                            {(
                              editingTask?.advancedDependencies ||
                              newTask.advancedDependencies ||
                              []
                            ).map((dep, idx) => {
                              const depTask = tasks.find(
                                (t) => t.id === dep.id,
                              );
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 md:gap-3 bg-surface p-2 md:p-3 rounded-xl border border-divider shadow-sm group"
                                >
                                  <span className="flex-1 text-[9px] md:text-[10px] font-black text-ink/80 truncate">
                                    {depTask?.name}
                                  </span>
                                  <div className="flex items-center bg-panel rounded-lg px-2 py-1 gap-1 md:gap-2">
                                    <select
                                      className="bg-transparent text-[9px] md:text-[10px] font-black text-indigo-600 outline-none"
                                      value={dep.type}
                                      onChange={(e) => {
                                        const newDeps = [
                                          ...(editingTask?.advancedDependencies ||
                                            newTask.advancedDependencies ||
                                            []),
                                        ];
                                        newDeps[idx].type = e.target
                                          .value as DependencyType;
                                        editingTask
                                          ? setEditingTask({
                                              ...editingTask,
                                              advancedDependencies: newDeps,
                                            })
                                          : setNewTask({
                                              ...newTask,
                                              advancedDependencies: newDeps,
                                            });
                                      }}
                                    >
                                      <option>FS</option>
                                      <option>SS</option>
                                      <option>FF</option>
                                      <option>SF</option>
                                    </select>
                                    <div className="w-px h-3 bg-slate-300" />
                                    <input
                                      type="number"
                                      className="w-6 md:w-8 bg-transparent text-[9px] md:text-[10px] font-black text-center outline-none"
                                      value={dep.lag}
                                      onChange={(e) => {
                                        const newDeps = [
                                          ...(editingTask?.advancedDependencies ||
                                            newTask.advancedDependencies ||
                                            []),
                                        ];
                                        newDeps[idx].lag =
                                          parseInt(e.target.value) || 0;
                                        editingTask
                                          ? setEditingTask({
                                              ...editingTask,
                                              advancedDependencies: newDeps,
                                            })
                                          : setNewTask({
                                              ...newTask,
                                              advancedDependencies: newDeps,
                                            });
                                      }}
                                    />
                                    <span className="text-[7px] md:text-[8px] font-black text-ink-muted">
                                      D
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newDeps = (
                                        editingTask?.advancedDependencies ||
                                        newTask.advancedDependencies ||
                                        []
                                      ).filter((_, i) => i !== idx);
                                      editingTask
                                        ? setEditingTask({
                                            ...editingTask,
                                            advancedDependencies: newDeps,
                                          })
                                        : setNewTask({
                                            ...newTask,
                                            advancedDependencies: newDeps,
                                          });
                                    }}
                                    className="p-1 text-ink-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <X className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resource & Budget Intensity */}
                  <div className="space-y-6 md:space-y-10">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="p-2 md:p-3 bg-slate-900 text-white rounded-lg md:rounded-[20px] shadow-sm">
                        <IndianRupee className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs md:text-sm font-black text-ink leading-none">
                          Resources & Budget
                        </h4>
                        <p className="text-[9px] md:text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1">
                          Allocation Strategy
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
                      {/* Resources */}
                      <div className="bg-indigo-50/50 rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-indigo-100/50 space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] md:text-[11px] font-black uppercase text-indigo-900 tracking-tighter flex items-center gap-2">
                            Labor Assignments
                          </h5>
                          <div className="flex gap-2">
                            <select
                              className="bg-surface border-none text-[9px] md:text-[10px] font-bold text-indigo-600 px-3 md:px-4 py-2 rounded-xl shadow-sm outline-none cursor-pointer max-w-[150px] md:max-w-none"
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const card = rateCards.find(
                                  (r) => r.id === e.target.value,
                                );
                                if (card) {
                                  const vendor = vendors.find(
                                    (v) => v.id === card.vendorId,
                                  );
                                  const res: ResourceAllocation = {
                                    resourceId: card.id,
                                    name: `${vendor?.name || "Unknown"}: ${card.role}`,
                                    quantity: 1,
                                    unit: card.unit,
                                    costPerUnit: card.rate,
                                  };
                                  if (editingTask) {
                                    setEditingTask({
                                      ...editingTask,
                                      resources: [
                                        ...(editingTask.resources || []),
                                        res,
                                      ],
                                    });
                                  } else {
                                    setNewTask({
                                      ...newTask,
                                      resources: [
                                        ...(newTask.resources || []),
                                        res,
                                      ],
                                    });
                                  }
                                }
                                e.target.value = "";
                              }}
                            >
                              <option value="">+ Assign Labor Role</option>
                              {rateCards.map((r) => {
                                const vendor = vendors.find(
                                  (v) => v.id === r.vendorId,
                                );
                                return (
                                  <option key={r.id} value={r.id}>
                                    {vendor?.name}: {r.role}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2 md:space-y-3 max-h-[200px] overflow-y-auto pr-1">
                          {(
                            editingTask?.resources ||
                            newTask.resources ||
                            []
                          ).map((res, idx) => (
                            <div
                              key={`res-edit-${res.resourceId || idx}`}
                              className="bg-surface p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm border border-indigo-100 flex items-center gap-3 md:gap-4 group hover:border-indigo-300 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] md:text-xs font-bold text-ink truncate">
                                  {res.name}
                                </div>
                                <div className="text-[8px] md:text-[9px] font-medium text-ink-muted mt-0.5 uppercase tracking-wider">
                                  {res.unit} • ₹
                                  {res.costPerUnit.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                                </div>
                              </div>
                              <input
                                type="number"
                                className="w-12 md:w-16 bg-panel border border-divider rounded-lg px-2 py-1.5 text-[10px] md:text-xs font-bold text-indigo-600 text-center focus:border-indigo-500 outline-none"
                                value={res.quantity || 0}
                                onChange={(e) => {
                                  const newRes = [
                                    ...(editingTask?.resources ||
                                      newTask.resources ||
                                      []),
                                  ];
                                  newRes[idx].quantity =
                                    parseFloat(e.target.value) || 0;
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        resources: newRes,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        resources: newRes,
                                      });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newRes = (
                                    editingTask?.resources ||
                                    newTask.resources ||
                                    []
                                  ).filter((_, i) => i !== idx);
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        resources: newRes,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        resources: newRes,
                                      });
                                }}
                                className="text-ink-muted hover:text-red-500 p-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Materials */}
                      <div className="bg-emerald-50/50 rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-emerald-100/50 space-y-4 md:space-y-6">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] md:text-[11px] font-black uppercase text-emerald-900 tracking-tighter flex items-center gap-2">
                            Material Consumption
                          </h5>
                          <div className="flex gap-2">
                            <select
                              className="bg-surface border-none text-[9px] md:text-[10px] font-bold text-emerald-600 px-3 md:px-4 py-2 rounded-xl shadow-sm outline-none cursor-pointer max-w-[150px] md:max-w-none"
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const invItem = inventory.find(
                                  (i) => i.id === e.target.value,
                                );
                                if (invItem) {
                                  const ma: MaterialAllocation = {
                                    inventoryItemId: invItem.id,
                                    name: invItem.name,
                                    quantity: 1,
                                    unit: invItem.unit,
                                  };
                                  if (editingTask) {
                                    setEditingTask({
                                      ...editingTask,
                                      materialAllocations: [
                                        ...(editingTask.materialAllocations ||
                                          []),
                                        ma,
                                      ],
                                    });
                                  } else {
                                    setNewTask({
                                      ...newTask,
                                      materialAllocations: [
                                        ...(newTask.materialAllocations || []),
                                        ma,
                                      ],
                                    });
                                  }
                                }
                                e.target.value = "";
                              }}
                            >
                              <option value="">+ Assign Material</option>
                              {inventory.map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2 md:space-y-3 max-h-[200px] overflow-y-auto pr-1">
                          {(
                            editingTask?.materialAllocations ||
                            newTask.materialAllocations ||
                            []
                          ).map((ma, idx) => (
                            <div
                              key={`mat-edit-${ma.inventoryItemId || idx}`}
                              className="bg-surface p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm border border-emerald-100 flex items-center gap-3 md:gap-4"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] md:text-xs font-black text-ink truncate">
                                  {ma.name}
                                </div>
                                <div className="text-[8px] md:text-[9px] font-bold text-emerald-600/60 mt-0.5 uppercase tracking-widest">
                                  {ma.unit}
                                </div>
                              </div>
                              <input
                                type="number"
                                className="w-12 md:w-16 bg-panel border-2 border-divider rounded-lg md:rounded-xl px-1.5 md:px-2 py-1.5 md:py-2 text-[10px] md:text-xs font-black text-emerald-600 text-center focus:border-emerald-500 outline-none"
                                value={ma.quantity || 0}
                                onChange={(e) => {
                                  const newMa = [
                                    ...(editingTask?.materialAllocations ||
                                      newTask.materialAllocations ||
                                      []),
                                  ];
                                  newMa[idx].quantity =
                                    parseFloat(e.target.value) || 0;
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        materialAllocations: newMa,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        materialAllocations: newMa,
                                      });
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newMa = (
                                    editingTask?.materialAllocations ||
                                    newTask.materialAllocations ||
                                    []
                                  ).filter((_, i) => i !== idx);
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        materialAllocations: newMa,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        materialAllocations: newMa,
                                      });
                                }}
                                className="text-ink-muted hover:text-red-500 p-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Linked Documents - only for existing tasks */}
                    {editingTask && (
                      <div className="bg-surface rounded-2xl md:rounded-[32px] p-5 md:p-8 border border-divider shadow-sm space-y-4 md:space-y-6">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="p-2 md:p-3 bg-indigo-50 text-indigo-600 rounded-lg md:rounded-[20px]">
                            <FileText className="w-4 h-4 md:w-5 md:h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs md:text-sm font-black text-ink leading-none">
                              Documents
                            </h4>
                            <p className="text-[9px] md:text-[10px] font-bold text-ink-muted uppercase tracking-widest mt-1">
                              Vault Attachments
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                          {docs
                            .filter((d) => d.taskId === editingTask.id)
                            .map((d) => (
                              <div
                                key={d.id}
                                className="flex items-center justify-between bg-panel p-3 md:p-4 rounded-xl md:rounded-2xl border border-divider group"
                              >
                                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                  <div className="p-1.5 md:p-2 bg-surface rounded-lg shadow-sm shrink-0">
                                    <FileText className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-500" />
                                  </div>
                                  <span className="text-[10px] md:text-[11px] font-bold text-ink/80 truncate">
                                    {d.name}
                                  </span>
                                </div>
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 md:p-2 bg-surface text-indigo-600 rounded-lg md:rounded-xl shadow-sm hover:shadow-md transition-all shrink-0"
                                >
                                  <ExternalLink className="w-3 md:w-3.5 h-3 md:h-3.5" />
                                </a>
                              </div>
                            ))}
                          {docs.filter((d) => d.taskId === editingTask.id)
                            .length === 0 && (
                            <div className="col-span-1 sm:col-span-2 text-center py-6 bg-panel rounded-2xl border-2 border-dashed border-divider">
                              <p className="text-[9px] md:text-[10px] font-bold text-ink-muted uppercase tracking-widest">
                                No vault documents
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Financial Summary Sheet */}
                    <div className="bg-slate-900 rounded-3xl md:rounded-[40px] p-6 md:p-10 text-white relative overflow-hidden shadow-2xl">
                      <div className="absolute right-0 top-0 w-64 md:w-96 h-64 md:h-96 bg-indigo-500/20 blur-[80px] md:blur-[120px] -mr-32 md:-mr-48 -mt-32 md:-mt-48" />

                      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
                        <div>
                          <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-2 md:mb-4">
                            Planned Resource Value
                          </p>
                          <div className="text-4xl md:text-6xl font-black tracking-tightest flex items-center gap-2 md:gap-3">
                            <span className="text-indigo-400 text-2xl md:text-4xl">
                              ₹
                            </span>
                            {(
                              (
                                editingTask?.resources ||
                                newTask.resources ||
                                []
                              ).reduce(
                                (acc, curr) =>
                                  acc + curr.quantity * curr.costPerUnit,
                                0,
                              ) +
                              (
                                editingTask?.materialAllocations ||
                                newTask.materialAllocations ||
                                []
                              ).reduce((acc, curr) => {
                                const invItem = inventory.find(
                                  (i) => i.id === curr.inventoryItemId,
                                );
                                return (
                                  acc + curr.quantity * (invItem?.unitCost || 0)
                                );
                              }, 0) +
                              (editingTask
                                ? editingTask.plannedOtherCost || 0
                                : newTask.plannedOtherCost || 0)
                            ).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 md:gap-x-12 gap-y-4 md:gap-y-8 border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-12">
                          <div>
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-30 mb-1 md:mb-2">
                              Labor
                            </p>
                            <div className="text-lg md:text-xl font-black text-indigo-400">
                              ₹
                              {(
                                editingTask?.resources ||
                                newTask.resources ||
                                []
                              )
                                .reduce(
                                  (acc, curr) =>
                                    acc + curr.quantity * curr.costPerUnit,
                                  0,
                                )
                                .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                          <div>
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-30 mb-1 md:mb-2">
                              Materials
                            </p>
                            <div className="text-lg md:text-xl font-black text-emerald-400">
                              ₹
                              {(
                                editingTask?.materialAllocations ||
                                newTask.materialAllocations ||
                                []
                              )
                                .reduce((acc, curr) => {
                                  const invItem = inventory.find(
                                    (i) => i.id === curr.inventoryItemId,
                                  );
                                  return (
                                    acc +
                                    curr.quantity * (invItem?.unitCost || 0)
                                  );
                                }, 0)
                                .toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </div>
                          </div>
                          <div className="col-span-2 space-y-2">
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-widest opacity-30">
                              Other Expenditure / Lumpsum
                            </p>
                            <div className="relative">
                              <input
                                type="number"
                                className="w-full bg-surface/10 border border-white/20 rounded-xl md:rounded-2xl px-4 md:px-5 py-2.5 md:py-3 font-black text-indigo-200 focus:bg-surface/20 outline-none transition-all placeholder:text-white/20 text-sm"
                                placeholder="Additional Budget..."
                                value={
                                  editingTask
                                    ? editingTask.plannedOtherCost || 0
                                    : newTask.plannedOtherCost || 0
                                }
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  editingTask
                                    ? setEditingTask({
                                        ...editingTask,
                                        plannedOtherCost: val,
                                      })
                                    : setNewTask({
                                        ...newTask,
                                        plannedOtherCost: val,
                                      });
                                }}
                              />
                              <IndianRupee className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-white/20" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 md:px-10 py-5 md:py-8 bg-surface border-t border-divider flex items-center justify-between shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(null);
                      setEditingTask(null);
                    }}
                    className="px-4 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl text-ink-muted hover:text-ink font-black uppercase tracking-widest text-[9px] md:text-[10px] transition-colors"
                  >
                    Discard
                  </button>
                  <div className="flex gap-2 md:gap-4">
                    <button
                      type="submit"
                      className="bg-indigo-600 text-white px-6 md:px-12 py-3 md:py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-[0.1em] md:tracking-[0.2em] text-[9px] md:text-[10px] hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100"
                    >
                      {editingTask ? "Save Changes" : "Add Task"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dailyLogTaskId && (
           <DailyLogEntryScreen 
             projectId={projectId}
             taskId={dailyLogTaskId}
             onClose={() => setDailyLogTaskId(null)}
           />
        )}
      </AnimatePresence>
    </div>
  );
};
