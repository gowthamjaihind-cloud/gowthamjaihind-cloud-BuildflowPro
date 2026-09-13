import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TRAVEL, whipShift } from "./whip";

/**
 * A CSS cubic-bezier, evaluated here rather than imported.
 *
 * Remotion is installed only inside marketing/remotion, so this package cannot
 * import its Easing. That is why TRAVEL is exported as control points: the film
 * and this test agree on the curve's definition, and each evaluates it with
 * whatever is to hand. This is the same standard curve every browser uses.
 */
function bezier([p1x, p1y, p2x, p2y]: readonly [number, number, number, number]) {
  const bx = (t: number) => 3 * (1 - t) ** 2 * t * p1x + 3 * (1 - t) * t * t * p2x + t ** 3;
  const by = (t: number) => 3 * (1 - t) ** 2 * t * p1y + 3 * (1 - t) * t * t * p2y + t ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (bx(mid) < x) lo = mid;
      else hi = mid;
    }
    return by((lo + hi) / 2);
  };
}

/**
 * The geometry and pacing of a whip, checked without rendering.
 *
 * Both defects these pin shipped in the first cut and were found by measuring
 * the finished file frame by frame, which is a slow and lucky way to find a
 * bug. They are arithmetic, so they can be caught here instead.
 */

const at = (e: (n: number) => number, frames: number) =>
  Array.from({ length: frames + 1 }, (_, i) => e(i / frames));

describe("a whip's two halves tile the frame", () => {
  /*
    THE DEFECT. `Take` rendered only the incoming half, sliding in over
    whatever was behind it, and each shot's Sequence outlived its own span by a
    single frame -- so one frame into every whip the outgoing picture was gone
    and the incoming was still 31% off-screen. That 31% was bare background: a
    hard-edged dark band down one side of the frame, eight times in the film,
    reading as a dropped frame.
  */
  for (const dir of [1, -1] as const) {
    it(`leaves no gap, direction ${dir}`, () => {
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        const inc = whipShift(p, dir, true);
        const out = whipShift(p, dir, false);
        // Each half is one frame wide, so it spans [shift, shift + 100].
        const spans = [
          [inc, inc + 100],
          [out, out + 100],
        ].sort((a, b) => a[0] - b[0]);
        // Edge to edge: the left span's trailing edge is the right span's leading edge.
        expect(spans[0][1]).toBeCloseTo(spans[1][0], 6);
        // And between them they cover the whole visible frame, 0..100.
        expect(spans[0][0]).toBeLessThanOrEqual(0.000001);
        expect(spans[1][1]).toBeGreaterThanOrEqual(99.999999);
      }
    });
  }

  it("starts with the incoming fully off and the outgoing fully on", () => {
    expect(whipShift(0, 1, true)).toBeCloseTo(-100, 6);
    expect(whipShift(0, 1, false)).toBeCloseTo(0, 6);
  });

  it("ends with the incoming landed and the outgoing fully gone", () => {
    expect(whipShift(1, 1, true)).toBeCloseTo(0, 6);
    expect(whipShift(1, 1, false)).toBeCloseTo(100, 6);
  });
});

describe("a whip actually travels across its frames", () => {
  /*
    THE DEFECT. The whip used `arrive` -- Easing.bezier(0.16, 1, 0.3, 1), an
    extreme ease-out built for a shot landing and settling. Over the six frames
    a whip is given it reached 0.686 by frame ONE: 69% of the pan in a single
    frame, and five frames of almost nothing after it. The eye read two smeared
    frames, not a camera move, which is why it looked like a glitch rather than
    an edit.
  */
  const WHIP_FRAMES = 6;
  const travel = bezier(TRAVEL);
  // The curve the whip used to use, kept here only so the comparison below has
  // something to fail against if someone puts it back.
  const arrive = bezier([0.16, 1.0, 0.3, 1.0]);

  const biggestStep = (e: (n: number) => number) => {
    const xs = at(e, WHIP_FRAMES);
    return Math.max(...xs.slice(1).map((v, i) => v - xs[i]));
  };

  it("spreads the move: no single frame carries a third of it", () => {
    expect(biggestStep(travel)).toBeLessThan(0.34);
  });

  it("is a real improvement on the easing it replaced", () => {
    // Guards against someone reverting to `arrive` and the test still passing.
    expect(biggestStep(arrive)).toBeGreaterThan(0.6);
    expect(biggestStep(travel)).toBeLessThan(biggestStep(arrive) / 2);
  });

  it("still ends where it started and finished", () => {
    expect(travel(0)).toBeCloseTo(0, 6);
    expect(travel(1)).toBeCloseTo(1, 6);
  });
});


describe("the edit still renders both halves of a whip", () => {
  /*
    The tests above prove the arithmetic is right IF both halves are on screen.
    They cannot prove that Cut.tsx still puts them there -- that needs a React
    renderer, and Remotion is installed only inside marketing/remotion, which
    this package cannot reach.

    So this reads the source. A structural check is weaker than a behavioural
    one and it is here under no illusions: it catches the regression that
    actually happened (the outgoing half missing, and each shot's Sequence too
    short to outlive its own span), and it would not catch a subtler one. The
    honest backstop remains measuring the rendered file, which is how the
    original defect was found.
  */
  // Read as text, never imported: see the boundary test at the foot of this file.
  const src = readFileSync(new URL("./remotion/src/film/Cut.tsx", import.meta.url), "utf8");
  // Comments in this file describe the very bug being tested, so they must not
  // be what satisfies the test.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("renders an outgoing Whip, not only the incoming one", () => {
    expect(code).toMatch(/<Whip\s+progress=\{leaving\}/);
    expect(code).toMatch(/<Whip\s+progress=\{p\}[^>]*incoming/);
  });

  it("holds a shot on screen for the whole of the next shot's transition", () => {
    // `lens[i] + 1` was the bug: one frame is enough only for a hard cut.
    expect(code).toMatch(/durationInFrames=\{lens\[i\] \+ Math\.max\(1, exit\?\.cost \?\? 0\)\}/);
  });

  it("paces the whip on the travelling curve, not the arriving one", () => {
    expect(code).toMatch(/ramp\(frame, \[0, cost\], travel\)/);
    expect(code).not.toMatch(/ramp\(frame, \[0, cost\], arrive\)/);
  });
});


describe("the root test package does not reach into marketing/remotion", () => {
  /*
    THE DEFECT, which I caused while writing the tests above. `whip.ts` first
    lived at marketing/remotion/src/film/whip.ts and this file imported it
    directly. That one import pulled the whole Remotion package into the root
    TypeScript program, which resolved React's SVG types from
    marketing/remotion/node_modules/@types/react@19.3.0 -- and the root project
    has no @types/react of its own. Result: `Property 'className' does not
    exist on type 'IconProps'`, 561 errors across thirty files, not one of them
    in code anyone had touched.

    tsconfig already excludes marketing/remotion, and that did nothing, because
    `exclude` filters which files SEED the program rather than what those files
    go on to import. So the boundary has to be asserted, not configured.

    Reading a file as text is fine -- that is what the block above does. It is
    `import` that drags the package in.
  */
  const specs = ["transitions.spec.ts", "films.spec.ts", "brand.spec.ts"];

  for (const name of specs) {
    it(`${name} imports nothing from inside marketing/remotion`, () => {
      const src = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
      const bad = [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)]
        .map((m) => m[1])
        .filter((spec) => /(^|\/)remotion\//.test(spec));
      expect(bad, `import from inside marketing/remotion breaks the root typecheck`).toEqual([]);
    });
  }
});
