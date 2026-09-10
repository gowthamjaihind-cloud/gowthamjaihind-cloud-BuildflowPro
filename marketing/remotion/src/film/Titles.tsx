import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { Grain, Vignette, arrive, ramp } from "./Cinema";

/**
 * The type in the film.
 *
 * One rule throughout: a line of type arrives from behind its own baseline,
 * masked, one line at a time. It is the oldest title-sequence move there is and
 * it works for the same reason it always did -- the reveal happens at the
 * bottom edge of the text, so the eye starts reading before the line has
 * finished arriving. Fading a whole paragraph up instead gives the viewer
 * nothing to follow and reads as a slide.
 */

const MaskedLine: React.FC<{
  children: React.ReactNode;
  delay: number;
  size: number;
  weight?: number;
  colour?: string;
  lineHeight?: number;
}> = ({ children, delay, size, weight = 800, colour = C.white, lineHeight = 1.08 }) => {
  const frame = useCurrentFrame();
  // Nine frames -- a half-beat at 100 BPM. It was 26, which is nearly a second
  // for a line of type and reads as a title card easing in rather than a cut
  // landing on the music.
  const p = ramp(frame, [delay, delay + 9], arrive);
  return (
    <div style={{ overflow: "hidden", paddingBottom: size * 0.06 }}>
      <div
        style={{
          transform: `translateY(${(1 - p) * size * 1.05}px)`,
          opacity: p,
          fontFamily: FONT,
          fontSize: size,
          fontWeight: weight,
          lineHeight,
          letterSpacing: size > 60 ? "-0.028em" : "-0.012em",
          color: colour,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** A full-frame statement on navy. The film's three cold-open beats and its thesis. */
export const Statement: React.FC<{
  lines: string[];
  sub?: string;
  /** Index of the line to set in the accent colour. */
  accent?: number;
  /** Small label above, for the beats that want one. */
  kicker?: string;
  size?: number;
}> = ({ lines, sub, accent, kicker, size = 78 }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  // A very slow push, so a card of pure type is never completely static.
  // A faster drift than before: these cards are on screen for a beat or two now.
  const scale = 1 + ramp(frame, [0, 90]) * 0.022;
  return (
    <AbsoluteFill style={{ backgroundColor: C.surfaceDark }}>
      {/* A soft light from above left, so the ground is not a flat fill. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(90% 70% at 22% -8%, rgba(29,78,216,0.34) 0%, rgba(18,32,63,0) 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: `0 ${width * 0.09}px`,
          transform: `scale(${scale})`,
        }}
      >
        {kicker ? (
          <div style={{ overflow: "hidden", marginBottom: 26 }}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: C.primaryOnDark,
                opacity: ramp(frame, [0, 8], arrive),
              }}
            >
              {kicker}
            </div>
          </div>
        ) : null}
        {lines.map((line, i) => (
          <MaskedLine
            key={i}
            delay={2 + i * 5}
            size={size}
            colour={i === accent ? C.primaryOnDark : C.white}
          >
            {line}
          </MaskedLine>
        ))}
        {sub ? (
          <div style={{ marginTop: 30, maxWidth: width * 0.56 }}>
            <MaskedLine
              delay={4 + lines.length * 5}
              size={28}
              weight={500}
              colour="#B6C4DE"
              lineHeight={1.5}
            >
              {sub}
            </MaskedLine>
          </div>
        ) : null}
      </AbsoluteFill>
      <Vignette strength={0.42} />
      <Grain />
    </AbsoluteFill>
  );
};

/**
 * The mark, drawn rather than placed.
 *
 * Three bars rising to different heights, which is the actual logo in
 * src/components/BrandLogo.tsx -- a bar chart in a cobalt tile. Building it
 * from divs instead of dropping the SVG in means the bars can grow on the
 * beat, and it stays the same drawing in both places because the geometry is
 * copied from the same source.
 */
export const Mark: React.FC<{ unit: number; progress: number }> = ({ unit, progress }) => {
  // Heights are the SVG's, as fractions of the 512 tile: 104, 164, 236 tall.
  const bars = [104, 164, 236].map((h) => h / 512);
  return (
    <div
      style={{
        width: unit,
        height: unit,
        borderRadius: unit * 0.226, // rx 116 / 512
        background: C.primary,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: unit * 0.027,
        paddingBottom: unit * 0.266,
        boxShadow: `0 ${unit * 0.09}px ${unit * 0.26}px rgba(29,78,216,0.42)`,
      }}
    >
      {bars.map((h, i) => {
        const p = Math.min(Math.max((progress - i * 0.12) / 0.5, 0), 1);
        const eased = 1 - Math.pow(1 - p, 3);
        return (
          <div
            key={i}
            style={{
              width: unit * 0.141,
              height: unit * h * eased,
              background: C.white,
              borderRadius: unit * 0.043,
            }}
          />
        );
      })}
    </div>
  );
};

/** The title beat: the mark builds, the wordmark arrives beside it. */
export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const build = ramp(frame, [1, 20], arrive);
  const word = ramp(frame, [7, 24], arrive);
  const unit = height * 0.17;
  return (
    <AbsoluteFill style={{ backgroundColor: C.surfaceDark }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(70% 60% at 50% 42%, rgba(29,78,216,0.40) 0%, rgba(18,32,63,0) 68%)`,
          opacity: build,
        }}
      />
      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: unit * 0.34 }}
      >
        <Mark unit={unit} progress={build} />
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: FONT,
              fontSize: unit * 0.72,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: C.white,
              transform: `translateY(${(1 - word) * unit * 0.5}px)`,
              opacity: word,
            }}
          >
            Sitetru
          </div>
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: height * 0.17,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: C.primaryOnDark,
          opacity: ramp(frame, [22, 34], arrive),
        }}
      >
        Construction management, reported from site
      </div>
      <Vignette strength={0.4} />
      <Grain />
    </AbsoluteFill>
  );
};

/** The last frame: mark, price, address. Nothing else. */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const build = ramp(frame, [1, 22], arrive);
  const unit = height * 0.13;
  return (
    <AbsoluteFill style={{ backgroundColor: C.surfaceDark }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(75% 65% at 50% 40%, rgba(29,78,216,0.42) 0%, rgba(18,32,63,0) 70%)`,
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: unit * 0.42 }}>
        <div style={{ display: "flex", alignItems: "center", gap: unit * 0.3 }}>
          <Mark unit={unit} progress={build} />
          <div
            style={{
              fontFamily: FONT,
              fontSize: unit * 0.68,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: C.white,
              opacity: ramp(frame, [8, 24], arrive),
            }}
          >
            Sitetru
          </div>
        </div>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 30,
            fontWeight: 600,
            color: "#B6C4DE",
            opacity: ramp(frame, [20, 34], arrive),
          }}
        >
          Free to start · ₹999/month · English &amp; தமிழ்
        </div>
        <div
          style={{
            marginTop: unit * 0.16,
            fontFamily: FONT,
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: "0.02em",
            color: C.primaryOnDark,
            opacity: ramp(frame, [30, 46], arrive),
          }}
        >
          sitetru.com
        </div>
      </AbsoluteFill>
      <Vignette strength={0.38} />
      <Grain />
    </AbsoluteFill>
  );
};
