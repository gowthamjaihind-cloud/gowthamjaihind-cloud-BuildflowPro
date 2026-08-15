import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkle,
  ArrowsClockwise as RefreshCw,
  WarningCircle as AlertCircle,
  ChartLineUp,
  CalendarX,
  Notebook,
  Buildings,
} from "@phosphor-icons/react";
import { useTasksQuery } from "../hooks/queries";
import { useProjectDailyLogsQuery } from "../hooks/useDailyLogs";
import { useProjectCostTotals } from "../hooks/useProjectCostTotals";
import {
  callGenerateProjectInsights,
  ProjectInsightsResult,
} from "../services/firebaseFunctions";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getProjectSubCollectionPath } from "../utils/projectPath";
import { useProjectStore } from "../store";

interface ProjectInsightsProps {
  projectId: string;
}

// A tiny Markdown renderer (bold + bullet lists + ### headings). Avoids pulling
// in a markdown dependency for the short, model-generated sections.
const InsightText: React.FC<{ text: string }> = ({ text }) => {
  if (!text?.trim()) {
    return <p className="text-sm text-ink-muted italic">No data for this section yet.</p>;
  }
  const renderInline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={i} className="font-bold text-ink">{p.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      ),
    );
  };

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 my-2">
          {bullets.map((b, i) => (
            <li key={i} className="text-sm text-ink/80 leading-relaxed">{renderInline(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const t = line.trim();
    if (/^[-*•]\s+/.test(t)) {
      bullets.push(t.replace(/^[-*•]\s+/, ""));
    } else if (/^#{1,3}\s+/.test(t)) {
      flush();
      blocks.push(
        <h4 key={`h-${blocks.length}`} className="text-sm font-black text-ink uppercase tracking-wide mt-3 mb-1">
          {renderInline(t.replace(/^#{1,3}\s+/, ""))}
        </h4>,
      );
    } else if (t === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-sm text-ink/80 leading-relaxed my-1.5">
          {renderInline(t)}
        </p>,
      );
    }
  });
  flush();
  return <div>{blocks}</div>;
};

const todayKolkata = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export const ProjectInsights: React.FC<ProjectInsightsProps> = ({ projectId }) => {
  const { data: tasks = [] } = useTasksQuery(projectId);
  const { data: dailyLogs = [] } = useProjectDailyLogsQuery(projectId);
  const { stats, getTaskTotals } = useProjectCostTotals(projectId);
  const activeProject = useProjectStore((s) => s.activeProject);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectInsightsResult | null>(null);

  const analyticsPath = getProjectSubCollectionPath(projectId, "analytics");

  // Load the last generated insights so the panel isn't empty on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, analyticsPath, "projectInsights"));
        if (!cancelled && snap.exists()) {
          setResult(snap.data() as ProjectInsightsResult);
        }
      } catch {
        /* first run / no doc yet — fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const buildBrief = () => {
    const leafTasks = tasks.filter((t) => t.type !== "Summary" && !t.isSystemGenerated);

    const taskBrief = leafTasks.slice(0, 100).map((t) => {
      const totals = getTaskTotals(t);
      return {
        name: t.name,
        phase: t.phase || null,
        location: t.location || null,
        status: t.status || "Pending",
        progressPercent: t.progress ?? 0,
        plannedEnd: t.endDate || null,
        actualEnd: t.actualEndDate || null,
        plannedCost: Math.round(totals.totalPlanned),
        actualCost: Math.round(totals.totalActual),
      };
    });

    const taskName = (id: string) => tasks.find((t) => t.id === id)?.name || "Unknown task";

    const recentLogs = [...dailyLogs]
      .sort((a, b) => (b.workDate || "").localeCompare(a.workDate || ""))
      .slice(0, 40)
      .map((l: any) => ({
        date: l.workDate,
        task: taskName(l.taskId),
        progressPercent: l.progressPercent,
        materials: (l.materials || []).map((m: any) => ({ name: m.name, qty: m.quantity, unit: m.unit })),
        labour: (l.labour || []).map((x: any) => ({ role: x.roleName, count: x.headcount })),
        equipment: (l.equipment || []).map((e: any) => ({ name: e.name, qty: e.quantity, unit: e.unit })),
        note: l.note || null,
      }));

    return {
      todayISO: todayKolkata(),
      project: { name: activeProject?.name || "Project", status: activeProject?.status || null },
      cost: {
        currency: "INR",
        totalBudget: Math.round(stats.totalBudgeted),
        totalActual: Math.round(stats.totalActual),
        categories: {
          material: { planned: Math.round(stats.materialPlanned), actual: Math.round(stats.materialActual) },
          labour: { planned: Math.round(stats.laborPlanned), actual: Math.round(stats.laborActual) },
          equipment: { planned: Math.round(stats.equipmentPlanned), actual: Math.round(stats.equipmentActual) },
          directCost: {
            planned: Math.round(stats.otherPlanned - stats.equipmentPlanned),
            actual: Math.round(stats.otherActual - stats.equipmentActual),
          },
        },
      },
      tasks: taskBrief,
      recentDailyLogs: recentLogs,
    };
  };

  const hasData = tasks.length > 0 || dailyLogs.length > 0;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const brief = buildBrief();
      const res = await callGenerateProjectInsights(brief);
      setResult(res);
      // Persist so it's there next time the tab opens (any device).
      try {
        await setDoc(doc(db, analyticsPath, "projectInsights"), res as any);
      } catch {
        /* saving is best-effort; the result is already shown */
      }
    } catch (err: any) {
      console.error("Insight generation failed:", err);
      setError(
        err?.message?.includes("GEMINI") || err?.code === "internal"
          ? "The AI service isn't configured yet (missing GEMINI_API_KEY). Ask the admin to add it."
          : err?.message || "Failed to generate insights. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const sections = useMemo(
    () => [
      { key: "executiveDigest" as const, title: "Executive Digest", icon: Sparkle, accent: "#6E8CA0" },
      { key: "costVariance" as const, title: "Cost Variance", icon: ChartLineUp, accent: "#D97D54" },
      { key: "scheduleSlippage" as const, title: "Schedule Slippage", icon: CalendarX, accent: "#B85F3B" },
      { key: "siteReport" as const, title: "Site Report", icon: Buildings, accent: "#56778E" },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-[20px] border border-divider shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#6E8CA0]/12 text-[#46617C] rounded-xl shrink-0">
            <Sparkle weight="fill" className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-ink tracking-tight flex items-center gap-2">
              AI Project Insights
            </h2>
            <p className="text-sm text-ink-muted mt-0.5 max-w-xl">
              A model reads this project's costs, schedule, and daily logs to produce a cost-variance
              read, schedule-slippage flags, an executive digest, and a shareable site report.
            </p>
            {result?.generatedAt && (
              <p className="text-[11px] text-ink-muted font-medium mt-1.5">
                Last generated {new Date(result.generatedAt).toLocaleString("en-IN")}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading || !hasData}
          className="shrink-0 px-5 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing…</>
          ) : (
            <><Sparkle weight="fill" className="w-4 h-4" /> {result ? "Regenerate" : "Generate Insights"}</>
          )}
        </button>
      </div>

      {!hasData && (
        <div className="p-6 bg-panel rounded-2xl border border-divider text-sm text-ink-muted flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Add some tasks and daily logs first — insights are generated from your project data.
        </div>
      )}

      {error && (
        <div className="p-4 bg-danger/8 text-danger rounded-xl border border-danger/20 flex items-start gap-2 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading && !result && (
        <div className="p-10 text-center text-ink-muted">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          Reading your project and writing insights…
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {sections.map((s) => (
            <div key={s.key} className="bg-surface rounded-2xl border border-divider shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-divider" style={{ background: `${s.accent}10` }}>
                <s.icon weight="bold" className="w-4 h-4" style={{ color: s.accent }} />
                <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: s.accent }}>
                  {s.title}
                </h3>
              </div>
              <div className="p-5">
                <InsightText text={result.insights[s.key]} />
              </div>
            </div>
          ))}
          <p className="lg:col-span-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Notebook className="w-3.5 h-3.5" />
            AI-generated from your project data — review figures before acting on them.
          </p>
        </div>
      )}
    </div>
  );
};
