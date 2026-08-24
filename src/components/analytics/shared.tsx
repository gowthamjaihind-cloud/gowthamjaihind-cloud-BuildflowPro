import React from "react";

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export const inrCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
};

export const StatTile: React.FC<{
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

export const GaugeTile: React.FC<{ pct: number; label: string; color: string; track: string }> = ({ pct, label, color, track }) => {
  const p = Math.min(pct, 100) / 100;
  const arcLen = Math.PI * 32;
  return (
    <div className="soft-card rounded-2xl p-4 flex items-center gap-3">
      <svg viewBox="0 0 80 46" className="w-[72px] shrink-0" aria-hidden="true">
        <path d="M8 42 A32 32 0 0 1 72 42" fill="none" stroke={track} strokeWidth="8" strokeLinecap="round" />
        <path d="M8 42 A32 32 0 0 1 72 42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arcLen * p} ${arcLen}`} />
      </svg>
      <div className="min-w-0">
        <div className="text-xl md:text-2xl font-black font-mono tracking-tight" style={{ color }}>{pct.toFixed(0)}%</div>
        <div className="text-[10px] font-black uppercase tracking-widest text-ink-muted truncate">{label}</div>
      </div>
    </div>
  );
};

/** Sorted horizontal value bars (single series) — for role / vendor / material breakdowns. */
export const RankedBars: React.FC<{
  rows: { name: string; value: number }[];
  color: string;
  format?: (n: number) => string;
}> = ({ rows, color, format = inrCompact }) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-24 md:w-32 text-xs font-bold text-ink truncate shrink-0" title={r.name}>{r.name}</span>
          <div className="flex-1 h-6 rounded-lg bg-surface/50 overflow-hidden">
            <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-[width] duration-700"
              style={{ width: `${Math.max((r.value / max) * 100, 6)}%`, background: color }}>
              <span className="text-[10px] font-black font-mono text-white whitespace-nowrap">{format(r.value)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
