import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Focus, SRC_H, SRC_W } from "../theme";
import { Grain, Marker, Vignette, arrive, ramp, smooth } from "./Cinema";

/**
 * One shot of the product: a crop of a screenshot, moving, with the option of a
 * highlight drawn on it.
 *
 * The crop model is the same as Screen.tsx -- a centre point and a width in
 * SOURCE pixels, with the height derived from the composition's aspect so a
 * region always fills the frame exactly. What this adds is that highlights are
 * given in source pixels too, and projected through the same transform. That
 * matters more than it sounds: a marker positioned in frame percentages has to
 * be re-guessed every time the crop is nudged, and it drifts off its target
 * silently. Given in source pixels it is attached to the thing it is pointing
 * at, and the crop can move underneath it.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export const Shot: React.FC<{
  src: string;
  from: Focus;
  to?: Focus;
  /** Frames the move runs over; defaults to the whole sequence. */
  moveFrames?: number;
  /** Highlights, in source pixels. */
  marks?: Rect[];
  /** Frame at which the highlights start drawing on. */
  markAt?: number;
  /** Source size, for images that are not the 3200x2000 app captures. */
  srcW?: number;
  srcH?: number;
}> = ({ src, from, to, moveFrames, marks, markAt = 10, srcW = SRC_W, srcH = SRC_H }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const span = moveFrames ?? durationInFrames;
  const e = ramp(frame, [0, span], smooth);

  const end = to ?? from;
  const cw = from.w + (end.w - from.w) * e;
  const cx = from.cx + (end.cx - from.cx) * e;
  const cy = from.cy + (end.cy - from.cy) * e;
  const ch = (cw * height) / width;

  // Keep the crop inside the image, or the edge of the screenshot shows.
  const halfW = cw / 2;
  const halfH = ch / 2;
  const clampedX = Math.min(Math.max(cx, halfW), srcW - halfW);
  const clampedY = Math.min(Math.max(cy, halfH), srcH - halfH);

  const scale = width / cw;
  const left = -(clampedX - halfW) * scale;
  const top = -(clampedY - halfH) * scale;

  /** Source pixels -> fraction of the frame. */
  const project = (r: Rect) => ({
    x: (left + r.x * scale) / width,
    y: (top + r.y * scale) / height,
    w: (r.w * scale) / width,
    h: (r.h * scale) / height,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: C.page, overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          width: srcW * scale,
          height: srcH * scale,
          left,
          top,
        }}
      />
      {marks?.map((r, i) => {
        // Six frames, not thirty. A highlight that takes a third of a second to
        // appear is longer than some of the shots it sits on now.
        const p = ramp(frame, [markAt + i * 4, markAt + i * 4 + 6], arrive);
        return <Marker key={i} {...project(r)} progress={p} label={r.label} />;
      })}
      {/* Light on a product shot, not just on the title cards: a screenshot
          pasted edge to edge with no falloff reads as a screenshot. */}
      <Vignette strength={0.3} />
      <Grain opacity={0.035} />
    </AbsoluteFill>
  );
};

/**
 * The band that carries the on-screen line.
 *
 * Full bleed across the foot of the frame, never a floating chip, and the text
 * is never laid over the part of the screen being pointed at. A caption in a
 * rounded card over a screenshot is the single most common way these videos
 * look cheap.
 */
export const Caption: React.FC<{
  kicker: string;
  title: string;
  /** Frame the band starts arriving. */
  at?: number;
}> = ({ kicker, title, at = 6 }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const p = ramp(frame, [at, at + 9], arrive);
  const bandH = height * 0.185;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: bandH,
        // Opaque well before the type starts. The first version ramped to 86%
        // at 42% of the band and the app's own text was still legible behind
        // the caption, which reads as two layers fighting rather than one frame.
        background: `linear-gradient(180deg, rgba(18,32,63,0) 0%, rgba(18,32,63,0.72) 26%, rgba(18,32,63,0.97) 52%, ${C.surfaceDark} 100%)`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: `0 ${height * 0.075}px ${height * 0.052}px`,
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
      }}
    >
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: C.primaryOnDark,
          marginBottom: 10,
        }}
      >
        {kicker}
      </div>
      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>
        {title}
      </div>
    </div>
  );
};
