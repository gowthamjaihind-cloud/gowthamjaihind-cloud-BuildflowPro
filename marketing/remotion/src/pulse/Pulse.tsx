import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, SRC_H, SRC_W } from "../theme";
import { Fonts } from "../film/Fonts";
import { arrive, Grain, ramp, smooth } from "../film/Cinema";
import { Mark } from "../kinetic/Mark";
import film from "./pulse.json";

/**
 * Pulse: the fast cut. 40 seconds, 120 BPM, every cut on a beat.
 *
 * The kinetic cut explains (a scene per feature, a sentence to read); this one
 * SELLS, at the pace of a product-launch spot: two beats a feature, then a
 * second drop of one-beat punches into the real figures on real screens.
 * Nothing on screen is invented -- every frame is a screenshot of the demo
 * build or the film's own type, and the words are the app's own (module names,
 * "Preview first", "Nothing is saved until you confirm").
 *
 * pulse.json is the single timeline. The score (music/score.py, cue "pulse")
 * reads the same file through films/pulse.mjs, so its kick, impacts and
 * whooshes land on these cuts by construction rather than by alignment.
 */

type Cam = [number, number, number]; // cx, cy, visible source width
type Fx = "punch" | "whipL" | "whipR" | "zoom" | "spin" | "glitch" | "flash" | "rise" | "stutter";
interface Shot {
  kind: "type" | "logo" | "card" | "full" | "phones" | "end";
  beats: number;
  fx?: Fx;
  text?: string;
  sub?: string;
  word?: string;
  src?: string;
  from?: Cam;
  to?: Cam;
  images?: string[];
  style?: "outline" | "invert" | "accent";
  hit?: boolean;
  breakdown?: boolean;
}

export const PULSE_FPS = film.fps;
export const BEAT = (60 / film.bpm) * film.fps; // 15 frames
const SHOTS = film.shots as Shot[];
export const PULSE_FRAMES = SHOTS.reduce((n, s) => n + s.beats * BEAT, 0);

/** Start frame of every shot. */
const STARTS = SHOTS.reduce<number[]>((a, s, i) => (a.push(i ? a[i - 1] + SHOTS[i - 1].beats * BEAT : 0), a), []);

const NAVY = "#0A1430";
const GROUND = `radial-gradient(120% 90% at 50% 35%, ${C.surfaceDark} 0%, ${NAVY} 70%)`;
const SANS = 'Manrope, "Helvetica Neue", Arial, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const clamp = (x: number, a = 0, b = 1) => Math.min(Math.max(x, a), b);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** How a shot arrives, over its first frames. Returns transform/filter for the shot layer. */
function enter(fx: Fx | undefined, f: number, w: number): { transform: string; filter?: string; opacity?: number } {
  const p = (n: number) => arrive(clamp(f / n));
  switch (fx) {
    case "punch": {
      const e = p(7);
      return { transform: `scale(${lerp(1.22, 1, e)})`, filter: e < 1 ? `blur(${((1 - e) * 10).toFixed(1)}px)` : undefined };
    }
    case "whipL":
    case "whipR": {
      const e = p(6);
      const d = fx === "whipL" ? -1 : 1;
      return {
        transform: `translateX(${(d * (1 - e) * w * 0.55).toFixed(1)}px) skewX(${(d * (1 - e) * -8).toFixed(2)}deg)`,
        filter: e < 1 ? `blur(${((1 - e) * 26).toFixed(1)}px)` : undefined,
      };
    }
    case "zoom": {
      const e = p(9);
      return { transform: `scale(${lerp(0.55, 1, e)}) rotate(${lerp(-6, 0, e)}deg)`, opacity: clamp(f / 4) };
    }
    case "spin": {
      const e = p(9);
      return { transform: `perspective(1600px) rotateY(${lerp(-55, 0, e)}deg) scale(${lerp(0.8, 1, e)})`, opacity: clamp(f / 3) };
    }
    case "rise": {
      const e = p(10);
      return { transform: `translateY(${((1 - e) * 120).toFixed(1)}px)`, opacity: clamp(f / 6) };
    }
    case "glitch": {
      // Chromatic split and a sideways jitter for five frames, then clean.
      if (f >= 6) return { transform: "none" };
      const jit = [18, -26, 12, -8, 4, 0][f] ?? 0;
      const s = 14 - f * 2.4;
      return {
        transform: `translateX(${jit}px) skewX(${(jit / 6).toFixed(1)}deg)`,
        filter: `drop-shadow(${s}px 0 0 rgba(255,40,110,0.85)) drop-shadow(${-s}px 0 0 rgba(0,210,255,0.85))`,
      };
    }
    case "stutter": {
      // Three steps in, one every third of a beat.
      const step = Math.min(Math.floor(f / (BEAT / 3)), 2);
      return { transform: `scale(${[1, 1.16, 1.34][step]})` };
    }
    default:
      return { transform: "none" };
  }
}

/** A small kick on every beat: the picture breathes with the four-on-the-floor. */
const beatBump = (frame: number) => {
  const ph = (frame % BEAT) / BEAT;
  return 1 + 0.018 * Math.exp(-ph * 9);
};

/** The screenshot through a camera, filling a box of size bw x bh. */
const Shot: React.FC<{ src: string; cam: Cam; bw: number; bh: number }> = ({ src, cam, bw, bh }) => {
  const [cx, cy, vw] = cam;
  // Fit the requested width, but never show past the screenshot's edge.
  const scale = Math.max(bw / vw, bw / SRC_W, bh / SRC_H);
  const left = clamp(bw / 2 - cx * scale, bw - SRC_W * scale, 0);
  const top = clamp(bh / 2 - cy * scale, bh - SRC_H * scale, 0);
  return (
    <Img
      src={staticFile(src)}
      style={{ position: "absolute", left, top, width: SRC_W * scale, height: SRC_H * scale, maxWidth: "none" }}
    />
  );
};

const camAt = (from: Cam | undefined, to: Cam, t: number): Cam => {
  if (!from) return to;
  const e = smooth(clamp(t));
  return [lerp(from[0], to[0], e), lerp(from[1], to[1], e), lerp(from[2], to[2], e)];
};

/** Per-letter rise for kinetic type. */
const Letters: React.FC<{ text: string; f: number; size: number; style?: Shot["style"]; color: string }> = ({ text, f, size, style, color }) => (
  <span style={{ display: "inline-block", whiteSpace: "pre" }}>
    {[...text].map((ch, i) => {
      const e = arrive(clamp((f - i * 0.8) / 7));
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            transform: `translateY(${((1 - e) * size * 0.55).toFixed(1)}px)`,
            opacity: e,
            color: style === "outline" ? "transparent" : color,
            WebkitTextStroke: style === "outline" ? `${Math.max(2, size / 36)}px ${color}` : undefined,
          }}
        >
          {ch}
        </span>
      );
    })}
  </span>
);

const Word: React.FC<{ word: string; sub?: string; f: number; tall: boolean; w: number }> = ({ word, sub, f, tall, w }) => {
  const size = tall ? Math.min(150, (w * 1.55) / Math.max(word.length, 4)) : 168;
  const subIn = arrive(clamp((f - 4) / 8));
  return (
    <div
      style={{
        position: "absolute",
        left: tall ? 60 : 96,
        right: tall ? 60 : undefined,
        bottom: tall ? undefined : 70,
        top: tall ? 150 : undefined,
        fontFamily: SANS,
        textShadow: "0 10px 40px rgba(5,10,30,0.55)",
      }}
    >
      {sub && (
        <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: tall ? 30 : 30, letterSpacing: 2, color: C.primaryOnDark, opacity: subIn, transform: `translateX(${(1 - subIn) * -30}px)`, marginBottom: 6, textTransform: "uppercase" }}>
          {sub}
        </div>
      )}
      <div style={{ fontWeight: 800, fontSize: size, lineHeight: 0.92, letterSpacing: -size * 0.035, color: C.white }}>
        <Letters text={word} f={f} size={size} color={C.white} />
      </div>
    </div>
  );
};

const CardShot: React.FC<{ s: Shot; f: number; len: number; w: number; h: number }> = ({ s, f, len, w, h }) => {
  const tall = h > w;
  const bw = tall ? w - 120 : w * 0.8;
  const bh = tall ? h * 0.6 : h * 0.66;
  // A phone-width card cannot hold the app's full width legibly: frame tighter
  // on the same target in the tall cut.
  const raw = camAt(s.from, s.to!, f / len);
  const cam: Cam = tall ? [raw[0], raw[1], raw[2] * 0.5] : raw;
  const drift = (f / len) * (tall ? 0 : 1);
  return (
    <AbsoluteFill style={{ background: GROUND }}>
      <div
        style={{
          position: "absolute",
          width: bw,
          height: bh,
          left: tall ? 60 : w * 0.17 - drift * 14,
          top: tall ? h * 0.3 : h * 0.06,
          borderRadius: 28,
          overflow: "hidden",
          background: C.page,
          boxShadow: "0 50px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
          transform: tall ? undefined : `perspective(2200px) rotateY(${lerp(-7, -3, f / len).toFixed(2)}deg)`,
        }}
      >
        <Shot src={s.src!} cam={cam} bw={bw} bh={bh} />
      </div>
      {s.word && <Word word={s.word} sub={s.sub} f={f} tall={tall} w={w} />}
    </AbsoluteFill>
  );
};

const FullShot: React.FC<{ s: Shot; f: number; len: number; w: number; h: number }> = ({ s, f, len, w, h }) => {
  const [cx, cy, vw] = s.to!;
  // A slow push through the beat, so even a half-second shot is moving.
  const cam: Cam = [cx, cy, vw * lerp(1.08, 0.94, f / len)];
  return (
    <AbsoluteFill style={{ background: C.page }}>
      <Shot src={s.src!} cam={cam} bw={w} bh={h} />
      <AbsoluteFill style={{ background: "radial-gradient(90% 80% at 50% 50%, transparent 55%, rgba(10,20,48,0.35) 100%)" }} />
    </AbsoluteFill>
  );
};

const TypeShot: React.FC<{ s: Shot; f: number; w: number; h: number }> = ({ s, f, w, h }) => {
  const tall = h > w;
  const bg = s.style === "invert" ? C.page : s.style === "accent" ? C.primary : GROUND;
  const color = s.style === "invert" ? C.ink : C.white;
  const size = Math.min(tall ? 190 : 230, (w * (tall ? 1.6 : 1.25)) / Math.max(s.text!.length, 5));
  const subIn = arrive(clamp((f - 10) / 10));
  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", fontFamily: SANS, textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: size, letterSpacing: -size * 0.04, lineHeight: 1 }}>
        <Letters text={s.text!} f={f} size={size} style={s.style} color={color} />
      </div>
      {s.sub && (
        <div style={{ marginTop: 34, fontSize: tall ? 40 : 44, fontWeight: 600, color: s.style === "invert" ? C.inkMuted : C.primaryOnDark, opacity: subIn, transform: `translateY(${(1 - subIn) * 20}px)`, padding: "0 60px" }}>
          {s.sub}
        </div>
      )}
    </AbsoluteFill>
  );
};

const LogoShot: React.FC<{ f: number; w: number; h: number; end?: boolean }> = ({ f, w, h, end }) => {
  const tall = h > w;
  const size = tall ? 260 : 230;
  const word = arrive(clamp((f - 8) / 10));
  const line = arrive(clamp((f - 18) / 10));
  const url = arrive(clamp((f - 34) / 12));
  return (
    <AbsoluteFill style={{ background: GROUND, alignItems: "center", justifyContent: "center", fontFamily: SANS, flexDirection: "column", gap: 26 }}>
      <Mark size={size} t={f} at={0} rise={BEAT * 0.6} stagger={BEAT * 0.25} />
      <div style={{ fontWeight: 800, fontSize: tall ? 150 : 170, letterSpacing: -6, color: C.white, opacity: word, transform: `translateY(${(1 - word) * 40}px)` }}>Sitetru</div>
      <div style={{ fontWeight: 600, fontSize: tall ? 46 : 50, color: C.primaryOnDark, opacity: line, transform: `translateY(${(1 - line) * 24}px)` }}>
        Truth, reported from site.
      </div>
      {end && (
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: url, transform: `translateY(${(1 - url) * 24}px)` }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: tall ? 54 : 58, color: C.white, padding: "14px 34px", borderRadius: 18, background: C.primary }}>sitetru.com</div>
          <div style={{ fontSize: tall ? 34 : 36, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>14-day free trial · no card needed</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const PhonesShot: React.FC<{ s: Shot; f: number; len: number; w: number; h: number }> = ({ s, f, len, w, h }) => {
  const tall = h > w;
  const pw = tall ? w * 0.6 : w * 0.24;
  return (
    <AbsoluteFill style={{ background: GROUND }}>
      {s.images!.map((img, i) => {
        const e = arrive(clamp((f - i * 3) / 9));
        const x = tall ? (i ? w * 0.34 : w * 0.06) : w * (0.47 + i * 0.24);
        const y = tall ? (i ? h * 0.47 : h * 0.3) : h * (0.1 + i * 0.07);
        return (
          <div
            key={img}
            style={{
              position: "absolute", left: x, top: y + (1 - e) * 260 - (f / len) * 24 * (i ? 1 : -1), width: pw,
              borderRadius: 44, overflow: "hidden", background: "#fff", opacity: e,
              boxShadow: "0 40px 100px rgba(0,0,0,0.55), 0 0 0 10px #050A1A",
              transform: `rotate(${(i ? 4 : -5) * (1 - 0.3 * e)}deg)`,
            }}
          >
            <Img src={staticFile(img)} style={{ width: "100%", display: "block" }} />
          </div>
        );
      })}
      {s.word && <Word word={s.word} sub={s.sub} f={f} tall={tall} w={w} />}
    </AbsoluteFill>
  );
};

export const Pulse: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  const i = Math.max(0, STARTS.findIndex((st, k) => frame >= st && frame < st + SHOTS[k].beats * BEAT));
  const s = SHOTS[i];
  const f = frame - STARTS[i];
  const len = s.beats * BEAT;
  const fx = enter(s.fx, f, w);
  const bump = s.kind === "type" && s.style !== "accent" && i < 4 ? 1 : beatBump(frame);

  let body: React.ReactNode = null;
  if (s.kind === "card") body = <CardShot s={s} f={f} len={len} w={w} h={h} />;
  else if (s.kind === "full") body = <FullShot s={s} f={f} len={len} w={w} h={h} />;
  else if (s.kind === "type") body = <TypeShot s={s} f={f} w={w} h={h} />;
  else if (s.kind === "logo") body = <LogoShot f={f} w={w} h={h} />;
  else if (s.kind === "end") body = <LogoShot f={f} w={w} h={h} end />;
  else if (s.kind === "phones") body = <PhonesShot s={s} f={f} len={len} w={w} h={h} />;

  // A white frame on every impact, fading over four frames.
  const flash = (s.fx === "flash" || s.hit) ? Math.max(0, 1 - f / 4) * (s.fx === "flash" ? 1 : 0.55) : 0;
  // The film's progress, as a hairline: the one constant across 40 cuts.
  const progress = frame / PULSE_FRAMES;

  return (
    <AbsoluteFill style={{ background: NAVY, overflow: "hidden" }}>
      <Fonts />
      <AbsoluteFill style={{ transform: `${fx.transform} scale(${bump.toFixed(4)})`, filter: fx.filter, opacity: fx.opacity ?? 1 }}>
        {body}
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
      <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(progress * 100).toFixed(2)}%`, background: C.primary }} />
      <Grain opacity={0.05} />
    </AbsoluteFill>
  );
};

/** Cut times and impacts, for the score. */
export const pulseTimeline = () => ({
  cuts: STARTS.slice(1).map((st) => st / PULSE_FPS),
  hits: SHOTS.map((s, k) => (s.hit ? STARTS[k] / PULSE_FPS : null)).filter((x): x is number => x !== null),
});

// Keep `ramp` referenced for parity with the other films' imports.
void ramp;
