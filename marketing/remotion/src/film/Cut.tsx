import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Defocus, Flash, Punch, Whip, arrive, ramp } from "./Cinema";
import { BPM } from "../generated/launchTiming";

/**
 * The edit: a scheduler that lays shots on the music's grid.
 *
 * WHY A GRID. The first cut of this film gave each narration line one
 * continuous shot and crossfaded between them over sixteen frames. Nothing was
 * wrong with any single frame of it; it was just slow, because a dissolve says
 * "time is passing" and there were sixteen of them. Speeding that up by simply
 * shortening the fades would have produced something quick but arbitrary --
 * cuts landing wherever a sentence happened to end.
 *
 * So the cuts land on the beat instead. At 100 BPM and 30fps a beat is exactly
 * 18 frames and a bar is 72, with no rounding anywhere. Every shot boundary in
 * the film is a multiple of a half-beat, which is what makes a fast edit feel
 * driven rather than merely busy: the picture and the music change at the same
 * instant, and a viewer feels that even when they are not listening for it.
 *
 * WHAT A SHOT IS. A narration beat still owns its span -- the film is cut to
 * the voice, and that has not changed. What is new is that a beat can hold
 * several shots inside its span, and the long ones now do. "Three phone calls.
 * A photo on WhatsApp. A number in somebody's notebook." was one card for five
 * and a half seconds; it is three cards now, one per fragment, cut hard.
 */

export const FPS = 30;
/** Frames per beat. Exact by construction -- see the film's script for the why. */
export const BEAT = Math.round((60 / BPM) * FPS);
/** The finest boundary the edit uses. Nothing is shorter than this. */
export const HALF = BEAT / 2;

/** How a shot arrives. Default is a hard cut, which costs no frames at all. */
export type CutKind = "hard" | "flash" | "whip" | "dissolve";

/**
 * An entry in the cut list. Named ShotDef rather than Shot because Shot.tsx
 * already exports a component by that name -- the thing that renders a cropped
 * screenshot. This is the description; that is the picture.
 */
export interface ShotDef {
  /** Relative share of the beat's span. Snapped to the half-beat grid. */
  weight?: number;
  cut?: CutKind;
  /** Whip direction: -1 left, 1 right. */
  dir?: -1 | 1;
  node: React.ReactNode;
}

/** Frames each transition costs. A hard cut is the point of the exercise. */
const COST: Record<CutKind, number> = { hard: 0, flash: 4, whip: 6, dissolve: 7 };

/**
 * Divide a span between shots, snapped to the grid, without losing a frame.
 *
 * Largest-remainder, in half-beat units. The obvious version -- round each
 * share to the nearest half-beat and hand the difference back to the longest
 * shot -- is what I wrote first, and a property test over a spread of spans
 * caught it doing two things wrong. It produced a ZERO-length shot when the
 * span could not hold them all, and it distributed badly: a 105-frame beat
 * split two ways came out [15, 90] rather than [54, 51], because subtracting a
 * whole half-beat to correct a three-frame overshoot flipped the sign of the
 * error and the correction loop oscillated.
 *
 * Flooring and then handing out the leftover half-beats to whichever shot lost
 * the most in the flooring has neither failure: it cannot overshoot, so it
 * cannot oscillate, and every shot starts at a half-beat floor.
 */
export function schedule(frames: number, shots: ShotDef[]): number[] {
  if (shots.length === 1) return [frames];
  if (shots.length * HALF > frames) {
    throw new Error(
      `beat of ${frames}f cannot hold ${shots.length} shots at a ${HALF}f floor. ` +
        "Give the beat fewer shots, or more narration.",
    );
  }
  const weights = shots.map((s) => s.weight ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const ideal = weights.map((w) => (frames * w) / sum);

  // Floor to whole half-beats, never below one.
  const units = ideal.map((r) => Math.max(1, Math.floor(r / HALF)));
  const lens = units.map((u) => u * HALF);
  // What each shot gave up in the flooring; the biggest losers are paid first.
  const owed = ideal.map((r, i) => r - lens[i]);

  let left = frames - lens.reduce((a, b) => a + b, 0);
  while (left >= HALF) {
    let best = 0;
    for (let i = 1; i < owed.length; i++) if (owed[i] > owed[best]) best = i;
    lens[best] += HALF;
    owed[best] -= HALF;
    left -= HALF;
  }
  // Whatever is left is finer than the grid, so it goes where it shows least.
  if (left > 0) {
    let longest = 0;
    for (let i = 1; i < lens.length; i++) if (lens[i] > lens[longest]) longest = i;
    lens[longest] += left;
  }
  return lens;
}

/** One shot, with its arrival treatment. */
const Take: React.FC<{ shot: ShotDef; length: number }> = ({ shot, length }) => {
  const frame = useCurrentFrame();
  const kind = shot.cut ?? "hard";
  const cost = COST[kind];
  const p = cost ? ramp(frame, [0, cost], arrive) : 1;
  // Every shot lands with a small settle, whatever its transition. It is the
  // cheapest thing that makes a hard cut read as deliberate rather than abrupt.
  const punch = ramp(frame, [0, Math.min(10, Math.max(6, length))], arrive);

  const body =
    kind === "whip" ? (
      <Whip progress={p} direction={shot.dir ?? 1} incoming>
        {shot.node}
      </Whip>
    ) : kind === "dissolve" ? (
      <Defocus progress={p} incoming maxBlur={14}>
        {shot.node}
      </Defocus>
    ) : (
      shot.node
    );

  return (
    <AbsoluteFill>
      <Punch progress={punch}>{body}</Punch>
      {kind === "flash" ? <Flash progress={p} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Lay a beat's shots across its span.
 *
 * `from` and `frames` come from the measured narration, so the film is still
 * cut to the voice; this only decides what happens inside that window.
 */
export const Beat: React.FC<{
  from: number;
  frames: number;
  shots: ShotDef[];
  /**
   * Rendered once across the WHOLE beat, not per shot.
   *
   * A caption belongs to the sentence being spoken, and the sentence does not
   * restart when the picture cuts. Putting it inside the shots made it
   * re-animate on every jump cut, which turns a caption band into a flicker.
   */
  caption?: React.ReactNode;
}> = ({ from, frames, shots, caption }) => {
  const lens = schedule(frames, shots);
  let at = from;
  return (
    <>
      {shots.map((shot, i) => {
        const start = at;
        at += lens[i];
        return (
          <Sequence
            key={i}
            from={start}
            // A frame of overlap, so a hard cut never shows the background
            // through a seam on a rounding boundary.
            durationInFrames={lens[i] + 1}
            layout="none"
          >
            <Take shot={shot} length={lens[i]} />
          </Sequence>
        );
      })}
      {caption ? (
        <Sequence from={from} durationInFrames={frames} layout="none">
          {caption}
        </Sequence>
      ) : null}
    </>
  );
};
