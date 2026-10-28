import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Checks on the kinetic cut that a render cannot make for you.
 *
 * These live at `marketing/*.spec.ts` rather than next to the code they test,
 * and that is load-bearing rather than tidy: the root vitest config collects
 * `marketing/*.spec.ts` ONLY -- not `marketing/remotion/src/**`. `marketing/`
 * is a separate package with its own node_modules and no CI step of its own,
 * which is exactly how five renderers kept a retired palette for months. A
 * test file under remotion/src would be a test nobody ever runs.
 *
 * What is worth pinning here is everything whose failure is SILENT. A wrong
 * tempo still renders a film. A label invented for the film still renders. A
 * missing screenshot renders as a blank frame. None of them throw, and none of
 * them are visible in a progress bar that says 864/864.
 */

const ROOT = join(__dirname, "..");
const KIN = join(ROOT, "marketing/remotion/src/kinetic");
const read = (p: string) => readFileSync(join(KIN, p), "utf8");

const grid = read("grid.ts");
const shots = read("shots.ts");
const mark = read("Mark.tsx");
const kinetic = read("Kinetic.tsx");
const palette = read("palette.ts");

const num = (src: string, name: string): number => {
  const m = new RegExp(`export const ${name} = (\\d+(?:\\.\\d+)?)`).exec(src);
  expect(m, `${name} must be exported as a plain literal`).toBeTruthy();
  return Number(m![1]);
};

describe("the tempo grid", () => {
  const FPS = num(grid, "FPS");
  const BPM = num(grid, "BPM");
  const BARS = num(grid, "BARS");

  it("puts a whole number of frames on every beat", () => {
    // The entire reason 150 was chosen over a rounder-sounding 140. A
    // fractional beat means a cut lands off the music by an amount that
    // accumulates, and nothing about the render reports it.
    const beat = (60 / BPM) * FPS;
    expect(Number.isInteger(beat)).toBe(true);
    expect(beat).toBe(12);
  });

  it("puts a whole number of frames on every quarter-beat", () => {
    // Shots are placed on half-beats and the flash on quarter-beats.
    expect(Number.isInteger(((60 / BPM) * FPS) / 4)).toBe(true);
  });

  it("stays the length a hero film can be", () => {
    const seconds = (BARS * ((60 / BPM) * FPS) * 4) / FPS;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(40);
  });
});

describe("the cut", () => {
  const srcs = [...shots.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  const labels = [...shots.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);

  it("references only screenshots that exist", () => {
    // A `staticFile` that is not there renders as a blank frame, not an error.
    expect(srcs.length).toBeGreaterThan(20);
    for (const s of srcs) {
      expect(existsSync(join(ROOT, "marketing/remotion/public", s)), `missing ${s}`).toBe(true);
    }
  });

  it("fills every act, so no shot list is silently empty", () => {
    for (const act of ["BLITZ", "FIGURES", "HOLDS"]) {
      const m = new RegExp(`export const ${act}: Shot\\[\\] = \\[([\\s\\S]*?)\\n\\];`).exec(shots);
      expect(m, `${act} not found`).toBeTruthy();
      expect(m![1].match(/\{ src:|\{\s*\n\s*src:/g)?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("says nothing the product does not say", () => {
    /*
      The rule the whole film is built on, and the only one a reader cannot
      check by watching it: every caption is a string the APP displays.

      This matters because the film is made of real screenshots. A caption
      written for the film, laid over a real screen, is the one element in the
      frame that would be a claim rather than a record -- and the failure mode
      is specific and has already happened in this repo, where an end card
      carried a price no plan charged.

      Substring, not equality: "Every project" is the opening of
      portfolio.taglineSub. That is still the app's own words, and the shot it
      labels is that screen. What this forbids is a label whose words appear
      nowhere in the product at all.
    */
    const appSrc = [
      "src/i18n/translations.ts",
      "src/components/ProcurementView.tsx",
      "src/components/CostManagement.tsx",
      "src/components/DashboardView.tsx",
      "src/components/EstimateTrackerView.tsx",
      "src/components/ProgressReportsView.tsx",
      "src/components/schedule/PhaseStrips.tsx",
      "src/pages/LandingPage.tsx",
      "src/App.tsx",
    ]
      .map((f) => readFileSync(join(ROOT, f), "utf8"))
      .join("\n");

    expect(labels.length).toBeGreaterThan(10);
    for (const label of labels) {
      expect(appSrc.includes(label), `"${label}" appears nowhere in the app`).toBe(true);
    }
  });
});

/**
 * Can this machine measure a PNG? The theme check shells out to ffmpeg, which
 * the CI runner that deploys this app does not have. Everything else in this
 * file is pure string work and runs anywhere.
 */
const CAN_MEASURE = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("the light theme", () => {
  it("draws its own chrome with light-ground tokens only", () => {
    /*
      `surfaceDark` and `primaryOnDark` are the DARK-SURFACE tokens. The second
      is the trap: it is a lifted cobalt that exists because base cobalt is
      2.40:1 on navy -- put it on this film's off-white ground and it measures
      about 1.5:1, which is an end-card address nobody can read. It was on the
      end card, and the theme swap is what removed it.

      Comments are stripped first, so the paragraph above explaining the rule
      does not trip the rule.
    */
    const strip = (x: string) =>
      x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [name, src] of [["Kinetic.tsx", kinetic], ["Mark.tsx", mark]] as const) {
      expect(strip(src), `${name} reaches for a dark-surface token`).not.toMatch(
        /C\.surfaceDark|C\.primaryOnDark/,
      );
    }
    // And the palette it does use is declared in one place.
    expect(palette).toContain("ground: C.page");
    expect(palette).toContain("accent: C.primary");
  });

  it("cuts from the light screenshot set", () => {
    // Both sets exist and are byte-different; only the prefix says which is
    // which, so the filename is the first thing to pin.
    const srcs = [...shots.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
    for (const s of srcs) expect(s, `${s} is not from the light set`).toMatch(/^l-/);
  });

  it.skipIf(!CAN_MEASURE)("and those screenshots are actually light", () => {
    /*
      The filename is a claim; this is the measurement.

      `capture-screens.mjs` defaults to FILM_THEME=dark, so a re-capture that
      forgets the flag would overwrite the light set with dark frames under
      light names. Nothing downstream would complain -- the film would just
      render dark, with ink captions on near-black screens, which is the one
      failure that makes it unreadable rather than merely wrong.

      Measured: the dark set averages 37 luma, the light set 208.
    */
    const luma = (file: string): number => {
      const out = execFileSync("ffmpeg", [
        "-v", "error", "-i", file,
        "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
        "-f", "null", "-",
      ], { encoding: "utf8" });
      const m = /=([0-9.]+)/.exec(out.trim());
      expect(m, `no luma reading for ${file}`).toBeTruthy();
      return Number(m![1]);
    };
    const pub = join(ROOT, "marketing/remotion/public");
    for (const f of ["l-01-dashboard.png", "l-09-cost-management.png", "l-12-vault.png"]) {
      expect(luma(join(pub, f)), `${f} is not a light-theme capture`).toBeGreaterThan(140);
    }
  });
});

describe("the brand mark", () => {
  const app = readFileSync(join(ROOT, "src/components/BrandLogo.tsx"), "utf8");

  it("is the product's drawing, not a redrawing of it", () => {
    /*
      Mark.tsx animates the logo by rebuilding it as three <rect>s it controls.
      That is the only way to make the bars rise -- but it also means the film
      now holds a SECOND copy of the mark, and a second copy is how a logo
      quietly becomes two logos.

      So the numbers are pinned against BrandLogo.tsx. If the product's mark
      moves, this fails rather than the film shipping yesterday's logo.
    */
    const appRects = [...app.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], rx: +m[5] }));
    expect(appRects).toHaveLength(3);

    const baseline = num(mark, "BASELINE");
    const barW = num(mark, "BAR_W");
    const barR = num(mark, "BAR_R");
    const filmBars = [...mark.matchAll(/\{ x: (\d+), h: (\d+) \}/g)].map((m) => ({
      x: +m[1],
      h: +m[2],
    }));
    expect(filmBars).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      expect(filmBars[i].x, `bar ${i} x`).toBe(appRects[i].x);
      expect(filmBars[i].h, `bar ${i} height`).toBe(appRects[i].h);
      // Every bar in the app's mark ends on the same baseline; the rise
      // animation depends on that being true.
      expect(appRects[i].y + appRects[i].h).toBe(baseline);
      expect(appRects[i].w).toBe(barW);
      expect(appRects[i].rx).toBe(barR);
    }
  });

  it("keeps the tile's cobalt, not a colour picked for the film", () => {
    expect(app).toContain('fill="#1D4ED8"');
    expect(mark).toContain("C.primary");
  });
});

describe("the composition", () => {
  it("renders every act back to back with no gap and no overrun", () => {
    /*
      Remotion will happily render a Sequence that starts after the composition
      ends, or leave a hole between two acts. Either is a black frame in a
      finished film, and the progress bar still reads 864/864.

      Checked as arithmetic on the exported constants rather than by rendering,
      so it runs on the CI box that has no browser.
    */
    const n = (name: string) => {
      const m = new RegExp(`export const ${name} = ([^;]+);`).exec(kinetic);
      expect(m, `${name} not exported`).toBeTruthy();
      return m![1];
    };
    // The end card must consume exactly the remainder.
    expect(n("ENDCARD_FRAMES").replace(/\s+/g, " ")).toContain("KINETIC_FRAMES - ENDCARD_AT");
    // And each act must start where the previous one ended.
    expect(n("BLITZ_AT")).toContain("OPENER_FRAMES");
    expect(n("FIGURES_AT").replace(/\s+/g, " ")).toContain("BLITZ_AT + BLITZ_FRAMES");
    expect(n("HOLDS_AT").replace(/\s+/g, " ")).toContain("FIGURES_AT + FIGURES_FRAMES");
    expect(n("ENDCARD_AT").replace(/\s+/g, " ")).toContain("HOLDS_AT + HOLDS_FRAMES");
  });

  it("loads the font, which the older Hero composition does not", () => {
    /*
      Hero.tsx mounts no font loader at all, so it has always rendered in
      whatever the fallback stack resolves to -- silently, for its whole life.
      This composition must not inherit that. `Fonts` both loads Manrope from
      disk and holds the render open until it has rasterised.
    */
    expect(kinetic).toMatch(/<Fonts\s*\/>/);
    expect(kinetic).toContain('from "../film/Fonts"');
  });

  it("keeps the end card free of any claim that can go stale", () => {
    // The silent hero cut shipped a price no plan charged. An end card that
    // says only the name and the address cannot go out of date.
    //
    // Comments are stripped before matching, as the other source assertions in
    // this repo do. Without that this test fails on the comment IN Mark.tsx
    // that explains why the rule exists -- it quotes the offending price, so
    // the prose describing the fix trips the check for the bug.
    const code = mark
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/₹|Rs\.?\s*\d|\/\s*month|per month|free trial/i);
  });
});
