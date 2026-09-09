#!/usr/bin/env node
// Inventory of user-visible text that never reaches i18n.
//
// The translations file itself is complete — 478 keys, both locales, nothing
// missing. What is not complete is the app: a large amount of interface text
// is written straight into JSX with no key at all, so a Tamil user reads it in
// English regardless of the language toggle. That is invisible from the
// translations file, which is why it went unnoticed.
//
// This prints the gap as a bounded, deduplicated worklist and, where the exact
// English already exists under a translated key, names that key so the string
// can be reused rather than translated again.
//
//   npm run i18n:report          summary
//   npm run i18n:report -- --all every occurrence, with file:line
//
// Heuristic by nature: it reads JSX text nodes and the four user-facing
// attributes. Treat the output as a worklist to review, not a verdict.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";
const SKIP = ["src/demo"]; // demo fixtures are never shown to a customer

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// --- what is already translated -------------------------------------------
const tsrc = readFileSync("src/i18n/translations.ts", "utf8");
const lines = tsrc.split("\n");
const enStart = lines.findIndex((l) => /^\s*en:\s*\{/.test(l));
const taStart = lines.findIndex((l) => /^\s*ta:\s*\{/.test(l));
const parse = (from, to) => {
  const map = new Map();
  const body = lines.slice(from, to).join("\n");
  const re = /"([^"]+)":\s*\n?\s*(?:"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/gs;
  let m;
  while ((m = re.exec(body))) map.set(m[1], m[2] ?? m[3]);
  return map;
};
const en = parse(enStart, taStart);
const ta = parse(taStart, lines.length);
const TAMIL = /[஀-௿]/;

// English value -> key, only where the Tamil side is genuinely Tamil.
const reusable = new Map();
for (const [k, v] of en) {
  if (ta.has(k) && TAMIL.test(ta.get(k) ?? "")) {
    const norm = (v ?? "").trim().toLowerCase();
    if (norm && !reusable.has(norm)) reusable.set(norm, k);
  }
}

// --- what is hardcoded ----------------------------------------------------
const JSX_TEXT = />\s*([A-Z][A-Za-z][^<>{}\n]{2,60}?)\s*</g;
const ATTR = /(?:placeholder|aria-label|alt|title)="([A-Z][^"\n]{2,60})"/g;

const found = new Map(); // string -> [{file, line}]
const add = (text, file, line) => {
  const key = text.trim();
  if (!key || !/[a-z]/.test(key)) return; // all-caps tends to be decorative
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

const entries = [...found.entries()].sort((a, b) => b[1].length - a[1].length);
const occurrences = entries.reduce((n, [, v]) => n + v.length, 0);
const withKey = entries.filter(([t]) => reusable.has(t.toLowerCase()));
const needTamil = entries.filter(([t]) => !reusable.has(t.toLowerCase()));

console.log(`\ni18n coverage report`);
console.log(`  translations file : ${en.size} keys, ${ta.size} Tamil — complete`);
console.log(`  hardcoded strings : ${occurrences} occurrences, ${entries.length} distinct`);
console.log(`    reusable now    : ${withKey.length} distinct already exist under a translated key`);
console.log(`    need Tamil      : ${needTamil.length} distinct\n`);

console.log(`Reusable — swap for the named key, no translation needed:`);
for (const [text, at] of withKey.slice(0, 40)) {
  console.log(`  ${String(at.length).padStart(3)}x  ${JSON.stringify(text).padEnd(34)} -> ${reusable.get(text.toLowerCase())}`);
}

console.log(`\nNeed Tamil — most repeated first:`);
for (const [text, at] of needTamil.slice(0, process.argv.includes("--all") ? 1e9 : 60)) {
  console.log(`  ${String(at.length).padStart(3)}x  ${JSON.stringify(text)}`);
  if (process.argv.includes("--all")) {
    for (const a of at) console.log(`         ${a.file}:${a.line}`);
  }
}
if (!process.argv.includes("--all") && needTamil.length > 60) {
  console.log(`  … and ${needTamil.length - 60} more (run with --all for every occurrence)`);
}
