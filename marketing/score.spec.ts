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

function sample(fn: string, n = 400): number[] {
  const out = execFileSync(
    "python3",
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "marketing/music"))})\n` +
        `import score\n` +
        `print(" ".join(f"{score.${fn}(i/${n - 1}):.6f}" for i in range(${n})))`,
    ],
    { encoding: "utf8" },
  );
  return out.trim().split(/\s+/).map(Number);
}

describe.each(["arc", "walk_arc"])("%s", (fn) => {
  const v = sample(fn);

  it("is continuous across every join", () => {
    // The widest legitimate step is one sample of the steepest segment. Any
    // real discontinuity is an order of magnitude above that.
    const steps = v.slice(1).map((x, i) => Math.abs(x - v[i]));
    expect(Math.max(...steps)).toBeLessThan(0.02);
  });

  it("stays a positive multiplier, never silent and never doubled", () => {
    expect(Math.min(...v)).toBeGreaterThan(0.2);
    expect(Math.max(...v)).toBeLessThanOrEqual(1.25);
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

  it("pulls back for the closing line and opens up on the end card", () => {
    expect(at(0.9)).toBeLessThan(at(0.7));
    expect(at(1.0)).toBeGreaterThan(at(0.7));
  });
});
