import React from "react";
import { arrive, ramp } from "../film/Cinema";
import { T } from "./palette";

/**
 * The explainer column: which chapter this is, what the feature is called, and
 * one sentence saying what it does.
 *
 * Every sentence here is the app's OWN description of that screen -- the line
 * printed under each page title ("What's in stock, what's running out.") -- so
 * the film explains the product in the product's words and invents nothing.
 * kinetic.spec.ts checks each one against the app source.
 *
 * The sentence is revealed word by word because that is how it is read. A line
 * that appears whole is read at the reader's pace, which in a film is a race
 * against the next transition; a line that arrives at reading speed sets the
 * pace for them, and finishes arriving well before it has to leave.
 */

export const COLUMN = 520;

/** Frames between one word starting and the next. ~4 words a second. */
const STAGGER = 2.5;
/** Frames one word takes to settle. */
const SETTLE = 14;

const Word: React.FC<{ w: string; t: number; at: number }> = ({ w, t, at }) => {
  const p = ramp(t, [at, at + SETTLE], arrive);
  return (
    <span
      style={{
        display: "inline-block",
        marginRight: "0.26em",
        opacity: p,
        transform: `translateY(${((1 - p) * 26).toFixed(2)}px)`,
        filter: p < 0.99 ? `blur(${((1 - p) * 8).toFixed(2)}px)` : undefined,
      }}
    >
      {w}
    </span>
  );
};

export const Explainer: React.FC<{
  t: number;
  side: "left" | "right";
  chapter: number;
  total: number;
  kicker: string;
  line?: string;
  chips?: string[];
}> = ({ t, side, chapter, total, kicker, line, chips }) => {
  const head = ramp(t, [-4, 10], arrive);
  const rule = ramp(t, [0, 14], arrive);
  const words = line ? line.split(" ") : [];
  // Long sentences step down a size rather than running to six lines.
  const size = line && line.length > 62 ? 44 : 54;
  const n = (i: number) => String(i).padStart(2, "0");

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: COLUMN,
        left: side === "left" ? 70 : undefined,
        right: side === "right" ? 70 : undefined,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 22,
        paddingBottom: 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: head }}>
        <div style={{ height: 3, width: 46 * rule, background: T.accent, borderRadius: 2 }} />
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 600,
            fontSize: 19,
            letterSpacing: "0.08em",
            color: T.muted,
          }}
        >
          {n(chapter)} / {n(total)}
        </div>
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: T.accent,
          opacity: head,
          transform: `translateY(${((1 - head) * 12).toFixed(2)}px)`,
        }}
      >
        {kicker}
      </div>

      {words.length > 0 && (
        <div
          style={{
            fontSize: size,
            fontWeight: 750,
            lineHeight: 1.13,
            letterSpacing: "-0.022em",
            color: T.text,
          }}
        >
          {words.map((w, i) => (
            <Word key={i} w={w} t={t} at={4 + i * STAGGER} />
          ))}
        </div>
      )}

      {chips && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          {chips.map((c, i) => {
            const p = ramp(t, [10 + i * 9, 10 + i * 9 + 14], arrive);
            return (
              <div
                key={c}
                style={{
                  padding: "16px 28px",
                  borderRadius: 999,
                  background: "#FFFFFF",
                  border: `2px solid rgba(29,78,216,0.22)`,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                  color: T.text,
                  fontSize: 36,
                  fontWeight: 750,
                  letterSpacing: "-0.015em",
                  opacity: p,
                  transform: `translateX(${((1 - p) * (side === "left" ? -30 : 30)).toFixed(2)}px) scale(${(0.9 + 0.1 * p).toFixed(4)})`,
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export { Word, STAGGER };
