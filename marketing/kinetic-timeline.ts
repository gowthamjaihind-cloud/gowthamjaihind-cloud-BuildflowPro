/**
 * The kinetic cut's timeline arithmetic, as a pure function of the film data.
 *
 * WHY IT LIVES HERE, beside whip.ts, rather than in remotion/src/kinetic: the
 * same reason whip.ts does, and its header says it better -- the root tsconfig
 * excludes marketing/remotion because that package carries its own React 19
 * types, and `exclude` only filters which files SEED the program, not what they
 * import. A root-level test that imports ANY module from inside the package
 * resolves `react/jsx-runtime` from the package's node_modules, and the app
 * stops type-checking in files nobody touched (`src/App.tsx`, Phosphor icons'
 * `className`).
 *
 * This was relearned the slow way: marketing/kinetic.spec.ts first imported
 * grid.ts from inside the package and broke the app's typecheck. The data stays
 * in remotion/src/kinetic/film.json; grid.ts feeds it to `layout` for the
 * composition, and the spec reads it with fs and calls the same function.
 */

export type Kind = "title" | "phones" | "screen";
export type Enter = "push" | "zoom" | "rise" | "iris";

export interface CameraKey {
  at: number;
  cx: number;
  cy: number;
  w: number;
}
export interface MarkRect {
  at: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** For phone scenes: which image the rect is in. */
  image?: number;
}
export interface Scene {
  id: string;
  kind: Kind;
  bars: number;
  enter?: Enter;
  irisFrom?: [number, number];
  kicker?: string;
  line?: string;
  /** The narration for this scene. Must fit inside it; see films/kinetic.mjs. */
  vo?: string;
  chips?: string[];
  url?: string;
  src?: string;
  images?: string[];
  camera?: CameraKey[];
  marks?: MarkRect[];
}
export interface Film {
  fps: number;
  bpm: number;
  transitionBeats: number;
  /** Kokoro voice, Indian-English accent level (voice/accent.py), and pace. */
  voice?: { name?: string; accent?: "light" | "full"; speed?: number };
  /**
   * When the picture's own effects happen, in frames from their scene's start.
   * Held here rather than as constants in the components because the music-only
   * version puts a sound on each one, and a second copy of a timing in the build
   * script is a timing that drifts.
   */
  effects: {
    logo: { intro: number; outro: number; stagger: number };
    name: { intro: number; outro: number };
    chips: { at: number; stagger: number };
  };
  scenes: Scene[];
}

/** A scene placed on the timeline, in frames. */
export interface Placed extends Scene {
  index: number;
  start: number;
  dur: number;
  /** 1-based index among the feature scenes; undefined for titles. */
  chapter?: number;
  /** The NEXT scene's entry, which decides how this one leaves. */
  exit?: Enter;
}

export function layout(film: Film) {
  const FPS = film.fps;
  const BPM = film.bpm;
  const BEAT = (60 / BPM) * FPS;
  const BAR = BEAT * 4;
  const TRANSITION = BEAT * film.transitionBeats;
  const HALF = TRANSITION / 2;
  const SCENES = film.scenes;
  const FEATURES = SCENES.filter((s) => s.kind !== "title").length;

  let at = 0;
  let chapter = 0;
  const TIMELINE: Placed[] = SCENES.map((s, i) => {
    const placed: Placed = {
      ...s,
      index: i,
      start: at,
      dur: s.bars * BAR,
      chapter: s.kind === "title" ? undefined : ++chapter,
      exit: SCENES[i + 1]?.enter,
    };
    at += s.bars * BAR;
    return placed;
  });
  const KINETIC_FRAMES = TIMELINE.reduce((n, s) => n + s.dur, 0);
  return {
    FPS, BPM, BEAT, BAR, TRANSITION, HALF, SCENES, FEATURES, TIMELINE,
    EFFECTS: film.effects,
    KINETIC_FRAMES,
    KINETIC_SECONDS: KINETIC_FRAMES / FPS,
  };
}
