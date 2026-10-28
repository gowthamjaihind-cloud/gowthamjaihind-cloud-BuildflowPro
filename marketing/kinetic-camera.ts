import type { CameraKey, MarkRect } from "./kinetic-timeline";

/**
 * 1200 x 750, 16:10 like the captures. Larger than the first draft's 1130 for
 * one reason: legibility. At the camera's closest the crop is ~1900 source px
 * wide, so body text lands at about 0.63 of its 28px capture size -- 18px on a
 * 1080 frame, which reads. The first draft's crops were 2450 wide in a smaller
 * window and put that text at 11px: the screen was visible and unreadable.
 */
export const WIN_W = 1200;
export const WIN_H = 750;
export const WIN_TOP = 140;
export const winLeft = (side: "left" | "right") => (side === "right" ? 650 : 70);

/*
 * The window geometry lives here, not in Stage.tsx, so marketing/kinetic.spec.ts
 * can import it: Stage.tsx imports Remotion, which the CI runner that executes
 * the suite does not install. And this file sits outside marketing/remotion for
 * the reason given at the top of kinetic-timeline.ts.
 */

/**
 * The camera, as arithmetic.
 *
 * Kept free of React so the crop and the projection can be reasoned about (and
 * tested) on their own. The model is the one Screen.tsx established: a focus is
 * a centre and a width in SOURCE pixels, and the height is derived from the
 * viewport's aspect, so a focus always fills its window exactly. What changes
 * here is that the viewport is a floating window rather than the whole frame,
 * and that the camera MOVES between several keyframes instead of between two.
 */

export interface Focus {
  cx: number;
  cy: number;
  w: number;
}

/**
 * In-out cubic. The camera starts and stops gently, which is the difference
 * between a push that guides the eye and one that yanks it -- and the whole
 * complaint about the first cut was that the eye was never given time.
 */
export const easeInOut = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * Where the camera is at scene time `t`.
 *
 * Before the first key it holds the first; after the last it holds the last;
 * between two it eases across the gap. A "hold then push" is therefore just
 * two keys with the same focus followed by a third.
 */
export function focusAt(keys: CameraKey[], t: number): Focus {
  if (!keys.length) throw new Error("a screen scene needs at least one camera key");
  if (t <= keys[0].at) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.at) {
      const e = easeInOut((t - a.at) / Math.max(b.at - a.at, 1));
      return {
        cx: a.cx + (b.cx - a.cx) * e,
        cy: a.cy + (b.cy - a.cy) * e,
        w: a.w + (b.w - a.w) * e,
      };
    }
  }
  return keys[keys.length - 1];
}

export interface Crop {
  scale: number;
  /** Image offset inside the viewport, in viewport pixels. */
  left: number;
  top: number;
}

/**
 * The crop for a focus in a viewport of `vw` x `vh`.
 *
 * Clamped so the edge of the screenshot never shows: a crop that runs past the
 * image is moved back inside it rather than letterboxed.
 */
export function crop(f: Focus, vw: number, vh: number, sw: number, sh: number): Crop {
  const cw = Math.min(f.w, sw, (sh * vw) / vh);
  const ch = (cw * vh) / vw;
  const cx = Math.min(Math.max(f.cx, cw / 2), sw - cw / 2);
  const cy = Math.min(Math.max(f.cy, ch / 2), sh - ch / 2);
  const scale = vw / cw;
  return { scale, left: -(cx - cw / 2) * scale, top: -(cy - ch / 2) * scale };
}

/** A source-pixel rect, in viewport pixels under a crop. */
export function project(r: { x: number; y: number; w: number; h: number }, c: Crop) {
  return { x: c.left + r.x * c.scale, y: c.top + r.y * c.scale, w: r.w * c.scale, h: r.h * c.scale };
}

/**
 * The spotlight's rect at time `t`, in SOURCE pixels, gliding between marks.
 *
 * The first cut's highlights snapped on. Here the spotlight MOVES from one
 * element to the next when a sentence has two halves -- "what's in stock,
 * what's running out" -- which is the single most self-explanatory thing the
 * film does: the eye is carried from the clause to the part of the screen it
 * describes, rather than being asked to find it.
 */
export function spotlightAt(marks: MarkRect[], t: number, glide = 16) {
  if (!marks.length || t < marks[0].at) return null;
  let k = 0;
  while (k + 1 < marks.length && t >= marks[k + 1].at) k++;
  const cur = marks[k];
  if (k === 0) return { rect: cur, index: k, since: t - cur.at };
  const prev = marks[k - 1];
  const e = easeInOut((t - cur.at) / glide);
  return {
    rect: {
      x: prev.x + (cur.x - prev.x) * e,
      y: prev.y + (cur.y - prev.y) * e,
      w: prev.w + (cur.w - prev.w) * e,
      h: prev.h + (cur.h - prev.h) * e,
    },
    index: k,
    since: t - marks[0].at,
  };
}
