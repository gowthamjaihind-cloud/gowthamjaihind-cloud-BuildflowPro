import { useAuthStore } from "../../store";
import { useQueryClient } from "@tanstack/react-query";
import React, { useState, useMemo } from "react";
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
  ListTree,
  AlignLeft,
  Calendar,
  Info,
  ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RoleGuard } from "../RoleGuard";
import { differenceInDays } from "date-fns";
import { useLocationDrilldown, buildPhaseLocationGroups } from "./wbsTreeUtils";

export interface MobileWBSViewProps {
  projectId: string;
  onOpenFullForm: (task?: Task, parentId?: string | null) => void;
  onOpenDailyLog: (taskId: string) => void;
}

export const MobileWBSView: React.FC<MobileWBSViewProps> = ({
  projectId,
  onOpenFullForm,
  onOpenDailyLog,
}) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;

  const { data: rawTasks = [] } = useTasksQuery(projectId);
  const [sheetState, setSheetState] = useState<{
    isOpen: boolean;
    mode: "add" | "edit";
    task: any | null;
  } | null>(null);

  const {
    roots,
    groupedRoots,
    currentNodes,
    parentChain,
    currentParentNode,
    navigateDown,
    navigateUp,
    navigateToRoot,
    navigateToBreadcrumb,
    viewModeState,
  } = useLocationDrilldown(rawTasks.filter((t) => !t.isSystemGenerated));

  const [viewMode, setViewMode] = viewModeState;

  const openEditSheet = (task: any) => {
    setSheetState({ isOpen: true, mode: "edit", task });
  };

  const openAddSheet = () => {
    setSheetState({ isOpen: true, mode: "add", task: null });
  };

  const renderDrilldownRow = (node: any) => {
    const isGroup = node.type === "phase" || node.type === "location";
    const hasChildren = isGroup || (node.children && node.children.length > 0);

    if (isGroup) {
      return (
        <div
          key={node.id}
          className="flex items-center justify-between p-4 border-b border-divider bg-surface active:bg-panel transition-colors cursor-pointer"
          onClick={() => navigateDown(node)}
        >
          <div className="flex-1 min-w-0 pr-4 flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#A3711C] mb-1">
              {node.type}
            </span>
            <span className="text-sm font-bold text-ink truncate block">
              {node.name}
            </span>
            <span className="text-xs font-bold text-ink-muted mt-1">
              {node.taskCount} {node.taskCount === 1 ? "task" : "tasks"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-2 text-ink-muted">
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className="flex items-center justify-between p-4 border-b border-divider bg-surface active:bg-panel transition-colors"
      >
        <div
          className="flex-1 min-w-0 pr-4 flex flex-col cursor-pointer"
          onClick={() =>
            hasChildren ? navigateDown(node) : openEditSheet(node)
          }
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-ink-muted bg-panel px-1.5 py-0.5 rounded font-bold">
              {node.wbsCode}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#A3711C]">
              {node.type}
            </span>
            {node.status && (
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${node.status === "Completed" ? "text-emerald-500" : "text-amber-500"}`}
              >
                {node.status}
              </span>
            )}
          </div>
          <span className="text-sm font-bold text-ink truncate block">
            {node.name}
          </span>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-divider rounded-full overflow-hidden">
              <div
                className={`h-full ${node.computedProgress === 100 ? "bg-emerald-500" : "bg-[#F3E8D2]0"}`}
                style={{ width: `${node.computedProgress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-ink-muted w-8 text-right">
              {node.computedProgress}%
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasChildren ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditSheet(node);
                }}
                className="p-2 text-ink-muted hover:text-[#A3711C] bg-panel rounded-full"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <div className="p-2 text-ink-muted">
                <ChevronRight className="w-5 h-5" />
              </div>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEditSheet(node);
              }}
              className="p-2 text-[#A3711C] bg-[#F3E8D2] hover:bg-[#F3E8D2] rounded-full transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderOutlineNode = (node: any) => {
    return (
      <div key={node.id} className="border-b border-divider/50 py-3 pl-4 pr-4">
        <div className="flex items-start gap-2">
          <span className="text-[10px] sm:text-xs font-mono text-ink-muted mt-0.5 min-w-[32px]">
            {node.wbsCode}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <span
                className={`text-xs sm:text-sm font-bold leading-tight ${node.type === "Summary" ? "text-ink" : "text-ink/80"}`}
              >
                {node.name}
              </span>
              <span
                className={`text-[10px] font-mono ${node.computedProgress === 100 ? "text-emerald-500" : "text-[#A3711C]"} font-bold`}
              >
                {node.computedProgress}%
              </span>
            </div>
          </div>
        </div>
        {node.children.length > 0 && (
          <div className="mt-1 border-l border-divider/50 ml-[16px] pl-[8px] sm:pl-[12px]">
            {node.children.map((c: any) => renderOutlineNode(c))}
          </div>
        )}
      </div>
    );
  };

  const phaseGroups = useMemo(() => buildPhaseLocationGroups(roots), [roots]);
  const skipPhase = phaseGroups.length <= 1;

  const renderOutlinePhaseGroup = (phaseGroup: any) => {
    return (
      <div key={phaseGroup.id} className="mb-6">
        {!skipPhase && (
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#A3711C] mb-2 pl-4">
            {phaseGroup.name}
          </h3>
        )}
        {phaseGroup.children.map((locationGroup: any) => {
          const skipLocation = phaseGroup.children.length <= 1;
          return (
            <div
              key={locationGroup.id}
              className={`${!skipPhase ? "mb-4 pl-2" : "mb-6"}`}
            >
              {!skipLocation && (
                <h4 className="text-[10px] font-bold uppercase tracking-wide text-ink-muted mb-1.5 pl-2">
                  {locationGroup.name}
                </h4>
              )}
              <div className="bg-surface rounded-xl border border-divider overflow-hidden">
                {(locationGroup.children || []).map((task: any) =>
                  renderOutlineNode(task),
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface-dark/5 min-h-[500px] rounded-3xl overflow-hidden relative">
      {/* Top Header */}
      <div className="bg-surface p-4 border-b border-divider flex items-center justify-between shrink-0">
        <div className="flex items-center bg-panel rounded-xl p-1 shrink-0">
          <button
            onClick={() => setViewMode("drilldown")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${viewMode === "drilldown" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            <ListTree className="w-3.5 h-3.5" /> Drill-down
          </button>
          <button
            onClick={() => setViewMode("outline")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${viewMode === "outline" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            <AlignLeft className="w-3.5 h-3.5" /> Outline
          </button>
        </div>
      </div>

      {viewMode === "drilldown" ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Breadcrumb */}
          {currentParentNode && (
            <div className="bg-panel px-4 py-3 border-b border-divider flex items-center gap-2 shrink-0 overflow-x-auto no-scrollbar">
              <button
                onClick={navigateToRoot}
                className="text-[#A3711C] text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
              >
                All Locations
              </button>
              {parentChain.map((p, idx) => (
                <React.Fragment key={p.id}>
                  <ChevronRight className="w-3 h-3 text-ink-muted shrink-0" />
                  <button
                    onClick={() => navigateToBreadcrumb(p)}
                    className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${idx === parentChain.length - 1 ? "text-ink" : "text-[#A3711C]"}`}
                  >
                    {p.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Drilldown List */}
          <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
            {currentNodes.length === 0 ? (
              <div className="p-8 text-center bg-surface border-b border-divider">
                <p className="text-ink-muted text-sm mb-4">
                  No work packages here.
                </p>
              </div>
            ) : (
              currentNodes.map(renderDrilldownRow)
            )}
          </div>

          {/* Add Button */}
          <RoleGuard
            allowedRoles={[
              "Project Manager",
              "Site Engineer",
              "Admin",
              "Admin",
            ]}
            projectId={projectId}
            requireWriteAccess
          >
            <div className="absolute bottom-6 right-6 z-20">
              <button
                onClick={openAddSheet}
                className="bg-[#A3711C] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:bg-[#8a5d16] active:scale-95 transition-all"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </RoleGuard>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 bg-surface pb-12">
          {phaseGroups.map(renderOutlinePhaseGroup)}
        </div>
      )}

      {/* Task Bottom Sheet */}
      <AnimatePresence>
        {sheetState?.isOpen && (
          <MobileTaskSheet
            projectId={projectId}
            mode={sheetState.mode}
            task={sheetState.task}
            parentNode={currentParentNode}
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

interface MobileTaskSheetProps {
  projectId: string;
  mode: "add" | "edit";
  task: any | null; // For edit
  parentNode: any | null; // For add context
  onClose: () => void;
  onOpenFullForm: (task?: Task, parentId?: string | null) => void;
  onOpenDailyLog: (taskId: string) => void;
}

const MobileTaskSheet: React.FC<MobileTaskSheetProps> = ({
  projectId,
  mode,
  task,
  parentNode,
  onClose,
  onOpenFullForm,
  onOpenDailyLog,
}) => {
  const user = useAuthStore(state => state.user);
  const basePath = user?.currentOrgId ? `organizations/${user.currentOrgId}/projects/${projectId}` : `projects/${projectId}`;
  const [designation, setDesignation] = useState(task?.name || "");
  const [status, setStatus] = useState(task?.status || "Pending");
  const [actualStart, setActualStart] = useState("");
  const [actualFinish, setActualFinish] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  // Derived / Read-only fields
  const type = task?.type || "Task";
  const phase = task?.phase || parentNode?.phase || "";
  const loc = task?.location || parentNode?.location || "";
  const planStart = task?.startDate || "";
  const planFinish = task?.endDate || "";

  const computedProgress = task?.computedProgress || 0;
  // Cost rollup approx
  const totalRes =
    (task?.plannedLaborCost || 0) +
    (task?.plannedMaterialCost || 0) +
    (task?.plannedOtherCost || 0);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (mode === "add") {
        // Create task
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
        // Note: Not saving empty actualStart/Finish string for new tasks, only if needed. But actual dates are derived by logs now anyway!
        // WAIT: Actual Start / Finish are now READ ONLY since DailyLogs handles them.
        // Let's implement that. The spec has changed to "Actual start and Actual finish ... are READ-ONLY" in the later prompt.
        // And "Progress becomes READ-ONLY"

        // OH wait use runTransaction or addDoc
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
        `${basePath}/tasks`,
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
      handleFirestoreError(
        e,
        OperationType.DELETE,
        `${basePath}/tasks`,
      );
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
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }} // smooth cubic-bezier
        className="fixed inset-x-0 bottom-0 z-[101] max-h-[90vh] bg-surface rounded-t-[32px] flex flex-col shadow-2xl"
      >
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-12 h-1.5 bg-divider rounded-full" />
        </div>

        <div className="px-6 py-2 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#A3711C] block mb-1">
              {mode === "add" ? "New Task" : "Edit Task"}
            </span>
            {parentNode && (
              <span className="text-xs font-bold text-ink-muted">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block mb-1.5">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-ink-muted block mb-1.5">
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
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted flex items-center gap-1.5">
              <ShieldAlert className="w-3 h-3" /> Daily Log Derived Fields
            </span>
          </div>

          <div className="bg-[#F3E8D2]/50 rounded-2xl p-4 border border-[#F3E8D2] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink-muted uppercase tracking-widest">
                Progress
              </span>
              <span className="text-lg font-black text-[#A3711C] font-mono">
                {computedProgress}%
              </span>
              {mode === "edit" && task?.actualStartDate && (
                <span className="text-[10px] text-ink-muted font-mono mt-1">
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
                className="bg-[#A3711C] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#8a5d16] transition"
              >
                Log Work
              </button>
            )}
          </div>

          <div className="my-6 border-t border-divider flex items-center justify-center">
            <span className="bg-surface px-3 -mt-3 text-[10px] font-black uppercase tracking-widest text-ink-muted">
              Set at office
            </span>
          </div>

          {/* TIER 2: Read-Only Mobile Info Context */}
          <div className="space-y-3">
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-ink-muted">
                Activity Type
              </span>
              <span className="text-xs font-bold text-ink">{type}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-ink-muted">
                Work Phase
              </span>
              <span className="text-xs font-bold text-ink">
                {phase || "--"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-ink-muted">Location</span>
              <span className="text-xs font-bold text-ink">{loc || "--"}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-ink-muted">
                Plan Dates
              </span>
              <span className="text-xs font-bold text-ink font-mono">
                {planStart || "--"} → {planFinish || "--"}
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs font-bold text-ink-muted">
                Resource Value
              </span>
              <span className="text-xs font-bold text-ink font-mono">
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
                  mode === "add" ? parentNode?.id : undefined,
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
