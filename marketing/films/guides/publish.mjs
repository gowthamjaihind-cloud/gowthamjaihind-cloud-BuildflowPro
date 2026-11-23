#!/usr/bin/env node
/**
 * Publish the recorded module guides to the website.
 *
 *   node marketing/films/guides/publish.mjs            # every guide in src/content/guides.ts
 *   node marketing/films/guides/publish.mjs wbs cost   # just these
 *
 * From each narrated recording (marketing/walkthrough/out/guides/guide-<id>/
 * sitetru-guide-<id>.mp4) it writes, into public/media/guides/:
 *
 *   <id>-480.mp4    phones, and anyone on Data Saver or a slow connection
 *   <id>-720.mp4    tablets and the desktop page
 *   <id>-1080.mp4   full screen on a large display, where small app text needs it
 *   <id>-640.webp   poster for phones and the Help panel
 *   <id>-1280.webp  poster for tablets and desktop
 *   <id>.jpg        poster for browsers without WebP, and the <video> poster
 *   <id>.vtt        English captions, for watching with the sound off
 *
 * GuidesPlayer picks the rendition when play is pressed (guideRendition in
 * src/content/guides.ts). Every file is H.264/AAC with the index at the front
 * (faststart), so playback starts before the download ends on any device.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const OUT = join(ROOT, "public/media/guides");
const LIST = join(ROOT, "src/content/guides.ts");

const ids = [...readFileSync(LIST, "utf8").matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);
const want = process.argv.slice(2).length ? process.argv.slice(2) : ids;
mkdirSync(OUT, { recursive: true });

const seconds = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
const ff = (...args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
const mb = (f) => (statSync(f).size / 1e6).toFixed(1);

// Smaller pictures take a higher CRF; the voice is speech, so mono 64k is
// plenty on a phone and 96k stereo keeps the music bed clean on speakers.
const RENDITIONS = [
  { h: 480, w: 854, crf: 29, audio: ["-ac", "1", "-b:a", "64k"] },
  { h: 720, w: 1280, crf: 28, audio: ["-b:a", "96k"] },
  { h: 1080, w: 1920, crf: 27, audio: ["-b:a", "96k"] },
];

// Where the middle lands on a page load or a dimmed dialog, a hand-picked
// second (checked on a contact sheet) where the module is on screen, settled.
const POSTER_AT = { "getting-started": 21, inventory: 22, procurement: 30, vault: 17 };

/** SRT -> WebVTT: a header, and "." instead of "," in the timings. */
const toVtt = (srt) =>
  "WEBVTT\n\n" + srt.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2").trim() + "\n";

const lengths = {};
for (const id of want) {
  const dir = join(ROOT, `marketing/walkthrough/out/guides/guide-${id}`);
  const src = join(dir, `sitetru-guide-${id}.mp4`);
  if (!existsSync(src)) { console.error(`  ${id}: no recording at ${src} -- record it first`); process.exitCode = 1; continue; }

  for (const r of RENDITIONS) {
    ff("-i", src, "-vf", `scale=${r.w}:${r.h}:flags=lanczos`,
      "-c:v", "libx264", "-preset", "slow", "-crf", String(r.crf), "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-level", "4.0",
      "-c:a", "aac", ...r.audio, "-movflags", "+faststart", join(OUT, `${id}-${r.h}.mp4`));
  }
  rmSync(join(OUT, `${id}.mp4`), { force: true }); // the single 720p file this replaces

  // Every guide opens on the same portfolio screen, so take the poster from
  // the middle, where the module itself is on screen. Taken from the source,
  // not an encode, so the posters are as sharp as they can be.
  const at = String(POSTER_AT[id] ?? (seconds(src) * 0.45).toFixed(2));
  ff("-ss", at, "-i", src, "-frames:v", "1", "-vf", "scale=1280:720:flags=lanczos", "-q:v", "5", join(OUT, `${id}.jpg`));
  for (const w of [640, 1280]) {
    ff("-ss", at, "-i", src, "-frames:v", "1", "-vf", `scale=${w}:-2:flags=lanczos`, "-c:v", "libwebp", "-quality", "78", join(OUT, `${id}-${w}.webp`));
  }

  const srt = join(dir, `guide-${id}.srt`);
  if (existsSync(srt)) writeFileSync(join(OUT, `${id}.vtt`), toVtt(readFileSync(srt, "utf8")));
  else { console.error(`  ${id}: no captions at ${srt}`); process.exitCode = 1; }

  const s = Math.round(seconds(join(OUT, `${id}-720.mp4`)));
  lengths[id] = s;
  console.log(`  ${id}: ${s}s  480p ${mb(join(OUT, `${id}-480.mp4`))} MB · 720p ${mb(join(OUT, `${id}-720.mp4`))} MB · 1080p ${mb(join(OUT, `${id}-1080.mp4`))} MB · posters ${(statSync(join(OUT, `${id}-640.webp`)).size / 1e3).toFixed(0)}/${(statSync(join(OUT, `${id}-1280.webp`)).size / 1e3).toFixed(0)} KB`);
}
// Read the list again now, not at the start: an encode takes minutes, and the
// file may have been edited meanwhile. Only the lengths change.
let list = readFileSync(LIST, "utf8");
for (const [id, s] of Object.entries(lengths)) {
  list = list.replace(new RegExp(`(\\{ id: "${id}",[^\\n]*seconds: )\\d+`), `$1${s}`);
}
writeFileSync(LIST, list);
