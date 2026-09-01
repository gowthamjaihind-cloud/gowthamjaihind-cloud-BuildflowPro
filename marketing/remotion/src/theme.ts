// Sitetru brand, mirrored from the app's src/index.css.
export const C = {
  rust: "#D97D54",
  rustDeep: "#B65C36",
  slate: "#324755",
  slateDeep: "#26343F",
  ice: "#F0F3F4",
  sage: "#87BCBF",
  onyx: "#1B1C20",
  white: "#FFFFFF",
} as const;

export const FONT =
  'Manrope, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Source screenshots are all 3200x2000. */
export const SRC_W = 3200;
export const SRC_H = 2000;

/**
 * A region of a screenshot to show, given as a centre point and a width in
 * source pixels. Height is derived from the composition's aspect ratio, so the
 * same focus works for 16:9 and 9:16 without ever letterboxing.
 */
export interface Focus {
  cx: number;
  cy: number;
  w: number;
}
