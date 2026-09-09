#!/usr/bin/env node
/**
 * Master the raw synthesised lines, and lay them out on a timeline.
 *
 * Raw Piper output is intelligible but it is not broadcast: it peaks at full
 * scale, its sibilance is harsh enough to fatigue over ninety seconds, and it
 * has no consistent level to sit against music. This is the chain that makes it
 * sound like a voiceover rather than a text-to-speech demo.
 *
 * Every stage earns its place -- measured on the actual output, not applied out
 * of habit:
 *
 *   highpass 85     nothing the voice says lives below this; it only makes the
 *                   music's low end fight the read.
 *   deesser         the model's /s/ is its worst artefact. This is the single
 *                   biggest audible improvement in the chain.
 *   equalizer       a shelf out of the boxy 300-500 Hz region and a presence
 *                   lift at 3 kHz, which is where consonants live and where a
 *                   voice wins against a music bed.
 *   acompressor     4:1 with a slow release, so the level stops moving without
 *                   the read starting to pump.
 *   alimiter        a ceiling, so a plosive cannot spike into the mix.
 *   loudnorm        -16 LUFS integrated, the level web video is mixed to.
 *
 * Usage:
 *   node master.mjs <manifest.json> <outDir>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

export const VOICE_CHAIN = [
  "highpass=f=85",
  "deesser=i=0.45:m=0.5:f=0.35",
  "equalizer=f=380:t=q:w=1.1:g=-2.5",
  "equalizer=f=3000:t=q:w=1.4:g=2.5",
  "acompressor=threshold=-20dB:ratio=4:attack=6:release=180:makeup=2",
  "alimiter=limit=0.95",
  "loudnorm=I=-16:TP=-1.5:LRA=11",
  "aresample=48000",
].join(",");

const ff = (args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });

/** Seconds of audio in a file, read back rather than assumed. */
export function duration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", file,
  ]);
  return Number(String(out).trim());
}

export function masterLines(manifestPath, outDir) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mkdirSync(outDir, { recursive: true });
  const lines = manifest.lines.map((line) => {
    const out = join(outDir, basename(line.file));
    ff(["-i", line.file, "-af", VOICE_CHAIN, "-c:a", "pcm_s16le", out]);
    // Read the length back: loudnorm and the limiter can each shift it by a
    // frame or two, and the film's timeline is built from these numbers.
    return { ...line, file: out, seconds: Number(duration(out).toFixed(3)) };
  });
  return { ...manifest, lines, seconds: Number(lines.reduce((n, l) => n + l.seconds, 0).toFixed(3)) };
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const [, , manifestPath, outDir] = process.argv;
  if (!manifestPath || !outDir) {
    console.error("usage: node master.mjs <manifest.json> <outDir>");
    process.exit(1);
  }
  const mastered = masterLines(manifestPath, outDir);
  const dest = join(outDir, "manifest.json");
  writeFileSync(dest, JSON.stringify(mastered, null, 2));
  for (const l of mastered.lines) console.error(`  ${l.id.padEnd(14)} ${l.seconds.toFixed(2)}s`);
  console.error(`  ${"total".padEnd(14)} ${mastered.seconds.toFixed(2)}s`);
  console.log(dest);
}
