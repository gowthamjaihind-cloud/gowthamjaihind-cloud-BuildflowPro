import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

const rise = (frame: number, delay: number) => {
  const t = interpolate(frame, [delay, delay + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const e = 1 - Math.pow(1 - t, 3);
  return { opacity: e, transform: `translateY(${(1 - e) * 22}px)` };
};

/** A full-frame statement on solid ground. Type is never boxed or highlighted. */
export const TypeCard: React.FC<{
  lines: string[];
  sub?: string;
  accentLine?: number;
  align?: "left" | "center";
}> = ({ lines, sub, accentLine, align = "left" }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const size = width * 0.062;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.slate,
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start",
        padding: `0 ${width * 0.075}px`,
        fontFamily: FONT,
      }}
    >
      <div style={{ textAlign: align, maxWidth: "88%" }}>
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              ...rise(frame, i * 7),
              fontSize: size,
              lineHeight: 1.14,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: i === accentLine ? C.rust : C.ice,
            }}
          >
            {l}
          </div>
        ))}
        {sub ? (
          <div
            style={{
              ...rise(frame, lines.length * 7 + 4),
              marginTop: size * 0.42,
              fontSize: size * 0.34,
              lineHeight: 1.45,
              fontWeight: 500,
              color: C.sage,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/**
 * A caption over a screen: one full-bleed band across the foot of the frame,
 * not a coloured chip hugging the words. The generated version put every line
 * in its own swatch, which is what made it look cheap.
 */
export const Caption: React.FC<{
  label: string;
  title: string;
  note?: string;
}> = ({ label, title, note }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const inT = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const outT = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const o = Math.min(inT, outT);
  const pad = width * 0.05;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, justifyContent: "flex-end" }}>
      <div
        style={{
          width: "100%",
          background: C.slate,
          padding: `${height * 0.035}px ${pad}px ${height * 0.042}px`,
          opacity: o,
          transform: `translateY(${(1 - o) * 40}px)`,
        }}
      >
        <div
          style={{
            fontSize: width * 0.0125,
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.rust,
            marginBottom: height * 0.014,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: width * 0.036,
            fontWeight: 800,
            letterSpacing: "-0.015em",
            color: C.ice,
            lineHeight: 1.12,
          }}
        >
          {title}
        </div>
        {note ? (
          <div
            style={{
              marginTop: height * 0.016,
              fontSize: width * 0.0185,
              fontWeight: 500,
              color: C.sage,
              lineHeight: 1.4,
            }}
          >
            {note}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Closing card: the offer, held long enough to act on. */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const unit = width * 0.01;

  const Mark = () => (
    <div style={{ display: "flex", alignItems: "center", gap: unit * 1.6, ...rise(frame, 0) }}>
      <div
        style={{
          width: unit * 6,
          height: unit * 6,
          borderRadius: unit * 1.55,
          background: C.slateDeep,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: unit * 0.5,
          paddingBottom: unit * 1.5,
        }}
      >
        <div style={{ width: unit * 0.85, height: unit * 1.2, background: C.rust, borderRadius: unit * 0.3 }} />
        <div style={{ width: unit * 0.85, height: unit * 1.9, background: C.rust, borderRadius: unit * 0.3 }} />
        <div style={{ width: unit * 0.85, height: unit * 2.7, background: C.sage, borderRadius: unit * 0.3 }} />
      </div>
      <div style={{ fontSize: unit * 4.4, fontWeight: 800, color: C.ice, letterSpacing: "-0.02em" }}>
        Sitetru
      </div>
    </div>
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.slate,
        fontFamily: FONT,
        justifyContent: "center",
        padding: `0 ${width * 0.075}px`,
      }}
    >
      <Mark />
      <div
        style={{
          ...rise(frame, 8),
          marginTop: height * 0.045,
          fontSize: width * 0.042,
          fontWeight: 800,
          color: C.rust,
          letterSpacing: "-0.015em",
        }}
      >
        Truth, reported from site.
      </div>
      <div
        style={{
          ...rise(frame, 18),
          marginTop: height * 0.05,
          display: "flex",
          flexWrap: "wrap",
          gap: `${height * 0.022}px ${width * 0.028}px`,
          fontSize: width * 0.021,
          fontWeight: 700,
          color: C.ice,
        }}
      >
        <span>Free plan to start</span>
        <span style={{ color: C.sage }}>·</span>
        <span>From ₹999 / month</span>
        <span style={{ color: C.sage }}>·</span>
        <span>14-day trial, no card</span>
      </div>
      <div
        style={{
          ...rise(frame, 30),
          marginTop: height * 0.055,
          fontSize: width * 0.028,
          fontWeight: 800,
          color: C.sage,
          letterSpacing: "0.02em",
        }}
      >
        sitetru.com
      </div>
    </AbsoluteFill>
  );
};
