import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { layout } from "./kinetic-timeline";
import { crop, focusAt, WIN_H, WIN_W } from "./kinetic-camera";
import { effectEvents, readGrid } from "./films/kinetic.mjs";

/**
 * Checks on the kinetic cut that a render cannot make for you.
 *
 * These live at `marketing/*.spec.ts` rather than next to the code they test,
 * and that is load-bearing rather than tidy: the root vitest config collects
 * `marketing/*.spec.ts` ONLY. `marketing/` is a separate package with its own
 * node_modules and no CI step of its own, which is how five renderers once kept
 * a retired palette for months. A test under remotion/src would never run.
 *
 * It imports kinetic-timeline.ts and kinetic-camera.ts -- pure, beside whip.ts,
 * OUTSIDE marketing/remotion -- and reads film.json with fs, so the arithmetic
 * under test is the same code the film renders with. It must not import
 * anything from inside marketing/remotion: see kinetic-timeline.ts.
 *
 * What is worth pinning is everything whose failure is SILENT. A scene too
 * short to read still renders. A spotlight pointing off the edge of its window
 * still renders. An invented caption still renders. None of them throw, and
 * none show up in a progress bar that says 1620/1620.
 */

const ROOT = join(__dirname, "..");
const KIN = join(ROOT, "marketing/remotion/src/kinetic");
const read = (p: string) => readFileSync(join(KIN, p), "utf8");
const film = JSON.parse(read("film.json"));
const { BAR, BEAT, FPS, HALF, KINETIC_SECONDS, TIMELINE, TRANSITION } = layout(film);
const strip = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const features = TIMELINE.filter((s) => s.kind !== "title");

describe("the tempo grid", () => {
  it("puts a whole number of frames on every beat, bar and half-transition", () => {
    // A fractional beat still renders a film -- one whose transitions drift
    // against the whooshes the score lands on them.
    expect(Number.isInteger(BEAT)).toBe(true);
    expect(BEAT).toBe(15);
    expect(Number.isInteger(BAR)).toBe(true);
    // Transitions are centred on the bar line, so half of one must be whole.
    expect(Number.isInteger(HALF)).toBe(true);
    expect(HALF * 2).toBe(TRANSITION);
  });

  it("lasts long enough to explain and short enough to finish", () => {
    expect(KINETIC_SECONDS).toBeGreaterThan(40);
    expect(KINETIC_SECONDS).toBeLessThan(70);
  });
});

describe("the pace", () => {
  /*
    The regression guard for the reason this edit exists.

    The first cut changed shot every 0.8 seconds and the verdict was that a
    customer could not understand any of it. Nothing in the pipeline objected,
    because nothing in the pipeline knew a film is supposed to be READ. These
    two tests are that knowledge, written down.
  */
  it("gives every feature at least two bars", () => {
    for (const s of features) {
      expect(s.bars, `${s.id} is ${s.bars} bar(s)`).toBeGreaterThanOrEqual(2);
    }
  });

  it("leaves time to read every explainer at a comfortable pace", () => {
    // Visible time is the scene minus its two half-transitions. 3.5 words a
    // second is a relaxed reading pace for a short line; a film that needs more
    // than that is asking the viewer to race it.
    for (const s of features) {
      const words = [s.line ?? "", ...(s.chips ?? [])].join(" ").split(/\s+/).filter(Boolean).length;
      const visible = (s.dur - TRANSITION) / FPS;
      expect(words / visible, `${s.id}: ${words} words in ${visible.toFixed(1)}s`).toBeLessThanOrEqual(3.5);
    }
  });
});

describe("the content", () => {
  const appSource = (() => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(readFileSync(p, "utf8"));
      }
    };
    walk(join(ROOT, "src"));
    return out.join("\n");
  })();

  it("says nothing the product does not say", () => {
    /*
      The rule the whole film is built on, and the one a viewer cannot check by
      watching it: every word on screen is a string the APP displays. The
      explainer lines are each screen's own one-line description, the chips are
      Procurement's real tab names, the kicker is the sidebar label.

      The film is made of real screenshots, so a sentence written FOR the film
      laid beside them would be the one element in frame that is a claim rather
      than a record -- and this repo has already shipped an end card with a
      price no plan charged. Test files are excluded from the haystack so a test
      quoting a string cannot vouch for it.
    */
    const strings = film.scenes.flatMap((s: any) => [s.kicker, s.line, s.url, ...(s.chips ?? [])]).filter(Boolean);
    expect(strings.length).toBeGreaterThan(15);
    for (const str of strings) {
      expect(appSource.includes(str), `"${str}" appears nowhere in the app`).toBe(true);
    }
  });

  it("references only images that exist", () => {
    // A missing staticFile renders as an empty box, not an error.
    const pub = join(ROOT, "marketing/remotion/public");
    const wall = [...read("Title.tsx").matchAll(/"(l-[^"]+\.png)"/g)].map((m) => m[1]);
    const imgs = [
      ...film.scenes.flatMap((s: any) => [s.src, ...(s.images ?? [])]).filter(Boolean),
      ...wall,
    ];
    expect(wall.length).toBeGreaterThan(8);
    for (const f of imgs) expect(existsSync(join(pub, f)), `missing ${f}`).toBe(true);
  });

  it("carries no claim that can go stale", () => {
    // An end card that says only the name and the address cannot go out of
    // date when the pricing does.
    const all = JSON.stringify(film) + strip(read("Title.tsx")) + strip(read("Explainer.tsx"));
    expect(all).not.toMatch(/₹\s*\d|Rs\.?\s*\d|\/\s*month|per month|free trial/i);
  });
});

describe("the camera", () => {
  const screens = TIMELINE.filter((s) => s.kind === "screen");

  it("moves forward in time, within the scene", () => {
    for (const s of screens) {
      const keys = s.camera!;
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i].at, `${s.id} key ${i}`).toBeGreaterThanOrEqual(keys[i - 1].at);
      }
      // Finished before the scene starts leaving, or the push is cut off mid-move.
      expect(keys[keys.length - 1].at, `${s.id} camera`).toBeLessThanOrEqual(s.dur - HALF);
      for (const m of s.marks ?? []) expect(m.at, `${s.id} mark`).toBeLessThanOrEqual(s.dur - HALF);
    }
  });

  it("gets close enough to read", () => {
    /*
      The measured legibility fix. Body text in the captures is ~28 source px;
      the window is WIN_W wide; so a crop W px wide shows that text at
      28 * WIN_W / W. The first draft's closest crops were ~2450 wide -- 13px at
      a 1130 window -- and the screens were visible and unreadable. Every screen
      scene has to get to a crop where body text is at least 16px.
    */
    for (const s of screens) {
      const closest = Math.min(...s.camera!.map((k) => k.w));
      expect((28 * WIN_W) / closest, `${s.id} closest crop ${closest}px`).toBeGreaterThanOrEqual(16);
    }
  });

  it("has every spotlight inside the frame when it lands", () => {
    /*
      The failure this guards is invisible in review: a mark whose rect is
      right, under a camera that has panned somewhere else, draws its ring off
      the edge of the window. The scene still "works"; the sentence just points
      at nothing. Checked at the moment each mark has finished gliding in.
    */
    for (const s of screens) {
      for (const m of s.marks ?? []) {
        const c = crop(focusAt(s.camera!, m.at + 16), WIN_W, WIN_H, 3200, 2000);
        const left = -c.left / c.scale;
        const top = -c.top / c.scale;
        const right = left + WIN_W / c.scale;
        const bottom = top + WIN_H / c.scale;
        const where = `${s.id} mark @${m.at}`;
        expect(m.x, where).toBeGreaterThanOrEqual(left - 1);
        expect(m.y, where).toBeGreaterThanOrEqual(top - 1);
        expect(m.x + m.w, where).toBeLessThanOrEqual(right + 1);
        expect(m.y + m.h, where).toBeLessThanOrEqual(bottom + 1);
      }
    }
  });
});

describe("the transitions", () => {
  it("are continuous everywhere -- no scene after the first arrives on a hard cut", () => {
    for (const s of TIMELINE.slice(1)) expect(s.enter, `${s.id} has no transition`).toBeTruthy();
  });

  it("open every iris from something the viewer was looking at", () => {
    // The iris origin is derived from the previous scene's last highlight. A
    // previous scene with no highlight would open it from the frame centre --
    // a transition that claims a connection it does not have.
    for (const s of TIMELINE) {
      if (s.enter !== "iris") continue;
      const prev = TIMELINE[s.index - 1];
      expect(prev.marks?.length ?? 0, `${s.id} irises from ${prev.id}, which has no mark`).toBeGreaterThan(0);
    }
  });
});

describe("the narration", () => {
  // Mirrors films/kinetic.mjs: a line starts VO_LEAD after its scene arrives
  // and must end VO_TAIL before the next transition.
  const LEAD = 0.3;
  const TAIL = 0.3;

  it("narrates every scene", () => {
    for (const s of TIMELINE) expect(s.vo, `${s.id} has no narration`).toBeTruthy();
  });

  it("gives every line room to be spoken at a natural pace", () => {
    /*
      The build measures the synthesised lines exactly and fails on overflow,
      but only on a machine with the voice model. This is the cheap version CI
      can run: 2.6 words a second is about where unhurried narration sits, and
      a line that needs more than that in its window would have to be SPED UP
      to fit -- the quickest way to make a voice sound synthetic, and the thing
      this pipeline refuses to do.
    */
    for (const s of TIMELINE) {
      const words = (s.vo ?? "").split(/\s+/).filter(Boolean).length;
      const room = s.dur / FPS - LEAD - TAIL;
      expect(words / room, `${s.id}: ${words} words in ${room.toFixed(1)}s`).toBeLessThanOrEqual(2.6);
    }
  });

  it("names the product the way the phonemiser says it", () => {
    // "Sitetru" is SITE-troo on its own (/saittru:/). Hyphenated or spaced
    // spellings change how it is spoken, and nothing downstream would notice.
    for (const s of TIMELINE) expect(s.vo ?? "").not.toMatch(/site[\s-]tru/i);
  });
});

describe("the accent", () => {
  const indianize = (ipa: string, level: string) =>
    execFileSync(
      "python3",
      ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "marketing/voice"))})\n` +
        `from accent import indianize\nprint(indianize(sys.stdin.read(), ${JSON.stringify(level)}), end="")`],
      { input: ipa, encoding: "utf8" },
    );

  it("keeps the affricates in 'job' and 'change' whole", () => {
    // t and d become retroflex -- but dʒ and tʃ are single sounds, and
    // retroflexing their first half turns "job" into something else.
    const out = indianize("dʒˈɑːb tʃˈeɪndʒ", "full");
    expect(out).toContain("dʒ");
    expect(out).toContain("tʃ");
    expect(out).not.toMatch(/ɖʒ|ʈʃ/);
  });

  it("turns the American flap into a t, not into the Indian tapped r", () => {
    // "water" is wɔːɾɚ in en-us. The flap must become ʈ BEFORE r becomes ɾ,
    // or "water" and "warer" come out the same.
    expect(indianize("wˈɔːɾɚ", "full")).toBe("ʋˈɔːʈəɾ");
  });

  it("leaves the r and the vowels alone at the light level", () => {
    const out = indianize("ɹˈaɪt fɹʌm pˈeɪpɚ", "light");
    expect(out).toContain("ɹ");
    expect(out).toContain("ʌ");
    expect(out).toContain("ɚ");
    expect(out).toContain("eː");
  });

  it("emits nothing Kokoro would silently drop", () => {
    // Kokoro DROPS phonemes it has no id for, so a target outside its
    // vocabulary deletes sounds instead of changing them. These are the
    // symbols accent.py may introduce; each is in Kokoro's vocab (checked
    // against the real tokenizer in synth.py at synthesis time).
    const out = indianize("θɹˈiː ðə wˈɜːk dˈeɪ ɡˈoʊ tˈɛlᵻɡɹˌæm wʌts", "full");
    const introduced = new Set([...out].filter((c) => !"θɹiːðəwɜkdeɪɡoʊtɛlᵻæmʌsˈˌ ".includes(c)));
    for (const c of introduced) expect("ʈɖɾʋːʰəɛɔeoatdɪ").toContain(c);
  });
});

describe("the voice", () => {
  it("names one Kokoro voice, with an accent only where one is wanted", () => {
    // `accent` respells American IPA as Indian English (voice/accent.py). It
    // belongs with the Hindi-trained voices; on an American voice it would make
    // an American speaker do an Indian accent -- the mirror of the problem the
    // respelling exists to fix.
    const v = film.voice;
    expect(v.name).toMatch(/^[a-z]{2}_[a-z]+$/);
    if (v.accent) {
      expect(["light", "full"]).toContain(v.accent);
      expect(v.name, "accent set on a non-Hindi voice").toMatch(/^h[fm]_/);
    }
  });
});

describe("the music-only version", () => {
  const grid = readGrid();
  const events = effectEvents(grid);

  it("takes every effect timing from film.json, not from a constant in a component", () => {
    // The sounds are placed from film.json. A component that went back to its
    // own number would move the picture and leave the sound behind.
    const title = strip(read("Title.tsx"));
    expect(title).toMatch(/EFFECTS\.logo\.(intro|outro)/);
    expect(title).toMatch(/EFFECTS\.name\.(intro|outro)/);
    expect(title).not.toMatch(/closing \? 4 : 10/);
    expect(strip(read("Explainer.tsx"))).toMatch(/EFFECTS\.chips\.at \+ i \* EFFECTS\.chips\.stagger/);
  });

  it("puts a bell on every spotlight and a pop on every chip", () => {
    const marks = TIMELINE.reduce((n, s) => n + (s.marks?.length ?? 0), 0);
    const chips = TIMELINE.reduce((n, s) => n + (s.chips?.length ?? 0), 0);
    expect(events.filter((e: any) => e.kind === "bell")).toHaveLength(marks);
    expect(events.filter((e: any) => e.kind === "pop")).toHaveLength(chips);
    // Three logo notes at each end.
    expect(events.filter((e: any) => e.kind === "rise")).toHaveLength(6);
  });

  it("lands every sound inside the scene whose effect it is", () => {
    for (const e of events as any[]) {
      expect(e.t).toBeGreaterThanOrEqual(0);
      expect(e.t).toBeLessThan(grid.seconds);
    }
    // And each bell inside its own scene, not leaked across a boundary.
    for (const s of grid.scenes) {
      for (const m of s.marks ?? []) {
        const t = s.startS + m.at / grid.fps;
        expect(t, `${s.id} bell`).toBeLessThan(s.startS + s.durS);
        expect(events.some((e: any) => e.kind === "bell" && Math.abs(e.t - t) < 0.002)).toBe(true);
      }
    }
  });
});

/** ffmpeg is not on the CI runner; the luma check skips itself there. */
const CAN_MEASURE = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("the light theme", () => {
  const files = ["Kinetic.tsx", "Stage.tsx", "Explainer.tsx", "Title.tsx", "Mark.tsx"];

  it("draws its own chrome with light-ground tokens only", () => {
    // `primaryOnDark` is a LIFTED cobalt for navy surfaces; on this film's
    // off-white ground it measures about 1.5:1 -- unreadable.
    for (const f of files) {
      expect(strip(read(f)), `${f} reaches for a dark-surface token`).not.toMatch(/C\.surfaceDark|C\.primaryOnDark/);
    }
    const palette = read("palette.ts");
    expect(palette).toContain("ground: C.page");
    expect(palette).toContain("accent: C.primary");
  });

  it("cuts from the light screenshot set", () => {
    for (const s of film.scenes as any[]) {
      if (s.src) expect(s.src, `${s.id}`).toMatch(/^l-/);
    }
  });

  it.skipIf(!CAN_MEASURE)("and those screenshots are actually light", () => {
    // The filename is a claim; this is the measurement. capture-screens.mjs
    // defaults to dark, so a re-capture that forgets FILM_THEME=light writes
    // dark frames under light names and nothing downstream complains.
    const luma = (file: string): number => {
      const out = execFileSync(
        "ffmpeg",
        ["-v", "error", "-i", file, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"],
        { encoding: "utf8" },
      );
      return Number(/=([0-9.]+)/.exec(out.trim())![1]);
    };
    const pub = join(ROOT, "marketing/remotion/public");
    for (const f of ["l-01-dashboard.png", "l-06-inventory.png", "l-11-reports.png"]) {
      expect(luma(join(pub, f)), `${f} is not a light-theme capture`).toBeGreaterThan(140);
    }
  });
});

describe("the brand mark", () => {
  const app = readFileSync(join(ROOT, "src/components/BrandLogo.tsx"), "utf8");
  const mark = read("Mark.tsx");
  const num = (name: string) => Number(new RegExp(`export const ${name} = (\\d+)`).exec(mark)![1]);

  it("is the product's drawing, not a redrawing of it", () => {
    // Mark.tsx rebuilds the logo as three animatable rects -- a second copy of
    // the mark, which is how a logo quietly becomes two. Pinned to the app's.
    const appRects = [...app.matchAll(/x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="(\d+)"/g)].map((m) => ({
      x: +m[1], y: +m[2], w: +m[3], h: +m[4], rx: +m[5],
    }));
    const filmBars = [...mark.matchAll(/\{ x: (\d+), h: (\d+) \}/g)].map((m) => ({ x: +m[1], h: +m[2] }));
    expect(appRects).toHaveLength(3);
    expect(filmBars).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(filmBars[i].x).toBe(appRects[i].x);
      expect(filmBars[i].h).toBe(appRects[i].h);
      expect(appRects[i].y + appRects[i].h).toBe(num("BASELINE"));
      expect(appRects[i].w).toBe(num("BAR_W"));
      expect(appRects[i].rx).toBe(num("BAR_R"));
    }
  });

  it("keeps the tile's cobalt", () => {
    expect(app).toContain('fill="#1D4ED8"');
    expect(mark).toContain("C.primary");
  });
});

describe("the composition", () => {
  it("loads the font, which the older Hero composition does not", () => {
    // Hero.tsx mounts no font loader, so it has always rendered in a fallback
    // face, silently. Fonts loads Manrope from disk and holds the render.
    const k = read("Kinetic.tsx");
    expect(k).toMatch(/<Fonts\s*\/>/);
    expect(k).toContain('from "../film/Fonts"');
  });

  it("is described on the landing page at its real length", () => {
    // HeroVideo's caption is hand-typed ("Watch · 54 seconds"), and it was
    // already wrong once -- it said 29 after the film had become 54.
    const hero = readFileSync(join(ROOT, "src/components/HeroVideo.tsx"), "utf8");
    const secs = Math.round(KINETIC_SECONDS);
    expect(hero).toContain(`Watch · ${secs} seconds`);
    expect(hero).toContain(`${secs} seconds, with sound`);
  });
});
