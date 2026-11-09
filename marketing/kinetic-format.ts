import type { CameraKey, MarkRect } from "./kinetic-timeline";

/**
 * The two shapes the kinetic cut is delivered in, as geometry.
 *
 *   wide  1920 x 1080, the landing-page hero, LinkedIn, YouTube, X.
 *   tall  1080 x 1920, Instagram Reels, YouTube Shorts, WhatsApp Status --
 *         where most of this audience actually watches.
 *
 * The tall cut is NOT the wide one letterboxed or cropped: letterboxed, a
 * 1920-wide frame lands on a phone at 56% scale and the screens are
 * unreadable; centre-cropped, it loses the explainer column entirely. It is
 * the same film -- same scenes, same timing, same marks, so the same score and
 * the same effects land on it -- re-laid out: the explainer stacked ABOVE the
 * screen, and the screen's camera re-derived for a near-square window.
 *
 * Pure, and outside marketing/remotion, for the reason in kinetic-timeline.ts.
 */

export type FormatId = "wide" | "tall";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhoneSlot {
  left: number;
  top: number;
  height: number;
  sw: number;
  sh: number;
}

export interface Format {
  id: FormatId;
  W: number;
  H: number;
  /** The screen window. Wide alternates sides per chapter; tall does not. */
  win: (side: "left" | "right") => Rect;
  /** The explainer block. */
  text: (side: "left" | "right") => Rect;
  /** Type sizes, px. */
  type: { kicker: number; chapter: number; line: number; lineLong: number; chip: number };
  phones: [PhoneSlot, PhoneSlot];
  /** Gap from the bottom edge to the chapter bar. */
  chaptersBottom: number;
  title: { mark: number; name: number; line: number; lineWidth: number; url: number; cols: number; wallScale: number };
}

const PHONE_SRC = [
  { sw: 1320, sh: 1330 },
  { sw: 1320, sh: 1290 },
];

export const WIDE: Format = {
  id: "wide",
  W: 1920,
  H: 1080,
  win: (side) => ({ left: side === "right" ? 650 : 70, top: 140, width: 1200, height: 750 }),
  text: (side) => ({ left: side === "left" ? 70 : 1920 - 70 - 520, top: 0, width: 520, height: 1080 }),
  type: { kicker: 24, chapter: 19, line: 54, lineLong: 44, chip: 36 },
  phones: [
    { left: 700, top: 236, height: 620, ...PHONE_SRC[0] },
    { left: 1220, top: 150, height: 560, ...PHONE_SRC[1] },
  ],
  chaptersBottom: 54,
  title: { mark: 150, name: 118, line: 48, lineWidth: 1200, url: 30, cols: 4, wallScale: 1.32 },
};

/**
 * Safe area. Reels and Shorts draw their own UI over the frame -- the account
 * row and caption along the bottom ~420px, the like/comment column down the
 * right ~140px, the header across the top ~220px -- and the profile grid shows
 * a reel cropped to its middle 4:5 (y 285..1635). Everything that has to be
 * READ sits inside y 250..1560 and clear of the right-hand column.
 */
export const TALL_SAFE = { top: 250, bottom: 1560, right: 1080 - 60 };

export const TALL: Format = {
  id: "tall",
  W: 1080,
  H: 1920,
  win: () => ({ left: 60, top: 760, width: 960, height: 740 }),
  text: () => ({ left: 80, top: 250, width: 880, height: 470 }),
  type: { kicker: 30, chapter: 22, line: 62, lineLong: 52, chip: 38 },
  phones: [
    { left: 60, top: 800, height: 690, ...PHONE_SRC[0] },
    { left: 400, top: 730, height: 600, ...PHONE_SRC[1] },
  ],
  chaptersBottom: 1920 - 1548,
  title: { mark: 124, name: 104, line: 54, lineWidth: 900, url: 30, cols: 3, wallScale: 2.2 },
};

export const FORMATS: Record<FormatId, Format> = { wide: WIDE, tall: TALL };

/**
 * The tall cut's camera, derived from the scene's marks.
 *
 * The wide cut's keys are hand-set for a 1200 x 750 window beside the text, and
 * they push to crops ~1950 source px wide that show TWO neighbouring cards at
 * once. In a 960-wide window that same crop puts body text at 14px, so the
 * tall cut frames each SPOTLIGHT instead: wide on arrival, then onto each
 * mark in turn, arriving as the mark lands -- which is the moment the effect's
 * sound plays, so the picture and the score stay in step without moving either.
 */
export const TALL_MARGIN = 70;
export const TALL_MIN_CROP = 1100;

export function tallCamera(
  marks: MarkRect[],
  view: { width: number; height: number },
  src: { w: number; h: number },
): CameraKey[] {
  const aspect = view.width / view.height;
  const wide = { cx: src.w / 2, cy: src.h / 2, w: src.w };
  const keys: CameraKey[] = [
    { at: 0, ...wide },
    { at: 15, ...wide },
  ];
  marks.forEach((m, i) => {
    const w = Math.max(m.w + 2 * TALL_MARGIN, (m.h + 2 * TALL_MARGIN) * aspect, TALL_MIN_CROP);
    const prev = keys[keys.length - 1];
    // Hold where we are, then move: 45 frames for the first push from wide,
    // 30 between marks (a shorter hop).
    const travel = i === 0 ? 45 : 30;
    const start = Math.max(prev.at, m.at - travel);
    if (start > prev.at) keys.push({ ...prev, at: start });
    keys.push({ at: Math.max(m.at, start + 1), cx: m.x + m.w / 2, cy: m.y + m.h / 2, w });
  });
  return keys;
}
