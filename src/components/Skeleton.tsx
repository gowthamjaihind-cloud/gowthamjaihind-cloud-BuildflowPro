import React from "react";

/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * The app had 48 spinners and one skeleton. Most of those spinners are
 * correct and stay: 37 of them sit inside a submit button, where a spinner is
 * exactly right — the user pressed a thing, the thing is happening, and there
 * is no layout to preserve. Two more cover genuinely shapeless waits (OCR on
 * an invoice, an AI insight), where pretending to know the result's shape
 * would be a lie.
 *
 * A skeleton earns its place only where the shape IS known: a table of rows,
 * a row of KPI cards, a screen about to mount. There it holds the layout
 * still, so content does not jump when it lands, and it tells the user what
 * kind of thing is coming.
 *
 * Accessibility: the blocks are decorative, so they are hidden from the
 * accessibility tree, and exactly one wrapper carries `role="status"` with
 * real text. A screen reader should hear "Loading…" once — not nothing, and
 * not three times over from nested regions.
 */

/** One tinted block. `.skeleton` carries the sweep; see index.css. */
export const Skeleton: React.FC<{ className?: string; onDark?: boolean }> = ({
  className,
  onDark,
}) => (
  <span
    className={`skeleton${onDark ? " skeleton-on-dark" : ""} block rounded-lg ${className ?? ""}`}
    aria-hidden="true"
  />
);

/**
 * The single announcing wrapper. Composed skeletons take `announce={false}`
 * when they are nested inside another one.
 */
const Busy: React.FC<{
  label: string;
  announce: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ label, announce, className, children }) =>
  announce ? (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  ) : (
    <div className={className}>{children}</div>
  );

interface Common {
  label?: string;
  /** Set false when nesting inside another skeleton. */
  announce?: boolean;
  className?: string;
}

/** Lines of text, the last one short like a real last line. */
export const SkeletonText: React.FC<Common & { lines?: number }> = ({
  lines = 3,
  label = "Loading…",
  announce = true,
  className,
}) => (
  <Busy label={label} announce={announce} className={`flex flex-col gap-2 ${className ?? ""}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/5" : "w-full"}`} />
    ))}
  </Busy>
);

/**
 * Rows of a list or table. These are blocks, not `<tr>`, so use it in place
 * of the whole table while loading rather than inside a `<tbody>`.
 */
export const SkeletonRows: React.FC<Common & { rows?: number }> = ({
  rows = 6,
  label = "Loading records…",
  announce = true,
  className,
}) => (
  <Busy label={label} announce={announce} className={`flex flex-col gap-2.5 ${className ?? ""}`}>
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-4 bg-panel border border-divider rounded-2xl px-4 py-4"
      >
        <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-3.5 w-20 shrink-0" />
      </div>
    ))}
  </Busy>
);

/** The KPI strip that heads most screens. */
export const SkeletonCards: React.FC<Common & { count?: number }> = ({
  count = 4,
  label = "Loading figures…",
  announce = true,
  className,
}) => (
  <Busy
    label={label}
    announce={announce}
    className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className ?? ""}`}
  >
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-panel border border-divider rounded-2xl p-5 flex flex-col gap-3">
        <Skeleton className="h-2.5 w-2/3" />
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    ))}
  </Busy>
);

/**
 * A whole screen: header band, KPI strip, then rows. This is the fallback for
 * the ten lazily-loaded views, which previously showed a single spinner in an
 * empty `py-32` box on every navigation.
 */
export const SkeletonScreen: React.FC<{ label?: string }> = ({ label = "Loading screen…" }) => (
  <Busy label={label} announce className="flex flex-col gap-4">
    <div className="bg-surface-dark border border-surface-edge rounded-[24px] sm:rounded-[32px] px-6 py-5 sm:px-8 sm:py-6 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" aria-hidden="true" />
      <Skeleton onDark className="h-8 w-56 max-w-full" />
      <Skeleton onDark className="h-3.5 w-80 max-w-full mt-3" />
    </div>
    <SkeletonCards announce={false} />
    <SkeletonRows rows={5} announce={false} />
  </Busy>
);
