import React from "react";
import { cellKey, type LineKind, type WeekDay } from "../lib/weekLog";

export interface WeekLine {
  kind: LineKind;
  index: number;
  label: string;
  unit: string;
  /** The "each day" amount, shown as the placeholder of every day's cell. */
  each: number;
}

interface Props {
  days: WeekDay[];
  onChange: (days: WeekDay[]) => void;
  lines: WeekLine[];
  /** Progress each worked day will be saved with (typed, or the even spread). */
  progress: Map<string, number>;
  /** Days this task already has a log for: progress and who saved it. */
  logged: Map<string, string>;
}

const dayLabel = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

/**
 * The week, one row per day: worked or not, progress at the end of the day,
 * and what was used. A blank cell means the line's "each day" amount (shown
 * greyed as its placeholder); typing a number overrides it for that day only,
 * and 0 means none that day. Scrolls sideways on a phone, with the day column
 * kept in view.
 */
export const WeekLogGrid: React.FC<Props> = ({ days, onChange, lines, progress, logged }) => {
  const set = (i: number, patch: Partial<WeekDay>) => onChange(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const setQty = (i: number, key: string, raw: string) => {
    const qty = { ...days[i].qty };
    if (raw === "") delete qty[key];
    else qty[key] = parseFloat(raw);
    set(i, { qty });
  };

  const input =
    "w-full min-w-[4.5rem] bg-surface px-2 py-2 rounded-lg border border-divider text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-primary font-mono disabled:opacity-40 placeholder:text-ink-muted/60";

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <table className="w-full border-separate border-spacing-y-1.5 text-left">
        <thead>
          <tr className="text-[10px] font-black text-ink-muted uppercase tracking-widest">
            <th className="sticky left-0 bg-surface z-10 pr-2 font-black">Day</th>
            <th className="px-1 font-black">Progress %</th>
            {lines.map((l) => (
              <th key={cellKey(l.kind, l.index)} className="px-1 font-black normal-case tracking-normal max-w-[8rem]">
                <span className="block truncate" title={l.label}>{l.label}</span>
                <span className="block text-[9px] font-bold text-ink-muted/80">{l.unit}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => {
            const already = logged.get(d.date);
            return (
              <tr key={d.date} className={d.worked ? "" : "opacity-60"}>
                <td className="sticky left-0 bg-surface z-10 pr-2 align-top">
                  <label className="flex items-center gap-2 py-2 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={d.worked}
                      onChange={(e) => set(i, { worked: e.target.checked })}
                      className="w-4 h-4 accent-primary"
                      aria-label={`Worked on ${dayLabel(d.date)}`}
                    />
                    <span className="text-xs font-bold text-ink">{dayLabel(d.date)}</span>
                  </label>
                  {already && (
                    <span className="block text-[9px] font-bold text-warning max-w-[8rem] leading-tight">Already logged: {already}</span>
                  )}
                </td>
                <td className="px-1 align-top">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!d.worked}
                    value={d.progress ?? ""}
                    placeholder={d.worked ? String(progress.get(d.date) ?? "") : "–"}
                    onChange={(e) => set(i, { progress: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                    className={input}
                    aria-label={`Progress at the end of ${dayLabel(d.date)}`}
                  />
                </td>
                {lines.map((l) => {
                  const key = cellKey(l.kind, l.index);
                  return (
                    <td key={key} className="px-1 align-top">
                      <input
                        type="number"
                        min={0}
                        step={l.kind === "e" ? 0.5 : 0.1}
                        disabled={!d.worked}
                        value={d.qty[key] ?? ""}
                        placeholder={d.worked ? String(l.each || 0) : "–"}
                        onChange={(e) => setQty(i, key, e.target.value)}
                        className={input}
                        aria-label={`${l.label} on ${dayLabel(d.date)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default WeekLogGrid;
