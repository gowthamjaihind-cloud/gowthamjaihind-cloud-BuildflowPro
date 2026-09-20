import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every callable must opt into App Check, or enforcement will quietly miss it.
 *
 * `APPCHECK_ENFORCE=true` is a deploy-time switch: it flips
 * `CALLABLE_OPTS.enforceAppCheck` for every function that spreads it. A
 * callable written without that spread keeps `enforceAppCheck: false` forever.
 * It deploys, it works, and it stays the one unauthenticated door in the wall —
 * with nothing in the console to say so, because monitoring only reports on
 * functions that are checking.
 *
 * That is the same shape as the six triggers bound to the wrong database and
 * the invoice path that skipped the compressor: code that looks deployed and
 * isn't doing the thing. So it gets the same treatment — an assertion at the
 * source, which is the only place the omission is visible.
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

/** Each `onCall(` with the options text that follows it. */
function callables(src: string): { name: string; head: string }[] {
  const out: { name: string; head: string }[] = [];
  for (const m of src.matchAll(/onCall\s*\(/g)) {
    const before = src.slice(Math.max(0, m.index! - 90), m.index! + 7);
    const name = /export const (\w+)\s*=\s*onCall/.exec(before)?.[1] ?? "(anonymous)";
    out.push({ name, head: src.slice(m.index! + m[0].length, m.index! + m[0].length + 260) });
  }
  return out;
}

const files = tsFiles(HERE);

describe("App Check covers every callable", () => {
  const found = files.flatMap((f) =>
    callables(readFileSync(f, "utf8")).map((c) => ({ ...c, file: relative(HERE, f) })),
  );

  it("finds the callables at all, so this cannot pass by matching nothing", () => {
    expect(found.length).toBeGreaterThan(20);
  });

  it("spreads CALLABLE_OPTS into every one", () => {
    const missing = found
      .filter((c) => !c.head.includes("CALLABLE_OPTS"))
      .map((c) => `${c.file}:${c.name}`);
    expect(
      missing,
      `these callables would stay unenforced after APPCHECK_ENFORCE=true: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps enforcement a single deploy-time switch", () => {
    // If enforceAppCheck is ever hardcoded at a call site, the one variable
    // stops being the whole story and a rollback stops being a redeploy.
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (relative(HERE, f) === "callable.ts") continue;
      expect(src, `${relative(HERE, f)} hardcodes enforceAppCheck`).not.toMatch(
        /enforceAppCheck\s*:\s*(true|false)/,
      );
    }
  });
});
