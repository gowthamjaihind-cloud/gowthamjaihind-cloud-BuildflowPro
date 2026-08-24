import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useProjectCostTotals } from "../../hooks/useProjectCostTotals";
import { useProjectDataQuery } from "../../hooks/queries";
import { DailyLaborLog } from "../../types";
import { useUIStore } from "../../store";
import { useTranslation } from "../../i18n";
import { Users, TrendUp, TrendDown } from "@phosphor-icons/react";
import { inr, inrCompact, StatTile, GaugeTile, RankedBars } from "./shared";

type ViewId = "byRole" | "manpower" | "trend";

export const LaborAnalyticsDashboard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const dark = useUIStore((s) => s.darkMode);
  const { stats } = useProjectCostTotals(projectId);
  const { data: laborLogs = [] } = useProjectDataQuery<DailyLaborLog>(projectId, "labor_logs");
  const [view, setView] = useState<ViewId>("byRole");

  const S = dark
    ? { actual: "#CE7250", under: "#46B08C", over: "#CE7250", amber: "#E0A63E", bar: "#2A86C4" }
    : { actual: "#C0653F", under: "#2E8B6F", over: "#C0653F", amber: "#C0872A", bar: "#0F79B8" };

  const budget = stats.laborPlanned || 0;
  const actual = stats.laborActual || 0;
  const variance = actual - budget;
  const consumedPct = budget > 0 ? (actual / budget) * 100 : 0;
  const overBudget = variance > 0;

  // Detail from the structured labour logs.
  const { byRole, manpower, headcountDays } = useMemo(() => {
    const roleCost = new Map<string, number>();
    const byDate = new Map<string, number>();
    let hcDays = 0;
    for (const log of laborLogs as DailyLaborLog[]) {
      for (const it of log.items || []) {
        roleCost.set(it.role || "—", (roleCost.get(it.role || "—") || 0) + (it.cost || 0));
        const hc = it.headcount || 0;
        hcDays += hc * (it.shifts || 1);
        if (log.date) byDate.set(log.date, (byDate.get(log.date) || 0) + hc);
      }
    }
    const byRole = Array.from(roleCost.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const manpower = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, workers]) => ({ date, workers }));
    return { byRole, manpower, headcountDays: hcDays };
  }, [laborLogs]);

  const statusColor = consumedPct >= 100 ? S.over : consumedPct >= 90 ? S.amber : S.under;
  const hasData = budget > 0 || actual > 0 || byRole.length > 0;

  if (!hasData) {
    return (
      <div className="soft-card rounded-2xl p-10 text-center text-ink-muted">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold max-w-sm mx-auto">{t("an.noLaborData")}</p>
      </div>
    );
  }

  const views: { id: ViewId; label: string }[] = [
    { id: "byRole", label: t("an.viewByRole") },
    { id: "manpower", label: t("an.viewManpower") },
    { id: "trend", label: t("an.viewTrend") },
  ];

  const axis = dark ? "#A99E92" : "#786F67";
  const grid = dark ? "rgba(169,158,146,.15)" : "rgba(120,111,103,.12)";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl"><Users weight="fill" className="w-5 h-5" /></div>
        <div>
          <h3 className="text-lg font-black text-ink tracking-tight">{t("an.laborTitle")}</h3>
          <p className="text-xs text-ink-muted font-medium">{t("an.laborSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatTile label={t("an.laborSpent")} value={inr(actual)} />
        <StatTile label={t("an.laborBudget")} value={inr(budget)} />
        <StatTile
          label={t("an.variance")}
          value={`${overBudget ? "+" : ""}${inr(variance)}`}
          tone={overBudget ? "danger" : "success"}
          icon={variance === 0 ? null : overBudget ? <TrendUp className="w-3.5 h-3.5" /> : <TrendDown className="w-3.5 h-3.5" />}
        />
        {budget > 0
          ? <GaugeTile pct={consumedPct} label={t("an.consumed")} color={statusColor} track={dark ? "#2E2820" : "#ECE6DD"} />
          : <StatTile label={t("an.headcountDays")} value={String(Math.round(headcountDays))} />}
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

      <div className="soft-card rounded-2xl p-4 md:p-6">
        {view === "byRole" && (
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.byRoleTitle")}</h4>
            {byRole.length ? <RankedBars rows={byRole} color={S.bar} /> : <div className="py-8 text-center text-ink-muted text-sm font-bold">{t("an.noLaborData")}</div>}
          </div>
        )}
        {view === "manpower" && (
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.manpowerTitle")}</h4>
            {manpower.length >= 2 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={manpower} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="hcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={S.bar} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={S.bar} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: axis, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: grid }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip cursor={{ stroke: grid }}
                    content={({ active, payload, label }: any) => active && payload?.length ? (
                      <div className="bg-surface border border-divider rounded-xl shadow-lg px-3 py-2 text-xs">
                        <p className="font-black text-ink mb-1">{label}</p>
                        <p className="font-mono font-bold" style={{ color: S.bar }}>{payload[0].value} {t("an.workers")}</p>
                      </div>) : null} />
                  <Area type="monotone" dataKey="workers" stroke={S.bar} strokeWidth={2.4} fill="url(#hcFill)" dot={{ r: 2.5, fill: S.bar }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="py-8 text-center text-ink-muted text-sm font-bold">{t("an.noTrend")}</div>}
          </div>
        )}
        {view === "trend" && <LaborTrend logs={laborLogs} budget={budget} S={S} dark={dark} t={t} />}
      </div>
    </div>
  );
};

const LaborTrend: React.FC<any> = ({ logs, budget, S, dark, t }) => {
  const axis = dark ? "#A99E92" : "#786F67";
  const grid = dark ? "rgba(169,158,146,.15)" : "rgba(120,111,103,.12)";
  const data = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const l of (logs as DailyLaborLog[]).filter((x) => x.date)) {
      const m = l.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + (l.totalCost || 0));
    }
    let cum = 0;
    return Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => {
      cum += v; return { month, spend: Math.round(cum) };
    });
  }, [logs]);
  if (data.length < 2) return <div className="py-8 text-center text-ink-muted text-sm font-bold">{t("an.noTrend")}</div>;
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black uppercase tracking-widest text-ink-muted">{t("an.trendTitle")}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="labSpendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={S.actual} stopOpacity={0.3} />
              <stop offset="100%" stopColor={S.actual} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: axis, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: grid }} />
          <YAxis tickFormatter={inrCompact} tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={52} />
          <Tooltip cursor={{ stroke: grid }}
            content={({ active, payload, label }: any) => active && payload?.length ? (
              <div className="bg-surface border border-divider rounded-xl shadow-lg px-3 py-2 text-xs">
                <p className="font-black text-ink mb-1">{label}</p>
                <p className="font-mono font-bold" style={{ color: S.actual }}>{inr(payload[0].value)}</p>
              </div>) : null} />
          <Area type="monotone" dataKey="spend" stroke={S.actual} strokeWidth={2.4} fill="url(#labSpendFill)" dot={{ r: 3, fill: S.actual }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
