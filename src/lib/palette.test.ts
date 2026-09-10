import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The palette must live in index.css, and only there.
 *
 * Two migrations moved this product's colours — to navy/cobalt, and to the
 * status tokens — and both left a tail behind, because a colour written
 * straight into a component is invisible to a search for token names. Fifty-six
 * arbitrary-value colour classes and a whole warm-sand chart chrome survived
 * that way, and some were measurably broken rather than merely off-brand:
 *
 *   white on #6E8CA0 (two filled buttons)   3.55:1 — below AA
 *   #2E8B6F as body text (cost dashboard)   4.17:1 — below AA
 *   #6E8CA0 as a section heading            3.55:1 — below AA
 *   #8A8078 as a donut's centre label       3.86:1 — below AA
 *   a fixed pale chip under text-ink-muted  inverts in dark mode
 *
 * Nothing failed while any of that was true, so these are the checks that were
 * missing rather than a style preference.
 *
 * One thing to know before editing this file: do NOT write an arbitrary colour
 * class in its literal form anywhere here, even in a comment. Tailwind's
 * scanner reads every file in the project, comments included, so naming one
 * makes Tailwind GENERATE it — the first draft of these notes shipped two dead
 * utilities into the CSS bundle that way. Describe them; do not spell them.
 */

const ROOT = "src";

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Comments are removed before scanning.
 *
 * The replacements deliberately record the colour they replaced, so the reader
 * can see what changed — which means the retired values appear all over the
 * codebase as prose. Without this the check fails on its own documentation.
 * (Third time this has bitten: chartTheme.test.ts and triggers.test.ts too.)
 */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // JSX {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // keep the // in https://
}

const files = sources(ROOT).map((path) => ({
  path,
  code: stripComments(readFileSync(path, "utf8")),
}));

/**
 * No /g flag, deliberately: this is used with `.test()` in two loops, and a
 * global regex carries `lastIndex` between calls, so the second file scanned
 * would be checked from an arbitrary offset and could pass by accident.
 */
const HEX = /#[0-9A-Fa-f]{3,8}\b/;

describe("the palette lives in index.css", () => {
  it("reads the source files at all, so a silent pass is not possible", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no arbitrary colour class, in any component", () => {
    // A colour inlined into a utility. Even a correct one written this way is a
    // colour that will not follow the next palette change or the dark theme.
    const found = files.flatMap(({ path, code }) =>
      [...code.matchAll(/\b[a-z-]+-\[(#[0-9A-Fa-f]{3,8})\]/g)].map(
        (m) => `${path}: ${m[0]}`,
      ),
    );
    expect(found).toEqual([]);
  });

  /**
   * Where a literal colour is genuinely unavoidable, because the thing being
   * coloured is outside our CSS. Each entry states why.
   */
  // exportUtils.ts is absent on purpose: jsPDF takes RGB tuples, so that file
  // already holds numbers rather than hex, with each one commented with the
  // token it mirrors.
  const LITERALS_ALLOWED: Record<string, string> = {
    "src/components/BrandLogo.tsx":
      "the brand mark; one drawing in both themes, and rasterised into favicons",
    "src/hooks/useRazorpayCheckout.ts":
      "Razorpay renders its own iframe; checked against --primary below",
    "src/components/ProgressReportsView.tsx":
      "html2canvas capture background — a printed page, always white",
  };

  it("keeps literal colours to the places that cannot use a variable", () => {
    const offenders = files
      .filter(({ path, code }) => HEX.test(code) && !(path in LITERALS_ALLOWED))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("does not keep an allowance for a file that no longer needs one", () => {
    const stale = Object.keys(LITERALS_ALLOWED).filter((path) => {
      const f = files.find((x) => x.path === path);
      return !f || !HEX.test(f.code);
    });
    expect(stale).toEqual([]);
  });

  it("keeps the Razorpay checkout theme equal to --primary", () => {
    const css = readFileSync("src/index.css", "utf8");
    const primary = /\n\s*--primary:\s*(#[0-9A-Fa-f]{6})/.exec(css)?.[1];
    expect(primary, "--primary not found in :root").toBeTruthy();
    const hook = readFileSync("src/hooks/useRazorpayCheckout.ts", "utf8");
    const theme = /theme:\s*\{\s*color:\s*"(#[0-9A-Fa-f]{6})"/.exec(hook)?.[1];
    expect(theme?.toUpperCase()).toBe(primary!.toUpperCase());
  });

  it("carries no colour from either retired palette", () => {
    // The exact values that were still in the components. Kept as a list
    // because a component can hold a literal legitimately (above) and still
    // must not hold one of THESE.
    const retired: Record<string, string> = {
      "#3A4F5F": "slate — dark surfaces",
      "#465D6E": "slate — hover/border on those",
      "#5C7889": "slate — button hover",
      "#6E8CA0": "slate — accents and two failing buttons",
      "#46617C": "slate — body text",
      "#E2E8ED": "slate — neutral chips",
      "#C5D2DB": "slate — chip borders",
      "#27363F": "slate — headings",
      "#786F67": "sand — chart axis",
      "#A99E92": "sand — chart axis, dark",
      "#ECE6DD": "sand — gauge track",
      "#2E2820": "sand — gauge track, dark",
      "#DFD8CD": "sand — bar target",
      "#3A332B": "sand — bar target, dark",
      "#221D18": "sand — donut ring, dark",
      "#8A8078": "sand — donut label",
      "#C8D1D3": "fossil",
      "#B9B0A2": "sand",
      "#1B1C20": "onyx",
    };
    const found: string[] = [];
    for (const { path, code } of files) {
      const upper = code.toUpperCase();
      for (const [hex, why] of Object.entries(retired)) {
        if (upper.includes(hex)) found.push(`${path}: ${hex} (${why})`);
      }
    }
    expect(found).toEqual([]);
  });

  it("keeps the retired values out of index.css too", () => {
    const css = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const found = ["#3A4F5F", "#6E8CA0", "#786F67", "#ECE6DD", "#221D18", "#C8D1D3", "#B9B0A2", "#1B1C20"]
      .filter((hex) => css.toUpperCase().includes(hex));
    expect(found).toEqual([]);
  });
});
