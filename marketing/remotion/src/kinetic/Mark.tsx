import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { arrive, ramp, smooth } from "../film/Cinema";
import { BEAT } from "./grid";

/**
 * The Sitetru mark, built.
 *
 * The geometry is copied EXACTLY from src/components/BrandLogo.tsx -- the same
 * 512 viewBox, the same three 72-wide bars at x 136/222/308 with 22px radii,
 * all sharing a 376 baseline. It is copied rather than imported because the app
 * and this film are separate packages with separate builds, and a mark redrawn
 * by eye for a film is how a logo quietly becomes two logos. If the product's
 * mark changes, `mark.test.ts` beside this file fails: it reads BrandLogo.tsx
 * and compares the numbers.
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
}> = ({ size, at = 0, rise = BEAT * 0.75, stagger = BEAT * 0.5 }) => {
  const frame = useCurrentFrame();
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

/**
 * The opening: the mark builds, then the name arrives beside it.
 *
 * On the brand's deep navy rather than on a screenshot. The film has
 * twenty-four cuts of product in it; the one thing it should not open on is a
 * twenty-fifth, because an opening frame that looks like the rest of the film
 * gives a viewer nothing to orient on.
 */
export const Opener: React.FC = () => {
  const frame = useCurrentFrame();
  // The name comes in on beat 3, after the last bar has finished rising, so the
  // two events read as cause and effect rather than as one busy moment.
  const nameAt = BEAT * 3;
  const name = ramp(frame, [nameAt, nameAt + BEAT], arrive);
  // A short settle on the whole lockup, so the hold before the first cut is
  // never completely static.
  const settle = ramp(frame, [0, BEAT * 6], smooth);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.surfaceDark,
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        flexDirection: "row",
        transform: `scale(${(1 + 0.03 * settle).toFixed(4)})`,
      }}
    >
      <Mark size={190} at={BEAT * 0.5} />
      <div
        style={{
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          color: C.white,
          // Revealed by a wipe rather than a fade: the mark's bars arrive by
          // moving, and a name that merely brightens next to them reads as a
          // different film.
          clipPath: `inset(0 ${((1 - name) * 100).toFixed(2)}% 0 0)`,
          transform: `translateX(${((1 - name) * -26).toFixed(2)}px)`,
        }}
      >
        Sitetru
      </div>
    </AbsoluteFill>
  );
};

/**
 * The end card. The mark, the name, and the address -- nothing else.
 *
 * Deliberately NO price and no claim. The silent hero cut in this repo shipped
 * "From Rs999 / month" on its end card for a plan that charges something else,
 * and it took a re-cut to remove. An end card that says only where to go cannot
 * go out of date when the pricing does.
 */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const url = ramp(frame, [BEAT, BEAT * 2], arrive);
  const settle = ramp(frame, [0, BEAT * 4], smooth);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.surfaceDark,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 30,
        transform: `scale(${(1 + 0.02 * settle).toFixed(4)})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
        <Mark size={132} at={0} rise={BEAT * 0.6} stagger={BEAT * 0.3} />
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.035em", color: C.white }}>
          Sitetru
        </div>
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: C.primaryOnDark,
          opacity: url,
          transform: `translateY(${((1 - url) * 14).toFixed(2)}px)`,
        }}
      >
        sitetru.com
      </div>
    </AbsoluteFill>
  );
};
