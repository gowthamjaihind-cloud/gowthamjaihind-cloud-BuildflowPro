import React from "react";
import { motion } from "motion/react";
import { Construction, Info, Users, RefreshCw } from "lucide-react";
import { WBSView } from "./WBSView";
import { auth } from "../firebase";
import { useTasksQuery } from "../hooks/queries";
import { Task } from "../types";

import { useScheduleData } from "../hooks/useScheduleData";
import { ScheduleView } from "./schedule/ScheduleView";
import { PhaseStrips } from "./schedule/PhaseStrips";

interface DashboardViewProps {
  activeProjectId: string;
  handleAddDependency: (
    fromId: string,
    toId: string,
    type: any,
  ) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  activeProjectId,
  handleAddDependency,
}) => {
  const { data: legacyTasks = [] } = useTasksQuery(activeProjectId);
  const { tasks: scheduleTasks, phases, loading: scheduleLoading } = useScheduleData(activeProjectId);

  const calculateGlobalProgress = () => {
    const activeTasks = legacyTasks.filter((t) => t.type === "Task" && !t.isSystemGenerated);
    if (activeTasks.length === 0) return 0;
    const totalDuration = activeTasks.reduce(
      (acc, t) => acc + (Number(t.duration) || 1),
      0,
    );
    const weightedProgress = activeTasks.reduce(
      (acc, t) => acc + (Number(t.progress) || 0) * (Number(t.duration) || 1),
      0,
    );
    return Math.round(weightedProgress / (totalDuration || 1));
  };

  const calculateNetworkIntegrity = () => {
    const validTasks = legacyTasks.filter(t => !t.isSystemGenerated);
    if (validTasks.length === 0) return 100;
    const withDates = validTasks.filter((t) => t.startDate && t.endDate).length;
    const withDeps = validTasks.filter(
      (t) =>
        (t.dependencies?.length || 0) > 0 ||
        (t.advancedDependencies?.length || 0) > 0,
    ).length;
    const integrity =
      ((withDates / validTasks.length) * 0.6 + (withDeps / validTasks.length) * 0.4) *
      100;
    return Math.min(100, Math.round(integrity));
  };

  const completionPercentage = calculateGlobalProgress();
  const integrityScore = calculateNetworkIntegrity();

  const handleTaskUpdate = async (task: Task) => {
    try {
      const { doc, updateDoc } = await import("../firebase");
      const taskRef = doc(await import("../firebase").then(m => m.db), `projects/${activeProjectId}/tasks`, task.id);
      await updateDoc(taskRef, {
        startDate: task.startDate,
        endDate: task.endDate,
        progress: task.progress
      });
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  return (
    <div className="space-y-6 md:space-y-10">
      <header className="mb-4 md:mb-8">
        <h2 className="text-2xl md:text-[29px] font-bold tracking-tight text-ink mb-1 md:mb-2 leading-tight">
          Project Intelligence
        </h2>
        <p className="text-xs md:text-[14px] text-ink-muted font-medium leading-relaxed max-w-2xl">
          Real-time synchronization of project tasks and critical path analysis.
        </p>
      </header>

      {/* Top Row: Compact Info Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Profile Panel (Reduced Size) */}
        <section className="apple-glass p-5 squircle-24 flex items-center gap-5">
          <div className="relative shrink-0">
            <img
              src={
                auth.currentUser?.photoURL ||
                `https://ui-avatars.com/api/?name=${auth.currentUser?.displayName}`
              }
              className="w-12 md:w-16 h-12 md:h-16 rounded-2xl shadow-xl border-2 border-white/50"
              alt="Profile"
            />
            <div className="absolute -bottom-1 -right-1 bg-surface p-1 rounded-lg shadow-md border border-white/40">
              <Users className="w-3 md:w-3.5 h-3 md:h-3.5 text-primary" />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] md:text-[17px] font-bold text-ink truncate">
              {auth.currentUser?.displayName || "Session User"}
            </h3>
            <p className="text-[12px] md:text-[13px] text-ink-muted font-medium">
              Project Director
            </p>
            <div className="flex gap-4 mt-1">
              <div className="text-[10px] md:text-[11px] font-bold">
                <span className="text-primary mr-1">{legacyTasks.filter(t => !t.isSystemGenerated).length}</span>Tasks
              </div>
              <div className="text-[10px] md:text-[11px] font-bold">
                <span className="text-[#34C759] mr-1">98%</span>Uptime
              </div>
            </div>
          </div>
        </section>

        {/* Global Progress Panel */}
        <section className="apple-glass p-5 squircle-24 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2 md:mb-3">
            <h3 className="text-xs md:text-[15px] font-bold text-ink">
              Completion
            </h3>
            <span className="text-lg md:text-[20px] font-black text-primary tracking-tighter">
              {completionPercentage}%
            </span>
          </div>
          <div className="h-2 md:h-2.5 bg-surface/30 rounded-full overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{ duration: 1, ease: [0.2, 0, 0, 1] }}
              className="h-full bg-gradient-to-r from-primary to-[#5856D6]"
            />
          </div>
        </section>

        {/* Network Integrity Panel */}
        <section className="bg-surface-dark p-5 squircle-24 text-white shadow-xl relative overflow-hidden flex flex-col justify-center sm:col-span-2 lg:col-span-1">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary blur-[60px] opacity-40" />
          <div className="flex justify-between items-center mb-2 md:mb-3 relative z-10">
            <h4 className="text-xs md:text-[15px] font-bold">
              Network Integrity
            </h4>
            <span className="text-[15px] md:text-[17px] font-mono font-bold">
              {integrityScore}%
            </span>
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="flex-1 h-1.5 md:h-2 bg-surface/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${integrityScore}%` }}
                className="h-full bg-primary"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Phase Strips */}
      <div className="grid grid-cols-1 mb-8">
        <PhaseStrips phases={phases} onNavigate={() => console.log('Navigate to full schedule')} />
      </div>

      {/* Large Visualizations (Increased Width) */}
      <div className="grid grid-cols-1 gap-6 md:gap-10">
        {/* Gantt View */}
        <section className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
            <h3 className="text-lg md:text-xl font-bold text-ink">Schedule</h3>
            <div className="flex-1 h-px bg-surface-dark/5" />
            <span className="text-[11px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">
              Timeline
            </span>
          </div>
          <div className="apple-glass rounded-t-[24px] md:rounded-[32px] overflow-hidden p-0 shadow-sm border border-white/10">
            <ScheduleView projectId={activeProjectId} tasks={scheduleTasks} loading={scheduleLoading} onAddDependency={handleAddDependency} onTaskUpdate={handleTaskUpdate} />
          </div>
        </section>

        {/* WBS Hierarchy */}
        <section className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
            <h3 className="text-lg md:text-xl font-bold text-ink">Structure</h3>
            <div className="flex-1 h-px bg-surface-dark/5" />
            <span className="text-[11px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">
              WBS Hierarchy
            </span>
          </div>
          <div className="apple-glass rounded-[24px] md:rounded-[32px] overflow-hidden p-1 shadow-sm overflow-x-auto">
            <WBSView projectId={activeProjectId} />
          </div>
        </section>
      </div>

      {/* Footer / Activities */}
      <div className="hidden lg:block border-t border-surface-dark/5 pt-8">
        <h4 className="text-[13px] font-bold text-ink-muted uppercase tracking-widest mb-6 px-2">
          Recent Activity
        </h4>
        <div className="flex gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide">
          {[
            {
              id: "act-1",
              type: "Update",
              msg: "Foundation schedule updated",
              time: "2m ago",
              color: "bg-[#5856D6]",
            },
            {
              id: "act-2",
              type: "Alert",
              msg: "Inventory depletion: Cement",
              time: "15m ago",
              color: "bg-[#FF3B30]",
            },
            {
              id: "act-3",
              type: "Status",
              msg: "Procurement cycle synced",
              time: "1h ago",
              color: "bg-[#34C759]",
            },
            {
              id: "act-4",
              type: "Note",
              msg: "Labor metrics recalculated",
              time: "4h ago",
              color: "bg-primary",
            },
          ].map((activity) => (
            <div
              key={activity.id}
              className="min-w-[280px] bg-surface/40 p-4 rounded-2xl border border-white/60 flex gap-3 shadow-sm"
            >
              <div className={`w-1 h-8 rounded-full ${activity.color}`} />
              <div>
                <div className="text-[12px] font-bold">{activity.type}</div>
                <div className="text-[13px] text-ink-muted truncate max-w-[200px]">
                  {activity.msg}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
