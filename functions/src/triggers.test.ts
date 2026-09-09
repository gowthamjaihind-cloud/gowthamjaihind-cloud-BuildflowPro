import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every Firestore trigger must name the database it listens to.
 *
 * This project's data lives in a NAMED Firestore database — the client passes
 * `firebaseConfig.firestoreDatabaseId` to `initializeFirestore`, and the Admin
 * SDK passes `FIRESTORE_DATABASE_ID` to `getFirestore`. A v2 trigger declared
 * without a `database` option does not inherit that: it binds to "(default)",
 * where nothing this app writes ever lands. It deploys cleanly, reports
 * healthy, and never fires once.
 *
 * Six triggers were in that state — daily-log photo cleanup and task rollup,
 * goods-receipt PO reconciliation, approval notifications and the Telegram
 * unlink handler — and nothing surfaced it, because a trigger that never runs
 * produces no logs and no errors. A source-level assertion is the only cheap
 * way to catch it, so that is what this is.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * Comments are removed before scanning. Without that, prose inside a comment
 * decides where the options object appears to end -- the first version of
 * this test reported two bound triggers as unbound because a comment above
 * them contained the words "instead, where it never fires", and the comma
 * terminated the scan early.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Slice from each `onDocument*(` to the start of its handler. */
function triggerDeclarations(raw: string) {
  const src = stripComments(raw);
  const found: { name: string; kind: string; options: string }[] = [];
  const re = /export const (\w+)\s*=\s*(onDocument\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Walk to the matching close paren of the FIRST argument, so a long
    // comment block before the options object cannot truncate the window --
    // a fixed character window silently reported two of these as unbound.
    let i = re.lastIndex;
    let depth = 0;
    let end = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && c === "," ) {
        end = i;
        break;
      }
      end = i;
    }
    found.push({ name: m[1], kind: m[2], options: src.slice(re.lastIndex, end + 1) });
  }
  return found;
}

const declarations = tsFiles(HERE).flatMap((f) =>
  triggerDeclarations(readFileSync(f, "utf8")).map((d) => ({
    ...d,
    file: f.slice(HERE.length + 1),
  })),
);

describe("Firestore triggers", () => {
  it("finds the triggers at all, so a silent pass is not possible", () => {
    expect(declarations.length).toBeGreaterThanOrEqual(7);
  });

  it("every trigger names the database", () => {
    const unbound = declarations
      .filter((d) => !/\bdatabase\s*:/.test(d.options))
      .map((d) => `${d.file}: ${d.name}`);
    expect(unbound).toEqual([]);
  });

  it("every trigger uses the shared constant rather than a literal id", () => {
    // A pasted database id drifts the moment the project is recreated.
    const literal = declarations
      .filter((d) => /database\s*:\s*["'`]/.test(d.options))
      .map((d) => `${d.file}: ${d.name}`);
    expect(literal).toEqual([]);
  });
});
