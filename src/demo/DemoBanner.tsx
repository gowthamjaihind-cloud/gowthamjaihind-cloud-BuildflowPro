import React, { useEffect, useRef, useState } from "react";

/**
 * The escape hatch for the public demo at sitetru.com/demo.
 *
 * Two jobs. It tells the visitor plainly that the figures are sample data for
 * a made-up project, so nobody mistakes them for their own. And it keeps a way
 * out on screen at all times — a demo you cannot leave is worse than no demo,
 * and the visitor who is convinced needs somewhere to go.
 *
 * Rendered only in demo builds; the production bundle never includes it.
 */
export const DemoBanner: React.FC = () => {
  const [open, setOpen] = useState(true);
  const bar = useRef<HTMLDivElement>(null);

  // The bar is fixed, so without this it sits on top of the last row of
  // whatever the visitor scrolled to. Reserve its height at the foot of the
  // page instead, and give it back when the bar is collapsed.
  useEffect(() => {
    const apply = () => {
      document.body.style.paddingBottom = open
        ? `${bar.current?.offsetHeight ?? 64}px`
        : "";
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.body.style.paddingBottom = "";
    };
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-demo-banner="pill"
        className="fixed bottom-4 right-4 z-[200] px-3.5 py-2 rounded-full bg-surface-dark text-white text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-onyx apple-transition"
      >
        Demo
      </button>
    );
  }

  return (
    <div ref={bar} data-demo-banner="bar" className="fixed bottom-0 inset-x-0 z-[200] bg-surface-dark text-white shadow-2xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5 flex-wrap">
        <span className="inline-flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
          <span className="text-[11px] font-black uppercase tracking-widest text-primary">
            Live demo
          </span>
        </span>

        <p className="text-[13px] leading-snug text-white/80 min-w-0 flex-1">
          Sample data from a made-up project in Madurai. Click anything — nothing
          you do here is saved.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="https://sitetru.com/?signup=1"
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-[#B85F3B] apple-transition"
          >
            Start free trial
          </a>
          <a
            href="https://sitetru.com"
            className="px-3 py-2 rounded-xl border border-white/25 text-white/85 text-xs font-bold hover:bg-white/10 apple-transition"
          >
            Back to site
          </a>
          <button
            onClick={() => setOpen(false)}
            aria-label="Hide demo banner"
            className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 apple-transition text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};
