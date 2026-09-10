import React from "react";

/**
 * The one way a screen says "there is nothing here".
 *
 * Before this there were 32 hand-rolled versions across 25 files: nine
 * different paddings (p-5 through py-32), four different wrapper tags, icons
 * at four sizes and three opacities, and copy that drifted between italic
 * asides, uppercase tracked labels and full sentences. Nothing was wrong with
 * any one of them; together they read as four different products.
 *
 * Two rules the old code kept breaking:
 *
 * 1. "Nothing yet" and "nothing matches" are different states. A brand-new
 *    project told to "try adjusting your search or filters" has no filters to
 *    adjust. Pass `variant="filtered"` only when a filter is actually on, and
 *    give that variant a way to clear it.
 * 2. An empty state inside a `<tbody>` has to be a row. Pass `colSpan` and it
 *    renders `<tr><td colSpan>`; a bare `<div>` in a table is invalid markup
 *    that browsers hoist out of the table entirely.
 */

type Size = "inline" | "panel" | "page";

interface EmptyStateProps {
  /** Phosphor (or any) icon component. Omitted at `inline` size. */
  icon?: React.ComponentType<{ className?: string; weight?: "duotone" | "fill" | "regular" }>;
  title: React.ReactNode;
  /** One sentence on what goes here, or how to get some. */
  body?: React.ReactNode;
  /** The thing to do about it. */
  action?: { label: React.ReactNode; onClick: () => void };
  /** Set inside a `<tbody>`: renders a full-width row instead of a block. */
  colSpan?: number;
  size?: Size;
  /**
   * `empty` — there is genuinely nothing yet; offer the way to make one.
   * `filtered` — rows exist but none match; offer a way back.
   */
  variant?: "empty" | "filtered";
  className?: string;
}

const SIZE: Record<Size, { pad: string; tile: string; glyph: string; title: string; body: string }> = {
  // In a card section beside other content: text only, no tile.
  inline: { pad: "py-8 px-4", tile: "", glyph: "", title: "text-[13px]", body: "text-[12px]" },
  panel: { pad: "py-14 px-6", tile: "w-14 h-14 rounded-2xl", glyph: "w-6 h-6", title: "text-[15px]", body: "text-[13px]" },
  page: { pad: "py-20 px-8", tile: "w-16 h-16 rounded-[20px]", glyph: "w-7 h-7", title: "text-lg", body: "text-sm" },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  body,
  action,
  colSpan,
  size = "panel",
  variant = "empty",
  className,
}) => {
  const s = SIZE[size];
  const showIcon = Icon && size !== "inline";

  const content = (
    <div className={`flex flex-col items-center justify-center text-center ${s.pad} ${className ?? ""}`}>
      {showIcon && (
        <span
          className={`${s.tile} mb-4 flex items-center justify-center bg-page border border-divider`}
          aria-hidden="true"
        >
          <Icon className={`${s.glyph} text-ink-muted`} weight="duotone" />
        </span>
      )}
      <p className={`${s.title} font-bold text-ink`}>{title}</p>
      {body && (
        <p className={`${s.body} text-ink-muted font-medium leading-relaxed mt-1.5 max-w-sm`}>
          {body}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-5 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider apple-transition ${
            variant === "filtered"
              ? "border border-divider text-ink hover:bg-page"
              : "bg-primary text-on-primary hover:bg-primary-deep"
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );

  // Inside a table the only valid child of <tbody> is a row.
  if (colSpan !== undefined) {
    return (
      <tr>
        <td colSpan={colSpan} className="p-0">
          {content}
        </td>
      </tr>
    );
  }
  return content;
};
