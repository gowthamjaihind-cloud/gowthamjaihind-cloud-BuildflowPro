import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A filled control must be readable in BOTH themes.
 *
 * This is the check whose absence let `bg-primary text-white` ship at 3.30:1 in
 * dark mode across a hundred-odd elements, and `bg-success text-white` at
 * **1.92** — a white label on a mint-green button, which is very close to
 * invisible. Neither was a slip at any one call site; both were the app-wide
 * convention, which is exactly the kind of fault a per-component review never
 * catches.
 *
 * The cause is that a status token flips lightness between themes. In light
 * mode the fills are dark (#1D4ED8, #B3261E, #046A4E) and take white. In dark
 * mode they are light (#5B87FF, #F87171, #34D399) and need a dark label. So the
 * foreground has to be a token that flips with them — `--on-fill`, exposed as
 * `text-on-primary` / `text-on-danger` / `text-on-success`.
 */

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

/**
 * Read a token from a named rule block; `.dark` redefines most of them.
 *
 * The palette carries long prose comments that contain braces, so the block
 * ends at the first `}` in the first column, not the first `}` anywhere.
 */
function token(selector: string, name: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} not found in index.css`).toBeGreaterThan(-1);
  const from = at + 1;
  const end = css.indexOf("\n}", from);
  const block = css.slice(from, end === -1 ? css.length : end);
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`).exec(block);
  expect(m, `--${name} not found in ${selector}`).not.toBeNull();
  return m![1];
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const AA = 4.5;

describe("filled controls, in both themes", () => {
  /**
   * fill token -> the foreground token a call site must pair it with.
   *
   * The hover and press states are in here for their own reason: they were
   * never redefined in `.dark`, so they stayed at the light values while
   * `--primary` went light. A primary button INVERTED its own lightness on
   * hover -- resting wanted a dark label, hovered wanted white -- and the
   * dark `text-primary-deep` sites measured 2.15 on the panel. Requiring
   * every state in the ladder to carry the same label catches that.
   */
  const PAIRS: [string, string][] = [
    ["primary", "on-fill"],
    ["primary-deep", "on-fill"],
    ["primary-press", "on-fill"],
    ["danger", "on-fill"],
    ["success", "on-fill"],
  ];

  for (const [mode, selector] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const) {
    describe(mode, () => {
      for (const [fill, fg] of PAIRS) {
        it(`${fill} carries its label at AA`, () => {
          const r = ratio(token(selector, fg), token(selector, fill));
          expect(r, `text-on-* on bg-${fill} is ${r.toFixed(2)}:1 in ${mode}`).toBeGreaterThanOrEqual(AA);
        });
      }
    });
  }

  it("uses a flipping foreground, not a fixed one", () => {
    // If --on-fill were the same in both blocks, the whole mechanism is inert.
    expect(token(":root", "on-fill").toUpperCase()).not.toBe(
      token(".dark", "on-fill").toUpperCase(),
    );
  });
});

describe("no component pairs a solid status fill with a fixed white label", () => {
  const SOLID = /^bg-(primary|danger|success)$/;

  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      // `src/demo` is NOT excluded. The codemod skipped it as "demo chrome,
      // not product UI", and a browser check then caught the demo banner's
      // "Start free trial" still at 3.30 in dark -- the public demo's
      // conversion CTA, and probably the most-looked-at button on the site.
      // Anything a visitor can see is in scope.
      if (statSync(p).isDirectory()) sources(p, out);
      else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
    }
    return out;
  }

  it("has none left", () => {
    const found: string[] = [];
    for (const file of sources("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?:"([^"\n]{0,900})"|`([^`\n]{0,900})`)/g)) {
        const body = m[1] ?? m[2] ?? "";
        const toks = body.split(/\s+/);
        if (!toks.some((t) => SOLID.test(t))) continue;
        if (!toks.some((t) => t.startsWith("text-white"))) continue;
        found.push(`${file.replace("src/", "")}: ${body.slice(0, 70)}`);
      }
    }
    expect(found).toEqual([]);
  });
});
