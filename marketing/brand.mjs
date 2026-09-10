/**
 * The brand, for everything under marketing/.
 *
 * One copy, because there were five and every one of them was wrong. The films,
 * the Telegram stills and the walkthrough recorder each carried their own
 * hexes, and when the product's palette moved to navy and cobalt none of them
 * came along -- so the videos were rendered in the retired brand around
 * screenshots that show the current one. Nothing caught it: the app's palette
 * test reads src/, and this is a separate package.
 *
 * `marketing/brand.test.mjs` reads ../src/index.css and fails if any value here
 * stops matching the token it claims to mirror.
 *
 * Names are the app's TOKEN names, not colour names. The old set called itself
 * rust and sage, which is exactly how it drifted invisibly: once the value
 * moves, a colour name is a lie, while a role name stays true.
 */
export const BRAND = {
  /** --primary. Cobalt: actions, active state, emphasis. 6.70:1 on white. */
  primary: "#1D4ED8",
  /** --primary-on-dark. For type on navy, where the base cobalt is 2.40:1. */
  primaryOnDark: "#A8C2FF",
  /** --surface-dark. Deep navy: inverted panels, full-frame cards, title cards. */
  surfaceDark: "#12203F",
  /** --surface-edge. Hairline on a dark surface -- navy, not neutral. */
  surfaceEdge: "#1E2B4D",
  /** --ink. Near-navy, never pure black. 17.85:1 on white. */
  ink: "#0F172A",
  /** --ink-muted. 6.07:1 on white. */
  inkMuted: "#56637A",
  /** --page. The cool off-white ground. */
  page: "#F5F7FA",
  /** --panel. Card white. */
  panel: "#FFFFFF",
  /** --divider. Hairline on light. */
  divider: "#E1E6EE",
  /** --success-on-dark. The base green is 2.29:1 on navy. */
  successOnDark: "#34D399",
  white: "#FFFFFF",
};

/** Which token in src/index.css each of the above must equal. */
export const MIRRORS = {
  primary: "primary",
  primaryOnDark: "primary-on-dark",
  surfaceDark: "surface-dark",
  surfaceEdge: "surface-edge",
  ink: "ink",
  inkMuted: "ink-muted",
  page: "page",
  panel: "panel",
  divider: "divider",
  successOnDark: "success-on-dark",
};
