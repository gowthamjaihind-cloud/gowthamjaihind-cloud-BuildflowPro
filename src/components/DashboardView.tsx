import React from "react";
import { motion } from "motion/react";
import {
  Barricade as Construction,
  Info,
  Users,
  ArrowsClockwise as RefreshCw,
  Warning as AlertTriangle,
  CheckCircle as CheckCircle2,
} from "@phosphor-icons/react";
import { WBSView } from "./WBSView";
import { CountUp, PageHero } from "./motion";
import { auth } from "../firebase";
import { useQueryClient } from "@tanstack/react-query";
import { useTasksQuery } from "../hooks/queries";
import { Task } from "../types";

import { useScheduleData } from "../hooks/useScheduleData";
import { ScheduleView } from "./schedule/ScheduleView";
import { PhaseStrips } from "./schedule/PhaseStrips";
import { AnalyticsTabs } from "./analytics/AnalyticsTabs";
import { useTranslation } from "../i18n";

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
  const { t } = useTranslation();
  const { data: legacyTasks = [] } = useTasksQuery(activeProjectId);
  const {
    tasks: scheduleTasks,
    phases,
    loading: scheduleLoading,
  } = useScheduleData(activeProjectId);

  const calculateGlobalProgress = () => {
    const activeTasks = legacyTasks.filter(
      (t) => t.type === "Task" && !t.isSystemGenerated,
    );
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

  const calculateTasksAtRisk = () => {
    const validTasks = scheduleTasks.filter((t) => !t.isSystemGenerated);
    const today = new Date().toISOString().split("T")[0];

    const atRisk = validTasks.filter(
      (t) =>
        (t.endDate && t.endDate < today && t.status !== "Completed") ||
        t.status === "Delayed",
    );

    const criticalCount = atRisk.filter((t) => t.isCritical).length;

    return {
      count: atRisk.length,
      criticalCount,
    };
  };

  const completionPercentage = calculateGlobalProgress();
  const tasksAtRisk = calculateTasksAtRisk();

  const handleTaskUpdate = async (task: Task) => {
    try {
      const { doc, updateDoc } = await import("../firebase");
      const taskRef = doc(
        await import("../firebase").then((m) => m.db),
        `projects/${activeProjectId}/tasks`,
        task.id,
      );
      await updateDoc(taskRef, {
        startDate: task.startDate,
        endDate: task.endDate,
        progress: task.progress,
      });
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  return (
    <div className="space-y-6 md:space-y-10">
      <PageHero
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.heroTitle")}
        subtitle={t("dashboard.heroSubtitle")}
        icon={
          <Construction
            weight="duotone"
            className="w-4 h-4 sm:w-5 sm:h-5 text-white"
          />
        }
        glyph={
          <Construction
            weight="duotone"
            className="w-40 h-40 sm:w-56 sm:h-56"
          />
        }
        className="mb-6 md:mb-10"
      />

      {/* Top Row: Compact Info Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Profile Panel (Reduced Size) */}
        <section className="soft-card p-5 md:p-6 squircle-24 flex items-center gap-5">
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
              <Users className="w-3 md:w-4 h-3 md:h-4 text-primary" />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] md:text-[17px] font-bold text-ink truncate">
              {auth.currentUser?.displayName || t("dashboard.sessionUser")}
            </h3>
            <p className="text-[12px] md:text-[13px] text-ink-muted font-medium">
              {t("dashboard.projectDirector")}
            </p>
            <div className="flex flex-wrap gap-2 xl:gap-4 mt-1">
              <div className="text-[10px] md:text-xs font-bold whitespace-nowrap">
                <CountUp
                  value={legacyTasks.filter((tk) => !tk.isSystemGenerated).length}
                  className="text-rust-strong mr-1"
                />
                {t("dashboard.tasks")}
              </div>
              <div className="text-[10px] md:text-xs font-bold whitespace-nowrap">
                <span className="text-success mr-1">98%</span>
                {t("dashboard.uptime")}
              </div>
            </div>
          </div>
        </section>

        {/* Global Progress Panel */}
        <section className="soft-card p-5 md:p-6 squircle-24 flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2 md:mb-3">
            <h3 className="text-xs md:text-[15px] font-bold text-ink">
              {t("dashboard.completion")}
            </h3>
            <span className="text-lg md:text-[20px] font-black text-primary tracking-tighter">
              <CountUp value={completionPercentage} />%
            </span>
          </div>
          <div className="h-2 md:h-2.5 bg-surface/30 rounded-full overflow-hidden shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              transition={{ duration: 1, ease: [0.2, 0, 0, 1] }}
              className="h-full bg-gradient-to-r from-primary to-[#E29677]"
            />
          </div>
        </section>

        {/* Tasks at Risk Panel */}
        <section className="bg-surface-dark p-5 md:p-6 squircle-24 text-white shadow-xl relative overflow-hidden flex flex-col justify-center">
          <div className="flex justify-between items-center mb-2 md:mb-3 relative z-10">
            <h4 className="text-xs md:text-[15px] font-bold">
              {t("dashboard.tasksAtRisk")}
            </h4>
            <span className="text-[15px] md:text-[17px] font-mono font-bold">
              <CountUp value={tasksAtRisk.count} />
            </span>
          </div>
          <div className="relative z-10">
            {tasksAtRisk.count === 0 ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base font-bold">
                  {t("dashboard.allOnTrack")}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 md:gap-1.5">
                <div className="flex items-center gap-2 text-[#E1946F]">
                  <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="text-sm md:text-base font-bold">
                    {t("dashboard.requireAttention")}
                  </span>
                </div>
                {tasksAtRisk.criticalCount > 0 && (
                  <span className="text-xs md:text-sm text-danger font-bold bg-rose-500/10 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full inline-block w-max">
                    {t("dashboard.onCriticalPath", {
                      count: tasksAtRisk.criticalCount,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Visual Analytics — interactive per-module dashboards */}
      <section className="space-y-4 md:space-y-6">
        <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
          <h3 className="text-lg md:text-xl font-bold text-ink">
            {t("an.sectionTitle")}
          </h3>
          <div className="flex-1 h-px bg-surface-dark/5" />
          <span className="text-[10px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">
            {t("an.sectionEyebrow")}
          </span>
        </div>
        <AnalyticsTabs projectId={activeProjectId} />
      </section>

      {/* Phase Strips */}
      <div className="grid grid-cols-1 mb-8">
        <PhaseStrips
          phases={phases}
          onNavigate={() => console.log("Navigate to full schedule")}
        />
      </div>

      {/* Large Visualizations (Increased Width) */}
      <div className="grid grid-cols-1 gap-6 md:gap-10">
        {/* Gantt View */}
        <section className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
            <h3 className="text-lg md:text-xl font-bold text-ink">
              {t("dashboard.schedule")}
            </h3>
            <div className="flex-1 h-px bg-surface-dark/5" />
            <span className="text-[10px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">
              {t("dashboard.timeline")}
            </span>
          </div>
          <div className="soft-card rounded-2xl overflow-hidden p-0">
            <ScheduleView
              projectId={activeProjectId}
              tasks={scheduleTasks}
              loading={scheduleLoading}
              onAddDependency={handleAddDependency}
              onTaskUpdate={handleTaskUpdate}
            />
          </div>
        </section>

        {/* WBS Hierarchy */}
        <section className="space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
            <h3 className="text-lg md:text-xl font-bold text-ink">
              {t("dashboard.structure")}
            </h3>
            <div className="flex-1 h-px bg-surface-dark/5" />
            <span className="text-[10px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">
              {t("dashboard.wbsHierarchy")}
            </span>
          </div>
          <div className="soft-card rounded-2xl overflow-hidden p-1 overflow-x-auto">
            <WBSView projectId={activeProjectId} />
          </div>
        </section>
      </div>
    </div>
  );
};
