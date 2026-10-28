import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { arrive, ramp } from "../film/Cinema";
import { BEAT } from "./grid";
import { Mark } from "./Mark";
import { T } from "./palette";
import { Word, STAGGER } from "./Explainer";

/**
 * The opening and closing cards.
 *
 * Behind both, a WALL of the product: the real light-theme screens laid on a
 * tilted plane in perspective, drifting. It does in one held shot what the
 * first cut tried to do with sixteen hard cuts -- say "this is a whole system"
 * -- without asking the viewer to read any of it. The detail comes later, one
 * screen at a time; here it is texture, faded back behind a wash so the name
 * and the line sit on it rather than in it.
 */

const WALL = [
  "l-01-dashboard.png",
  "l-09-cost-management.png",
  "l-06-inventory.png",
  "l-02-insights.png",
  "l-07-procurement.png",
  "l-11-reports.png",
  "l-04-daily-logs.png",
  "l-10-client-estimates.png",
  "l-03-wbs.png",
  "l-08-consumption.png",
  "l-00-portfolio.png",
  "l-12-vault.png",
];

const TILE_W = 620;
const TILE_H = 388;
const GAP = 34;
const COLS = 4;

const Wall: React.FC<{ t: number; drift: number }> = ({ t, drift }) => {
  const rows = Math.ceil(WALL.length / COLS);
  const w = COLS * TILE_W + (COLS - 1) * GAP;
  const h = rows * TILE_H + (rows - 1) * GAP;
  const pan = t * drift;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: w,
          height: h,
          marginLeft: -w / 2,
          marginTop: -h / 2,
          transform: `perspective(2200px) rotateX(34deg) rotateZ(-13deg) scale(1.32) translate(${pan.toFixed(2)}px, ${(-pan * 0.45).toFixed(2)}px)`,
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, ${TILE_W}px)`,
          gap: GAP,
        }}
      >
        {WALL.map((src) => (
          <div
            key={src}
            style={{
              width: TILE_W,
              height: TILE_H,
              borderRadius: 20,
              overflow: "hidden",
              background: "#FFFFFF",
              boxShadow: "0 30px 60px rgba(15,23,42,0.14)",
            }}
          >
            <Img src={staticFile(src)} style={{ width: TILE_W, height: TILE_H, display: "block" }} />
          </div>
        ))}
      </div>
      {/* The wash. Strong in the middle where the type sits, lighter at the
          edges so the wall still reads as a wall. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 62% at 50% 50%, rgba(245,247,250,0.97) 0%, rgba(245,247,250,0.9) 46%, rgba(245,247,250,0.55) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const Title: React.FC<{ t: number; line: string; url?: string; closing?: boolean }> = ({
  t,
  line,
  url,
  closing = false,
}) => {
  // Intro: mark builds first, then the name, then the line. Closing: quicker,
  // because the viewer already knows whose film it is.
  const markAt = closing ? 4 : 10;
  const nameAt = closing ? 18 : BEAT * 2.5;
  const lineAt = closing ? 36 : BEAT * 4.5;
  const name = ramp(t, [nameAt, nameAt + BEAT], arrive);
  const urlP = ramp(t, [lineAt + 40, lineAt + 56], arrive);
  const words = line.split(" ");

  return (
    <AbsoluteFill>
      <Wall t={t} drift={closing ? -0.35 : 0.35} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 34,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Mark size={150} at={markAt} t={t} />
          <div
            style={{
              fontSize: 118,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              color: T.text,
              clipPath: `inset(-10% ${((1 - name) * 100).toFixed(2)}% -10% 0)`,
              transform: `translateX(${((1 - name) * -24).toFixed(2)}px)`,
            }}
          >
            Sitetru
          </div>
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 650,
            letterSpacing: "-0.018em",
            color: T.text,
            textAlign: "center",
            maxWidth: 1200,
          }}
        >
          {words.map((w, i) => (
            <Word key={i} w={w} t={t} at={lineAt + i * STAGGER * 1.2} />
          ))}
        </div>
        {url && (
          <div
            style={{
              marginTop: 8,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: T.accent,
              opacity: urlP,
              transform: `translateY(${((1 - urlP) * 14).toFixed(2)}px)`,
            }}
          >
            {url}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
