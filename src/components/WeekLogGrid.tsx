import React from "react";
import { PencilSimple } from "@phosphor-icons/react";
import { labourSummary, type DayLines, type WeekDay } from "../lib/weekLog";

interface Props {
  days: WeekDay[];
  /** The day whose labour, materials and equipment are open below. */
  active: number;
  /** That day's lines as being edited (not yet stored on `days`). */
  activeLines: DayLines;
  onSelect: (index: number) => void;
  onToggle: (index: number, worked: boolean) => void;
  onProgress: (index: number, value: number | undefined) => void;
  /** Progress each worked day will be saved with (typed, or the even spread). */
  progress: Map<string, number>;
  /** Days this task already has a log for: progress and who saved it. */
  logged: Map<string, string>;
}

export const dayLabel = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

const summary = (l: DayLines) => {
  const parts = [labourSummary(l.labour)];
  const mats = l.materials.filter((m) => m.materialId && m.quantity > 0);
  const eqs = l.equipment.filter((e) => e.equipmentId && e.quantity > 0);
  if (mats.length) parts.push(mats.map((m) => `${m.name} ${m.quantity} ${m.unit}`).join(", "));
  if (eqs.length) parts.push(eqs.map((e) => `${e.name} ${e.quantity} ${e.unit === "days" ? "d" : "h"}`).join(", "));
  return parts.filter(Boolean).join(" · ");
};

/**
 * The week, one row per day: worked or not, progress at the end of the day,
 * and what that day used. Each day has its own labour, materials and
 * equipment; tap a day to edit them below.
 */
export const WeekLogGrid: React.FC<Props> = ({ days, active, activeLines, onSelect, onToggle, onProgress, progress, logged }) => {
  const input =
    "w-16 bg-surface px-2 py-2 rounded-lg border border-divider text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-primary font-mono disabled:opacity-40 placeholder:text-ink-muted/60";
  return (
    <ul className="space-y-1.5" aria-label="The week, day by day">
      {days.map((d, i) => {
        const on = i === active;
        const text = summary(on ? activeLines : d);
        const already = logged.get(d.date);
        return (
          <li
            key={d.date}
            className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${on ? "border-primary bg-primary/5" : "border-divider bg-surface"} ${d.worked ? "" : "opacity-60"}`}
          >
            <input
              type="checkbox"
              checked={d.worked}
              onChange={(e) => onToggle(i, e.target.checked)}
              className="w-4 h-4 mt-2.5 accent-primary shrink-0"
              aria-label={`Worked on ${dayLabel(d.date)}`}
            />
            <button
              type="button"
              onClick={() => onSelect(i)}
              disabled={!d.worked}
              aria-pressed={on}
              className="flex-1 min-w-0 text-left py-1 cursor-pointer disabled:cursor-default"
            >
              <span className="flex items-center gap-1.5 text-xs font-black text-ink">
                {dayLabel(d.date)}
                {on ? (
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">Editing</span>
                ) : d.worked ? (
                  <PencilSimple className="w-3 h-3 text-ink-muted" />
                ) : null}
              </span>
              <span className={`block text-[11px] font-semibold truncate ${text ? "text-ink-muted" : "text-ink-muted/60 italic"}`}>
                {d.worked ? text || "Nothing entered yet" : "Not worked"}
              </span>
              {already && <span className="block text-[10px] font-bold text-warning">Already logged: {already}</span>}
            </button>
            <label className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-[9px] font-black text-ink-muted uppercase tracking-widest">Progress %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                disabled={!d.worked}
                value={d.progress ?? ""}
                placeholder={d.worked ? String(progress.get(d.date) ?? "") : "–"}
                onChange={(e) => onProgress(i, e.target.value === "" ? undefined : parseFloat(e.target.value))}
                className={input}
                aria-label={`Progress at the end of ${dayLabel(d.date)}`}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
};

export default WeekLogGrid;
