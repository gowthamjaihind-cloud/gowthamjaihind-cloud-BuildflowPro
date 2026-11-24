// A week of daily logs entered at once.
//
// A site engineer who missed a few days, or who keeps the register on paper
// and types it up on Saturday, had to open the log form seven times and
// re-enter the same gang and the same materials each time. The week form
// takes the task, the days worked, what was used "each day", and the progress
// at the end of the week, and turns them into one ordinary daily log per day.
// Each log is saved through the same path as a single log, so stock, cost,
// the stock card, reports and the task's progress (recomputed on the server
// from all its logs) treat them exactly like logs entered day by day.

import type { DailyLogEntry } from "../types";

export type LineKind = "m" | "l" | "e";

/** A cell in the week grid: the item's line (kind + index) on one day. */
export const cellKey = (kind: LineKind, index: number) => `${kind}:${index}`;

export interface WeekDay {
  date: string; // YYYY-MM-DD
  worked: boolean;
  /** Progress typed for this day; undefined = use the even spread. */
  progress?: number;
  /** Quantities typed for this day, by cellKey; missing = the line's "each day" amount. */
  qty: Record<string, number | undefined>;
}

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
  materials: DailyLogEntry["materials"];
  labour: DailyLogEntry["labour"];
  equipment: NonNullable<DailyLogEntry["equipment"]>;
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

/** One daily-log payload per worked day, in date order. Lines with no quantity that day are left out. */
export function buildWeekLogs(input: WeekInput): WeekLogPayload[] {
  const progress = dayProgress(input);
  const worked = input.days.filter((d) => d.worked).sort((a, b) => a.date.localeCompare(b.date));
  const qty = (day: WeekDay, kind: LineKind, i: number, each: number) => {
    const v = day.qty[cellKey(kind, i)];
    return v !== undefined && !Number.isNaN(v) ? Math.max(0, v) : Math.max(0, Number(each) || 0);
  };
  return worked.map((day, n) => {
    const last = n === worked.length - 1;
    const pct = progress.get(day.date) ?? 0;
    const complete = last && input.markComplete;
    return {
      taskId: input.taskId,
      projectId: input.projectId,
      workDate: day.date,
      progressPercent: complete ? 100 : pct,
      markComplete: complete,
      materials: input.materials
        .map((m, i) => ({ ...m, quantity: qty(day, "m", i, m.quantity) }))
        .filter((m) => m.materialId && m.quantity > 0),
      labour: input.labour
        .map((l, i) => ({ ...l, headcount: Math.round(qty(day, "l", i, l.headcount) * 10) / 10 }))
        .filter((l) => l.roleId && l.headcount > 0),
      equipment: input.equipment
        .map((e, i) => {
          const quantity = qty(day, "e", i, e.quantity);
          const r = input.equipmentRates?.[e.equipmentId];
          const rate = e.unit === "days" ? r?.dailyRate ?? e.rate ?? 0 : r?.hourlyRate ?? e.rate ?? 0;
          return { ...e, quantity, rate, cost: rate * quantity };
        })
        .filter((e) => e.equipmentId && e.quantity > 0),
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
