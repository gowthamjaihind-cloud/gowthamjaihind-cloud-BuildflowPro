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
  let out;
  try {
    out = probe(path);
  } catch (err) {
    // Reading a file that is still being muxed gives "moov atom not found".
    // That is not a defect in the film, it is a race with the renderer, and it
    // should not look like one.
    const msg = String(err?.stderr ?? err?.message ?? err);
    if (/moov atom not found|Invalid data found/.test(msg)) {
      console.error(`${path}: not a complete mp4 yet -- still being written?`);
      process.exit(2);
    }
    console.error(`${path}: could not decode\n${msg}`);
    process.exit(2);
  }
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

function probe(path) {
  return execFileSync(
    "ffprobe",
    ["-v", "error", "-f", "lavfi", "-i", `movie=${path},signalstats`,
     "-show_entries", "frame=pts_time:frame_tags=lavfi.signalstats.YAVG",
     "-of", "csv=p=0"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

/**
 * A frame markedly darker than BOTH its neighbours.
 *
 * This is the signature of background showing through a transition, and it is
 * specific: a real cut steps from one level to another and stays there, while a
 * hole dips for a frame and comes BACK to roughly where it was, because nothing
 * actually changed except that one frame.
 */
const DIP = 22;

/**
 * How far the recovery may fall short of the original level, as a fraction of
 * the drop, before this is read as a real cut rather than a hole.
 *
 * Without this the check has a false positive, and it had one: the film cuts
 * from Client Estimates (luma 217) to the Portfolio hero, which is dark navy,
 * and four frames later a white Flash transition lifts it again -- 217 down to
 * 124, back to 149. That satisfies "darker than both neighbours" while being an
 * ordinary cut to a darker screen. It is the opposite of a hole: the picture
 * genuinely changed and never returns.
 *
 * Every real instance recovers to within 20 luma of where it started, against a
 * drop of 54-58. This cut recovers 68 short of a drop of 93.
 */
const RECOVERY = 0.5;

function dips(rows) {
  const out = [];
  for (let i = 1; i < rows.length - 1; i++) {
    const [, a] = rows[i - 1];
    const [t, b] = rows[i];
    const [, c] = rows[i + 1];
    if (!(a - b > DIP && c - b > DIP)) continue;
    if (Math.abs(c - a) > (a - b) * RECOVERY) continue; // a cut, not a hole
    out.push({ t, from: a, to: b, back: c, drop: a - b });
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
