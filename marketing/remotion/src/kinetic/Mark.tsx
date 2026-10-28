import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { arrive, ramp } from "../film/Cinema";
import { BEAT } from "./grid";

/**
 * The Sitetru mark, built.
 *
 * The geometry is copied EXACTLY from src/components/BrandLogo.tsx -- the same
 * 512 viewBox, the same three 72-wide bars at x 136/222/308 with 22px radii,
 * all sharing a 376 baseline. It is copied rather than imported because the app
 * and this film are separate packages with separate builds, and a mark redrawn
 * by eye for a film is how a logo quietly becomes two logos. If the product's
 * mark changes, `marketing/kinetic.spec.ts` fails: it reads BrandLogo.tsx and
 * compares the numbers. (It lives there rather than beside this file because
 * the root vitest only collects `marketing/*.spec.ts`.)
 *
 * The animation is the drawing's own idea. Three ascending bars are already a
 * rising skyline, so the build is simply to let them rise -- each growing from
 * the shared baseline, a half-beat apart, in the order they ascend. Nothing is
 * added to the mark to make it animate; the motion is what the mark already
 * means.
 */

/** Straight from BrandLogo.tsx. x, baseline-anchored height, corner radius. */
export const BARS = [
  { x: 136, h: 104 },
  { x: 222, h: 164 },
  { x: 308, h: 236 },
] as const;
export const BASELINE = 376;
export const BAR_W = 72;
export const BAR_R = 22;
export const TILE_R = 116;

export const Mark: React.FC<{
  size: number;
  /** Frame the build starts. Before it, nothing has risen. */
  at?: number;
  /** Frames each bar takes to rise. */
  rise?: number;
  /** Frames between one bar starting and the next. */
  stagger?: number;
  /** Scene time, when the caller's clock is not the Sequence's own. */
  t?: number;
}> = ({ size, at = 0, rise = BEAT * 0.75, stagger = BEAT * 0.5, t }) => {
  const current = useCurrentFrame();
  const frame = t ?? current;
  // The tile arrives first and the bars rise inside it, so the mark is never
  // three bars floating with no ground.
  const tile = ramp(frame, [at, at + BEAT * 0.6], arrive);

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Sitetru"
      style={{ transform: `scale(${(0.84 + 0.16 * tile).toFixed(4)})`, opacity: tile }}
    >
      <rect width="512" height="512" rx={TILE_R} fill={C.primary} />
      {BARS.map((b, i) => {
        const p = ramp(frame, [at + i * stagger, at + i * stagger + rise], arrive);
        const h = b.h * p;
        return (
          <rect
            key={b.x}
            x={b.x}
            y={BASELINE - h}
            width={BAR_W}
            // A zero-height rounded rect renders as nothing in some engines and
            // as a dot in others; clamping keeps the first frame consistent.
            height={Math.max(h, 0.001)}
            rx={Math.min(BAR_R, h / 2)}
            fill={C.white}
          />
        );
      })}
    </svg>
  );
};
