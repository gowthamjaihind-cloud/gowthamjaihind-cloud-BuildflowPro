/**
 * The tempo grid the kinetic cut is built on.
 *
 * Every number in this file exists so that the picture and the score can be
 * laid out against the SAME grid rather than two grids that happen to be
 * close. The launch film established why that matters: a cut a frame either
 * side of the music reads as merely quick, while a cut on it reads as driven.
 * In a film whose shortest shot is 24 frames, one frame is 4% of a shot.
 *
 * 150 BPM is chosen for the PICTURE, not the music. At 30fps:
 *
 *     60 / 150 * 30 = 12.0 frames to the beat
 *     12 * 4        = 48   frames to the bar
 *
 * Both whole numbers, so a cut can land on a beat, a half-beat (6 frames) or
 * even a quarter-beat (3 frames) and still sit on a real frame. The obvious
 * "fast" tempos do not: 140 BPM gives 12.857 frames to the beat, so every
 * third cut lands off the music and no amount of rounding fixes it -- the
 * error accumulates across the film.
 *
 * `grid.test.ts` beside this file checks the arithmetic rather than trusting
 * the comment, because the failure is silent: a wrong BEAT still renders a
 * film, just one whose cuts drift against its own soundtrack.
 */

export const FPS = 30;

/** Beats per minute. Shared with marketing/music/score.py's `kinetic` cue. */
export const BPM = 150;

/** Frames per beat. Whole by construction -- see the note above. */
export const BEAT = (60 / BPM) * FPS;

/** Frames per bar, 4/4. */
export const BAR = BEAT * 4;

/**
 * Length in bars.
 *
 * 18 bars is 28.8 seconds. A hero film is watched with a cursor already
 * heading for the scroll bar, so the length is chosen against attention
 * rather than against how much there is to show: the 83-second silent cut
 * already exists for anyone who wants the long version, and this one has to
 * earn its first three seconds.
 */
export const BARS = 18;

export const KINETIC_FRAMES = BARS * BAR;

/** Seconds, for the score render -- which takes a duration, not a frame count. */
export const KINETIC_SECONDS = KINETIC_FRAMES / FPS;
