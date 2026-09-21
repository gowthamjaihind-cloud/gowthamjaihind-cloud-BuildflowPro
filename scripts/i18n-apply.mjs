#!/usr/bin/env node
/**
 * Take the translator's filled CSV and write it into the translations file.
 *
 *   node scripts/i18n-apply.mjs i18n-handoff/ui-strings.csv          # dry run
 *   node scripts/i18n-apply.mjs i18n-handoff/ui-strings.csv --write
 *
 * Without this, 570 filled cells come back and the handoff stalls: somebody
 * hand-copies them into `translations.ts`, which is hours of work and exactly
 * the kind of typing where a row quietly goes missing.
 *
 * It ONLY adds keys to the dictionary. Replacing the hardcoded JSX with
 * `t("key")` calls is a separate, reviewable step — a codemod that edits 570
 * call sites unattended is how you break a screen nobody opens until Monday.
 * The report names the file and line for each; do them in batches and let the
 * typecheck catch the misses.
 *
 * Refuses rather than guesses:
 *   - Tamil that contains no Tamil characters (usually a copy-paste of the
 *     English, or a row the translator skipped and someone else filled in).
 *   - A row whose `english` no longer matches the code, which means the string
 *     changed after the CSV was sent and the translation may be for the old
 *     wording.
 *   - A key that already exists with different Tamil.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";

const TAMIL = /[஀-௿]/;

// --- CSV: quoted fields, embedded commas, doubled quotes --------------------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const file = process.argv[2];
const write = process.argv.includes("--write");
if (!file) {
  console.error("usage: node scripts/i18n-apply.mjs <filled.csv> [--write]");
  process.exit(1);
}

const rows = parseCsv(readFileSync(file, "utf8"));
const header = rows[0].map((h) => h.trim());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column "${name}" missing — is this the handoff CSV?`);
  return i;
};
const [K, E, T, TR] = [col("key"), col("english"), col("tamil"), col("translate")];

const tsrc = readFileSync("src/i18n/translations.ts", "utf8");
const lines = tsrc.split("\n");
const enStart = lines.findIndex((l) => /^\s*en:\s*\{/.test(l));
const taStart = lines.findIndex((l) => /^\s*ta:\s*\{/.test(l));
const parseBlock = (from, to) => {
  const map = new Map();
  const body = lines.slice(from, to).join("\n");
  const re = /"([^"]+)":\s*\n?\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/gs;
  let m;
  while ((m = re.exec(body))) map.set(m[1], m[2] ?? m[3]);
  return map;
};
const existingEn = parseBlock(enStart, taStart);
const existingTa = parseBlock(taStart, lines.length);

// The English still in the code, so a stale row can be spotted.
const codeText = new Set();
{
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (p.startsWith("src/demo")) continue;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith(".tsx")) out.push(p);
    }
    return out;
  };
  try {
    for (const f of walk("src")) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/>\s*([A-Z][A-Za-z][^<>{}\n]{2,60}?)\s*</g)) codeText.add(m[1].trim());
      for (const m of s.matchAll(/(?:placeholder|aria-label|alt|title)="([A-Z][^"\n]{2,60})"/g))
        codeText.add(m[1].trim());
    }
  } catch { /* best effort: staleness check is a warning, not a gate */ }
}

const add = [];
const skipped = { blank: 0, notTamil: [], stale: [], conflict: [], markedNo: 0 };

for (const r of rows.slice(1)) {
  const key = (r[K] ?? "").trim();
  const english = (r[E] ?? "").trim();
  const tamil = (r[T] ?? "").trim();
  const translate = (r[TR] ?? "").trim().toUpperCase();

  if (!key || !english) continue;
  if (translate === "NO") { skipped.markedNo++; continue; }
  if (!tamil) { skipped.blank++; continue; }
  if (!TAMIL.test(tamil)) { skipped.notTamil.push(`${key}  "${tamil}"`); continue; }
  if (codeText.size && !codeText.has(english)) { skipped.stale.push(`${key}  "${english}"`); continue; }
  if (existingTa.has(key) && existingTa.get(key) !== tamil) {
    skipped.conflict.push(`${key}  was "${existingTa.get(key)}"  now "${tamil}"`);
    continue;
  }
  if (existingEn.has(key) && existingTa.get(key) === tamil) continue; // already applied
  add.push({ key, english, tamil });
}

console.log(`\ni18n apply — ${file}`);
console.log(`  ready to add      ${add.length}`);
console.log(`  still blank       ${skipped.blank}`);
console.log(`  marked do-not     ${skipped.markedNo}`);
for (const [label, list] of [
  ["NOT TAMIL", skipped.notTamil],
  ["ENGLISH CHANGED SINCE SENT", skipped.stale],
  ["CONFLICTS WITH EXISTING", skipped.conflict],
]) {
  if (!list.length) continue;
  console.log(`\n  ${label} — ${list.length}, not applied:`);
  for (const l of list.slice(0, 15)) console.log(`    ${l}`);
  if (list.length > 15) console.log(`    … and ${list.length - 15} more`);
}

if (!write) {
  console.log(`\n  Dry run. Re-run with --write to apply.\n`);
  process.exit(0);
}
if (!add.length) {
  console.log(`\n  Nothing to apply.\n`);
  process.exit(0);
}

const indent = "    ";
const esc = (v) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const enBlock = add.map((a) => `${indent}"${a.key}": "${esc(a.english)}",`).join("\n");
const taBlock = add.map((a) => `${indent}"${a.key}": "${esc(a.tamil)}",`).join("\n");

// Insert before each block's closing brace, which is the last line of the block.
const closeOf = (from) => {
  for (let i = from + 1; i < lines.length; i++) if (/^\s{2}\},?\s*$/.test(lines[i])) return i;
  throw new Error("could not find the end of a translations block");
};
const enClose = closeOf(enStart);
const taClose = closeOf(taStart);

const out = [...lines];
out.splice(taClose, 0, `${indent}// ---- Added from translator handoff ----`, taBlock);
out.splice(enClose, 0, `${indent}// ---- Added from translator handoff ----`, enBlock);
writeFileSync("src/i18n/translations.ts", out.join("\n"));

console.log(`\n  Wrote ${add.length} keys into src/i18n/translations.ts`);
console.log(`
  src/i18n/reuse.test.ts WILL NOW FAIL, and that is the point. Its rule is that
  no JSX string may duplicate an already-translated key. Adding a key without
  replacing the hardcoded text creates exactly that duplicate, so the suite goes
  red until the second half is done. It is a worklist, not a regression.

  Next: replace the hardcoded text with t("key").
    npm run i18n:report -- --all     names every file and line
  Do it in batches and let tsc catch the misses. The suite goes green when the
  last one is swapped.
`);
