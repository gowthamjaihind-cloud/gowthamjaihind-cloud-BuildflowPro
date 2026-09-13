// Decode a finished film and fail on the defects that only exist in the render.
//
//   node marketing/audit-film.mjs marketing/remotion/out/sitetru-launch.mp4
//
// The unit tests in transitions.spec.ts check the arithmetic of a transition.
// They cannot check what the compositor actually produced, and every transition
// bug in this film so far has been exactly that: geometry that was right in
// isolation and wrong once composited over whatever happened to be behind it.
//
// Both were found by decoding the mp4 frame by frame in an ad-hoc script and
// reading the numbers. This is that script, kept.
//
//   - Six one-frame dark flashes, one in the middle of every whip, because only
//     the incoming half of the pan was ever rendered and the 31% of frame it
//     had not covered yet was bare background.
//   - One much deeper flash at a dissolve, because an arriving shot faded up
//     from `opacity: 0` with nothing underneath it but the backdrop.
//
// Neither is visible in a still, neither fails a typecheck, and neither shows
// up in a review of the diff. They are only findable by measurement.
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) {
  console.error("usage: node marketing/audit-film.mjs <film.mp4>");
  process.exit(2);
}

/** Mean luma per frame, 0..255, straight from the decoder. */
function luma(path) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-f", "lavfi", "-i", `movie=${path},signalstats`,
     "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG",
     "-of", "csv=p=0"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = [];
  for (const line of out.split("\n")) {
    const [t, y] = line.split(",");
    if (t && y) {
      const a = Number(t);
      const b = Number(y);
      if (Number.isFinite(a) && Number.isFinite(b)) rows.push([a, b]);
    }
  }
  return rows;
}

/**
 * A frame markedly darker than BOTH its neighbours.
 *
 * This is the signature of background showing through a transition, and it is
 * specific: a real cut steps from one level to another and stays there, while a
 * hole dips for a frame or two and recovers. The threshold is well below the
 * smallest real instance (37) and far below the whip flashes (54-58).
 */
const DIP = 22;

function dips(rows) {
  const out = [];
  for (let i = 1; i < rows.length - 1; i++) {
    const [, a] = rows[i - 1];
    const [t, b] = rows[i];
    const [, c] = rows[i + 1];
    if (a - b > DIP && c - b > DIP) out.push({ t, from: a, to: b, back: c, drop: a - b });
  }
  return out;
}

const rows = luma(file);
if (rows.length === 0) {
  console.error(`no frames decoded from ${file}`);
  process.exit(2);
}

const found = dips(rows);
console.log(`${file}: ${rows.length} frames`);
if (found.length === 0) {
  console.log("  no frame is a hole in a transition");
  process.exit(0);
}
console.log(`  ${found.length} frame(s) darker than both neighbours -- background showing through:`);
for (const d of found) {
  console.log(
    `    ${d.t.toFixed(2)}s  ${d.from.toFixed(1)} -> ${d.to.toFixed(1)} -> ${d.back.toFixed(1)}  (drop ${d.drop.toFixed(1)})`,
  );
}
process.exit(1);
