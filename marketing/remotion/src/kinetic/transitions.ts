import type React from "react";
import { easeInOut } from "../../../kinetic-camera";
import type { Enter } from "./grid";

/**
 * How one scene hands over to the next.
 *
 * The first cut used hard cuts with a punch-in, which is the right grammar for
 * a montage and the wrong one for an explanation: every cut resets where the
 * eye is, and at 0.8s a shot the eye never caught up. These are all CONTINUOUS
 * -- for the length of a transition both scenes are on screen and something
 * carries the eye across -- and there are four, rotated, so the film has rhythm
 * without any one move becoming wallpaper:
 *
 *   push  lateral, with motion blur. The workhorse. Direction follows the
 *         layout, so a window that sits on the right arrives from the right.
 *   zoom  a dolly THROUGH the outgoing scene into the next. Used into and out
 *         of the title cards, where the film changes register.
 *   rise  the outgoing card drops back, the next rises from below with a
 *         slight forward tilt. Reads as "and then", a step in a sequence.
 *   iris  the next scene opens from a POINT -- the element the viewer was just
 *         looking at. Used where the story continues from that element: tap
 *         Save in Telegram and the Daily Logs screen opens from the Save
 *         button.
 *
 * Each style has an enter half (for the incoming scene) and an exit half (for
 * the outgoing one). The outgoing scene leaves in whatever way the INCOMING one
 * arrives, so the pair always matches.
 */

export interface LayerStyle {
  style: React.CSSProperties;
  /** For iris: the circle the incoming layer is clipped to, in frame px. */
  iris?: { x: number; y: number; r: number; p: number };
}

const blur = (px: number) => (px > 0.05 ? `blur(${px.toFixed(2)}px)` : undefined);

/**
 * Staggered opacity: the outgoing scene is mostly gone before the incoming one
 * is legible. The first draft crossed them linearly, so at every midpoint both
 * sentences sat on top of each other at half strength -- "Where the job stands
 * today" printed through "Stock Inventory". Two half-legible lines are worse
 * than one line a few frames late.
 */
const inOpacity = (e: number) => Math.min(Math.max((e - 0.3) / 0.7, 0), 1);
const outOpacity = (e: number) => Math.min(Math.max(1 - e / 0.7, 0), 1);

/** The radius that covers the whole frame from (x, y). */
const coverRadius = (x: number, y: number, w: number, h: number) =>
  Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));

export function enterStyle(
  kind: Enter | undefined,
  p: number,
  opts: { dir: number; width: number; height: number; from?: [number, number] },
): LayerStyle {
  if (!kind || p >= 1) return { style: {} };
  const e = easeInOut(p);
  switch (kind) {
    case "push":
      return {
        style: {
          transform: `translateX(${(opts.dir * opts.width * 0.32 * (1 - e)).toFixed(1)}px) scale(${(1.04 - 0.04 * e).toFixed(4)})`,
          filter: blur(10 * (1 - e)),
          opacity: inOpacity(e),
        },
      };
    case "zoom":
      return {
        style: {
          transform: `scale(${(0.84 + 0.16 * e).toFixed(4)})`,
          filter: blur(10 * (1 - e)),
          opacity: inOpacity(e),
        },
      };
    case "rise":
      return {
        style: {
          transform: `perspective(1800px) translateY(${(160 * (1 - e)).toFixed(1)}px) rotateX(${(16 * (1 - e)).toFixed(2)}deg)`,
          transformOrigin: "50% 100%",
          filter: blur(6 * (1 - e)),
          opacity: inOpacity(e),
        },
      };
    case "iris": {
      const [x, y] = opts.from ?? [opts.width / 2, opts.height / 2];
      const r = coverRadius(x, y, opts.width, opts.height) * e;
      return {
        style: { clipPath: `circle(${r.toFixed(1)}px at ${x}px ${y}px)` },
        iris: { x, y, r, p: e },
      };
    }
  }
}

export function exitStyle(
  kind: Enter | undefined,
  p: number,
  opts: { dir: number; width: number },
): LayerStyle {
  if (!kind || p <= 0) return { style: {} };
  const e = easeInOut(p);
  switch (kind) {
    case "push":
      // Leaves toward the side the incoming scene is NOT coming from.
      return {
        style: {
          transform: `translateX(${(-opts.dir * opts.width * 0.32 * e).toFixed(1)}px) scale(${(1 - 0.06 * e).toFixed(4)})`,
          filter: blur(10 * e),
          opacity: outOpacity(e),
        },
      };
    case "zoom":
      return {
        style: {
          transform: `scale(${(1 + 0.32 * e).toFixed(4)})`,
          filter: blur(14 * e),
          opacity: outOpacity(e),
        },
      };
    case "rise":
      return {
        style: {
          transform: `translateY(${(-60 * e).toFixed(1)}px) scale(${(1 - 0.08 * e).toFixed(4)})`,
          filter: blur(5 * e),
          opacity: outOpacity(e),
        },
      };
    case "iris":
      // Stays put and is simply covered; a little push so it is not inert.
      return { style: { transform: `scale(${(1 + 0.04 * e).toFixed(4)})` } };
  }
}
