import React, { useState, useMemo } from "react";
import { useTasksQuery } from "../../hooks/queries";
import { Task } from "../../types";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { ChartBar } from "@phosphor-icons/react";
import { StatTile, RankedBars } from "./shared";

type ViewId = "byPhase" | "byStatus";

const STATUS_KEYS: Record<string, string> = {
  Pending: "an.stPending",
  "In Progress": "an.stInProgress",
  Completed: "an.stCompleted",
  Delayed: "an.stDelayed",
  "On Hold": "an.stOnHold",
};

export const ProgressAnalyticsDashboard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const dark = useUIStore((s) => s.darkMode);
  const { data: tasks = [] } = useTasksQuery(projectId);
  const [view, setView] = useState<ViewId>("byPhase");
  const bar = dark ? "#2A86C4" : "#0F79B8";

  const leaf = useMemo(
    () => (tasks as Task[]).filter((tk) => tk.type !== "Summary" && !tk.isSystemGenerated),
    [tasks],
  );

  const { completion, done, inProgress, atRisk, byPhase, byStatus } = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    let totalDur = 0, weighted = 0, done = 0, inProgress = 0, atRisk = 0;
    const phaseAgg = new Map<string, { sum: number; n: number }>();
    const statusAgg = new Map<string, number>();
    for (const tk of leaf) {
      const dur = Number(tk.duration) || 1;
      const p = Number(tk.progress) || 0;
      totalDur += dur; weighted += p * dur;
      if (p >= 100 || tk.status === "Completed") done++;
      else if (tk.status === "In Progress" || (p > 0 && p < 100)) inProgress++;
      if ((tk.endDate && tk.endDate < today && tk.status !== "Completed") || tk.status === "Delayed") atRisk++;
      const ph = tk.phase || "—";
      const a = phaseAgg.get(ph) || { sum: 0, n: 0 };
      a.sum += p; a.n += 1; phaseAgg.set(ph, a);
      const st = tk.status || "Pending";
      statusAgg.set(st, (statusAgg.get(st) || 0) + 1);
    }
    const byPhase = Array.from(phaseAgg.entries())
      .map(([name, a]) => ({ name, value: Math.round(a.sum / a.n) }))
      .sort((x, y) => y.value - x.value).slice(0, 10);
    const byStatus = Array.from(statusAgg.entries())
      .map(([name, value]) => ({ name: t(STATUS_KEYS[name] || "common.status"), value }))
      .sort((x, y) => y.value - x.value);
    return {
      completion: totalDur ? Math.round(weighted / totalDur) : 0,
      done, inProgress, atRisk, byPhase, byStatus,
    };
  }, [leaf, t]);

  if (leaf.length === 0) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <ChartBar className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold">{t("an.noProgress")}</p>
      </div>
    );
  }

  const views: { id: ViewId; label: string }[] = [
    { id: "byPhase", label: t("an.viewByPhase") },
    { id: "byStatus", label: t("an.viewByStatus") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl"><ChartBar weight="fill" className="w-5 h-5" /></div>
        <div>
          <h3 className="text-lg font-black text-ink tracking-tight">{t("an.progressTitle")}</h3>
          <p className="text-xs text-ink-muted font-medium">{t("an.progressSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t("dashboard.completion")} value={`${completion}%`} />
        <StatTile label={t("an.tasksDone")} value={`${done}/${leaf.length}`} />
        <StatTile label={t("an.inProgressKpi")} value={String(inProgress)} />
        <StatTile label={t("an.atRisk")} value={String(atRisk)} tone={atRisk > 0 ? "danger" : "success"} />
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {views.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap apple-transition shrink-0 ${
              view === v.id ? "bg-primary text-white shadow-sm" : "bg-panel border border-divider text-ink-muted hover:text-ink"}`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="soft-card rounded-2xl p-4 md:p-6 space-y-4">
        {view === "byPhase" ? (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.byPhaseTitle")}</h4>
            <RankedBars rows={byPhase} color={bar} format={(n) => `${Math.round(n)}%`} />
          </>
        ) : (
          <>
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.byStatusTitle")}</h4>
            <RankedBars rows={byStatus} color={bar} format={(n) => String(n)} />
          </>
        )}
      </div>
    </div>
  );
};
