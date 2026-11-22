#!/usr/bin/env node
/**
 * Publish the recorded module guides to the website.
 *
 *   node marketing/films/guides/publish.mjs            # every guide in src/content/guides.ts
 *   node marketing/films/guides/publish.mjs wbs cost   # just these
 *
 * Takes each narrated recording (marketing/walkthrough/out/guides/guide-<id>/
 * sitetru-guide-<id>.mp4), encodes it for the web at 720p -- the guides are
 * watched on phones over site mobile data, and screen content at 720p is still
 * readable -- writes a poster from a frame a few seconds in, and records the
 * measured length in src/content/guides.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

let list = readFileSync(LIST, "utf8");
for (const id of want) {
  const src = join(ROOT, `marketing/walkthrough/out/guides/guide-${id}/sitetru-guide-${id}.mp4`);
  if (!existsSync(src)) { console.error(`  ${id}: no recording at ${src} -- record it first`); process.exitCode = 1; continue; }
  const mp4 = join(OUT, `${id}.mp4`);
  const jpg = join(OUT, `${id}.jpg`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src,
    "-vf", "scale=1280:720", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", mp4]);
  // A frame after the project has opened, so the poster shows the module.
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", "6", "-i", mp4, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "5", jpg]);
  const s = Math.round(seconds(mp4));
  list = list.replace(new RegExp(`(\\{ id: "${id}",[^\\n]*seconds: )\\d+`), `$1${s}`);
  console.log(`  ${id}: ${s}s, ${(statSync(mp4).size / 1e6).toFixed(1)} MB, poster ${(statSync(jpg).size / 1e3).toFixed(0)} KB`);
}
writeFileSync(LIST, list);
