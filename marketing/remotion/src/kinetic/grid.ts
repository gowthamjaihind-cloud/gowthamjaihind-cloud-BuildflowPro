import film from "./film.json";
import { Film, layout } from "../../../kinetic-timeline";

/**
 * The tempo grid, and the timeline laid out on it.
 *
 * Every number the film runs on lives in film.json, not here. That file is read
 * by three things -- this composition, films/kinetic.mjs (which renders the
 * score) and marketing/kinetic.spec.ts -- and the reason it is JSON is that all
 * three can read it without any of them restating it. The first version of this
 * cut kept the tempo as TypeScript literals and the build script scraped them
 * out with a regex; adding scenes of different lengths made that untenable,
 * because the score has to know where every scene boundary falls in order to
 * put a whoosh on it.
 *
 * WHY 120 BPM. The first cut ran at 150 with a shot every two beats -- 0.8s --
 * and could not be read: a viewer got an impression of software and no idea
 * what any of it did. This cut gives each feature two or three BARS, sized to
 * how long its explainer takes to read, and 120 is chosen for the picture the
 * same way 150 was:
 *
 *     60 / 120 * 30 = 15 frames to the beat, 60 to the bar
 *
 * Both whole, so a scene boundary, a transition midpoint and a highlight cue
 * can all sit on real frames. 120 is also where most modern pop and house
 * sits, which matters for the score: it can stay driving while the picture
 * slows down, rather than the music slowing with it and the film going soft.
 */

export type { CameraKey, Enter, Film, Kind, MarkRect, Placed, Scene } from "../../../kinetic-timeline";

const L = layout(film as Film);

export const FPS = L.FPS;
export const BPM = L.BPM;
/** Frames per beat. Whole by construction -- see the spec. */
export const BEAT = L.BEAT;
/** Frames per bar, 4/4. */
export const BAR = L.BAR;
/**
 * Transition length. Two beats, centred ON the bar line: the outgoing scene
 * spends its last beat leaving and the incoming spends its first arriving, so
 * the moment the picture is half one thing and half the other lands exactly on
 * the downbeat the score marks with a whoosh.
 */
export const TRANSITION = L.TRANSITION;
export const HALF = L.HALF;
export const SCENES = L.SCENES;
export const FEATURES = L.FEATURES;
export const TIMELINE = L.TIMELINE;
export const KINETIC_FRAMES = L.KINETIC_FRAMES;
export const KINETIC_SECONDS = L.KINETIC_SECONDS;
