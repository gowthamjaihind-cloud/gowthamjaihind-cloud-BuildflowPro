import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Fonts, typeStyle } from "../film/Fonts";
import { Explainer } from "./Explainer";
import { FEATURES, HALF, KINETIC_FRAMES, Placed, TIMELINE, TRANSITION } from "./grid";
import { T } from "./palette";
import { anchorOf, Phones, Window } from "./Stage";
import { Title } from "./Title";
import { enterStyle, exitStyle } from "./transitions";

/**
 * The kinetic cut, second edit: a self-explaining tour, ~54 seconds.
 *
 * WHAT CHANGED, AND WHY. The first edit cut every 0.8 seconds -- 24 shots in
 * 29 seconds -- and the verdict was that a customer could not understand any of
 * it. That was a structural problem, not a speed setting: at that rate there is
 * no time to READ, so the film could only ever say "there is software" and
 * never "this is what it does".
 *
 * So the unit is no longer a shot. It is a SCENE: one feature, two or three
 * bars long, sized to how long its sentence takes to read. Each scene says
 * three things in order, and the order is the explanation --
 *
 *   1. its name and the app's own one-line description, word by word;
 *   2. the real screen, wide, so the viewer sees where they are;
 *   3. the camera pushing in to the part the sentence is about, with a
 *      spotlight on it -- and where the sentence has two halves, the spotlight
 *      gliding from one to the other.
 *
 * Scenes overlap by one transition, centred on the bar line, and the transition
 * is always continuous rather than a cut -- see transitions.ts. The story runs
 * in the order a job does: the site engineer logs from Telegram, the log lands
 * in Daily Logs, it rolls up into the Dashboard, then stock, buying, insight,
 * billing the client, and the report.
 *
 * Mounts `Fonts`, so render at --concurrency=2: at higher concurrency the
 * headless tabs race its delayRender past the 30s default.
 */

const W = 1920;
const H = 1080;

/** A window on the right is entered from the right, and so on. */
const windowSide = (s: Placed): "left" | "right" => ((s.chapter ?? 1) % 2 === 1 ? "right" : "left");
const dirOf = (s: Placed | undefined) => (s && s.kind !== "title" && windowSide(s) === "left" ? -1 : 1);

const IrisRing: React.FC<{ x: number; y: number; r: number; p: number }> = ({ x, y, r, p }) => (
  <div
    style={{
      position: "absolute",
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: "50%",
      border: `${(5 * (1 - p) + 1).toFixed(2)}px solid ${T.accent}`,
      opacity: 1 - p,
      pointerEvents: "none",
    }}
  />
);

const SceneLayer: React.FC<{ s: Placed; lead: number }> = ({ s, lead }) => {
  const frame = useCurrentFrame();
  const t = frame - lead;
  const next = TIMELINE[s.index + 1];

  const pIn = s.index === 0 ? 1 : (t + HALF) / TRANSITION;
  const pOut = next ? (t - (s.dur - HALF)) / TRANSITION : 0;
  const from = s.irisFrom ?? anchorOf(TIMELINE[s.index - 1]);
  const enter = enterStyle(s.enter, pIn, { dir: dirOf(s), width: W, height: H, from });
  const exit = exitStyle(s.exit, pOut, { dir: dirOf(next), width: W });

  const side = windowSide(s);
  const textSide = side === "right" ? "left" : "right";

  let body: React.ReactNode = null;
  if (s.kind === "title") {
    body = <Title t={t} line={s.line ?? ""} url={s.url} closing={!!s.url} />;
  } else if (s.kind === "phones") {
    body = (
      <>
        <Explainer t={t} side="left" chapter={s.chapter!} total={FEATURES} kicker={s.kicker!} line={s.line} chips={s.chips} />
        <Phones t={t} images={s.images ?? []} marks={s.marks ?? []} />
      </>
    );
  } else {
    body = (
      <>
        <Explainer t={t} side={textSide} chapter={s.chapter!} total={FEATURES} kicker={s.kicker!} line={s.line} chips={s.chips} />
        <Window t={t} side={side} src={s.src!} camera={s.camera ?? []} marks={s.marks ?? []} />
      </>
    );
  }

  // Exit wraps enter, so a scene that is both arriving and (briefly, for a very
  // short scene) leaving composes the two rather than one overwriting the other.
  return (
    <AbsoluteFill style={exit.style}>
      <AbsoluteFill style={enter.style}>{body}</AbsoluteFill>
      {enter.iris && <IrisRing {...enter.iris} />}
    </AbsoluteFill>
  );
};

/**
 * Light behind everything: two soft cobalt glows that drift.
 *
 * Painted once, under all scenes, rather than by each scene -- otherwise two
 * overlapping scenes each paint a ground and the cross-fade passes through a
 * double-exposed grey.
 */
const Backdrop: React.FC = () => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 140) * 80;
  const b = Math.cos(f / 170) * 90;
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(42% 52% at ${(28 + a / 30).toFixed(2)}% ${(30 + b / 40).toFixed(2)}%, rgba(29,78,216,0.10) 0%, rgba(29,78,216,0) 70%)`,
          `radial-gradient(46% 56% at ${(76 - b / 30).toFixed(2)}% ${(74 - a / 40).toFixed(2)}%, rgba(29,78,216,0.07) 0%, rgba(29,78,216,0) 70%)`,
          T.ground,
        ].join(", "),
      }}
    />
  );
};

/**
 * Chapters: one segment per feature, filling as the film goes.
 *
 * The single most useful thing a viewer can know about a minute-long film is
 * how much of it is left. Segments also say the film has STRUCTURE -- eight
 * parts, you are on the third -- which is half of what makes it self-explaining.
 */
const Chapters: React.FC = () => {
  const f = useCurrentFrame();
  const feats = TIMELINE.filter((s) => s.kind !== "title");
  const first = feats[0];
  const last = feats[feats.length - 1];
  const show =
    Math.min(
      Math.max((f - (first.start - HALF)) / TRANSITION, 0),
      Math.max(((last.start + last.dur + HALF) - f) / TRANSITION, 0),
      1,
    );
  if (show <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 54,
        display: "flex",
        justifyContent: "center",
        gap: 10,
        opacity: show,
        zIndex: 20,
      }}
    >
      {feats.map((s) => {
        const fill = Math.min(Math.max((f - s.start) / s.dur, 0), 1);
        return (
          <div key={s.id} style={{ width: 64, height: 5, borderRadius: 3, background: "rgba(15,23,42,0.10)", overflow: "hidden" }}>
            <div style={{ width: `${(fill * 100).toFixed(2)}%`, height: "100%", background: T.accent }} />
          </div>
        );
      })}
    </div>
  );
};

export const Kinetic: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: T.ground, ...typeStyle }}>
    <Fonts />
    <Backdrop />
    {TIMELINE.map((s, i) => {
      const lead = i === 0 ? 0 : HALF;
      const tail = i === TIMELINE.length - 1 ? 0 : HALF;
      return (
        <Sequence key={s.id} from={s.start - lead} durationInFrames={s.dur + lead + tail}>
          <SceneLayer s={s} lead={lead} />
        </Sequence>
      );
    })}
    <Chapters />
  </AbsoluteFill>
);

export { KINETIC_FRAMES };
