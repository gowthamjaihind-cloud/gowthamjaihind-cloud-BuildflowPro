// A week of daily logs entered at once.
//
// A site engineer who missed a few days, or who keeps the register on paper
// and types it up on Saturday, had to open the log form seven times. The week
// form takes the task, the days worked and, for each day, its own labour,
// materials and equipment (the gang and the materials change day to day, so
// every day is entered on its own, with "copy to the next day / all days" to
// save typing), plus the progress at the end of the week. It turns them into
// one ordinary daily log per day, saved through the same path as a single
// log, so stock, cost, the stock card, reports and the task's progress
// (recomputed on the server from all its logs) treat them exactly like logs
// entered day by day.

import type { DailyLogEntry } from "../types";

export interface DayLines {
  materials: DailyLogEntry["materials"];
  labour: DailyLogEntry["labour"];
  equipment: NonNullable<DailyLogEntry["equipment"]>;
}

export interface WeekDay extends DayLines {
  date: string; // YYYY-MM-DD
  worked: boolean;
  /** Progress typed for this day; undefined = use the even spread. */
  progress?: number;
}

export const emptyLines = (): DayLines => ({ materials: [], labour: [], equipment: [] });

/** Seven consecutive dates from `start` (YYYY-MM-DD), without time-zone drift. */
export function weekDates(start: string): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

/** The Monday on or before a date (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7; // Mon = 0 ... Sun = 6
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** The Monday `weeks` weeks before or after the week of `start`. */
export function shiftWeek(start: string, weeks: number): string {
  const [y, m, d] = mondayOf(start).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 7 * weeks)).toISOString().slice(0, 10);
}

/** Sunday, as a site week usually rests on it. */
export const isSunday = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
};

/**
 * Progress at the end of each of `n` worked days, rising evenly from `from`
 * (where the task stood before the week) to `to` (where it ends), in whole
 * percent. Never goes down, and the last day is exactly `to`.
 */
export function spreadProgress(from: number, to: number, n: number): number[] {
  if (n <= 0) return [];
  const a = clampPct(from);
  const b = Math.max(a, clampPct(to));
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? b : Math.round(a + ((b - a) * (i + 1)) / n)));
}

const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));

/** A deep copy of one day's lines, to copy them onto other days. */
export const copyLines = (l: DayLines): DayLines => JSON.parse(JSON.stringify({ materials: l.materials, labour: l.labour, equipment: l.equipment }));

/** Copy `from`'s lines onto the days at `to` (indexes), leaving everything else. */
export function copyDayTo(days: WeekDay[], from: number, to: number[]): WeekDay[] {
  const src = copyLines(days[from]);
  return days.map((d, i) => (to.includes(i) ? { ...d, ...copyLines(src) } : d));
}

/** "Mason × 4, Helper × 6, Shuttering ₹18,000" */
export function labourSummary(labour: DailyLogEntry["labour"]): string {
  return labour
    .filter((l) => l.roleId)
    .map((l) => (l.amount ? `${l.roleName || "Lump sum"} ₹${Math.round(l.amount).toLocaleString("en-IN")}` : `${l.roleName || "Labour"} × ${Number(l.headcount) || 0}`))
    .join(", ");
}

export interface WeekInput {
  projectId: string;
  taskId: string;
  days: WeekDay[];
  /** Where the task stood before this week (its latest logged progress). */
  fromProgress: number;
  /** Progress at the end of the last worked day. */
  toProgress: number;
  /** Task finished on the last worked day. */
  markComplete: boolean;
  /** Rates for equipment, by id (hourly/daily), to snapshot cost as a single log does. */
  equipmentRates?: Record<string, { hourlyRate?: number; dailyRate?: number }>;
  note: string;
}

export type WeekLogPayload = Omit<DailyLogEntry, "id" | "createdAt" | "createdByUid" | "createdByName">;

/** The progress each worked day will be saved with, typed or spread. */
export function dayProgress(input: Pick<WeekInput, "days" | "fromProgress" | "toProgress" | "markComplete">): Map<string, number> {
  const worked = input.days.filter((d) => d.worked);
  const target = input.markComplete ? 100 : input.toProgress;
  const spread = spreadProgress(input.fromProgress, target, worked.length);
  const out = new Map<string, number>();
  worked.forEach((d, i) => out.set(d.date, d.progress !== undefined && !Number.isNaN(d.progress) ? clampPct(d.progress) : spread[i]));
  return out;
}

/** One daily-log payload per worked day, in date order, each with that day's own lines. Empty lines are left out. */
export function buildWeekLogs(input: WeekInput): WeekLogPayload[] {
  const progress = dayProgress(input);
  const worked = input.days.filter((d) => d.worked).sort((a, b) => a.date.localeCompare(b.date));
  return worked.map((day, n) => {
    const last = n === worked.length - 1;
    const complete = last && input.markComplete;
    return {
      taskId: input.taskId,
      projectId: input.projectId,
      workDate: day.date,
      progressPercent: complete ? 100 : progress.get(day.date) ?? 0,
      markComplete: complete,
      materials: (day.materials || []).filter((m) => m.materialId && m.quantity > 0),
      labour: (day.labour || [])
        .filter((l) => l.roleId && ((Number(l.headcount) || 0) > 0 || (Number(l.amount) || 0) > 0))
        .map((l) => (Number(l.amount) > 0
          ? { roleId: l.roleId, roleName: l.roleName, headcount: 0, amount: Number(l.amount) }
          : { roleId: l.roleId, roleName: l.roleName, headcount: Math.round((Number(l.headcount) || 0) * 10) / 10 })),
      equipment: (day.equipment || [])
        .filter((e) => e.equipmentId && e.quantity > 0)
        .map((e) => {
          const r = input.equipmentRates?.[e.equipmentId];
          const rate = e.unit === "days" ? r?.dailyRate ?? e.rate ?? 0 : r?.hourlyRate ?? e.rate ?? 0;
          return { ...e, rate, cost: rate * e.quantity };
        }),
      note: input.note,
    };
  });
}

/** Total of each material across the week, for the stock check before saving. */
export function weekMaterialTotals(logs: WeekLogPayload[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const log of logs) for (const m of log.materials) out.set(m.materialId, (out.get(m.materialId) || 0) + m.quantity);
  return out;
}
