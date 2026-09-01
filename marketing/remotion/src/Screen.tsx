import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Focus, SRC_H, SRC_W } from "./theme";

/**
 * A product screenshot filling the frame edge to edge.
 *
 * The generated version of this video shrank whole app windows to roughly half
 * frame width and clipped their edges, which left the figures a few pixels tall.
 * Here the crop is derived from the composition's own aspect ratio, so the
 * region always fills the frame exactly: never letterboxed, never floating,
 * never clipped at an edge by accident.
 */
export const Screen: React.FC<{
  src: string;
  from: Focus;
  to?: Focus;
  /** Frames over which the move runs; defaults to the whole sequence. */
  moveFrames?: number;
}> = ({ src, from, to, moveFrames }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const span = moveFrames ?? durationInFrames;
  const t = interpolate(frame, [0, span], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Ease so the move settles rather than stopping dead.
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const end = to ?? from;
  const cw = from.w + (end.w - from.w) * e;
  const cx = from.cx + (end.cx - from.cx) * e;
  const cy = from.cy + (end.cy - from.cy) * e;
  // Height follows the frame's aspect, so the crop and the frame always agree.
  const ch = (cw * height) / width;

  // Keep the crop inside the image, or the edge of the screenshot shows.
  const halfW = cw / 2;
  const halfH = ch / 2;
  const clampedX = Math.min(Math.max(cx, halfW), SRC_W - halfW);
  const clampedY = Math.min(Math.max(cy, halfH), SRC_H - halfH);

  const scale = width / cw;
  const left = -(clampedX - halfW) * scale;
  const top = -(clampedY - halfH) * scale;

  return (
    <AbsoluteFill style={{ backgroundColor: C.ice, overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          width: SRC_W * scale,
          height: SRC_H * scale,
          left,
          top,
          imageRendering: "auto",
        }}
      />
    </AbsoluteFill>
  );
};
