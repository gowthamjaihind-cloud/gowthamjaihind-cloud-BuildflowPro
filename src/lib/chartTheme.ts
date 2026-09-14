/**
 * One palette for every chart, in both modes.
 *
 * Charts cannot use a Tailwind class: their colours end up in SVG
 * `fill`/`stroke` and in inline styles, so they have to be handed a value.
 * That is fine — the problem was that the values were *scattered*, a
 * `dark ? … : …` ternary re-declared in each dashboard, so they drifted away
 * from the brand with nothing to notice.
 *
 * They had drifted a long way. Every chart's chrome was still the retired warm
 * sand family: axis #786F67, gauge track #ECE6DD, donut ring #221D18, caption
 * #8A8078 — inside an app that is now navy and cobalt. #8A8078 also sat at
 * 3.86:1 on white, a real AA failure, because that caption is the donut's
 * centre label and is actual text.
 *
 * So these are CSS variables, declared in index.css beside the palette they
 * belong to, and named here. Two consequences worth the indirection:
 *
 *  - Dark mode needs no `dark` flag threaded through the chart tree. The
 *    variables switch with `.dark` like every other token, which is why none
 *    of these functions take an argument any more.
 *  - The chrome variables point AT the interface tokens (`--chart-axis` is
 *    `var(--ink-muted)`), so a palette change carries the charts with it
 *    instead of leaving them behind.
 *
 * `chartTheme.test.ts` reads index.css and fails if a variable named here
 * stops existing, or if a per-mode series colour is declared for only one mode
 * — which would leave that chart wearing its light-mode colour on a near-black
 * canvas.
 */

/** Chart chrome. Each of these resolves to an interface token. */
export const chartChrome = {
  /** Axis tick labels and small captions. Real text: must clear AA. */
  axis: "var(--chart-axis)",
  /** Gridlines and axis rules. Never text, so a hairline weight is right. */
  grid: "var(--chart-grid)",
  /** The empty part of a gauge or a budget bar. */
  track: "var(--chart-track)",
  /** One step in from `track`, for a target drawn inside the same bar. */
  trackStep: "var(--chart-track-step)",
  /** The card behind the chart, used to cut the gaps between donut segments. */
  surface: "var(--chart-surface)",
} as const;

/**
 * Data series.
 *
 * These are FILLS. Where the same over/under verdict is written as words, use
 * the semantic text tokens instead — `text-success` is 6.61 on white where the
 * `under` fill is 4.17, which is exactly how a chart colour ended up as
 * failing body text in the cost dashboard.
 */
export const chartSeries = {
  budget: "var(--chart-budget)",
  actual: "var(--chart-actual)",
  under: "var(--chart-under)",
  over: "var(--chart-over)",
  amber: "var(--chart-amber)",
  /** A lone series reads as the neutral one, so it borrows `budget`. */
  bar: "var(--chart-budget)",
  /** Categorical ramp, for a series count decided at runtime. */
  categories: [
    "var(--chart-cat-1)",
    "var(--chart-cat-2)",
    "var(--chart-cat-3)",
    "var(--chart-cat-4)",
  ],
} as const;
