import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { useProjectCostTotals } from "../../hooks/useProjectCostTotals";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { ChartLineUp, TrendUp, TrendDown } from "@phosphor-icons/react";

interface CostAnalyticsDashboardProps {
  projectId: string;
}

// Validated categorical palette (see dataviz palette validator): Budget = blue,
// Actual = rust, each with a dark-mode step. Both pass the six colour checks in
// light and dark against the app surfaces.
const COLORS = {
  budget: { light: "#0F79B8", dark: "#2A86C4" },
  actual: { light: "#C0653F", dark: "#CE7250" },
  over: { light: "#C0653F", dark: "#CE7250" }, // over budget → rust
  under: { light: "#2E8B6F", dark: "#46B08C" }, // under budget → green (status)
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// Compact axis labels: ₹1.2L / ₹3.4Cr so the y-axis stays readable.
const inrCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${n}`;
};

export const CostAnalyticsDashboard: React.FC<CostAnalyticsDashboardProps> = ({
  projectId,
}) => {
  const { t } = useTranslation();
  const darkMode = useUIStore((s) => s.darkMode);
  const { stats } = useProjectCostTotals(projectId);
  const [view, setView] = useState<"category" | "variance">("category");

  const mode = darkMode ? "dark" : "light";
  const axisColor = darkMode ? "#94A3B8" : "#64748B";
  const gridColor = darkMode ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.12)";

  const catLabel = (name: string) =>
    t(`an.cat${name.replace(/\s+/g, "")}`);

  // Localised copy of the hook's chart array, plus a signed variance per row.
  const data = useMemo(
    () =>
      (stats.chartData || []).map((d) => ({
        name: catLabel(d.name),
        Budget: Math.round(d.Budget),
        Actual: Math.round(d.Actual),
        variance: Math.round(d.Actual - d.Budget),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats.chartData, t],
  );

  const totalBudget = stats.totalBudgeted || 0;
  const totalActual = stats.totalActual || 0;
  const variance = totalActual - totalBudget;
  const consumedPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  const variancePct = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;

  const hasData = totalBudget > 0 || totalActual > 0;

  if (!hasData) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <ChartLineUp className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold max-w-sm mx-auto">{t("an.noCostData")}</p>
      </div>
    );
  }

  const overBudget = variance > 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface border border-divider rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-black text-ink mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} className="font-medium flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: p.color }}
            />
            <span className="text-ink-muted">{p.name}:</span>
            <span className="font-bold text-ink font-mono">{inr(p.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
            <ChartLineUp weight="fill" className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-ink tracking-tight">
              {t("an.costTitle")}
            </h3>
            <p className="text-xs text-ink-muted font-medium">
              {t("an.costSubtitle")}
            </p>
          </div>
        </div>
        {/* View toggle — interactive */}
        <div className="flex bg-panel border border-divider rounded-xl p-1 self-start">
          {(["category", "variance"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                view === v ? "bg-surface text-primary shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {v === "category" ? t("an.viewByCategory") : t("an.viewVariance")}
            </button>
          ))}
        </div>
      </div>

      {/* KPI stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t("an.totalBudget")} value={inr(totalBudget)} />
        <StatTile label={t("an.totalSpent")} value={inr(totalActual)} />
        <StatTile
          label={t("an.variance")}
          value={`${overBudget ? "+" : ""}${inr(variance)}`}
          tone={overBudget ? "danger" : "success"}
          hint={`${Math.abs(variancePct).toFixed(1)}% ${
            variance === 0
              ? t("an.onBudget")
              : overBudget
                ? t("an.overBudget")
                : t("an.underBudget")
          }`}
          icon={
            variance === 0 ? null : overBudget ? (
              <TrendUp className="w-3.5 h-3.5" />
            ) : (
              <TrendDown className="w-3.5 h-3.5" />
            )
          }
        />
        <StatTile
          label={t("an.consumed")}
          value={`${consumedPct.toFixed(0)}%`}
          tone={consumedPct > 100 ? "danger" : "default"}
          meter={Math.min(consumedPct, 100)}
        />
      </div>

      {/* Chart */}
      <div className="soft-card rounded-2xl p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">
            {view === "category" ? t("an.byCategory") : t("an.variance")}
          </h4>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          {view === "category" ? (
            <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: gridColor }} />
              <YAxis tickFormatter={inrCompact} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: gridColor }} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, fontWeight: 700, paddingTop: 8 }}
              />
              <Bar dataKey="Budget" name={t("an.budget")} fill={COLORS.budget[mode]} radius={[4, 4, 0, 0]} maxBarSize={44} />
              <Bar dataKey="Actual" name={t("an.actual")} fill={COLORS.actual[mode]} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: gridColor }} />
              <YAxis tickFormatter={inrCompact} tick={{ fontSize: 10, fill: axisColor }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                cursor={{ fill: gridColor }}
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="bg-surface border border-divider rounded-xl shadow-lg px-3 py-2 text-xs">
                      <p className="font-black text-ink mb-1">{label}</p>
                      <p className="font-bold font-mono" style={{ color: v > 0 ? COLORS.over[mode] : COLORS.under[mode] }}>
                        {v > 0 ? "+" : ""}{inr(v)}
                      </p>
                      <p className="text-ink-muted">
                        {v > 0 ? t("an.overBudget") : v < 0 ? t("an.underBudget") : t("an.onBudget")}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="variance" name={t("an.variance")} radius={[4, 4, 0, 0]} maxBarSize={56}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.variance > 0 ? COLORS.over[mode] : COLORS.under[mode]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
  icon?: React.ReactNode;
  meter?: number;
}> = ({ label, value, hint, tone = "default", icon, meter }) => {
  const toneClass =
    tone === "danger" ? "text-danger" : tone === "success" ? "text-[#2E8B6F]" : "text-ink";
  return (
    <div className="soft-card rounded-2xl p-4 flex flex-col justify-between gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-ink-muted">
        {label}
      </span>
      <span className={`text-xl md:text-2xl font-black font-mono tracking-tight flex items-center gap-1.5 ${toneClass}`}>
        {icon}
        {value}
      </span>
      {hint && <span className={`text-[10px] font-bold ${toneClass}`}>{hint}</span>}
      {meter !== undefined && (
        <div className="h-1.5 bg-surface/40 rounded-full overflow-hidden mt-1">
          <div
            className={`h-full rounded-full ${tone === "danger" ? "bg-danger" : "bg-primary"}`}
            style={{ width: `${meter}%` }}
          />
        </div>
      )}
    </div>
  );
};
