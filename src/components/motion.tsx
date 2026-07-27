import React, { useEffect, useState } from "react";
import { useUIStore } from "../store";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface CountUpProps {
  value: number;
  className?: string;
  /** Fixed decimal places when no `format` is given. */
  decimals?: number;
  /** Custom renderer, e.g. currency. Receives the interpolated value. */
  format?: (n: number) => string;
  durationMs?: number;
}

/**
 * Eases a number up from 0 on mount / when `value` changes. Falls back to the
 * final value immediately under Site Mode (low-distraction) or reduced-motion.
 */
export const CountUp: React.FC<CountUpProps> = ({
  value,
  className,
  decimals = 0,
  format,
  durationMs = 700,
}) => {
  const uiMode = useUIStore((state) => state.uiMode);
  const [current, setCurrent] = useState(value);

  useEffect(() => {
    if (uiMode === "site" || prefersReducedMotion()) {
      setCurrent(value);
      return;
    }
    let raf = 0;
    const from = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, uiMode, durationMs]);

  const text = format ? format(current) : current.toFixed(decimals);
  return <span className={className}>{text}</span>;
};

/**
 * Pointer-follow 3D tilt for cards. Spread the returned handlers onto the card.
 * Disabled under Site Mode / reduced-motion (Site Mode also strips transforms
 * via CSS `!important`, so it degrades safely even if a handler slips through).
 */
export const useCardTilt = (opts?: { max?: number; lift?: number }) => {
  const uiMode = useUIStore((state) => state.uiMode);
  const max = opts?.max ?? 6;
  const lift = opts?.lift ?? 4;
  const enabled = uiMode !== "site" && !prefersReducedMotion();

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!enabled) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-${lift}px) perspective(900px) rotateX(${(
      -py * max
    ).toFixed(2)}deg) rotateY(${(px * (max + 2)).toFixed(2)}deg)`;
  };
  const onMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "";
  };

  return { onMouseMove, onMouseLeave };
};

interface PageHeroProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Small mark shown in the accent badge next to the eyebrow. */
  icon?: React.ReactNode;
  /** Large decorative glyph that floats in the top-right corner. */
  glyph?: React.ReactNode;
  /** Chips / stats row under the subtitle. */
  stats?: React.ReactNode;
  /** Right-aligned actions (CTA, controls). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Branded Drab hero band: animated palette mesh + floating glyph + depth wash.
 * Mirrors the portfolio home hero so every screen's header reads as one system.
 */
export const PageHero: React.FC<PageHeroProps> = ({
  title,
  eyebrow,
  subtitle,
  icon,
  glyph,
  stats,
  actions,
  className,
}) => (
  <div
    className={`relative overflow-hidden rounded-[24px] sm:rounded-[32px] bg-surface-dark text-white px-6 py-6 sm:px-8 sm:py-8 shadow-xl shadow-drab/30 ${
      className ?? ""
    }`}
  >
    <div className="brand-mesh" aria-hidden="true" />
    <div
      className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-onyx/70 pointer-events-none"
      aria-hidden="true"
    />
    {glyph && (
      <div
        className="float-y pointer-events-none absolute -top-6 -right-6 sm:-top-8 sm:-right-4 text-white/[0.06]"
        aria-hidden="true"
      >
        {glyph}
      </div>
    )}
    <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-8">
      <div className="min-w-0">
        {eyebrow && (
          <div className="flex items-center gap-2.5 mb-2 sm:mb-3">
            {icon && (
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                {icon}
              </span>
            )}
            <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/60">
              {eyebrow}
            </span>
          </div>
        )}
        <h2 className="font-display text-3xl sm:text-4xl md:text-[44px] font-bold tracking-tight leading-[1.02]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[14px] sm:text-[15px] text-white/65 font-medium leading-relaxed mt-1.5 max-w-2xl">
            {subtitle}
          </p>
        )}
        {stats && (
          <div className="flex flex-wrap gap-2.5 mt-5 sm:mt-6">{stats}</div>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  </div>
);

/** Dark-surface stat chip for use inside PageHero `stats`. */
export const HeroStat: React.FC<{
  children: React.ReactNode;
  dotClassName?: string;
}> = ({ children, dotClassName }) => (
  <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-2.5">
    {dotClassName && <span className={`w-2.5 h-2.5 rounded-full ${dotClassName}`} />}
    {children}
  </div>
);
