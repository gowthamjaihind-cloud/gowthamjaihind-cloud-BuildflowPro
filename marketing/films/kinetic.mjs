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
 * derived from ONE tempo grid, so the only thing that has to agree is the
 * arithmetic, and this script reads that arithmetic out of grid.ts rather than
 * repeating it. A film whose score is rendered a bar longer than its picture
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
 * The grid, read from the TypeScript rather than restated here.
 *
 * Two copies of "18 bars at 150 BPM" is how a score comes out 1.6 seconds
 * longer than the film it is for, and the symptom -- a truncated end card --
 * points at ffmpeg rather than at the number that is actually wrong.
 */
export function readGrid(src = readFileSync(join(REMOTION, "src/kinetic/grid.ts"), "utf8")) {
  const num = (name) => {
    const m = new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?)`).exec(src);
    if (!m) throw new Error(`grid.ts does not export ${name} as a literal`);
    return Number(m[1]);
  };
  const fps = num("FPS");
  const bpm = num("BPM");
  const bars = num("BARS");
  const beat = (60 / bpm) * fps;
  if (!Number.isInteger(beat)) {
    throw new Error(
      `${bpm} BPM at ${fps}fps gives ${beat} frames to the beat. ` +
        "The cut is placed on beats, so a fractional beat puts every shot " +
        "boundary a little off the music. Pick a tempo where 60/bpm*fps is whole.",
    );
  }
  const frames = bars * beat * 4;
  return { fps, bpm, bars, beat, bar: beat * 4, frames, seconds: frames / fps };
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
    // Remotion defaults to CRF 18, which put this cut at 7.5 MB -- for a hero
    // film on a landing page whose audience is on Indian mobile data, that is
    // the single heaviest thing on the page by a wide margin. 26 lands near
    // 3 MB, matching the existing silent hero's footprint.
    //
    // Set HERE rather than by re-encoding the mux, which would be a second
    // lossy generation for no benefit. Checked rather than assumed: at 1:1 on
    // the densest table shot in the film, CRF 24, 27 and 30 are all visually
    // identical to the CRF 18 master, and whole-film SSIM stays above 0.9988
    // even at 30. Flat dark UI with hard cuts is close to the best case h264
    // has; this is not a film where bitrate buys legibility.
    "--crf=26",
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
      `loudnorm=I=-14:TP=-1.0:LRA=11:measured_I=${stats.input_i}:` +
      `measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:` +
      `measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true,` +
      // A true-peak limiter AFTER loudnorm, the same guard mix.mjs carries and
      // for the same reason: loudnorm's TP target is a request, not a
      // guarantee, and `alimiter`'s own limit is a SAMPLE peak -- the
      // inter-sample peaks a lossy encoder reconstructs sit above it. Measured
      // here: asking loudnorm for -1.0 and encoding to AAC landed at -0.6 dBTP,
      // over the ceiling that exists to stop decoders clipping.
      // level=disabled stops it re-normalising what loudnorm just set.
      "alimiter=level_in=1:level_out=1:limit=-1.2dB:asc=1:level=disabled," +
      "aresample=48000[a]",
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
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
  console.error(
    `\nout: ${final}\n  ${out.toFixed(2)}s  ${grab("Input Integrated")} LUFS  ` +
      `${grab("Input True Peak")} dBTP  ${grab("Input LRA")} LU range`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
