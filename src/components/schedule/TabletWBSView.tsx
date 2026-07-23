import { useAuthStore } from "../../store";
import React, { useState, useMemo, useEffect } from "react";
import { useTasksQuery } from "../../hooks/queries";
import {
  db,
  doc,
  updateDoc,
  OperationType,
  handleFirestoreError,
} from "../../firebase";
import { Task } from "../../types";
import {
  ChevronRight,
  Edit2,
  Plus,
  X,
  ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoleGuard } from "../RoleGuard";
import { useLocationDrilldown, buildPhaseLocationGroups } from "./wbsTreeUtils";
import { useProjectCostTotals } from "../../hooks/useProjectCostTotals";

export interface TabletWBSViewProps {
  projectId: string;
  onOpenFullForm: (task?: Task, parentId?: string | null) => void;
  onOpenDailyLog: (taskId: string) => void;
}

export const TabletWBSView: React.FC<TabletWBSViewProps> = ({
  projectId,
  onOpenFullForm,
  onOpenDailyLog,
}) => {
  const { user } = useAuthStore();
  const basePath = user?.currentOrgId
    ? `organizations/${user.currentOrgId}/projects/${projectId}`
    : `projects/${projectId}`;

  const { data: rawTasks = [] } = useTasksQuery(projectId);
  const { taskTotalsMap } = useProjectCostTotals(projectId);
  const [sheetState, setSheetState] = useState<{
    isOpen: boolean;
    mode: "add" | "edit";
    task: any | null;
  } | null>(null);

  const { roots } = useLocationDrilldown(rawTasks.filter((t) => !t.isSystemGenerated));
  const phaseGroups = useMemo(() => buildPhaseLocationGroups(roots), [roots]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hasInitializedExpand, setHasInitializedExpand] = useState(false);

  useEffect(() => {
    if (!hasInitializedExpand && phaseGroups.length > 0) {
      const initial = new Set<string>();
      const firstPhase = phaseGroups[0];
      initial.add(firstPhase.id);
      if (phaseGroups.length <= 1 && firstPhase.children && firstPhase.children.length > 0) {
        initial.add(firstPhase.children[0].id);
      }
      setExpandedIds(initial);
      setHasInitializedExpand(true);
    }
  }, [phaseGroups, hasInitializedExpand]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openEditSheet = (task: any) => {
    setSheetState({ isOpen: true, mode: "edit", task });
  };

  const openAddSheet = () => {
    setSheetState({ isOpen: true, mode: "add", task: null });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delayed":
        return "text-red-500 bg-red-500/10";
      case "In Progress":
        return "text-amber-500 bg-amber-500/10";
      case "Completed":
        return "text-emerald-500 bg-emerald-500/10";
      default:
        return "text-slate-500 bg-slate-500/10";
    }
  };

  const formatDates = (start?: string, end?: string) => {
    if (!start && !end) return "—";

    const formatDate = (dateStr: string) => {
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      } catch {
        return "";
      }
    };

    const s = start ? formatDate(start) : "?";
    const e = end ? formatDate(end) : "?";

    return `${s} – ${e}`;
  };

  const renderAccordionTaskNode = (node: any) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const taskCost = taskTotalsMap[node.id]?.totalActual || 0;

    return (
      <div key={node.id} className="border-b border-divider/50 py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div
            className={`flex items-center gap-3 flex-1 min-w-0 ${hasChildren ? "cursor-pointer" : ""}`}
            onClick={() => {
              if (hasChildren) toggleExpand(node.id);
            }}
          >
            {hasChildren ? (
              <ChevronRight
                className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : "rotate-0"
                }`}
              />
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}

            <span className="text-xs font-mono text-ink-muted shrink-0 min-w-[36px]">
              {node.wbsCode}
            </span>

            <span
              className={`text-sm font-bold truncate ${
                node.type === "Summary" ? "text-ink" : "text-ink/80"
              }`}
            >
              {node.name}
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-5">
              {/* Progress */}
              <div className="w-24 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-divider rounded-full overflow-hidden">
                  <div
                    className={`h-full ${node.computedProgress === 100 ? "bg-emerald-500" : "bg-[#A3711C]"}`}
                    style={{ width: `${node.computedProgress}%` }}
                  />
                </div>
                <span
                  className={`text-xs font-mono font-bold w-8 text-right ${
                    node.computedProgress === 100 ? "text-emerald-500" : "text-[#A3711C]"
                  }`}
                >
                  {node.computedProgress}%
                </span>
              </div>

              {/* Status */}
              <div className="w-24 shrink-0">
                {node.status && (
                  <span
                    className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest ${getStatusColor(
                      node.status
                    )}`}
                  >
                    {node.status}
                  </span>
                )}
              </div>

              {/* Dates */}
              <div className="w-28 shrink-0">
                <span className="text-xs font-mono text-ink-muted">
                  {formatDates(node.startDate, node.endDate)}
                </span>
              </div>

              {/* Cost */}
              <div className="w-24 shrink-0 text-right">
                <span className="text-sm font-mono font-bold text-ink">
                  {taskCost > 0 ? `₹${taskCost.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditSheet(node);
              }}
              className="p-2 text-ink-muted hover:text-[#A3711C] bg-panel rounded-xl transition-colors cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-2 ml-4 pl-3 border-l border-divider/50 space-y-1">
            {node.children.map((child: any) => renderAccordionTaskNode(child))}
          </div>
        )}
      </div>
    );
  };

  const renderAccordionLocation = (locationGroup: any) => {
    const hasTasks = locationGroup.children && locationGroup.children.length > 0;
    const isExpanded = expandedIds.has(locationGroup.id);

    return (
      <div key={locationGroup.id} className="mb-3">
        <div
          onClick={() => {
            if (hasTasks) toggleExpand(locationGroup.id);
          }}
          className={`flex items-center justify-between p-3.5 bg-panel/60 hover:bg-panel transition-colors rounded-xl border border-divider/70 ${
            hasTasks ? "cursor-pointer" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasTasks ? (
              <ChevronRight
                className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : "rotate-0"
                }`}
              />
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}
            <span className="text-xs font-bold uppercase tracking-wide text-ink truncate">
              {locationGroup.name}
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-surface text-ink-muted border border-divider shrink-0">
              {locationGroup.children.length}{" "}
              {locationGroup.children.length === 1 ? "task" : "tasks"}
            </span>
          </div>
        </div>

        {hasTasks && isExpanded && (
          <div className="mt-2.5 ml-3 bg-surface rounded-xl border border-divider overflow-hidden divide-y divide-divider/50">
            {locationGroup.children.map((task: any) => renderAccordionTaskNode(task))}
          </div>
        )}
      </div>
    );
  };

  const renderAccordionPhase = (phaseGroup: any) => {
    const hasLocations = phaseGroup.children && phaseGroup.children.length > 0;
    const isExpanded = expandedIds.has(phaseGroup.id);

    return (
      <div key={phaseGroup.id} className="mb-6">
        <div
          onClick={() => {
            if (hasLocations) toggleExpand(phaseGroup.id);
          }}
          className={`flex items-center justify-between p-4 bg-surface hover:bg-panel transition-colors rounded-2xl border border-divider shadow-sm ${
            hasLocations ? "cursor-pointer" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasLocations ? (
              <ChevronRight
                className={`w-4 h-4 text-[#A3711C] shrink-0 transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : "rotate-0"
                }`}
              />
            ) : (
              <div className="w-4 h-4 shrink-0" />
            )}
            <span className="text-xs font-black uppercase tracking-widest text-[#A3711C] truncate">
              {phaseGroup.name}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#F3E8D2] text-[#A3711C] shrink-0">
              {phaseGroup.children.length}{" "}
              {phaseGroup.children.length === 1 ? "location" : "locations"}
            </span>
          </div>
        </div>

        {hasLocations && isExpanded && (
          <div className="mt-3 pl-3 sm:pl-4 space-y-3">
            {phaseGroup.children.map((locationGroup: any) =>
              renderAccordionLocation(locationGroup)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface-dark/5 min-h-[500px] rounded-3xl overflow-hidden relative">
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 bg-surface pb-24">
        {phaseGroups.length === 0 ? (
          <div className="p-8 text-center bg-surface border border-divider rounded-2xl">
            <p className="text-ink-muted text-sm">No WBS tasks found.</p>
          </div>
        ) : (
          phaseGroups.map(renderAccordionPhase)
        )}
      </div>

      {/* Floating Add Button */}
      <RoleGuard
        allowedRoles={["Project Manager", "Site Engineer", "Admin"]}
        projectId={projectId}
        requireWriteAccess
      >
        <div className="absolute bottom-6 right-6 z-20">
          <button
            onClick={openAddSheet}
            className="bg-[#A3711C] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:bg-[#8a5d16] active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </RoleGuard>

      {/* Task Bottom Sheet */}
      <AnimatePresence>
        {sheetState?.isOpen && (
          <TabletTaskSheet
            projectId={projectId}
            mode={sheetState.mode}
            task={sheetState.task}
            parentNode={null}
            onClose={() => setSheetState(null)}
            onOpenFullForm={onOpenFullForm}
            onOpenDailyLog={onOpenDailyLog}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Bottom Sheet Component ---

interface TabletTaskSheetProps {
  projectId: string;
  mode: "add" | "edit";
  task: any | null; // For edit
  parentNode: any | null; // For add context
  onClose: () => void;
  onOpenFullForm: (task?: Task, parentId?: string | null) => void;
  onOpenDailyLog: (taskId: string) => void;
}

const TabletTaskSheet: React.FC<TabletTaskSheetProps> = ({
  projectId,
  mode,
  task,
  parentNode,
  onClose,
  onOpenFullForm,
  onOpenDailyLog,
}) => {
  const user = useAuthStore((state) => state.user);
  const basePath = user?.currentOrgId
    ? `organizations/${user.currentOrgId}/projects/${projectId}`
    : `projects/${projectId}`;
  const [designation, setDesignation] = useState(task?.name || "");
  const [status, setStatus] = useState(task?.status || "Pending");
  const [isSaving, setIsSaving] = useState(false);

  // Derived / Read-only fields
  const type = task?.type || "Task";
  const phase = task?.phase || parentNode?.phase || "";
  const loc = task?.location || parentNode?.location || "";
  const planStart = task?.startDate || "";
  const planFinish = task?.endDate || "";

  const computedProgress = task?.computedProgress || 0;
  const totalRes =
    (task?.plannedLaborCost || 0) +
    (task?.plannedMaterialCost || 0) +
    (task?.plannedOtherCost || 0);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (mode === "add") {
        const newTask = {
          projectId,
          parentId: parentNode?.id || null,
          name: designation,
          status: status,
          progress: 0,
          type: "Task",
          phase,
          location: loc,
        };

        const { addDoc, collection } = await import("firebase/firestore");
        await addDoc(collection(db, `${basePath}/tasks`), newTask);
      } else if (mode === "edit") {
        const taskRef = doc(db, `${basePath}/tasks`, task.id);
        const updates: any = {
          name: designation,
          status: status,
        };
        await updateDoc(taskRef, updates);
      }
      onClose();
    } catch (e) {
      handleFirestoreError(
        e,
        mode === "add" ? OperationType.CREATE : OperationType.UPDATE,
        `${basePath}/tasks`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, `${basePath}/tasks`, task.id));
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${basePath}/tasks`);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-[100]"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="fixed inset-x-0 bottom-0 md:inset-x-auto md:right-0 md:top-0 md:w-[480px] z-[101] max-h-[90vh] md:max-h-full bg-surface rounded-t-[32px] md:rounded-l-[32px] md:rounded-tr-none flex flex-col shadow-2xl"
      >
        <div className="flex justify-center pt-3 pb-2 shrink-0 md:hidden">
          <div className="w-12 h-1.5 bg-divider rounded-full" />
        </div>

        <div className="px-6 py-4 md:py-6 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-[#A3711C] block mb-1">
              {mode === "add" ? "New Task" : "Edit Task"}
            </span>
            {parentNode && (
              <span className="text-sm font-bold text-ink-muted">
                In: {parentNode.wbsCode} · {parentNode.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-panel rounded-full text-ink hover:bg-divider"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* TIER 1: Editable inputs */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-ink-muted block mb-1.5">
                Activity Designation
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="w-full bg-panel border-none rounded-xl px-4 py-3 text-sm font-bold text-ink focus:ring-2 focus:ring-[#A3711C]"
                placeholder="Task Name"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-widest text-ink-muted block mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-panel border-none rounded-xl px-4 py-3 text-sm font-bold text-ink focus:ring-2 focus:ring-[#A3711C] uppercase tracking-widest"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Delayed">Delayed</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          <div className="my-6 border-t border-divider" />

          <div className="mb-2">
            <span className="text-xs font-black uppercase tracking-widest text-ink-muted flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Daily Log Derived Fields
            </span>
          </div>

          <div className="bg-[#F3E8D2]/50 rounded-2xl p-4 md:p-6 border border-[#F3E8D2] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink-muted uppercase tracking-widest">
                Progress
              </span>
              <span className="text-2xl font-black text-[#A3711C] font-mono">
                {computedProgress}%
              </span>
              {mode === "edit" && task?.actualStartDate && (
                <span className="text-xs text-ink-muted font-mono mt-1">
                  Act: {task.actualStartDate} to {task.actualEndDate || "--"}
                </span>
              )}
            </div>
            {mode === "edit" && type !== "Summary" && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDailyLog(task.id);
                }}
                className="bg-[#A3711C] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#8a5d16] transition"
              >
                Log Work
              </button>
            )}
          </div>

          <div className="my-6 border-t border-divider flex items-center justify-center">
            <span className="bg-surface px-4 -mt-3 text-xs font-black uppercase tracking-widest text-ink-muted">
              Set at office
            </span>
          </div>

          {/* TIER 2: Read-Only Mobile Info Context */}
          <div className="space-y-4">
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-bold text-ink-muted">
                Activity Type
              </span>
              <span className="text-sm font-bold text-ink">{type}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-bold text-ink-muted">
                Work Phase
              </span>
              <span className="text-sm font-bold text-ink">
                {phase || "--"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-bold text-ink-muted">Location</span>
              <span className="text-sm font-bold text-ink">{loc || "--"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-bold text-ink-muted">
                Plan Dates
              </span>
              <span className="text-sm font-bold text-ink font-mono">
                {planStart || "--"} → {planFinish || "--"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-sm font-bold text-ink-muted">
                Resource Value
              </span>
              <span className="text-sm font-bold text-ink font-mono">
                ₹{totalRes.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <div className="my-6 border-t border-divider" />

          {/* Bottom Actions */}
          <div className="flex flex-col gap-3 pb-8">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-[#A3711C] text-white py-4 rounded-xl font-bold text-sm hover:bg-[#8a5d16] transition disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullForm(
                  mode === "edit" ? task : undefined,
                  mode === "add" ? parentNode?.id : undefined
                );
              }}
              className="w-full bg-panel text-ink py-4 rounded-xl font-bold text-sm hover:bg-divider transition"
            >
              Open full form
            </button>

            {mode === "edit" && (
              <RoleGuard
                allowedRoles={["Admin", "Project Manager"]}
                projectId={projectId}
                requireWriteAccess
              >
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full bg-red-50 text-red-600 py-4 rounded-xl font-bold text-sm hover:bg-red-100 transition mt-2"
                >
                  Delete Task
                </button>
              </RoleGuard>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
};
