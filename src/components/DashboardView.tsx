import React from "react";
import { motion } from "motion/react";
import {
  Barricade as Construction,
  Warning as AlertTriangle,
  CheckCircle as CheckCircle2,
  ChartLineUp,
  ArrowRight,
} from "@phosphor-icons/react";
import { CountUp, PageHero } from "./motion";
import { useTasksQuery } from "../hooks/queries";
import { globalProgress, tasksAtRisk as calcTasksAtRisk } from "../lib/projectMetrics";
import { Task } from "../types";
import { useProjectCostTotals } from "../hooks/useProjectCostTotals";
import { useUIStore } from "../store";

import { useScheduleData } from "../hooks/useScheduleData";
import { ScheduleView } from "./schedule/ScheduleView";
import { PhaseStrips } from "./schedule/PhaseStrips";
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
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const { data: legacyTasks = [] } = useTasksQuery(activeProjectId);
  const { stats } = useProjectCostTotals(activeProjectId);
  const {
    tasks: scheduleTasks,
    phases,
    loading: scheduleLoading,
  } = useScheduleData(activeProjectId);



  const completionPercentage = globalProgress(legacyTasks);
  const tasksAtRisk = calcTasksAtRisk(scheduleTasks);

  const totalBudget = stats.totalBudgeted || 0;
  const totalActual = stats.totalActual || 0;
  const consumedPct = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
  const costVariance = totalActual - totalBudget;
  const inr = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
    return `₹${Math.round(n)}`;
  };

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
    <div className="space-y-5 md:space-y-7">
      <PageHero
        title={t("dashboard.heroTitle")}
        subtitle={t("dashboard.heroSubtitle")}
        icon={<Construction weight="duotone" className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
        glyph={<Construction weight="duotone" className="w-40 h-40 sm:w-56 sm:h-56" />}
        className="mb-4 md:mb-8"
      />

      {/* KPI strip — one consistent row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <section className="soft-card p-4 md:p-5 squircle-24 flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{t("dashboard.completion")}</span>
          <span className="text-2xl font-black font-mono text-primary tracking-tight"><CountUp value={completionPercentage} />%</span>
          <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${completionPercentage}%` }} transition={{ duration: 1, ease: [0.2, 0, 0, 1] }} className="h-full bg-primary rounded-full" />
          </div>
        </section>

        <section className="soft-card p-4 md:p-5 squircle-24 flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{t("an.consumed")}</span>
          <span className={`text-2xl font-black font-mono tracking-tight ${consumedPct > 100 ? "text-danger" : "text-ink"}`}>{consumedPct}%</span>
          <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${consumedPct > 100 ? "bg-danger" : "bg-[#2E8B6F]"}`} style={{ width: `${Math.min(consumedPct, 100)}%` }} />
          </div>
        </section>

        <section className="soft-card p-4 md:p-5 squircle-24 flex flex-col gap-1.5 justify-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{t("an.variance")}</span>
          <span className={`text-2xl font-black font-mono tracking-tight ${costVariance > 0 ? "text-danger" : "text-[#2E8B6F]"}`}>{costVariance > 0 ? "+" : ""}{inr(costVariance)}</span>
          <span className="text-[10px] font-bold text-ink-muted">{t("an.totalSpent")} {inr(totalActual)}</span>
        </section>

        <section className="bg-surface-dark p-4 md:p-5 squircle-24 text-white flex flex-col gap-1.5 justify-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{t("dashboard.tasksAtRisk")}</span>
          <span className="text-2xl font-black font-mono tracking-tight"><CountUp value={tasksAtRisk.count} /></span>
          {tasksAtRisk.count === 0 ? (
            <span className="text-[11px] font-bold text-success flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{t("dashboard.allOnTrack")}</span>
          ) : (
            <span className="text-[11px] font-bold text-[#E1946F] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{tasksAtRisk.criticalCount > 0 ? t("dashboard.onCriticalPath", { count: tasksAtRisk.criticalCount }) : t("dashboard.requireAttention")}</span>
          )}
        </section>
      </div>

      {/* Cost snapshot → full interactive analytics live on the AI Insights tab */}
      <button
        onClick={() => setActiveTab("insights")}
        className="w-full soft-card rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 hover:bg-surface/40 apple-transition text-left group cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0"><ChartLineUp weight="fill" className="w-5 h-5" /></div>
          <div className="min-w-0">
            <div className="text-sm font-black text-ink">{t("an.costSnapshot")}</div>
            <div className="text-xs text-ink-muted font-medium truncate">
              {inr(totalActual)} / {inr(totalBudget)} · {consumedPct}%
            </div>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-bold text-primary shrink-0 whitespace-nowrap">
          {t("an.viewFull")} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </button>

      {/* Phase timeline */}
      <div className="grid grid-cols-1">
        <PhaseStrips phases={phases} onNavigate={() => setActiveTab("wbs")} />
      </div>

      {/* Schedule */}
      <section className="space-y-4 md:space-y-6">
        <div className="flex items-center gap-3 md:gap-4 px-1 md:px-2">
          <h3 className="text-lg md:text-xl font-bold text-ink">{t("dashboard.schedule")}</h3>
          <div className="flex-1 h-px bg-surface-dark/5" />
          <span className="text-[10px] md:text-[13px] font-medium text-ink-muted uppercase tracking-widest hidden sm:inline">{t("dashboard.timeline")}</span>
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
    </div>
  );
};
