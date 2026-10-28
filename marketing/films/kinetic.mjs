#!/usr/bin/env node
/**
 * Build the kinetic cut: score -> picture -> mux.
 *
 *   node marketing/films/kinetic.mjs
 *   node marketing/films/kinetic.mjs --preview      # half scale, for framing
 *
 * Unlike `film:launch`, there is no voice step. That removes the whole timing
 * problem the other two films have -- nothing here is laid out from measured
 * narration, because nothing is narrated. The picture and the score are both
 * derived from ONE timeline, film.json, so the only thing that has to agree is
 * the arithmetic, and this script reads it from there rather than repeating
 * it -- including the transition points the score puts its whooshes on. A film whose score is rendered a bar longer than its picture
 * is the exact failure mix.mjs documents: the audio graph ends early and ffmpeg
 * silently trims the end card.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const REMOTION = join(ROOT, "marketing/remotion");
const OUT = join(REMOTION, "out");

/**
 * The timeline, read from film.json -- the same file the composition renders.
 *
 * Two copies of the timing is how a score comes out a bar longer than its film,
 * and the symptom -- a truncated end card -- points at ffmpeg rather than at the
 * number that is actually wrong. The first version of this scraped literals out
 * of grid.ts with a regex, which held while every shot was the same length.
 * The second edit has scenes of two and three bars, and the score needs to know
 * where each boundary falls to put a whoosh on it; JSON both sides can parse is
 * the only form of that which cannot drift.
 */
export function readGrid(src = readFileSync(join(REMOTION, "src/kinetic/film.json"), "utf8")) {
  const film = JSON.parse(src);
  const { fps, bpm } = film;
  const beat = (60 / bpm) * fps;
  if (!Number.isInteger(beat)) {
    throw new Error(
      `${bpm} BPM at ${fps}fps gives ${beat} frames to the beat. ` +
        "Scenes and transitions are placed on beats, so a fractional beat puts " +
        "every boundary a little off the music. Pick a tempo where 60/bpm*fps is whole.",
    );
  }
  const bar = beat * 4;
  const bars = film.scenes.reduce((n, s) => n + s.bars, 0);
  // Transition midpoints, in seconds: every scene boundary except the ends.
  const marks = [];
  let at = 0;
  for (const s of film.scenes.slice(0, -1)) {
    at += s.bars * bar;
    marks.push(at / fps);
  }
  const frames = bars * bar;
  return { fps, bpm, bars, beat, bar, frames, seconds: frames / fps, marks };
}

/**
 * Find a Chromium that Remotion can drive.
 *
 * Hardcoding this path is what the README used to do, and it broke: the
 * sandbox moved from chromium-1194 to chromium-1243 and changed the directory
 * layout underneath at the same time (`chrome-linux/headless_shell` became
 * `chrome-headless-shell-linux64/chrome-headless-shell`). A glob survives both.
 * CHROME_PATH still wins, for a machine that keeps its browser elsewhere.
 */
export function findChromium(base = "/opt/pw-browsers") {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (!existsSync(base)) return null;
  const candidates = [];
  for (const dir of readdirSync(base)) {
    const d = join(base, dir);
    let inner;
    try {
      inner = readdirSync(d);
    } catch {
      continue;
    }
    for (const sub of inner) {
      for (const bin of ["chrome-headless-shell", "headless_shell", "chrome"]) {
        const p = join(d, sub, bin);
        // Headless shell first: Remotion passes the old --headless flag, which
        // current full Chrome builds reject outright.
        if (existsSync(p)) candidates.push({ p, rank: bin === "chrome" ? 1 : 0 });
      }
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates.length ? candidates[0].p : null;
}

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);

/**
 * Run ffmpeg and return what it wrote to STDERR.
 *
 * Every report ffmpeg prints -- loudnorm's included -- goes to stderr, while
 * execFileSync returns stdout. Reading the wrong stream is why the first
 * version of this printed "? LUFS" for a file that measured perfectly well,
 * which is the same mistake mix.mjs records having made.
 */
const ffErr = (args) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" });
  return (r.stderr ?? "") + (r.stdout ?? "");
};

/**
 * Measure a file the way loudnorm wants to be told about it.
 *
 * Two passes, because a single pass cannot know the integrated level of audio
 * it has not finished hearing: it adjusts as it goes and lands near the target
 * rather than on it. Measured here -- one pass put this cue at -13.6 LUFS with
 * a -0.7 dBTP peak against a -14 / -1.0 target, so it was both louder than
 * intended AND over the ceiling that exists to stop lossy encoders clipping.
 */
const measure = (file) => {
  const out = ffErr(["-i", file, "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json", "-f", "null", "-"]);
  const m = /\{[^{}]*"input_i"[\s\S]*?\}/.exec(out);
  if (!m) throw new Error("loudnorm printed no JSON measurement");
  return JSON.parse(m[0]);
};

const seconds = (file) =>
  Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", file,
    ], { encoding: "utf8" }).trim(),
  );

function main() {
  const preview = process.argv.includes("--preview");
  const grid = readGrid();
  mkdirSync(OUT, { recursive: true });

  const wav = join(OUT, "kinetic-score.wav");
  const silent = join(OUT, "kinetic-silent.mp4");
  const final = join(OUT, "sitetru-kinetic.mp4");

  console.error(
    `grid: ${grid.bars} bars @ ${grid.bpm} BPM = ${grid.frames} frames ` +
      `(${grid.seconds.toFixed(2)}s), ${grid.beat} frames/beat`,
  );

  // 1. The score, at exactly the picture's length and tempo.
  execFileSync("python3", [
    join(ROOT, "marketing/music/score.py"),
    "kinetic", wav, String(grid.seconds), String(grid.bpm),
    "--marks", grid.marks.join(","),
  ], { stdio: "inherit", cwd: join(ROOT, "marketing/music") });

  // 2. The picture, silent.
  const chrome = findChromium();
  if (!chrome) {
    throw new Error(
      "No Chromium found under /opt/pw-browsers. Set CHROME_PATH to a headless " +
        "shell binary -- Remotion passes --headless, which full Chrome rejects.",
    );
  }
  console.error(`chromium: ${chrome}`);
  execFileSync("npx", [
    "remotion", "render", "Kinetic", silent,
    `--browser-executable=${chrome}`,
    // Two, not four. This composition mounts Fonts, whose delayRender is raced
    // past its 30s default by four tabs competing for the same font load.
    "--concurrency=2",
    "--timeout=120000",
    // Remotion defaults to CRF 18. The first, hard-cut edit was mostly static
    // screenshots and sat at 3 MB on CRF 26; this edit pans, pushes and blurs
    // across every transition, so EVERY pixel changes on most frames and CRF 26
    // came out at 7.7 MB. Chosen by measurement on a 10-second slice with two
    // transitions and three camera moves, against a CRF 12 master:
    //
    //   crf 26 medium  5.9 MB/54s  ssim 0.9943
    //   crf 30 slow    3.7 MB/54s  ssim 0.9915   <- this
    //   crf 32 vslow   3.2 MB/54s  ssim 0.9905
    //
    // and, because averaged SSIM is dominated by easy frames, by eye at 1:1 on
    // the smallest text in the film (the KPI labels at the end of the
    // Dashboard push): all three are indistinguishable from the master. 30
    // rather than 32 leaves margin for the blurred transition frames, which are
    // the hardest thing in the film to encode and the ones not inspected.
    "--crf=30",
    "--x264-preset=slow",
    ...(preview ? ["--scale=0.5"] : []),
  ], { stdio: "inherit", cwd: REMOTION });

  // 3. Mux. One loudnorm pass at the end, to the same -14 LUFS / -1 dBTP every
  //    platform normalises to; `alimiter` ahead of it guards the ceiling so a
  //    downbeat cannot clip before the measurement sees it.
  const stats = measure(wav);
  console.error(
    `score measured: ${stats.input_i} LUFS in, ${stats.input_tp} dBTP in`,
  );
  ff([
    "-y", "-i", silent, "-i", wav,
    "-filter_complex",
    "[1:a]aresample=48000,aformat=channel_layouts=stereo," +
      // Guard the ceiling BEFORE loudnorm measures, so a downbeat cannot clip
      // ahead of the thing that exists to stop it clipping.
      "alimiter=limit=0.97," +
      `loudnorm=I=-14:TP=-2.0:LRA=11:measured_I=${stats.input_i}:` +
      `measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:` +
      `measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true,` +
      // A true-peak limiter AFTER loudnorm, run at 4x the sample rate.
      //
      // loudnorm's TP target is a request, not a guarantee, and `alimiter` at
      // the native rate only sees SAMPLES -- the peaks a lossy decoder
      // reconstructs BETWEEN them sit above whatever it allows. Upsampling
      // first puts those in-between peaks on real samples it can catch.
      // Measured on this cue, through AAC at 128k:
      //
      //   native rate, limit -2.0 dB     -13.9 LUFS   -0.2 dBTP   over
      //   4x, limit -2.0 dB              -14.0 LUFS   -0.9 dBTP   over
      //   4x, limit -2.5 dB              -14.1 LUFS   -1.6 dBTP   <- this
      //
      // Earlier builds of this film were delivered at -0.9 and -0.8 dBTP and
      // reported as under the ceiling. They were not. The gate below now fails
      // the build rather than letting that happen silently again.
      "aresample=192000," +
      "alimiter=level_in=1:level_out=1:limit=-2.5dB:level=disabled," +
      "aresample=48000[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
    // Without this the moov atom sits at the END of the file, and a browser
    // cannot begin playback until the whole thing has downloaded -- which on
    // the connection this audience actually has is the difference between a
    // film that starts and one that spins.
    "-movflags", "+faststart",
    // The picture is the authority on length. Without this the audio graph can
    // end first and take the end card with it -- the failure mix.mjs records.
    "-shortest",
    final,
  ]);

  const vid = seconds(silent);
  const out = seconds(final);
  if (out < vid - 0.08) {
    throw new Error(
      `the mix came out ${out.toFixed(2)}s against a ${vid.toFixed(2)}s picture -- ` +
        "the audio ended first and -shortest trimmed the end card.",
    );
  }
  const measured = ffErr([
    "-i", final, "-af", "loudnorm=I=-14:TP=-1.0:print_format=summary", "-f", "null", "-",
  ]);
  const grab = (k) => (new RegExp(`${k}:\\s*([-0-9.]+)`).exec(measured) ?? [])[1] ?? "?";
  const tp = Number(grab("Input True Peak"));
  if (!(tp <= -1.0)) {
    throw new Error(
      `delivered at ${tp} dBTP, over the -1.0 ceiling. Lossy decoders clip above it, ` +
        "and the earlier builds of this film shipped over it unnoticed because nothing failed.",
    );
  }
  console.error(
    `\nout: ${final}\n  ${out.toFixed(2)}s  ${grab("Input Integrated")} LUFS  ` +
      `${grab("Input True Peak")} dBTP  ${grab("Input LRA")} LU range`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
