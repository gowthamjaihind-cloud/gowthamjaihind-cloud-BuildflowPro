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
import { masterLines } from "../voice/master.mjs";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  const scenes = [];
  let t = 0;
  for (const s of film.scenes) {
    scenes.push({ ...s, startS: t / fps, durS: (s.bars * bar) / fps });
    t += s.bars * bar;
  }
  return { fps, bpm, bars, beat, bar, frames, seconds: frames / fps, marks, film, scenes };
}

/**
 * Narration windows. A line starts VO_LEAD after its scene's transition
 * midpoint -- once the incoming scene has arrived -- and must finish VO_TAIL
 * before the next one, so a line never talks across a transition into a
 * screen it is not about.
 */
export const VO_LEAD = 0.3;
export const VO_TAIL = 0.3;

/** Recorded takes, by scene id, that replace the synthesised line. */
export const TAKES = join(HERE, "takes", "kinetic");

/**
 * Speak the narration, master it, and place it on the timeline.
 *
 * The picture is cut to a musical grid, so -- unlike the launch film, which
 * lays its picture out FROM the measured voice -- here the voice has to fit
 * the picture. A line that runs past its window fails the build with the
 * numbers needed to fix it, rather than being sped up: a voice pushed faster
 * than its natural pace is the quickest way to make it sound synthetic.
 *
 * Any scene with a WAV in films/takes/kinetic/<id>.wav uses that instead of the
 * synthesised line. That is how a human recording, or a line from a hosted
 * voice, goes in: drop the file, rebuild. script.txt in films/out/kinetic says
 * exactly how long each one is allowed to be.
 */
export function buildVoiceover(grid) {
  const voice = grid.film.voice ?? {};
  const dir = join(HERE, "out", "kinetic");
  const raw = join(dir, "raw");
  mkdirSync(raw, { recursive: true });
  const spoken = grid.scenes.filter((s) => s.vo);
  const take = (s) => join(TAKES, `${s.id}.wav`);
  const toSynth = spoken.filter((s) => !existsSync(take(s)));

  let lines = [];
  if (toSynth.length) {
    const spec = {
      outDir: raw,
      ...(voice.name ? { voice: voice.name } : {}),
      ...(voice.accent ? { accent: voice.accent } : {}),
      ...(voice.speed ? { speed: voice.speed } : {}),
      lines: toSynth.map((s) => ({ id: s.id, text: s.vo })),
    };
    const out = execFileSync("python3", [join(ROOT, "marketing/voice/synth.py")], {
      input: JSON.stringify(spec), encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
      cwd: join(ROOT, "marketing/voice"),
    });
    lines = JSON.parse(out).lines;
  }
  for (const s of spoken.filter((s) => existsSync(take(s)))) {
    console.error(`  ${s.id.padEnd(14)} recorded take`);
    lines.push({ id: s.id, text: s.vo, file: take(s) });
  }
  const rawManifest = join(raw, "manifest.json");
  writeFileSync(rawManifest, JSON.stringify({ lines }, null, 2));
  const mastered = masterLines(rawManifest, dir).lines;

  const byId = new Map(mastered.map((l) => [l.id, l]));
  const placed = [];
  const over = [];
  for (const s of spoken) {
    const l = byId.get(s.id);
    const room = s.durS - VO_LEAD - VO_TAIL;
    if (l.seconds > room) over.push(`  ${s.id}: ${l.seconds.toFixed(2)}s of speech in a ${room.toFixed(2)}s window (${s.bars} bars). Add a bar in film.json or shorten the line.`);
    placed.push({ ...l, at: s.startS + VO_LEAD, room });
  }
  if (over.length) throw new Error("narration does not fit its scenes:\n" + over.join("\n"));

  const stamp = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${(x % 60).toFixed(1).padStart(4, "0")}`;
  writeFileSync(join(dir, "script.txt"), [
    "kinetic — voiceover script",
    "For re-recording: each line starts at its timestamp and must be NO LONGER",
    "than its max. Save each as films/takes/kinetic/<id>.wav and rebuild.",
    "",
    ...placed.map((l) => `[${stamp(l.at)}]  ${l.id}  (max ${l.room.toFixed(1)}s, synthesised ${l.seconds.toFixed(1)}s)\n  ${l.text}\n`),
  ].join("\n"));
  return placed;
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

/**
 * The score under the voice. The cue is peak-normalised and measures ~-18
 * LUFS against narration mastered to -16, so at unity it would sit within 2 dB
 * of the voice -- a duel, not a bed. Pulled down here and then ducked further
 * whenever someone is speaking, with mix.mjs's broadcast settings: enough to
 * get out of the way, not enough to disappear.
 */
export const MUSIC_DB = -6;

/** Voice + ducked score, before loudness. Also writes the two stems, for measuring. */
function premix(grid, lines, scoreWav, outWav) {
  const n = lines.length;
  const inputs = ["-i", scoreWav, ...lines.flatMap((l) => ["-i", l.file])];
  const legs = lines.map((l, i) => {
    const ms = Math.round(l.at * 1000);
    return `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`;
  });
  const graph = [
    ...legs,
    // Padded to the full picture: without it the voice bus ends with the last
    // line, the sidechain stops with it, and -shortest trims the end card --
    // the failure mix.mjs records.
    `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${n}:normalize=0:dropout_transition=0,apad=whole_dur=${grid.seconds.toFixed(3)}[vo]`,
    `[vo]asplit=3[voa][vob][voc]`,
    `[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=${MUSIC_DB}dB[mus]`,
    `[mus][vob]sidechaincompress=threshold=0.05:ratio=4:attack=12:release=380:makeup=1[musd]`,
    `[musd]asplit=2[musa][musb]`,
    `[voa][musa]amix=inputs=2:normalize=0:dropout_transition=0[mix]`,
  ].join(";");
  ff([
    "-y", ...inputs, "-filter_complex", graph,
    "-map", "[mix]", "-t", grid.seconds.toFixed(3), "-c:a", "pcm_s16le", outWav,
    "-map", "[voc]", "-t", grid.seconds.toFixed(3), "-c:a", "pcm_s16le", outWav.replace(/\.wav$/, "-voice.wav"),
    "-map", "[musb]", "-t", grid.seconds.toFixed(3), "-c:a", "pcm_s16le", outWav.replace(/\.wav$/, "-music.wav"),
  ]);
}

/**
 * The picture's own effects, as timed sound events -- for the music-only version.
 *
 * Every time comes from film.json: scene starts from the bar grid, highlight
 * times from each scene's marks, and the logo, name and chip timings from
 * `effects`, which the components read too. Nothing here is a second copy of a
 * frame number, so a retimed scene moves its sounds with it.
 */
export function effectEvents(grid) {
  const { film, fps } = grid;
  const E = film.effects;
  const ev = [];
  // Spotlight bells climb within a scene as the light moves on: the first
  // element gets the score's fifth, the next its octave, then the third above.
  const BELLS = ["A5", "D6", "F6"];
  for (const s of grid.scenes) {
    const at = (frame) => Number((s.startS + frame / fps).toFixed(3));
    if (s.kind === "title") {
      const closing = Boolean(s.url);
      const m = closing ? E.logo.outro : E.logo.intro;
      // +2 frames: the bars rise on an ease-out, so the visible jump is just
      // after the ramp starts, not on its first frame.
      ["D5", "F5", "A5"].forEach((note, i) =>
        ev.push({ t: at(m + i * E.logo.stagger + 2), kind: "rise", note }),
      );
      ev.push({ t: at(closing ? E.name.outro : E.name.intro), kind: "swish" });
    }
    (s.marks ?? []).forEach((m, i) => ev.push({ t: at(m.at), kind: "bell", note: BELLS[i % BELLS.length] }));
    (s.chips ?? []).forEach((_, i) => ev.push({ t: at(E.chips.at + i * E.chips.stagger + 2), kind: "pop" }));
    if (s.enter === "zoom") ev.push({ t: Number(s.startS.toFixed(3)), kind: "boom" });
  }
  return ev.sort((a, b) => a.t - b.t);
}

/** Effects level against the score in the music-only version. */
export const SFX_DB = 0;

function musicOnly(grid, scoreWav, outWav) {
  const events = effectEvents(grid);
  const evJson = join(OUT, "kinetic-effects.json");
  const sfxWav = join(OUT, "kinetic-sfx.wav");
  writeFileSync(evJson, JSON.stringify(events, null, 2));
  execFileSync("python3", [join(ROOT, "marketing/music/sfx.py"), sfxWav, String(grid.seconds), evJson], {
    stdio: "inherit", cwd: join(ROOT, "marketing/music"),
  });
  ff([
    "-y", "-i", scoreWav, "-i", sfxWav, "-filter_complex",
    "[0:a]aresample=48000,aformat=channel_layouts=stereo[m];" +
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${SFX_DB}dB[s];` +
      "[m][s]amix=inputs=2:normalize=0:dropout_transition=0[a]",
    "-map", "[a]", "-t", grid.seconds.toFixed(3), "-c:a", "pcm_s16le", outWav,
  ]);
  return events.length;
}

function main() {
  const preview = process.argv.includes("--preview");
  // Re-mix against the picture already rendered: voice and level work should
  // not cost a seven-minute render each time.
  const muxOnly = process.argv.includes("--mux-only");
  const grid = readGrid();
  mkdirSync(OUT, { recursive: true });

  const wav = join(OUT, "kinetic-score.wav");
  const mixWav = join(OUT, "kinetic-premix.wav");
  const silent = join(OUT, "kinetic-silent.mp4");
  const final = join(OUT, "sitetru-kinetic.mp4");
  if (muxOnly && !existsSync(silent)) throw new Error(`--mux-only needs ${silent}; run a full build first`);

  console.error(
    `grid: ${grid.bars} bars @ ${grid.bpm} BPM = ${grid.frames} frames ` +
      `(${grid.seconds.toFixed(2)}s), ${grid.beat} frames/beat`,
  );

  // 1. The score, at exactly the picture's length and tempo.
  if (!muxOnly) execFileSync("python3", [
    join(ROOT, "marketing/music/score.py"),
    "kinetic", wav, String(grid.seconds), String(grid.bpm),
    "--marks", grid.marks.join(","),
  ], { stdio: "inherit", cwd: join(ROOT, "marketing/music") });

  // 2. The narration, placed -- before the picture, so a line that does not fit
  //    its scene fails in seconds rather than after a seven-minute render.
  console.error("narration:");
  const lines = buildVoiceover(grid);
  premix(grid, lines, wav, mixWav);

  // 3. The picture, silent.
  if (!muxOnly) renderPicture(preview, silent);

  // 4. Mux the narrated version.
  mux(silent, mixWav, final);

  // 5. The music-only version: the same picture, the score at full level with
  //    no voice to duck under, and a sound on each of the picture's effects.
  const musicWav = join(OUT, "kinetic-music-only.wav");
  const finalMusic = join(OUT, "sitetru-kinetic-music.mp4");
  const n = musicOnly(grid, wav, musicWav);
  console.error(`\nmusic-only: ${n} effects`);
  mux(silent, musicWav, finalMusic);
}

function renderPicture(preview, silent) {
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
}

/**
 * Loudness and delivery: two-pass loudnorm to -14 LUFS, then a true-peak limiter
 * at 4x the sample rate, then AAC. Measured on the MIX, voice and all, because
 * that is what the listener hears.
 */
function mux(silent, mixWav, final) {
  const stats = measure(mixWav);
  console.error(
    `mix measured: ${stats.input_i} LUFS in, ${stats.input_tp} dBTP in`,
  );
  ff([
    "-y", "-i", silent, "-i", mixWav,
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
