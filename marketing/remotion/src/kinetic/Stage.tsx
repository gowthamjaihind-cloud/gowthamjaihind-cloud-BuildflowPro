import React from "react";
import { Img, staticFile } from "remotion";
import { SRC_H, SRC_W } from "../theme";
import { arrive, ramp, smooth } from "../film/Cinema";
import { crop, focusAt, project, spotlightAt, WIN_H, WIN_TOP, WIN_W, winLeft } from "../../../kinetic-camera";
import type { CameraKey, MarkRect, Placed } from "./grid";
import { T } from "./palette";

/**
 * The window a screen sits in, and the phones the Telegram scene uses.
 *
 * Both are presentation, not product: a rounded card with a shadow, holding a
 * real screenshot. Nothing is drawn INTO the screenshot -- no fake cursor, no
 * mocked notification, no window chrome the app does not have. The only marks
 * on it are the spotlight and its ring, which point at what the sentence beside
 * them is describing.
 */

export { WIN_H, WIN_TOP, WIN_W, winLeft };

/**
 * Dim outside the spotlight. Enough to say "not this", not enough to hide it.
 * 0.34 was the first value and on light screens it read as the whole window
 * going grey rather than as one element being lit; 0.18 still greyed it. The
 * ring does most of the pointing -- the dim only has to say "not this".
 */
const DIM = "rgba(15,23,42,0.12)";
/** Breathing room around a highlighted element, in window px. */
const PAD = 12;

const Spotlight: React.FC<{
  marks: MarkRect[];
  t: number;
  toView: (r: { x: number; y: number; w: number; h: number }) => { x: number; y: number; w: number; h: number };
  w: number;
  h: number;
}> = ({ marks, t, toView, w, h }) => {
  const s = spotlightAt(marks, t);
  if (!s) return null;
  const v = toView(s.rect);
  const x = v.x - PAD;
  const y = v.y - PAD;
  const rw = v.w + PAD * 2;
  const rh = v.h + PAD * 2;
  const dim = ramp(s.since, [0, 12], smooth);
  const draw = ramp(s.since, [0, 16], arrive);
  const id = `spot-${marks[0].at}-${marks.length}`;
  return (
    <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <mask id={id}>
          <rect width={w} height={h} fill="white" />
          <rect x={x} y={y} width={rw} height={rh} rx={16} fill="black" />
        </mask>
      </defs>
      <rect width={w} height={h} fill={DIM} mask={`url(#${id})`} opacity={dim} />
      {/* A soft halo under the ring, so it reads on light AND on the dark
          panels the light theme still has. */}
      <rect
        x={x}
        y={y}
        width={rw}
        height={rh}
        rx={16}
        fill="none"
        stroke={T.accent}
        strokeOpacity={0.22 * draw}
        strokeWidth={14}
      />
      <rect
        x={x}
        y={y}
        width={rw}
        height={rh}
        rx={16}
        fill="none"
        stroke={T.accent}
        strokeWidth={4}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
    </svg>
  );
};

export const Window: React.FC<{
  t: number;
  side: "left" | "right";
  src: string;
  camera: CameraKey[];
  marks: MarkRect[];
}> = ({ t, side, src, camera, marks }) => {
  const f = focusAt(camera, t);
  const c = crop(f, WIN_W, WIN_H, SRC_W, SRC_H);
  // The window starts turned toward the explainer and straightens as the camera
  // pushes in -- it settles at the moment there is something to read in it.
  const settle = ramp(t, [0, 70], smooth);
  const turn = (side === "right" ? -1 : 1) * (7 - 5 * settle);
  // A drift so a held frame is never wholly still.
  const drift = Math.sin(t / 38) * 4;

  return (
    <div
      style={{
        position: "absolute",
        left: winLeft(side),
        top: WIN_TOP,
        width: WIN_W,
        height: WIN_H,
        transform: `perspective(2400px) rotateY(${turn.toFixed(3)}deg) translateY(${drift.toFixed(2)}px)`,
        transformOrigin: side === "right" ? "0% 50%" : "100% 50%",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 26,
          overflow: "hidden",
          background: "#FFFFFF",
          border: "1px solid rgba(15,23,42,0.08)",
          boxShadow: "0 50px 110px rgba(15,23,42,0.20), 0 12px 32px rgba(15,23,42,0.08)",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            position: "absolute",
            left: c.left,
            top: c.top,
            width: SRC_W * c.scale,
            height: SRC_H * c.scale,
          }}
        />
        <Spotlight marks={marks} t={t} toView={(r) => project(r, c)} w={WIN_W} h={WIN_H} />
      </div>
    </div>
  );
};

/**
 * The Telegram scene: two real screenshots of the real bot, as phone cards.
 *
 * Real crops of the shipping bot -- the log menu and the material picker -- at
 * their own aspect. They are not composited into a phone frame, because a phone
 * frame is a device the film would be inventing; a rounded card with a shadow is
 * a presentation of a screenshot, which is all this is.
 */
const PHONES = [
  // [left, top, height, srcW, srcH, depth]
  { left: 700, top: 236, height: 620, sw: 1320, sh: 1330, depth: 1 },
  { left: 1220, top: 150, height: 560, sw: 1320, sh: 1290, depth: 0.82 },
];

export const Phones: React.FC<{ t: number; images: string[]; marks: MarkRect[] }> = ({
  t,
  images,
  marks,
}) => (
  <>
    {/* Back card first, so the front one overlaps it. */}
    {[1, 0].map((i) => {
      const p = PHONES[i];
      const src = images[i];
      if (!src) return null;
      const w = (p.height * p.sw) / p.sh;
      const s = p.height / p.sh;
      const arrive_ = ramp(t, [i * 8, i * 8 + 26], arrive);
      const bob = Math.sin((t + i * 23) / 26) * 7;
      const tilt = i === 0 ? -4 : 5;
      const mine = marks.filter((m) => (m.image ?? 0) === i);
      return (
        <div
          key={src}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: w,
            height: p.height,
            zIndex: i === 0 ? 2 : 1,
            opacity: arrive_,
            transform: `perspective(1800px) translateY(${(bob + (1 - arrive_) * 60).toFixed(2)}px) rotateY(${tilt}deg) scale(${(0.94 + 0.06 * arrive_).toFixed(4)})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 34,
              overflow: "hidden",
              boxShadow:
                i === 0
                  ? "0 50px 110px rgba(15,23,42,0.26), 0 12px 30px rgba(15,23,42,0.10)"
                  : "0 30px 80px rgba(15,23,42,0.16)",
              filter: i === 1 ? "saturate(0.92)" : undefined,
            }}
          >
            <Img src={staticFile(src)} style={{ width: w, height: p.height, display: "block" }} />
            {mine.length > 0 && (
              <Spotlight
                marks={mine}
                t={t}
                toView={(r) => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s })}
                w={w}
                h={p.height}
              />
            )}
          </div>
        </div>
      );
    })}
  </>
);

/**
 * Where a scene's LAST highlight sits on the frame when the scene ends.
 *
 * The iris transition opens the next scene from that point, so the story
 * continues from the thing the viewer was just looking at. It is computed
 * rather than stored because a stored coordinate is a copy of the layout: the
 * first draft kept these as numbers in film.json and one went stale the first
 * time a phone card moved by ten pixels. The window's small turn and drift are
 * ignored -- a few pixels at the centre of a circle that covers the frame.
 */
export function anchorOf(s: Placed | undefined): [number, number] | undefined {
  if (!s?.marks?.length) return undefined;
  const m = s.marks[s.marks.length - 1];
  if (s.kind === "phones") {
    const p = PHONES[m.image ?? 0];
    const k = p.height / p.sh;
    return [p.left + (m.x + m.w / 2) * k, p.top + (m.y + m.h / 2) * k];
  }
  if (s.kind === "screen" && s.camera?.length) {
    const side = (s.chapter ?? 1) % 2 === 1 ? "right" : "left";
    const c = crop(focusAt(s.camera, s.dur), WIN_W, WIN_H, SRC_W, SRC_H);
    const r = project(m, c);
    return [winLeft(side) + r.x + r.w / 2, WIN_TOP + r.y + r.h / 2];
  }
  return undefined;
}
