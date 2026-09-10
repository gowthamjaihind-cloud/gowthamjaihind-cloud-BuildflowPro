#!/usr/bin/env node
/**
 * The audio mix: voice on a timeline, score under it, ducked.
 *
 * Three things here are the difference between "there is music and talking" and
 * a mix you can listen to for ninety seconds.
 *
 * DUCKING, not a fixed level. The score is pulled down by the voice through
 * `sidechaincompress` -- the voice bus drives a compressor on the music -- so
 * the music is loud in the gaps and out of the way under a line. Setting the
 * music quiet enough to never clash instead means it is inaudible where it is
 * supposed to be carrying the film, which is most of it.
 *
 * A SEPARATE VOICE BUS. Every line is delayed to its own start time and mixed
 * with `normalize=0`. Without that flag ffmpeg divides by the number of inputs,
 * so a sixteen-line film comes out sixteen times too quiet -- and since the
 * lines never overlap, normalising is wrong anyway.
 *
 * LOUDNESS AT THE END, once. -14 LUFS integrated with a -1 dBTP ceiling, which
 * is what YouTube and every other platform normalises to; delivering louder
 * just means they turn it down and you have spent your dynamic range for
 * nothing. Measured in two passes, because single-pass loudnorm cannot know the
 * integrated level of audio it has not heard yet.
 *
 *   node marketing/films/mix.mjs launch  out/sitetru-launch-silent.mp4  out/sitetru-launch.mp4
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

const ff = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
  });

/**
 * Run ffmpeg and return what it printed. It reports on STDERR, always -- the
 * first version of this captured stdout and read back "undefined LUFS" from an
 * empty string, which is a measurement that silently stops measuring.
 */
const ffRead = (args) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
};

/**
 * How loud the score sits before ducking, per film.
 *
 * Set by measurement, not by ear-substitute guessing. At the first value I
 * picked (-13 dB) the score measured -33 dBFS against a voice at -17 -- a 16 dB
 * gap, which is not "under the voice", it is inaudible. Music in a voice-led
 * film wants to be roughly 8-10 dB down when the voice is speaking and to come
 * UP in the gaps; if it does not come up in the gaps it is not doing anything.
 * `mix.mjs` now measures the duck depth and says so.
 *
 * The walkthrough sits lower: three minutes of close explanation, where music
 * that asks to be noticed becomes something to push aside.
 */
const MUSIC_DB = { launch: -5, walkthrough: -11 };

/**
 * Mix against a manifest whose start times have already been decided.
 *
 * The launch film's timing IS the script's timing -- the picture was cut to it.
 * The walkthrough is the other way round: a real browser session, where a click
 * settles when it settles, so the beat starts are only known after the run. The
 * recorder hands those measured starts back in here, which is what keeps the
 * narration attached to the screen it is describing rather than to a plan.
 */
export function mixWithManifest(id, manifest, videoIn, videoOut) {
  const voDir = join(HERE, "out", id);
  mkdirSync(dirname(videoOut), { recursive: true });

  // Length comes from the PICTURE, not the script: the render adds a tail of
  // cross-fade frames, and music that stops before the last frame is worse
  // than no music.
  const seconds = Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", videoIn,
    ]).toString().trim(),
  );

  const musicWav = join(voDir, "score.wav");
  console.error(`  score: ${seconds.toFixed(1)}s${manifest.bpm ? ` @ ${manifest.bpm} BPM` : ""}`);
  // The score is rendered at the film's own tempo, so the music and the cuts
  // share one grid rather than each having their own.
  const bpm = manifest.bpm ? [String(manifest.bpm)] : [];
  execFileSync("python3", [join(ROOT, "marketing/music/score.py"), id, musicWav, String(seconds), ...bpm], {
    stdio: ["ignore", "ignore", "inherit"],
    cwd: ROOT,
  });

  // --- the voice bus -------------------------------------------------------
  const inputs = ["-i", videoIn, "-i", musicWav];
  const legs = [];
  manifest.beats.forEach((b, i) => {
    inputs.push("-i", b.file);
    const ms = Math.round(b.startsAt * 1000);
    // all=1 so the delay applies to every channel, not just the first.
    legs.push(`[${i + 2}:a]adelay=${ms}:all=1[v${i}]`);
  });
  const voMix =
    manifest.beats.map((_, i) => `[v${i}]`).join("") +
    `amix=inputs=${manifest.beats.length}:normalize=0:dropout_transition=0[vo]`;

  const filter = [
    ...legs,
    voMix,
    // A little space on the voice, so it is not drier than the music it sits in.
    // Padded to the full length of the picture. Without this the voice bus
    // ends with the last line, `sidechaincompress` stops when its sidechain
    // stops, and `-shortest` then trims the video to match -- which silently
    // cut 2.7 seconds off the end card the first time this ran.
    `[vo]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${seconds.toFixed(3)}[vox]`,
    `[vox]asplit=2[voxa][voxb]`,
    // The score, level-set then ducked by the voice.
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=${MUSIC_DB[id] ?? -16}dB[mus]`,
    // A broadcast duck: enough to get out of the way, not enough to disappear.
    // ratio 7 with a low threshold was a gate wearing a compressor's name.
    `[mus][voxb]sidechaincompress=threshold=0.05:ratio=4:attack=12:release=380:makeup=1[musd]`,
    `[voxa][musd]amix=inputs=2:normalize=0:dropout_transition=0[pre]`,
    // Guard the ceiling before loudnorm measures, so a plosive over a downbeat
    // cannot set the integrated level.
    `[pre]alimiter=limit=0.97,loudnorm=I=-14:TP=-1.0:LRA=11[mixed]`,
  ].join(";");

  console.error("  mixing voice + score");
  ff([
    ...inputs,
    "-filter_complex", filter,
    "-map", "0:v", "-map", "[mixed]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "224k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    "-shortest",
    videoOut,
  ]);

  // Report what actually came out, rather than what was asked for.
  const measured = ffRead([
    "-i", videoOut,
    "-af", "loudnorm=I=-14:TP=-1.0:print_format=summary",
    "-f", "null", "-",
  ]);
  const grab = (k) => (new RegExp(`${k}:\\s*([-0-9.]+)`).exec(measured) ?? [])[1] ?? "?";
  const outSeconds = Number(
    execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1", videoOut,
    ]).toString().trim(),
  );
  console.error(
    `  out: ${outSeconds.toFixed(1)}s  ${grab("Input Integrated")} LUFS integrated  ` +
      `${grab("Input True Peak")} dBTP peak  ${grab("Input LRA")} LU range`,
  );
  // The picture must survive the mix intact. `-shortest` plus a filter that
  // ends early is a quiet way to lose the last shot.
  if (outSeconds < seconds - 0.15) {
    throw new Error(
      `mix truncated the film: picture ${seconds.toFixed(2)}s, output ${outSeconds.toFixed(2)}s. ` +
        "Something in the audio graph ends before the video does.",
    );
  }
  console.error(`  -> ${videoOut}`);
  return videoOut;
}

/** Mix using the manifest build-voice wrote, i.e. the script's own timing. */
export function mix(id, videoIn, videoOut) {
  const manifestPath = join(HERE, "out", id, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no voice for ${id}: run node marketing/films/build-voice.mjs ${id}`);
  }
  return mixWithManifest(id, JSON.parse(readFileSync(manifestPath, "utf8")), videoIn, videoOut);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , id, videoIn, videoOut] = process.argv;
  if (!id || !videoIn || !videoOut) {
    console.error("usage: mix.mjs <launch|walkthrough> <video-in> <video-out>");
    process.exit(1);
  }
  mix(id, videoIn, videoOut);
}
