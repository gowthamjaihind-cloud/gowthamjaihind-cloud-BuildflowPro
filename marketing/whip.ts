/**
 * The arithmetic of a whip pan, with no React and no Remotion in it.
 *
 * Separate from Cinema.tsx so it can be tested from the root package, which
 * has neither of those installed. Both defects this file exists to prevent
 * were arithmetic, and both shipped: they were found by decoding the finished
 * mp4 frame by frame, which is a slow and lucky way to catch a bug that a unit
 * test catches in milliseconds.
 *
 * WHY IT LIVES HERE rather than beside the component that uses it. The root
 * tsconfig excludes `marketing/remotion` on purpose: that package carries its
 * own React 19 types, and the root project has no @types/react of its own, so
 * compiling the two together resolves React's SVG types from the nested copy
 * and every `className` on a Phosphor icon stops type-checking -- 561 errors
 * across thirty files, none of them in code anyone touched.
 *
 * `exclude` does not prevent that. It filters which files SEED the program,
 * not what those files import, so a single root-level test importing one
 * module from inside marketing/remotion pulls the whole package back in. This
 * is why marketing/brand.mjs sits at this level too, and this file follows it.
 */

/**
 * Where one half of a whip sits, as a percentage of frame width.
 *
 * The invariant is that the two halves TILE: at every value of progress the
 * outgoing frame's leading edge is exactly on the incoming frame's trailing
 * edge, so between them they cover the visible frame and no background shows.
 *
 * The first cut rendered only the incoming half, over nothing. One frame into
 * every whip the incoming was still 31% off-screen and that 31% was bare
 * background -- a hard-edged dark band down one side, eight times in the film.
 */
export function whipShift(progress: number, direction: number, incoming: boolean): number {
  const p = Math.min(Math.max(progress, 0), 1);
  const t = incoming ? 1 - p : p;
  return incoming ? -direction * t * 100 : direction * t * 100;
}

/**
 * Control points for the curve a travelling transition uses.
 *
 * Exported as points rather than as an Easing so the test can evaluate the
 * same curve without importing Remotion. A symmetric ease-in-out: the move is
 * spread across its frames instead of being spent in the first one.
 *
 * It replaced `arrive` -- bezier(0.16, 1, 0.3, 1) -- which is an extreme
 * ease-out built for a shot landing and settling. Over the six frames a whip
 * gets, that reached 0.686 by frame ONE. Sixty-nine per cent of the pan in a
 * single frame, then five frames of nearly nothing, so the eye read two
 * smeared frames rather than a camera move.
 */
export const TRAVEL: readonly [number, number, number, number] = [0.45, 0.0, 0.55, 1.0];
