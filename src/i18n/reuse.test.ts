import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { translations } from "./translations";

/**
 * A string written into JSX must not duplicate one that already has Tamil.
 *
 * The translation table has been complete for a long time — 478 keys, both
 * locales — which made the real gap invisible: interface text was being written
 * straight into components with no key at all, so a Tamil user read it in
 * English however the toggle was set. `npm run i18n:report` found 880 such
 * occurrences, and 161 of them were the *same English* as a key that already
 * carried a good Tamil translation. Those needed no translator, only a lookup,
 * and are now swapped.
 *
 * This is the half that can be enforced. It cannot tell whether new copy
 * deserves a key — that is a judgement — but it can tell when the words are
 * already in the table, which is the case that has no argument on the other
 * side. The remaining ~570 distinct strings genuinely need a translator and are
 * tracked by the report, not by this test.
 */

const ROOT = "src";
// Fixtures are never shown to a customer, and the marketing pages under
// /public are not scanned by the report either.
const SKIP = ["src/demo"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const TAMIL = /[஀-௿]/;

/** English value -> key, but only where the Tamil side is genuinely Tamil. */
const byEnglish = new Map<string, string>();
for (const [key, en] of Object.entries(translations.en)) {
  const ta = String(translations.ta[key] ?? "");
  if (!TAMIL.test(ta)) continue; // nothing gained by pointing at an untranslated key
  const norm = String(en).trim().toLowerCase();
  if (norm && !byEnglish.has(norm)) byEnglish.set(norm, key);
}

/**
 * Deliberate exceptions, each with the reason it is not a swap.
 * Keyed by the English string; the value is why.
 */
const KEEP_ENGLISH: Record<string, string> = {
  // reports.shifts is the lowercase unit in "3 shifts", not a column heading:
  // reusing it would render a lowercase word as a table header.
  shifts: "the key holds a unit fragment, not a heading",
  // The operator panel is admin-only internal tooling and is English
  // throughout; translating one label in it would read as a mistake.
  projects: "operator panel is deliberately English",
};

const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{2,60}?)\s*</g;
const ATTR = /(?:placeholder|aria-label|alt|title)="([A-Z][^"\n]{2,60})"/g;

const files = walk(ROOT);

describe("no JSX string duplicates a translated key", () => {
  it("reads the components and the table, so a silent pass is not possible", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(byEnglish.size).toBeGreaterThan(300);
  });

  it("has nothing left to swap", () => {
    const found: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const lineOf = (i: number) => src.slice(0, i).split("\n").length;
      const consider = (text: string, at: number) => {
        const raw = text.trim();
        // All-caps is never sentence copy. It is decorative, or -- as in the
        // account-deletion panel -- a token the user must literally type, which
        // is compared against the English word: translating "DELETE" there
        // would show Tamil and still demand English. i18n-report skips these
        // for the same reason, so the two stay in agreement.
        if (!/[a-z]/.test(raw)) return;
        const norm = raw.toLowerCase();
        const key = byEnglish.get(norm);
        if (!key) return;
        if (norm in KEEP_ENGLISH) return;
        found.push(`${file.replace("src/", "")}:${lineOf(at)}  "${text.trim()}" -> t("${key}")`);
      };
      for (const m of src.matchAll(JSX_TEXT)) consider(m[1], m.index!);
      for (const m of src.matchAll(ATTR)) consider(m[1], m.index!);
    }
    expect(found).toEqual([]);
  });

  it("does not keep an exception for a string that is no longer in the table", () => {
    const stale = Object.keys(KEEP_ENGLISH).filter((s) => !byEnglish.has(s));
    expect(stale).toEqual([]);
  });
});
