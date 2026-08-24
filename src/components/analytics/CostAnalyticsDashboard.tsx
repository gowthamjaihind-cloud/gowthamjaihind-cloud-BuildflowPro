import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { useProjectCostTotals } from "../../hooks/useProjectCostTotals";
import { useProjectDataQuery, useTasksQuery } from "../../hooks/queries";
import { CostEntry, Task } from "../../types";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { ChartLineUp, TrendUp, TrendDown } from "@phosphor-icons/react";

interface CostAnalyticsDashboardProps {
  projectId: string;
  /** Compact mode renders only the KPI row + gauge (for the Dashboard snapshot). */
  compact?: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
};

type ViewId = "utilisation" | "composition" | "bullet" | "variance" | "trend";

export const CostAnalyticsDashboard: React.FC<CostAnalyticsDashboardProps> = ({
  projectId,
  compact = false,
}) => {
  const { t } = useTranslation();
  const dark = useUIStore((s) => s.darkMode);
  const { stats, getTaskTotals } = useProjectCostTotals(projectId);
  const { data: costEntries = [] } = useProjectDataQuery<CostEntry>(projectId, "costs");
  const { data: allTasks = [] } = useTasksQuery(projectId);
  const [view, setView] = useState<ViewId>("utilisation");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [compTask, setCompTask] = useState<string>("all");

  // Leaf/phase tasks selectable in the composition donut's task filter.
  const filterTasks = useMemo(
    () => (allTasks as Task[]).filter((t) => !t.isSystemGenerated && t.name),
    [allTasks],
  );

  // Validated palettes (dataviz checker): 2-series budget/actual + status, and a
  // 4-hue categorical set for the composition donut (order keeps the similar
  // orange/yellow non-adjacent, and every slice is directly labelled).
  const S = dark
    ? { budget: "#2A86C4", actual: "#CE7250", under: "#46B08C", over: "#CE7250", amber: "#E0A63E" }
    : { budget: "#0F79B8", actual: "#C0653F", under: "#2E8B6F", over: "#C0653F", amber: "#C0872A" };
  const CAT = dark
    ? ["#3987e5", "#d95926", "#199e70", "#c98500"]
    : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

  const catLabel = (name: string) => t(`an.cat${name.replace(/\s+/g, "")}`);

  const rows = useMemo(
    () =>
      (stats.chartData || []).map((d, i) => ({
        key: d.name,
        name: catLabel(d.name),
        budget: Math.round(d.Budget),
        actual: Math.round(d.Actual),
        variance: Math.round(d.Actual - d.Budget),
        pct: d.Budget > 0 ? (d.Actual / d.Budget) * 100 : d.Actual > 0 ? 999 : 0,
        color: CAT[i % CAT.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.chartData, dark, t],
  );

  // Actual composition for the donut — either the whole project or one task.
  const compRows = useMemo(() => {
    if (compTask === "all") {
      return rows.map((r) => ({ key: r.key, name: r.name, actual: r.actual, color: r.color }));
    }
    const task = filterTasks.find((tk) => tk.id === compTask);
    if (!task) return [];
    const tt: any = getTaskTotals(task);
    const direct = (tt.actualOther || 0) - (tt.actualEquipment || 0);
    const map: Record<string, number> = {
      Material: tt.actualMaterial || 0,
      Labor: tt.actualLabor || 0,
      Equipment: tt.actualEquipment || 0,
      "Direct Cost": direct,
    };
    return ["Material", "Labor", "Equipment", "Direct Cost"].map((k, i) => ({
      key: k, name: catLabel(k), actual: Math.max(0, Math.round(map[k])), color: CAT[i],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compTask, rows, filterTasks, dark, t]);

  const totalBudget = stats.totalBudgeted || 0;
  const totalActual = stats.totalActual || 0;
  const variance = totalActual - totalBudget;
  const consumedPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const variancePct = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;
  const overBudget = variance > 0;
  const hasData = totalBudget > 0 || totalActual > 0;

  const statusColor = (pct: number) =>
    pct >= 100 ? S.over : pct >= 90 ? S.amber : S.under;

  // Cumulative dated actual spend, grouped by month, for the trend view.
  const trend = useMemo(() => {
    const actual = (costEntries || [])
      .filter((e) => e.type === "Actual" && e.date && e.amount)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (actual.length < 2) return [];
    const byMonth = new Map<string, number>();
    for (const e of actual) {
      const m = e.date.slice(0, 7); // YYYY-MM
      byMonth.set(m, (byMonth.get(m) || 0) + e.amount);
    }
    let cum = 0;
    return Array.from(byMonth.entries()).map(([m, v]) => {
      cum += v;
      return { month: m, spend: Math.round(cum) };
    });
  }, [costEntries]);

  if (!hasData) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <ChartLineUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold max-w-sm mx-auto">{t("an.noCostData")}</p>
      </div>
    );
  }

  // ---------- KPI + gauge (always shown) ----------
  const kpis = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <StatTile label={t("an.totalBudget")} value={inr(totalBudget)} />
      <StatTile label={t("an.totalSpent")} value={inr(totalActual)} />
      <StatTile
        label={t("an.variance")}
        value={`${overBudget ? "+" : ""}${inr(variance)}`}
        tone={overBudget ? "danger" : "success"}
        hint={`${Math.abs(variancePct).toFixed(1)}% ${
          variance === 0 ? t("an.onBudget") : overBudget ? t("an.overBudget") : t("an.underBudget")
        }`}
        icon={variance === 0 ? null : overBudget ? <TrendUp className="w-3.5 h-3.5" /> : <TrendDown className="w-3.5 h-3.5" />}
      />
      <GaugeTile pct={consumedPct} label={t("an.consumed")} color={statusColor(consumedPct)} track={dark ? "#2E2820" : "#ECE6DD"} />
    </div>
  );

  if (compact) return <div className="space-y-4">{kpis}</div>;

  const views: { id: ViewId; label: string }[] = [
    { id: "utilisation", label: t("an.viewUtilisation") },
    { id: "composition", label: t("an.viewComposition") },
    { id: "bullet", label: t("an.viewBullet") },
    { id: "variance", label: t("an.viewVariance") },
    { id: "trend", label: t("an.viewTrend") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
          <ChartLineUp weight="fill" className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-black text-ink tracking-tight">{t("an.costTitle")}</h3>
          <p className="text-xs text-ink-muted font-medium">{t("an.costSubtitle")}</p>
        </div>
      </div>

      {kpis}

      {/* View switcher */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap apple-transition shrink-0 ${
              view === v.id ? "bg-primary text-white shadow-sm" : "bg-panel border border-divider text-ink-muted hover:text-ink"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="soft-card rounded-2xl p-4 md:p-6">
        {view === "utilisation" && <UtilisationView rows={rows} statusColor={statusColor} dark={dark} t={t} />}
        {view === "composition" && (
          <CompositionView
            rows={compRows}
            excluded={excluded}
            setExcluded={setExcluded}
            dark={dark}
            t={t}
            tasks={filterTasks}
            selectedTask={compTask}
            onSelectTask={setCompTask}
          />
        )}
        {view === "bullet" && <BulletView rows={rows} S={S} dark={dark} t={t} />}
        {view === "variance" && <VarianceView rows={rows} S={S} t={t} />}
        {view === "trend" && <TrendView data={trend} budget={totalBudget} S={S} dark={dark} t={t} />}
      </div>
    </div>
  );
};

/* ---------------- KPI tiles ---------------- */

const StatTile: React.FC<{
  label: string; value: string; hint?: string;
  tone?: "default" | "danger" | "success"; icon?: React.ReactNode;
}> = ({ label, value, hint, tone = "default", icon }) => {
  const c = tone === "danger" ? "text-danger" : tone === "success" ? "text-[#2E8B6F]" : "text-ink";
  return (
    <div className="soft-card rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">{label}</span>
      <span className={`text-xl md:text-2xl font-black font-mono tracking-tight flex items-center gap-1.5 ${c}`}>
        {icon}{value}
      </span>
      {hint && <span className={`text-[10px] font-bold ${c}`}>{hint}</span>}
    </div>
  );
};

const GaugeTile: React.FC<{ pct: number; label: string; color: string; track: string }> = ({ pct, label, color, track }) => {
  const p = Math.min(pct, 100) / 100;
  const arcLen = Math.PI * 32; // semicircle of radius 32, matching the path below
  return (
    <div className="soft-card rounded-2xl p-4 flex items-center gap-3">
      <svg viewBox="0 0 80 46" className="w-[72px] shrink-0" aria-hidden="true">
        <path d="M8 42 A32 32 0 0 1 72 42" fill="none" stroke={track} strokeWidth="8" strokeLinecap="round" />
        <path
          d="M8 42 A32 32 0 0 1 72 42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${arcLen * p} ${arcLen}`}
        />
      </svg>
      <div className="min-w-0">
        <div className="text-xl md:text-2xl font-black font-mono tracking-tight" style={{ color }}>
          {pct.toFixed(0)}%
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-ink-muted truncate">{label}</div>
      </div>
    </div>
  );
};

/* ---------------- Utilisation bars ---------------- */

const UtilisationView: React.FC<any> = ({ rows, statusColor, t }) => (
  <div className="space-y-4">
    <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.utilisationTitle")}</h4>
    <div className="space-y-3">
      {rows.map((r: any) => {
        const shown = Math.min(r.pct, 120);
        return (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-20 md:w-24 text-xs font-bold text-ink truncate shrink-0">{r.name}</span>
            <div className="relative flex-1 h-6 rounded-lg bg-surface/50 overflow-hidden">
              <div className="absolute inset-y-0 border-r-2 border-dashed border-ink/25" style={{ left: `${(100 / 120) * 100}%` }} />
              <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-[width] duration-700"
                style={{ width: `${(shown / 120) * 100}%`, background: statusColor(r.pct), minWidth: 26 }}>
                <span className="text-[10px] font-black font-mono text-white">{r.pct > 900 ? "—" : `${Math.round(r.pct)}%`}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <div className="flex justify-end"><span className="text-[10px] text-ink-muted font-bold">100% = {t("an.budgetTarget")}</span></div>
  </div>
);

/* ---------------- Composition donut (interactive) ---------------- */

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arc = (cx: number, cy: number, ro: number, ri: number, start: number, end: number) => {
  const [x1, y1] = polar(cx, cy, ro, end);
  const [x2, y2] = polar(cx, cy, ro, start);
  const [x3, y3] = polar(cx, cy, ri, start);
  const [x4, y4] = polar(cx, cy, ri, end);
  const large = end - start > 180 ? 1 : 0;
  return `M${x1},${y1} A${ro},${ro} 0 ${large} 0 ${x2},${y2} L${x3},${y3} A${ri},${ri} 0 ${large} 1 ${x4},${y4} Z`;
};

const CompositionView: React.FC<any> = ({ rows, excluded, setExcluded, dark, t, tasks, selectedTask, onSelectTask }) => {
  const [active, setActive] = useState<string | null>(null);
  const included = rows.filter((r: any) => !excluded.has(r.key) && r.actual > 0);
  const total = included.reduce((s: number, r: any) => s + r.actual, 0);
  const cx = 100, cy = 100, ro = 92, ri = 58;
  const surface = dark ? "#221D18" : "#FFFFFF";

  let cursor = 0;
  const segs = included.map((r: any) => {
    const frac = total > 0 ? r.actual / total : 0;
    const start = cursor * 360, end = (cursor + frac) * 360;
    cursor += frac;
    const gap = end - start > 6 ? 1.4 : 0;
    return { ...r, frac, path: arc(cx, cy, ro, ri, start + gap, end - gap), mid: (start + end) / 2 };
  });

  const activeRow = included.find((r: any) => r.key === active);
  const toggle = (key: string) => {
    const next = new Set<string>(excluded);
    next.has(key) ? next.delete(key) : next.add(key);
    // never allow excluding everything
    if (rows.filter((r: any) => !next.has(r.key) && r.actual > 0).length === 0) return;
    setExcluded(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.compositionTitle")}</h4>
        <label className="flex items-center gap-2 text-[11px] font-bold text-ink-muted">
          <span className="uppercase tracking-widest text-[10px]">{t("an.filterByTask")}</span>
          <select
            value={selectedTask}
            onChange={(e) => onSelectTask(e.target.value)}
            className="bg-panel border border-divider rounded-lg px-2.5 py-1.5 text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-primary/30 max-w-[190px]"
          >
            <option value="all">{t("an.allTasks")}</option>
            {(tasks || []).map((tk: any) => (
              <option key={tk.id} value={tk.id}>{tk.name}</option>
            ))}
          </select>
        </label>
      </div>
      {total <= 0 ? (
        <div className="py-10 text-center text-ink-muted text-sm font-bold">{t("an.noCostData")}</div>
      ) : (
      <div className="grid sm:grid-cols-[200px_1fr] gap-5 items-center">
        <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto" role="img" aria-label={t("an.compositionTitle")}>
          {segs.map((s: any) => (
            <path
              key={s.key}
              d={s.path}
              fill={s.color}
              stroke={surface}
              strokeWidth="2"
              style={{ opacity: !active || active === s.key ? 1 : 0.32, cursor: "pointer", transition: "opacity .2s" }}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
            >
              <title>{`${s.name}: ${inr(s.actual)} (${Math.round(s.frac * 100)}%)`}</title>
            </path>
          ))}
          <text x={cx} y={cy - 6} textAnchor="middle" className="font-mono" style={{ fill: "var(--ink, currentColor)" }} fontSize="20" fontWeight="800">
            {activeRow ? `${Math.round((activeRow.actual / total) * 100)}%` : inrCompact(total)}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" style={{ fill: "#8a8078" }} fontWeight="700">
            {activeRow ? activeRow.name : t("an.totalSpent")}
          </text>
        </svg>

        {/* Interactive legend / filter + value table (also serves as the contrast relief) */}
        <div className="space-y-1.5">
          {rows.map((r: any) => {
            const off = excluded.has(r.key) || r.actual <= 0;
            const pct = total > 0 && !off ? Math.round((r.actual / total) * 100) : 0;
            return (
              <button
                key={r.key}
                onClick={() => toggle(r.key)}
                onMouseEnter={() => setActive(r.key)}
                onMouseLeave={() => setActive(null)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left apple-transition ${
                  active === r.key ? "bg-surface/60" : "hover:bg-surface/40"
                } ${off ? "opacity-40" : ""}`}
              >
                <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: r.color }} />
                <span className={`flex-1 text-sm font-bold text-ink truncate ${off ? "line-through" : ""}`}>{r.name}</span>
                <span className="text-xs font-mono text-ink-muted">{inrCompact(r.actual)}</span>
                <span className="text-sm font-black font-mono text-ink w-10 text-right">{off ? "—" : `${pct}%`}</span>
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};

/* ---------------- Bullet (actual vs budget target) ---------------- */

const BulletView: React.FC<any> = ({ rows, S, dark, t }) => {
  const max = Math.max(...rows.map((r: any) => Math.max(r.actual, r.budget)), 1) * 1.08;
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.bulletTitle")}</h4>
      <div className="space-y-3.5">
        {rows.map((r: any) => {
          const over = r.actual > r.budget;
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-20 md:w-24 text-xs font-bold text-ink truncate shrink-0">{r.name}</span>
              <div className="relative flex-1 h-6 rounded-lg overflow-hidden" style={{ background: dark ? "#2E2820" : "#ECE6DD" }}>
                <div className="absolute inset-y-0 rounded-lg" style={{ width: `${(r.budget / max) * 100}%`, background: dark ? "#3a332b" : "#dfd8cd" }} />
                <div className="absolute inset-y-1 rounded-md transition-[width] duration-700" style={{ width: `${(r.actual / max) * 100}%`, background: over ? S.over : S.under }} />
                <div className="absolute inset-y-[-2px] w-[3px] rounded bg-ink" style={{ left: `calc(${(r.budget / max) * 100}% - 1.5px)` }} title={`${t("an.budgetTarget")}: ${inr(r.budget)}`} />
              </div>
              <span className="w-16 text-right text-[11px] font-mono font-bold shrink-0" style={{ color: over ? S.over : S.under }}>{inrCompact(r.actual)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-4 text-[10px] text-ink-muted font-bold">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: S.over }} />{t("an.overBudget")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: S.under }} />{t("an.underBudget")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-[3px] h-3 rounded bg-ink" />{t("an.budgetTarget")}</span>
      </div>
    </div>
  );
};

/* ---------------- Variance (diverging) ---------------- */

const VarianceView: React.FC<any> = ({ rows, S, t }) => {
  const max = Math.max(...rows.map((r: any) => Math.abs(r.variance)), 1);
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.variance")}</h4>
      <div className="space-y-3">
        {rows.map((r: any) => {
          const over = r.variance > 0;
          const w = (Math.abs(r.variance) / max) * 50; // half-width %
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span className="w-20 md:w-24 text-xs font-bold text-ink truncate shrink-0">{r.name}</span>
              <div className="relative flex-1 h-6">
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink/25" />
                <div className="absolute inset-y-1 rounded-md transition-all duration-700"
                  style={{ background: over ? S.over : S.under, left: over ? "50%" : `${50 - w}%`, width: `${w}%` }} />
              </div>
              <span className="w-16 text-right text-[11px] font-mono font-bold shrink-0" style={{ color: over ? S.over : S.under }}>
                {over ? "+" : "−"}{inrCompact(Math.abs(r.variance))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- Trend (burn-up) ---------------- */

const TrendView: React.FC<any> = ({ data, budget, S, dark, t }) => {
  const axis = dark ? "#A99E92" : "#786F67";
  const grid = dark ? "rgba(169,158,146,.15)" : "rgba(120,111,103,.12)";
  if (!data || data.length < 2) {
    return (
      <div className="py-10 text-center text-ink-muted text-sm font-bold">{t("an.noTrend")}</div>
    );
  }
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.trendTitle")}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={S.actual} stopOpacity={0.32} />
              <stop offset="100%" stopColor={S.actual} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: axis, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: grid }} />
          <YAxis tickFormatter={inrCompact} tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            cursor={{ stroke: grid }}
            content={({ active, payload, label }: any) =>
              active && payload?.length ? (
                <div className="bg-surface border border-divider rounded-xl shadow-lg px-3 py-2 text-xs">
                  <p className="font-black text-ink mb-1">{label}</p>
                  <p className="font-mono font-bold" style={{ color: S.actual }}>{inr(payload[0].value)}</p>
                </div>
              ) : null
            }
          />
          {budget > 0 && (
            <ReferenceLine y={budget} stroke={axis} strokeDasharray="5 4"
              label={{ value: `${t("an.budgetCap")} ${inrCompact(budget)}`, position: "insideTopRight", fontSize: 10, fill: axis }} />
          )}
          <Area type="monotone" dataKey="spend" name={t("an.cumulativeSpend")} stroke={S.actual} strokeWidth={2.4} fill="url(#spendFill)" dot={{ r: 3, fill: S.actual }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
