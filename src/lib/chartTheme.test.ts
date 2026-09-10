import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { chartChrome, chartSeries } from "./chartTheme";

/**
 * The checks that were missing while the charts wore the retired palette.
 *
 * Each dashboard used to carry its own `dark ? … : …` literals, so when the
 * brand moved from warm sand to navy the charts did not come along — axis
 * #786F67, gauge track #ECE6DD, donut ring #221D18 — and nothing failed.
 * Reading index.css here means the next palette change breaks a test rather
 * than shipping mismatched charts.
 */

/**
 * Comments are stripped first. The palette block deliberately NAMES the retired
 * colours in prose so the next reader knows what went wrong, and the check
 * below looks for exactly those strings — without this it fails on its own
 * documentation. (The same trap caught functions/src/triggers.test.ts.)
 */
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations inside one rule block, since `.dark` redeclares tokens. */
function block(selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} block not found in index.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("\n}", at));
}

const ROOT = block(":root {");
const DARK = block(".dark {");

/** Every `var(--x)` name reachable from a chartTheme value. */
function varNames(value: unknown): string[] {
  const flat = Array.isArray(value) ? value.join(" ") : String(value);
  return [...flat.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]);
}

const chromeVars = Object.entries(chartChrome).flatMap(([k, v]) =>
  varNames(v).map((name) => [k, name] as const),
);
const seriesVars = Object.entries(chartSeries).flatMap(([k, v]) =>
  varNames(v).map((name) => [k, name] as const),
);

describe("chart palette", () => {
  it("names a variable for every entry, never a bare colour", () => {
    const literal = [...Object.entries(chartChrome), ...Object.entries(chartSeries)]
      .filter(([, v]) => /#[0-9A-Fa-f]{3,8}|\brgba?\(/.test(Array.isArray(v) ? v.join(" ") : String(v)))
      .map(([k]) => k);
    expect(literal).toEqual([]);
  });

  it("finds the variables at all, so a silent pass is not possible", () => {
    expect(chromeVars.length).toBeGreaterThanOrEqual(5);
    expect(seriesVars.length).toBeGreaterThanOrEqual(9);
  });

  it("declares every variable it names in :root", () => {
    const missing = [...chromeVars, ...seriesVars]
      .filter(([, name]) => !new RegExp(`\\n\\s*${name}:`).test(ROOT))
      .map(([k, name]) => `${k} -> ${name}`);
    expect(missing).toEqual([]);
  });

  it("resolves the chrome to interface tokens, so a palette change carries the charts", () => {
    // --chart-axis: var(--ink-muted) and friends. A hex here would be a chart
    // colour that stops following the brand, which is how this started.
    const expected: Record<string, string> = {
      "--chart-axis": "--ink-muted",
      "--chart-grid": "--ink-muted",
      "--chart-track": "--divider",
      "--chart-track-step": "--ink-muted",
      "--chart-surface": "--panel",
    };
    for (const [key, want] of Object.entries(expected)) {
      const decl = new RegExp(`\\n\\s*${key}:\\s*([^;]+);`).exec(ROOT);
      expect(decl, `${key} not declared in :root`).not.toBeNull();
      expect(varNames(decl![1]), `${key} should resolve to ${want}`).toContain(want);
    }
  });

  it("restates every per-mode series colour in .dark", () => {
    // A series variable declared only in :root keeps its light-mode colour on
    // a near-black canvas. Chrome is exempt: it points at --ink-muted,
    // --divider and --panel, which .dark has already moved.
    const perMode = seriesVars
      .map(([, name]) => name)
      .filter((name) => /^--chart-(budget|under|over|amber|cat-\d)$/.test(name));
    expect(perMode.length).toBeGreaterThanOrEqual(8);
    const notRestated = [...new Set(perMode)].filter(
      (name) => !new RegExp(`\\n\\s*${name}:`).test(DARK),
    );
    expect(notRestated).toEqual([]);
  });

  it("carries no colour from the retired warm palette", () => {
    const retired = ["#786F67", "#A99E92", "#ECE6DD", "#2E2820", "#DFD8CD", "#3A332B", "#221D18", "#8A8078"];
    const declared = (ROOT + DARK).toUpperCase();
    expect(retired.filter((h) => declared.includes(h))).toEqual([]);
  });

  it("keeps the categorical ramp distinct, so adjacent slices are separable", () => {
    expect(new Set(chartSeries.categories).size).toBe(chartSeries.categories.length);
    for (const scope of [ROOT, DARK]) {
      const values = [1, 2, 3, 4].map((n) => {
        const m = new RegExp(`\\n\\s*--chart-cat-${n}:\\s*([^;]+);`).exec(scope);
        return m?.[1].trim().toUpperCase();
      });
      expect(new Set(values).size, `cat ramp has a duplicate: ${values.join(", ")}`).toBe(4);
    }
  });
});
