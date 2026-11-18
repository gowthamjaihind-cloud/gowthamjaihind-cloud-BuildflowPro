#!/usr/bin/env node
/**
 * Build the fast cut: score -> picture -> mux, wide and tall.
 *
 *   node marketing/films/pulse.mjs              # 16:9 and 9:16
 *   node marketing/films/pulse.mjs --wide       # 16:9 only
 *   node marketing/films/pulse.mjs --tall       # 9:16 only
 *   node marketing/films/pulse.mjs --mux-only   # re-score and re-mix the rendered pictures
 *
 * The score and the picture read ONE timeline, remotion/src/pulse/pulse.json:
 * the cut times (each shot's start) and the impacts (shots marked "hit") are
 * computed here from it and handed to the score, so a shot that moves takes
 * its kick, whoosh and impact with it. Delivered at -14 LUFS, under -1 dBTP,
 * like the other films (see kinetic.mjs for why both numbers are checked).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChromium } from "./kinetic.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const REMOTION = join(ROOT, "marketing/remotion");
const OUT = join(REMOTION, "out");

export function readPulse(src = readFileSync(join(REMOTION, "src/pulse/pulse.json"), "utf8")) {
  const film = JSON.parse(src);
  const beat = (60 / film.bpm) * film.fps;
  if (!Number.isInteger(beat)) throw new Error(`${film.bpm} BPM at ${film.fps}fps is ${beat} frames a beat; cuts would drift off the music.`);
  const cuts = [];
  const hits = [];
  let at = 0;
  film.shots.forEach((s, i) => {
    if (i) cuts.push(at / film.fps);
    if (s.hit) hits.push(at / film.fps);
    at += s.beats * beat;
  });
  return { ...film, beat, frames: at, seconds: at / film.fps, cuts, hits };
}

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" });
const ffErr = (args) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8" }).stderr || "";
const probeSeconds = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));

function measure(wav) {
  // loudnorm prints its JSON on stderr.
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", wav, "-af", "loudnorm=I=-14:TP=-2:LRA=11:print_format=json", "-f", "null", "-"], {
    encoding: "utf8",
  }).stderr;
  return JSON.parse(r.slice(r.lastIndexOf("{")));
}

function render(composition, out) {
  const chrome = findChromium();
  if (!chrome) throw new Error("No Chromium under /opt/pw-browsers; set CHROME_PATH to a headless shell.");
  execFileSync("npx", [
    "remotion", "render", composition, out,
    `--browser-executable=${chrome}`, "--concurrency=2", "--timeout=120000", "--crf=26", "--x264-preset=slow",
  ], { stdio: "inherit", cwd: REMOTION });
}

function mux(silent, wav, final) {
  const m = measure(wav);
  ff([
    "-y", "-i", silent, "-i", wav, "-filter_complex",
    "[1:a]aresample=48000,aformat=channel_layouts=stereo,alimiter=limit=0.97," +
      `loudnorm=I=-14:TP=-2.0:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
      `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
      "aresample=192000,alimiter=level_in=1:level_out=1:limit=-3.5dB:level=disabled,aresample=48000[a]",
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", final,
  ]);
  const v = probeSeconds(silent);
  const o = probeSeconds(final);
  if (o < v - 0.08) throw new Error(`the mix came out ${o.toFixed(2)}s against a ${v.toFixed(2)}s picture`);
  const s = ffErr(["-i", final, "-af", "loudnorm=I=-14:TP=-1.0:print_format=summary", "-f", "null", "-"]);
  const grab = (k) => (new RegExp(`${k}:\\s*([-0-9.]+)`).exec(s) ?? [])[1] ?? "?";
  if (!(Number(grab("Input True Peak")) <= -1.0)) throw new Error(`delivered at ${grab("Input True Peak")} dBTP, over -1.0`);
  console.error(`out: ${final}\n  ${o.toFixed(2)}s  ${grab("Input Integrated")} LUFS  ${grab("Input True Peak")} dBTP`);
}

function main() {
  const a = process.argv.slice(2);
  const wide = !a.includes("--tall");
  const tall = !a.includes("--wide");
  const muxOnly = a.includes("--mux-only");
  const p = readPulse();
  mkdirSync(OUT, { recursive: true });
  console.error(`pulse: ${p.shots.length} shots, ${p.frames} frames (${p.seconds}s) @ ${p.bpm} BPM; ${p.hits.length} impacts`);

  const wav = join(OUT, "pulse-score.wav");
  execFileSync("python3", [
    join(ROOT, "marketing/music/score.py"), "pulse", wav, String(p.seconds), String(p.bpm),
    "--marks", p.cuts.join(","), "--hits", p.hits.join(","),
  ], { stdio: "inherit", cwd: join(ROOT, "marketing/music") });

  for (const [on, comp, name] of [[wide, "Pulse", "sitetru-pulse"], [tall, "PulseVertical", "sitetru-pulse-vertical"]]) {
    if (!on) continue;
    const silent = join(OUT, `${name}-silent.mp4`);
    if (!muxOnly && !(a.includes("--reuse") && existsSync(silent))) render(comp, silent);
    else if (!existsSync(silent)) throw new Error(`--mux-only needs ${silent}`);
    mux(silent, wav, join(OUT, `${name}.mp4`));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
