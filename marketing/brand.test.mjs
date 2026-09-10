#!/usr/bin/env node
/**
 * The marketing brand must equal the product's tokens.
 *
 * This is the check whose absence let every renderer under marketing/ keep the
 * retired palette after the app moved to navy and cobalt. The app's own
 * palette test reads src/ only, and marketing is a separate package with its
 * own node_modules -- so nothing connected the two, and the films shipped in
 * the old brand around screenshots that show the new one.
 *
 * Run: node marketing/brand.test.mjs   (also wired into `npm test` via
 * marketing/brand.spec.ts, so it runs on every commit rather than when someone
 * remembers.)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { BRAND, MIRRORS } from "./brand.mjs";

/** Read a token out of a named rule block; `.dark` redefines most of them. */
export function token(css, selector, name) {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`${selector} not found in index.css`);
  const block = css.slice(at, css.indexOf("\n}", at));
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,8})`).exec(block);
  if (!m) throw new Error(`--${name} not found in ${selector}`);
  return m[1].toUpperCase();
}

export function checkBrand(cssPath = new URL("../src/index.css", import.meta.url)) {
  const css = readFileSync(cssPath, "utf8");
  const wrong = [];
  for (const [key, name] of Object.entries(MIRRORS)) {
    const want = token(css, ":root {", name);
    const got = String(BRAND[key]).toUpperCase();
    if (got !== want) wrong.push(`${key}: ${got} should be --${name} = ${want}`);
  }
  return wrong;
}

/** The values the product retired. None may appear anywhere under marketing/. */
export const RETIRED = {
  "#D97D54": "rust",
  "#B65C36": "rust-deep",
  "#B85F3B": "rust-deep, as used in the Telegram avatar",
  "#324755": "slate",
  "#26343F": "slate-deep",
  "#F0F3F4": "ice",
  "#87BCBF": "sage",
  "#CFE6E7": "sage-pale",
  "#1B1C20": "onyx",
  "#C8D1D3": "fossil",
  "#B9B0A2": "sand",
};

/**
 * Every renderer under marketing/, so a retired value cannot hide in one of
 * them. Comments are stripped first: brand.mjs and this file both NAME the
 * retired colours on purpose, so without that the check fails on its own
 * documentation. (Fourth time this trap has been worth a comment.)
 */
export function findRetired(root = new URL(".", import.meta.url)) {
  const dir = fileURLToPath(root);
  const hits = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "out") continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!/\.(mjs|js|ts|tsx|css)$/.test(entry.name)) continue;
      if (/brand\.(test\.)?mjs$/.test(entry.name)) continue; // holds the deny-list
      const code = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
        .toUpperCase();
      for (const [hex, name] of Object.entries(RETIRED)) {
        if (code.includes(hex)) hits.push(`${relative(dir, p)}: ${hex} (${name})`);
      }
    }
  };
  walk(dir);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const wrong = checkBrand();
  const retired = findRetired();
  if (wrong.length || retired.length) {
    if (wrong.length) {
      console.error("FAIL — marketing/brand.mjs has drifted from src/index.css:");
      wrong.forEach((w) => console.error(`  ${w}`));
    }
    if (retired.length) {
      console.error("FAIL — a retired brand value is still in a renderer:");
      retired.forEach((r) => console.error(`  ${r}`));
      console.error("\nImport BRAND from marketing/brand.mjs instead of pasting a hex.");
    }
    process.exit(1);
  }
  console.log(
    `PASS — ${Object.keys(MIRRORS).length} brand values match src/index.css, ` +
    "and no renderer carries a retired one.",
  );
}
