import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Screen } from "../Screen";
import { Flash, Grain, Punch, Vignette, arrive, ramp } from "../film/Cinema";
import { Fonts, typeStyle } from "../film/Fonts";
import { BAR, BEAT, KINETIC_FRAMES } from "./grid";
import { BLITZ, BLITZ_STEP, FIGURES, HOLDS, Shot } from "./shots";
import { EndCard, Opener } from "./Mark";

/**
 * The kinetic cut: 18 bars at 150 BPM, 28.8 seconds, 16:9.
 *
 * A different job from the two films already here. The launch film argues and
 * the walkthrough explains; both assume someone has decided to watch. This one
 * runs on a landing page above the fold, where the only question is whether a
 * visitor keeps scrolling -- so it does not build, it starts, and the whole
 * thing is over before the 83-second silent cut has finished its first beat.
 *
 * Everything in frame is the real product. Fifteen real screenshots, the real
 * brand mark with its real geometry, and labels that are strings the app
 * itself displays. Nothing is staged, drawn or written for the film.
 *
 * It uses `Fonts` -- which the older Hero composition does not, and which is
 * why Hero has always rendered in a fallback face without anyone noticing.
 * That has a render cost attached: `Fonts` holds the render open with
 * `delayRender` until Manrope has rasterised, and at high concurrency the
 * headless tabs race that past the 30-second default and one gives up. Render
 * this at `--concurrency=2`, as the Launch composition does, for the same
 * reason. The alternative -- dropping `Fonts` to render faster -- buys speed by
 * shipping the wrong typeface.
 */

/** Where each act begins. Derived, so a change to the grid moves everything. */
export const OPENER_FRAMES = BAR * 2;
export const BLITZ_AT = OPENER_FRAMES;
export const BLITZ_FRAMES = BLITZ.length * BLITZ_STEP;
export const FIGURES_AT = BLITZ_AT + BLITZ_FRAMES;
export const FIGURES_FRAMES = FIGURES.length * BLITZ_STEP;
export const HOLDS_AT = FIGURES_AT + FIGURES_FRAMES;
export const HOLDS_FRAMES = HOLDS.reduce((n, s) => n + (s.span ?? BAR), 0);
export const ENDCARD_AT = HOLDS_AT + HOLDS_FRAMES;
export const ENDCARD_FRAMES = KINETIC_FRAMES - ENDCARD_AT;

/**
 * The label band: a rule and a word, bottom left.
 *
 * Not the full-bleed caption band the other films use. That band is 18.5% of
 * the frame and exists to carry a sentence under a shot that holds for five
 * seconds; here a shot holds for eight tenths of one, and a band that size
 * would cover the product for a third of the film to deliver two words.
 *
 * The reveal is a horizontal wipe rather than a fade for the same reason the
 * name is in the opener: at this rate a fade has not finished before the cut
 * arrives, so it reads as the type being dim rather than as the type arriving.
 */
const Label: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const p = ramp(frame, [1, 1 + BEAT * 0.75], arrive);
  const rule = ramp(frame, [0, BEAT * 0.5], arrive);
  return (
    <>
      {/*
        A soft scrim under the type, not a chip behind it.

        The shadow alone was enough on thirteen of the sixteen screens, because
        they are dark. It is not enough on `m-11-reports`, whose subject is a
        WHITE report preview filling most of the frame -- white type with a dark
        shadow on white paper is unreadable, and that shot is the one carrying
        the "Progress Reports" label. Picking a different crop would have been
        the easy fix and the wrong one: the white report IS the thing worth
        showing on that screen.

        So the scrim is a large, very soft corner gradient rather than a box.
        At this size and falloff it reads as the frame being lit from the other
        side, which is also what the Vignette is already doing -- the thing the
        other films' README warns against is text set in a visible coloured
        card, and this deliberately has no edge to see.
      */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "62%",
          height: "42%",
          zIndex: 4,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 0% 100%, rgba(5,10,24,0.92) 0%, rgba(5,10,24,0.72) 34%, rgba(5,10,24,0) 72%)",
        }}
      />
    <div
      style={{
        position: "absolute",
        left: 86,
        bottom: 78,
        zIndex: 5,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          height: 6,
          width: 104 * rule,
          borderRadius: 3,
          background: C.primary,
        }}
      />
      <div
        style={{
          fontSize: 58,
          fontWeight: 800,
          letterSpacing: "-0.025em",
          color: C.white,
          clipPath: `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`,
          transform: `translateY(${((1 - p) * 10).toFixed(2)}px)`,
          // The screens are dark and busy; without this the type sits in them
          // rather than on them.
          textShadow: "0 4px 34px rgba(5,10,24,0.92), 0 1px 3px rgba(5,10,24,0.8)",
        }}
      >
        {text}
      </div>
    </div>
    </>
  );
};

/**
 * One shot: a crop, punched, with its label.
 *
 * The punch is 4.5% settling over a third of a beat. It is the cheapest thing
 * that makes a hard cut read as deliberate rather than abrupt -- the launch
 * film's note on this applies unchanged, and matters more here because there
 * are twenty-four cuts instead of twenty-nine across three times the length.
 */
const Beat: React.FC<{ shot: Shot; span: number; index: number }> = ({ shot, span, index }) => {
  const frame = useCurrentFrame();
  const punch = ramp(frame, [0, BEAT * 0.75], arrive);
  // A flash on every fourth cut -- the downbeat of the bar, since the blitz
  // steps every half bar. On every cut it would be a strobe; on none of them
  // the bar line is inaudible in the picture.
  const flash = index % 4 === 0 ? ramp(frame, [0, 5], arrive) : 1;
  return (
    <AbsoluteFill>
      <Punch progress={punch}>
        <Screen src={shot.src} from={shot.from} to={shot.to} moveFrames={span} />
      </Punch>
      <Vignette strength={0.34} />
      <Grain opacity={0.03} />
      {shot.label ? <Label text={shot.label} /> : null}
      <Flash progress={flash} />
    </AbsoluteFill>
  );
};

/**
 * A hairline that crosses the frame once, over the whole film.
 *
 * It is the only element on screen that is not the product, and it earns that
 * by doing something the product cannot: it tells a viewer how much is left.
 * Two pixels at the very foot of the frame, in the brand's cobalt. On a hero
 * film the most common reason someone stops watching is not knowing whether
 * they are thirty seconds from the end or three minutes.
 */
const Progress: React.FC = () => {
  const frame = useCurrentFrame();
  const p = Math.min(frame / KINETIC_FRAMES, 1);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 4,
        width: `${(p * 100).toFixed(3)}%`,
        background: C.primary,
        zIndex: 20,
      }}
    />
  );
};

export const Kinetic: React.FC = () => {
  let at = BLITZ_AT;
  const blitz = BLITZ.map((shot, i) => {
    const from = at;
    at += shot.span ?? BLITZ_STEP;
    return { shot, from, span: shot.span ?? BLITZ_STEP, key: `b${i}`, index: i };
  });
  let fat = FIGURES_AT;
  const figures = FIGURES.map((shot, i) => {
    const from = fat;
    fat += shot.span ?? BLITZ_STEP;
    return { shot, from, span: shot.span ?? BLITZ_STEP, key: `f${i}`, index: i };
  });
  let hat = HOLDS_AT;
  const holds = HOLDS.map((shot, i) => {
    const from = hat;
    const span = shot.span ?? BAR;
    hat += span;
    return { shot, from, span, key: `h${i}`, index: i };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: C.surfaceDark, ...typeStyle }}>
      <Fonts />

      <Sequence from={0} durationInFrames={OPENER_FRAMES}>
        <Opener />
      </Sequence>

      {[...blitz, ...figures, ...holds].map(({ shot, from, span, key, index }) => (
        <Sequence key={key} from={from} durationInFrames={span}>
          <Beat shot={shot} span={span} index={index} />
        </Sequence>
      ))}

      <Sequence from={ENDCARD_AT} durationInFrames={ENDCARD_FRAMES}>
        <EndCard />
      </Sequence>

      <Progress />
    </AbsoluteFill>
  );
};
