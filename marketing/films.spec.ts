import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PLANS } from "../src/lib/plans";
// Plain ESM script modules with no type declarations; they are data, not a
// library, so the beats are typed at each use below.
import { LAUNCH } from "./films/launch.script.mjs";
import { WALKTHROUGH } from "./films/walkthrough.script.mjs";

/**
 * The films must not claim something the product does not do.
 *
 * A film is the one artefact nobody re-reads. It gets rendered once, uploaded,
 * embedded, and then the product changes underneath it — and unlike a page,
 * nothing about a stale video looks stale. So the two claims in these scripts
 * that are checkable against code are checked here, and the pipeline's own
 * README records the one that already went wrong: a beat read "₹6.4L" while the
 * cost screen showed ₹53.7L, because the demo dataset grew after the words
 * were written.
 */

const scripts = [
  { id: "launch", film: LAUNCH },
  { id: "walkthrough", film: WALKTHROUGH },
] as const;

/** Spoken numbers, since the narration says "nine hundred and ninety nine". */
const SPOKEN: Record<string, number> = {
  "nine hundred and ninety nine": 999,
  "one thousand seven hundred and ninety nine": 1799,
  "two thousand nine hundred and ninety nine": 2999,
};

describe("film scripts", () => {
  for (const { id, film } of scripts) {
    describe(id, () => {
      const all = film.beats.map((b: { vo: string }) => b.vo).join(" ");

      it("quotes a price that is actually a plan's price", () => {
        const said = Object.keys(SPOKEN).filter((words) => all.includes(words));
        expect(said.length, "no spoken price found — has the closing line changed?").toBe(1);
        const amount = SPOKEN[said[0]];
        const prices = Object.values(PLANS).map((p) => p.monthly);
        expect(prices, `${amount} is not a plan price`).toContain(amount);
      });

      it("says free-to-start only while a free tier exists", () => {
        if (!/free to start/i.test(all)) return;
        expect(PLANS.free.monthly).toBe(0);
        expect(PLANS.free.includedProjects).toBeGreaterThan(0);
      });

      it("names no real project, only the demo's placeholders", () => {
        // The instruction is that films use placeholder names. The fixtures are
        // already renamed; this stops a script from writing a real one back in
        // as prose, which no fixture check would catch.
        const banned = /\bplot\s*(?!12\b)\d+|\bvilla\s+(?!—|-)\w+\s+phase\b/i;
        expect(banned.test(all), all.slice(0, 80)).toBe(false);
      });

      it("has a hold after every line, so nothing lands on a hard cut", () => {
        const noHold = film.beats
          .filter((b: { hold: number }) => !(b.hold > 0))
          .map((b: { id: string }) => b.id);
        expect(noHold).toEqual([]);
      });
    });
  }

  it("keeps the launch composition's timing in step with its script", () => {
    // generated/launchTiming.ts is written by build-voice.mjs and imported by
    // the Remotion composition. If someone edits the script and renders without
    // re-running the voice step, the picture is cut to the OLD words.
    const timing = readFileSync(
      new URL("./remotion/src/generated/launchTiming.ts", import.meta.url),
      "utf8",
    );
    for (const beat of LAUNCH.beats as { id: string; vo: string }[]) {
      expect(timing, `beat ${beat.id} missing from launchTiming.ts`).toContain(`"id":"${beat.id}"`);
      // The text is embedded in the generated file, so a rewritten line shows
      // up here rather than silently rendering against the old duration.
      expect(timing, `beat ${beat.id} text has changed since the voice was built`).toContain(
        JSON.stringify(beat.vo).slice(1, -1).slice(0, 40),
      );
    }
  });
});
