import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * The two cue arcs are piecewise functions, and piecewise functions break at
 * the joins without breaking anything you can see. `walk_arc` shipped its first
 * draft with `0.92 + (position - 0.70 + 0.42) / 0.42 * 0.08` where it meant
 * `(position - 0.28)`; that one happened to be equivalent, but nothing in the
 * pipeline would have said so if it had not been. A discontinuity here is a
 * step in the music bed under a finished film — audible, and expensive to find
 * at that end.
 *
 * Rendering a cue takes about a minute, so this samples the curves directly
 * rather than measuring audio. It shells out to Python because that is where
 * they live; keeping it in the vitest run is the point, since a separate test
 * nobody invokes is worse than none.
 */

const ROOT = join(__dirname, "..");

/**
 * Can this machine render a cue? The curves need nothing; rendering needs
 * numpy and scipy, which the CI runner that deploys this app does not have.
 */
function canRenderCues(): boolean {
  try {
    execFileSync("python3", ["-c", "import numpy, scipy"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const CAN_RENDER = canRenderCues();

function sample(fn: string, n = 400, extra = ""): number[] {
  const out = execFileSync(
    "python3",
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "marketing/music"))})\n` +
        `import arcs as score\n` +
        `print(" ".join(f"{score.${fn}(i/${n - 1}${extra ? ", " + extra : ""}):.6f}" for i in range(${n})))`,
    ],
    { encoding: "utf8" },
  );
  return out.trim().split(/\s+/).map(Number);
}

describe.each(["arc", "walk_arc"])("%s", (fn) => {
  const v = sample(fn);

  it("is continuous across every join", () => {
    // Sampled densely ON PURPOSE. The threshold is only meaningful relative to
    // the sampling rate: at 400 points across a 162-second film each point is
    // 0.4s apart, and the arrival ramp legitimately climbs 0.033 between two
    // of them, which is indistinguishable from a real step. At 4000 the
    // steepest honest segment moves ~0.003 per point, so a genuine
    // discontinuity -- the 0.18 jump a mistyped join produces -- stands out by
    // two orders of magnitude.
    const dense = sample(fn, 4000);
    const steps = dense.slice(1).map((x, i) => Math.abs(x - dense[i]));
    expect(Math.max(...steps)).toBeLessThan(0.02);
  });

  it("stays a positive multiplier, never silent and never doubled", () => {
    expect(Math.min(...v)).toBeGreaterThan(0.2);
    expect(Math.max(...v)).toBeLessThanOrEqual(1.05);
  });

  it("ends louder than it begins, so the film arrives rather than fades", () => {
    expect(v[v.length - 1]).toBeGreaterThan(v[0]);
  });
});

describe("walk_arc", () => {
  const v = sample("walk_arc");
  const at = (p: number) => v[Math.round(p * (v.length - 1))];

  it("swings less than the launch cue, which has drums to carry it", () => {
    const launch = sample("arc");
    const span = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(span(v)).toBeLessThan(span(launch));
  });

  it("pulls back for the closing line and comes back up at the end", () => {
    expect(at(0.9)).toBeLessThan(at(0.7));
    expect(at(1.0)).toBeGreaterThan(at(0.95));
  });

  it("puts the lift where the caller says the voice stops", () => {
    // The whole point of threading `bloom` through from the timed manifest:
    // placed by a guessed fraction of the runtime instead, it fired seven
    // seconds early, under the line it was meant to make room for.
    const early = sample("walk_arc", 400, "0.80, 0.02");
    const late = sample("walk_arc", 400, "0.95, 0.02");
    const at85 = (a: number[]) => a[Math.round(0.85 * (a.length - 1))];
    expect(at85(early)).toBeGreaterThan(at85(late));
  });
});

/**
 * Both cues have to be RENDERABLE, not just shaped right.
 *
 * Twice while building the arrival I replaced a line that `launch` and
 * `walkthrough` happen to share -- `beat = 60 / bpm` and the three lines under
 * it are identical in both -- and the edit landed in `launch`, which then
 * referenced a name that only exists in `walkthrough`. Nothing caught it,
 * because re-mixing the walkthrough never imports the launch cue. The second
 * time it would have shipped a launch film that could not render at all.
 */
describe.skipIf(!CAN_RENDER)("both cues render (needs numpy + scipy)", () => {
  it.each(["launch", "walkthrough"])("%s builds without an undefined name", (cue) => {
    const out = execFileSync(
      "python3",
      [
        "-c",
        `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "marketing/music"))})\n` +
          `import numpy, score\n` +
          `a = score.CUES[${JSON.stringify(cue)}](20.0)\n` +
          `print(len(a), float(numpy.abs(a).max()))`,
      ],
      { encoding: "utf8" },
    ).trim().split(/\s+/).map(Number);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[1]).toBeGreaterThan(0); // and it is not silence
  });

  it("walkthrough accepts the bloom point the mix passes it", () => {
    const out = execFileSync(
      "python3",
      [
        "-c",
        `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "marketing/music"))})\n` +
          `import numpy, score\n` +
          `a = score.walkthrough(20.0, 90, 18.0)\n` +
          `print(float(numpy.abs(a[-int(1.0 * score.SR):]).max()))`,
      ],
      { encoding: "utf8" },
    ).trim();
    // The bed must still be sounding on the last frame -- an end card under
    // silence is the fault this whole arrangement exists to remove.
    expect(Number(out)).toBeGreaterThan(0.01);
  });
});
