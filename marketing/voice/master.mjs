#!/usr/bin/env node
/**
 * Master the raw synthesised lines, and lay them out on a timeline.
 *
 * This chain is TUNED TO THE VOICE, and it was re-tuned when the voice changed
 * from Piper to Kokoro, because applying the old settings to a different model
 * would have made things worse rather than better. Measured on the same line:
 *
 *   band              kokoro   piper     what it means
 *   300-800 Hz         22.9%   36.2%     Piper was boxy; Kokoro is not
 *   2-4 kHz             6.1%   11.5%     Kokoro needs the presence help more
 *   4-7 kHz            11.5%   20.5%     Piper's sibilance was its worst fault
 *   7-11 kHz           20.2%    3.1%     Kokoro has real air; Piper had none
 *
 * So the two settings that did the most work for Piper are the two that would
 * hurt here. Its 380 Hz cut was fixing 36% of the energy piling up in the boxy
 * region -- Kokoro sits at 23% and cutting there just hollows it out. Its
 * de-esser was doing the single biggest audible job on a voice with 20% of its
 * energy in the sibilant band; at Kokoro's 11.5% the same setting dulls the
 * consonants instead.
 *
 * What survives, and why:
 *
 *   highpass 75     gentler than before. Kokoro carries 19% of its energy
 *                   below 300 Hz and that warmth is worth keeping.
 *   deesser         light. Present because a de-essed /s/ still sits better
 *                   against a music bed, not because this voice hisses.
 *   equalizer       +2 dB at 2.8 kHz. Consonants live here and this is where a
 *                   voice wins against music; it is Kokoro's leanest band.
 *   acompressor     3:1, gentler than Piper needed -- Kokoro peaks at 0.64
 *                   rather than clipping at 1.0, so there is less to tame.
 *   alimiter        a ceiling, so a plosive cannot spike into the mix.
 *   loudnorm        -16 LUFS integrated, the level web video is mixed to.
 *
 * Nothing rolls off the top: that 20% of air above 7 kHz is a large part of why
 * this voice reads as present rather than synthetic, and it is exactly what a
 * habitual "tame the highs" move would throw away.
 *
 * Usage:
 *   node master.mjs <manifest.json> <outDir>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

export const VOICE_CHAIN = [
  "highpass=f=75",
  "deesser=i=0.18:m=0.5:f=0.30",
  "equalizer=f=2800:t=q:w=1.6:g=2",
  "acompressor=threshold=-18dB:ratio=3:attack=8:release=200:makeup=1.5",
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
