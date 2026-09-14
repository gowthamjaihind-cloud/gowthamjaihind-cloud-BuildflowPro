/**
 * Sitetru brand, mirrored from the app's src/index.css.
 *
 * This file used to hold the palette the product retired -- rust #D97D54,
 * slate #324755, sage #87BCBF, onyx #1B1C20 -- so the films were rendered in
 * the old brand around screenshots that show the new one. Nothing caught it:
 * the app's palette test only reads src/, and marketing/ is a separate package.
 * `theme.test.ts` beside this file now reads index.css and fails on drift.
 *
 * Names are the app's token names, not colour names. `rust` and `sage` were
 * how the old set drifted invisibly in the first place -- once the value moves,
 * a colour name is a lie, but a role name stays true.
 */
export const C = {
  /** Cobalt. Actions, active state, emphasis. 6.70:1 on white. */
  primary: "#1D4ED8",
  /** Lifted cobalt, for type ON a dark surface, where the base fails at 2.40. */
  primaryOnDark: "#A8C2FF",
  /** Deep navy. Inverted panels and every full-frame card in these films. */
  surfaceDark: "#12203F",
  /** Hairline on a dark surface -- navy, not neutral. */
  surfaceEdge: "#1E2B4D",
  /** Near-navy ink, never pure black. 17.85:1 on white. */
  ink: "#0F172A",
  /** The cool off-white ground the app sits on. */
  page: "#F5F7FA",
  /** Card white. */
  panel: "#FFFFFF",
  /** Muted type. 6.07:1 on white. */
  inkMuted: "#56637A",
  /** Status green, tuned for a dark surface (the base #046A4E is 2.29 there). */
  successOnDark: "#34D399",
  white: "#FFFFFF",
} as const;

export const FONT =
  'Manrope, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Source screenshots are all 3200x2000. */
export const SRC_W = 3200;
export const SRC_H = 2000;

/**
 * A region of a screenshot to show, given as a centre point and width in
 * source pixels. Height is derived from the composition's aspect ratio, so the
 * same focus works for 16:9 and 9:16 without ever letterboxing.
 */
export interface Focus {
  cx: number;
  cy: number;
  w: number;
}
