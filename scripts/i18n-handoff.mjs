#!/usr/bin/env node
/**
 * Turn the i18n gap into something a translator can actually work in.
 *
 *   npm run i18n:handoff
 *
 * `i18n-report` prints the gap to a terminal, which is right for a developer
 * checking progress and useless for the person who has to do the work. This
 * writes two CSVs a translator opens in Excel or Sheets, types one column into,
 * and sends back — plus a brief, because a list of 570 bare strings out of
 * context produces 570 plausible wrong answers.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: propose any Tamil. Not a draft, not a
 * "suggestion to check". Machine Tamil in this codebase has been written and
 * reverted three times; once a wrong word is sitting in the cell, a reviewer
 * corrects it rather than translates freshly, and the error survives. The Tamil
 * column ships empty.
 *
 * The part worth having is the opposite: marking what must NOT be translated.
 * The report lists "Sitetru" seven times as needing Tamil. It is the brand. A
 * translator handed that list transliterates it, and now the product has two
 * names. Same for units on a bill of quantities and for statutory codes, where
 * a translated "GSTIN" is not just odd but wrong on a document an auditor
 * reads.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = "src";
const SKIP = ["src/demo"];
const OUT_DIR = "i18n-handoff";

// ---------------------------------------------------------------- extract ---
// Same heuristic as scripts/i18n-report.mjs, deliberately: two extractors that
// drift would mean the worklist and the progress count disagree.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const tsrc = readFileSync("src/i18n/translations.ts", "utf8");
const tlines = tsrc.split("\n");
const enStart = tlines.findIndex((l) => /^\s*en:\s*\{/.test(l));
const taStart = tlines.findIndex((l) => /^\s*ta:\s*\{/.test(l));
const parse = (from, to) => {
  const map = new Map();
  const body = tlines.slice(from, to).join("\n");
  const re = /"([^"]+)":\s*\n?\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/gs;
  let m;
  while ((m = re.exec(body))) map.set(m[1], m[2] ?? m[3]);
  return map;
};
const en = parse(enStart, taStart);
const ta = parse(taStart, tlines.length);
const TAMIL = /[஀-௿]/;

const reusable = new Map();
for (const [k, v] of en) {
  if (ta.has(k) && TAMIL.test(ta.get(k) ?? "")) {
    const norm = (v ?? "").trim().toLowerCase();
    if (norm && !reusable.has(norm)) reusable.set(norm, k);
  }
}

const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{2,60}?)\s*</g;
const ATTR = /(?:placeholder|aria-label|alt|title)="([A-Z][^"\n]{2,60})"/g;

const found = new Map();
const add = (text, file, line) => {
  const key = text.trim();
  if (!key || !/[a-z]/.test(key)) return;
  if (/^[A-Z][a-z]{0,2}$/.test(key)) return;
  if (!found.has(key)) found.set(key, []);
  found.get(key).push({ file: file.replace("src/", ""), line });
};

for (const file of walk(ROOT)) {
  const s = readFileSync(file, "utf8");
  const lineOf = (i) => s.slice(0, i).split("\n").length;
  for (const m of s.matchAll(JSX_TEXT)) add(m[1], file, lineOf(m.index));
  for (const m of s.matchAll(ATTR)) add(m[1], file, lineOf(m.index));
}

// ------------------------------------------------------- do not translate ---
/**
 * The brand. Never translated, never transliterated. One name.
 */
const BRAND = /^Sitetru\b/i;

/**
 * Units as they appear on an Indian bill of quantities. A translated unit makes
 * a quantity ambiguous against the vendor's own paperwork, which is the one
 * place the number has to be checkable.
 */
const UNIT = /^(MT|Kg|Nos|Bag|Bags|Cum|Sqm|Sqft|Rft|Brass|Litre|L|ml|mm|cm|m|ft|%|₹)$/;

/**
 * Statutory and trade codes. "GSTIN" on a document an auditor reads is the
 * term, in any language.
 */
const CODE_TOKEN = /\b(GSTIN|GST|HSN|SAC|PAN|TDS|IGST|CGST|SGST|PO|GRN|RA|BOQ|WBS|UPI|IFSC|NEFT|RTGS|EMI|QR)\b/g;

/**
 * Three different situations, which the first version of this collapsed into
 * one and got wrong: "GRN + vendor bill recorded and matched to the PO." came
 * out marked "normally kept as-is", which would have left a whole sentence in
 * English. Containing a code is not the same as being one.
 */
function classify(text) {
  const t = text.trim();
  if (BRAND.test(t)) return ["NO", "Brand name — never translate or transliterate"];
  if (UNIT.test(t)) return ["NO", "Unit — must match the vendor's paperwork"];

  const codes = [...new Set([...t.matchAll(CODE_TOKEN)].map((m) => m[0]))];
  if (!codes.length) return ["YES", ""];

  // The whole string is the code, e.g. "GSTIN".
  if (CODE_TOKEN.test(t) && t.replace(CODE_TOKEN, "").trim() === "") {
    CODE_TOKEN.lastIndex = 0;
    return ["NO", "Statutory code — the term in Tamil too"];
  }
  CODE_TOKEN.lastIndex = 0;
  // A code inside a label or sentence: translate around it.
  return ["YES", `Translate, but keep ${codes.join(", ")} as-is`];
}

// ------------------------------------------------------------ proposed key --
/** `components/purchase/GoodsReceiptForm.tsx` -> `goodsReceiptForm` */
const nsOf = (file) => {
  const base = file.split("/").pop().replace(/\.tsx$/, "");
  return base.charAt(0).toLowerCase() + base.slice(1);
};
/** "Select Vendor" -> "selectVendor" */
const slug = (text) =>
  text
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("");

/** Which screen a translator would see this on. */
const screenOf = (file) =>
  file
    .replace(/\.tsx$/, "")
    .split("/")
    .pop()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

// ------------------------------------------------------------------ build ---
const entries = [...found.entries()].sort((a, b) => b[1].length - a[1].length);
const needTamil = entries.filter(([t]) => !reusable.has(t.toLowerCase()));

const usedKeys = new Set(en.keys());
const uiRows = [
  ["key", "english", "tamil", "translate", "note", "screen", "occurrences", "first_seen"],
];
for (const [text, at] of needTamil) {
  const [translate, note] = classify(text);
  let key = `${nsOf(at[0].file)}.${slug(text)}`;
  let n = 2;
  while (usedKeys.has(key)) key = `${nsOf(at[0].file)}.${slug(text)}${n++}`;
  usedKeys.add(key);
  const screens = [...new Set(at.map((a) => screenOf(a.file)))].slice(0, 3).join("; ");
  uiRows.push([
    key,
    text,
    "", // ← the translator fills this. Deliberately empty.
    translate,
    note,
    screens,
    at.length,
    `${at[0].file}:${at[0].line}`,
  ]);
}

// --- WBS template names: a different job, so a different sheet --------------
const wbsSrc = readFileSync("src/lib/wbsTemplates.ts", "utf8");
const wbsNames = [...wbsSrc.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
const wbsRows = [["english", "tamil", "note"]];
for (const n of [...new Set(wbsNames)]) {
  const [translate, note] = classify(n);
  wbsRows.push([n, "", translate === "YES" ? "" : note]);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "ui-strings.csv"), csv(uiRows));
writeFileSync(join(OUT_DIR, "wbs-template-names.csv"), csv(wbsRows));

const counts = uiRows.slice(1).reduce((acc, r) => ((acc[r[3]] = (acc[r[3]] || 0) + 1), acc), {});
console.log(`\ni18n translator handoff -> ${OUT_DIR}/`);
console.log(`  ui-strings.csv          ${uiRows.length - 1} rows`);
console.log(`      to translate        ${counts.YES ?? 0}`);
console.log(`      keep as-is          ${counts.NO ?? 0}  (brand, units)`);
console.log(`      translator decides  ${counts.CHECK ?? 0}  (statutory codes)`);
console.log(`  wbs-template-names.csv  ${wbsRows.length - 1} rows`);
console.log(`\n  The 'tamil' column is empty on purpose. See ${OUT_DIR}/BRIEF.md\n`);
