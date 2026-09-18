import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C } from "../theme";
import { TRAVEL, whipShift } from "../../../whip";

export { whipShift } from "../../../whip";

/**
 * The things that make a rendered timeline look photographed.
 *
 * None of this is decoration for its own sake. A composition of flat vector
 * screens on flat colour reads as a slide deck no matter how well it is cut,
 * because it is missing every cue the eye uses to read an image as one: grain
 * ties separate layers into a single surface, a vignette gives the frame a
 * centre, and blur on a moving layer is what tells you the move had weight.
 * Together they cost about fifteen lines each and do more for the result than
 * any amount of extra motion.
 */

/* --------------------------------------------------------------- easing -- */

/** Slow in, slow out, and it settles rather than stopping dead. */
export const smooth = Easing.bezier(0.33, 0.0, 0.15, 1.0);
/** For anything arriving: fast off the mark, long tail. */
export const arrive = Easing.bezier(0.16, 1.0, 0.3, 1.0);
/** For anything leaving: gathers speed and goes. */
export const depart = Easing.bezier(0.7, 0.0, 0.84, 0.0);
/**
 * For a transition that TRAVELS, as opposed to one that arrives.
 *
 * `arrive` is an extreme ease-out -- correct for a shot landing and settling,
 * and wrong for a whip, because it spends the move immediately: over the six
 * frames a whip is given it reaches 0.686 by frame 1. Sixty-nine per cent of
 * the pan happens in a single frame and the remaining five do almost nothing,
 * so the eye reads two smeared frames rather than a camera move. This is
 * symmetric: no frame carries more than a quarter of the distance.
 */
export const travel = Easing.bezier(...TRAVEL);

/** 0..1 across a range of frames, eased. */
export const ramp = (
  frame: number,
  [a, b]: [number, number],
  easing = smooth,
) =>
  interpolate(frame, [a, b], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

/**
 * Frames a caption outlives its beat, so the next one can dissolve over it.
 *
 * Shared by Beat (which extends the caption's Sequence) and Caption (which
 * fades its type out across the same window). If the two disagreed the band
 * would either flicker or double up. It lives here because both files already
 * import this one, and neither should have to import the other.
 */
export const CAPTION_LAP = 7;

/* ---------------------------------------------------------------- grain -- */

/**
 * Film grain, re-seeded every frame.
 *
 * This is an SVG turbulence filter, not a grid of divs. The first version built
 * a 44x44 grid of coloured cells, which on a 1920 frame is 44-pixel blocks --
 * it rendered as a visible checkerboard sitting on top of the picture, the
 * exact opposite of grain, which has to be finer than anything in the image to
 * read as part of it. Going finer that way is not an option either: real grain
 * at this size needs a few hundred thousand cells per frame.
 *
 * feTurbulence generates the noise in one node at whatever resolution the frame
 * is. The seed advances with the frame, so it moves; and because it advances
 * deterministically, two renders of the same film are identical -- which
 * matters, since a film you cannot re-render byte for byte is a film you cannot
 * fix one shot of.
 */
export const Grain: React.FC<{ opacity?: number; scale?: number }> = ({
  opacity = 0.09,
  scale = 0.85,
}) => {
  const frame = useCurrentFrame();
  const id = `grain-${frame % 12}`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
      <svg width="100%" height="100%" style={{ display: "block" }}>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={scale}
            numOctaves={2}
            seed={frame * 7 + 1}
            stitchTiles="stitch"
          />
          {/* Turbulence is colourful; grain is not. */}
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------- vignette -- */

/** Corners pulled down, so the frame has a middle. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(120% 100% at 50% 45%, rgba(0,0,0,0) 42%, rgba(0,0,0,${
        strength * 0.55
      }) 78%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/* ------------------------------------------------------------ letterbox -- */

/**
 * Bars that open at the head of the film and close at the tail.
 *
 * A cheap trick and an honest one: for the first fifteen seconds this film is
 * three sentences on black, and 2.39:1 tells the viewer to read it as a title
 * sequence rather than wonder when the software appears.
 */
export const Letterbox: React.FC<{ progress: number; ratio?: number }> = ({
  progress,
  ratio = 2.39,
}) => {
  const { width, height } = useVideoConfig();
  const closed = (height - width / ratio) / 2;
  const bar = closed * progress;
  if (bar < 0.5) return null;
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: bar, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: bar, background: "#000" }} />
    </>
  );
};

/* ---------------------------------------------------------- transitions -- */

/**
 * A wipe with a soft, lit leading edge.
 *
 * The edge is the whole point. A hard clip-path boundary sliding across the
 * frame looks like a browser repainting; a two-degree bevel with a thin bright
 * line on it looks like something passing in front of something else.
 */
export const Wipe: React.FC<{
  progress: number;
  angle?: number;
  children: React.ReactNode;
}> = ({ progress, angle = 96, children }) => {
  const p = Math.min(Math.max(progress, 0), 1);
  return (
    <AbsoluteFill
      style={{
        // 118% so the bevel is fully off-frame at either end.
        clipPath: `polygon(0 0, ${p * 118}% 0, ${p * 118 - 8}% 100%, 0 100%)`,
      }}
    >
      {children}
      {p > 0.002 && p < 0.998 ? (
        <div
          style={{
            position: "absolute",
            top: "-10%",
            bottom: "-10%",
            left: `${p * 118 - 4}%`,
            width: 3,
            transform: `rotate(${180 - angle}deg)`,
            background: `linear-gradient(180deg, rgba(168,194,255,0), ${C.primaryOnDark}, rgba(168,194,255,0))`,
            opacity: 0.85,
            filter: "blur(1.5px)",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ hard cuts -- */

/**
 * The transitions a fast cut is actually made of.
 *
 * The first version of this film crossfaded every shot over sixteen frames.
 * That is half a second of two pictures at once, sixteen times, and it is what
 * made a ninety-second film feel stately: a dissolve says "time is passing",
 * and this film wants to say "keep up". So the default is now a HARD CUT --
 * nothing at all, zero frames -- and everything below exists for the handful of
 * places where a cut needs help.
 *
 * The rule they follow: a transition should be doing narrative work or it
 * should not be there. `Flash` marks an arrival, `Whip` carries momentum
 * sideways between two views of the same thing, and `Defocus` survives only for
 * the three section changes where the film genuinely does change subject.
 */

/**
 * Two or three frames of light between shots.
 *
 * Almost subliminal, and it does two things at once: it hides the discontinuity
 * of a hard cut between dissimilar frames, and it reads as an impact. Long
 * enough to see is too long -- past about four frames it stops being a cut and
 * starts being an effect.
 */
export const Flash: React.FC<{ progress: number; tint?: string }> = ({
  progress,
  tint = "#DCE6FF",
}) => {
  const p = Math.min(Math.max(progress, 0), 1);
  if (p <= 0 || p >= 1) return null;
  // Sharp attack, quick decay -- a light source, not a fade.
  const a = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
  return (
    <AbsoluteFill style={{ background: tint, opacity: a * 0.9, pointerEvents: "none" }} />
  );
};

/**
 * A whip pan: the frame slides out under motion blur while the next slides in.
 *
 * Used only between two shots of the SAME screen, where the eye is being
 * carried from one part of it to another. Between unrelated screens it reads as
 * a slideshow transition, which is exactly the thing this is meant to avoid.
 */
export const Whip: React.FC<{
  progress: number;
  /** -1 slides left, 1 slides right. */
  direction?: number;
  incoming?: boolean;
  children: React.ReactNode;
}> = ({ progress, direction = 1, incoming = false, children }) => {
  // Unique per instance: the two halves of one whip are two Whips on screen at
  // once, and a shared filter id would make them share a blur amount.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = Math.min(Math.max(progress, 0), 1);
  // Blur peaks mid-move, so the frame is sharp at both ends of the whip.
  const blur = Math.sin(p * Math.PI) * 26;
  const shift = whipShift(p, direction, incoming);
  return (
    <AbsoluteFill style={{ transform: `translateX(${shift}%)` }}>
      {/*
        Blur along the axis of travel only.

        `filter: blur()` is isotropic, which is what a lens does when it loses
        focus and not what a camera does when it pans. The difference is the
        whole effect: a frame blurred equally in both directions reads as "out
        of focus", a frame blurred only horizontally reads as "moving fast".
        feGaussianBlur takes a two-number stdDeviation, so the vertical term
        is simply zero.
      */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id={`whip${uid}`} x="-10%" y="-2%" width="120%" height="104%">
          <feGaussianBlur stdDeviation={`${blur.toFixed(1)} 0`} />
        </filter>
      </svg>
      <AbsoluteFill style={{ filter: blur > 0.2 ? `url(#whip${uid})` : undefined }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The snap every shot opens on.
 *
 * A few frames of scale settling to 1. It is the single cheapest thing that
 * makes a hard cut feel deliberate rather than abrupt -- the frame arrives with
 * a little momentum and stops, the way a camera operator lands a move. Without
 * it a jump-cut sequence reads as a stack of stills.
 */
export const Punch: React.FC<{
  progress: number;
  /** How far in it starts, as a fraction. 0.05 is a firm punch. */
  amount?: number;
  children: React.ReactNode;
}> = ({ progress, amount = 0.045, children }) => {
  const p = Math.min(Math.max(progress, 0), 1);
  const eased = 1 - Math.pow(1 - p, 4);
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + amount * (1 - eased)})` }}>
      {children}
    </AbsoluteFill>
  );
};

/**
 * A dissolve where the outgoing layer defocuses and the incoming resolves.
 *
 * This is the transition that carries most of the film. A straight
 * cross-dissolve of two sharp images gives you a moment where both are legible
 * and neither is readable, which is the ugliest frame in any cut. Blurring the
 * one that is leaving means there is only ever one thing to read.
 */
export const Defocus: React.FC<{
  progress: number;
  /** true while this layer is the one arriving. */
  incoming?: boolean;
  maxBlur?: number;
  children: React.ReactNode;
}> = ({ progress, incoming = false, maxBlur = 18, children }) => {
  const p = Math.min(Math.max(progress, 0), 1);
  const t = incoming ? 1 - p : p;
  /*
    An arriving shot stays OPAQUE and resolves out of blur. It used to fade up
    from `opacity: p`, and that only looked like a cross-dissolve because a
    cross-dissolve needs two pictures -- there is only ever one here. Dissolves
    in this film sit at beat boundaries, where the outgoing shot belongs to the
    previous Beat and this one cannot reach it. So the layer underneath was not
    the shot being left, it was the background, and a partly transparent frame
    over a dark background is simply a dark frame.

    It was hidden rather than absent: with the old `arrive` easing, progress hit
    0.686 one frame in, so the dip lasted a frame and measured 37 luma. Pacing
    the transition properly across its frames exposed it at 136 -- the fix to
    the whip made this one visible, which is the useful kind of regression.

    Opacity pinned at 1, the transition rides blur and scale alone: a focus
    pull, which says "new subject" just as clearly and cannot show background
    at any progress or under any easing curve.
  */
  return (
    <AbsoluteFill
      style={{
        opacity: incoming ? 1 : 1 - p * 0.9,
        filter: `blur(${(t * maxBlur).toFixed(2)}px)`,
        transform: `scale(${1 + t * 0.035})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------- lights -- */

/**
 * The highlight that travels through the middle of the film.
 *
 * The argument in those four beats is that ONE entry from site moves through
 * the plan, the stock, the order and the cost. Four cuts with four captions
 * assert that; a lit rectangle that leaves one screen where it left off and
 * arrives on the next in the right place shows it, and is the only piece of
 * motion design here that is doing real narrative work.
 */
export const Marker: React.FC<{
  /** Fractions of the frame: 0..1 in each axis. */
  x: number;
  y: number;
  w: number;
  h: number;
  progress: number;
  label?: string;
}> = ({ x, y, w, h, progress, label }) => {
  const p = Math.min(Math.max(progress, 0), 1);
  // Draws on, holds, and does not draw off -- the cut takes it away.
  const draw = interpolate(p, [0, 0.22], [0, 1], { extrapolateRight: "clamp", easing: arrive });
  const glow = interpolate(p, [0, 0.3, 1], [0, 1, 0.72], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        border: `3px solid ${C.primary}`,
        borderRadius: 12,
        boxShadow: `0 0 0 6px rgba(29,78,216,${0.16 * glow}), 0 18px 60px rgba(29,78,216,${0.3 * glow})`,
        opacity: draw,
        transform: `scale(${0.985 + 0.015 * draw})`,
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            top: -34,
            left: -3,
            background: C.primary,
            color: C.white,
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "5px 11px",
            borderRadius: 7,
            opacity: draw,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
