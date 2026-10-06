import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const HERE = dirname(fileURLToPath(import.meta.url));

const scripts = [
  { id: "launch", film: LAUNCH },
  { id: "walkthrough", film: WALKTHROUGH },
] as const;

/** Spoken numbers, since the narration says "nine hundred and ninety nine". */
const SPOKEN: Record<string, number> = {
  "ninety nine": 99,
  "one thousand four hundred and ninety nine": 1499,
  // Retired, but kept so a script quoting one is caught as a price no plan
  // charges rather than as no price at all.
  "nine hundred and ninety nine": 999,
  "one thousand seven hundred and ninety nine": 1799,
  "two thousand nine hundred and ninety nine": 2999,
};

/**
 * Both films used to close on "Free to start, nine hundred and ninety nine
 * rupees a month", and neither half was true: the catalog is Starter at ₹99 per
 * project, Business at ₹1,499, Enterprise custom, and the only free entry point
 * is the 14-day Starter trial. They now close on "Fourteen days free, then
 * ninety nine rupees a project, a month".
 *
 * The re-cut was not a script edit. The voice is synthesised locally
 * (marketing/voice/fetch-voice.sh fetches Kokoro, then build-voice.mjs runs it)
 * and that regenerates the committed timing manifests under
 * marketing/remotion/src/generated/, shifting every beat offset in the film.
 * Changing the text without rebuilding leaves the script and the built voice
 * disagreeing, which the timing check below catches.
 *
 * The walkthrough also claimed "in English or Tamil". Tamil now lives only in
 * the Telegram bot and that film's footage is the English-only web app, so the
 * claim was dropped rather than qualified.
 *
 * The two checks below ran behind a FILMS_AWAITING_RECUT flag while that was
 * outstanding, with a companion test that failed the moment the films stopped
 * contradicting the catalog. Both are gone now that they do.
 */

describe("film scripts", () => {
  for (const { id, film } of scripts) {
    describe(id, () => {
      const all = film.beats.map((b: { vo: string }) => b.vo).join(" ");

      it("quotes a price that is actually a plan's price", () => {
        // Longest match wins: "ninety nine" is a substring of "nine hundred and
        // ninety nine", so without this a retired price would also register as
        // the current one and the check would pass on the wrong number.
        const present = Object.keys(SPOKEN).filter((words) => all.includes(words));
        const said = present.filter((w) => !present.some((other) => other !== w && other.includes(w)));
        expect(said.length, "no spoken price found — has the closing line changed?").toBe(1);
        const amount = SPOKEN[said[0]];
        const prices = Object.values(PLANS).map((p) => p.monthly);
        expect(prices, `${amount} is not a plan price`).toContain(amount);
      });

      it("promises a free start only where one actually exists", () => {
        if (!/\bfree\b/i.test(all)) return;
        // There is no permanent free tier any more, so the free entry point is
        // the self-serve trial. Read it from the source rather than trusting the
        // narration: if the trial is ever removed, both films start lying.
        const createOrg = readFileSync(join(HERE, "../functions/src/createOrg.ts"), "utf8");
        const days = createOrg.match(/TRIAL_MS\s*=\s*(\d+)\s*\*\s*24/);
        expect(days, "no self-serve trial found, but a film promises something free").not.toBeNull();
        const spokenDays = /fourteen days/i.test(all) ? 14 : null;
        if (spokenDays !== null) {
          expect(Number(days![1]), "the film names a trial length the code does not grant").toBe(spokenDays);
        }
        const free = Object.values(PLANS).filter((p) => p.monthly === 0);
        expect(free, "a ₹0 plan exists again — say so in the films instead of 'free for N days'").toHaveLength(0);
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

describe("the manifest carries everything the recorder reads from it", () => {
  /*
    THE DEFECT, twice.

    The walkthrough recorder reads a beat's cut-away settings from the MANIFEST
    that build-voice.mjs writes, not from the script. So a field added to the
    script and not copied through build-voice is silently ignored: the script
    says one thing, the film does another, and nothing fails.

    It cost two wasted recordings. First `cutTo` was repointed at the real
    Telegram screens and the film kept compositing the drawing, because the run
    went through `npm run walkthrough` (record only) rather than
    `film:walkthrough` (rebuild the manifest, then record). Then `cutAfter` and
    `cutHold` were added for the end card and were not copied through at all.

    Neither is visible in a diff and neither fails a typecheck. The only cheap
    check is this one: every `cut*` key the script uses must appear in the
    manifest builder.
  */
  const script = readFileSync(new URL("./films/walkthrough.script.mjs", import.meta.url), "utf8");
  const builder = readFileSync(new URL("./films/build-voice.mjs", import.meta.url), "utf8");

  // Comments in both files discuss these keys, so strip them before matching.
  const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  /*
    Every per-beat key the script sets, not just the `cut*` ones. The first
    version of this check matched `cut[A-Z]` only, and `scrollMax` -- added for
    exactly the same reason, and carried down exactly the same path -- slipped
    straight past it. A check that only knows about the fields that have already
    caused trouble is a check that catches the last bug rather than the next.

    `id`, `vo` and `hold` are the narration's own; build-voice reads them
    directly rather than copying them through, so they are not in scope.
  */
  const CORE = new Set(["id", "vo", "hold"]);
  const used = [
    ...new Set(
      [...strip(script).matchAll(/^\s{4,}([a-z][A-Za-z]*)\s*:/gm)].map((m) => m[1]),
    ),
  ].filter((k) => !CORE.has(k));

  it("finds the script's per-beat fields, or this check is vacuous", () => {
    expect(used).toContain("cutTo");
    expect(used).toContain("scrollMax");
  });

  for (const key of used) {
    it(`build-voice copies ${key} into the manifest`, () => {
      expect(strip(builder)).toMatch(new RegExp(`\\b${key}\\b`));
    });
  }
});
