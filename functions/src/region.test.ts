import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REGION, CALLABLE_OPTS } from "./callable";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");

/**
 * Everything user-facing runs in one region, and the client calls that region.
 *
 * It did not. Every callable had no `region` at all, which silently means
 * us-central1 — so signing up, buying a plan, inviting a teammate and every AI
 * call went from Madurai to Iowa and back while the Telegram handlers and the
 * scheduled jobs sat in Singapore. Nothing failed; it was just slow, and
 * invisible, because a missing region is a default rather than an error.
 *
 * The client half is worse: getFunctions(app) with no region targets
 * us-central1, and a mismatch with the server does not fail the build OR the
 * deploy. Every callable simply starts returning "not found" to real users.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) out.push(p);
  }
  return out;
}

const sources = walk(join(ROOT, "functions/src")).map((p) => ({
  rel: p.slice(ROOT.length + 1),
  src: readFileSync(p, "utf8"),
}));

/** The options object of a function declaration, up to the handler. */
function optionsOf(src: string, start: number): string {
  const open = src.indexOf("(", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(" || src[i] === "{") depth++;
    else if (src[i] === ")" || src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return "";
}

describe("every user-facing function names its region", () => {
  // Triggers are excluded on purpose — see the note in callable.ts. A v2
  // Firestore trigger must sit in a region compatible with the DATABASE's
  // location, which this repository cannot see, and nobody waits on a trigger
  // so there is no latency to win by moving one.
  const KINDS = ["onCall", "onRequest", "onSchedule"];

  it("declares a region on each one, directly or through CALLABLE_OPTS", () => {
    const missing: string[] = [];
    for (const { rel, src } of sources) {
      for (const kind of KINDS) {
        const re = new RegExp(`export const (\\w+)\\s*=\\s*${kind}\\(`, "g");
        for (const m of src.matchAll(re)) {
          const opts = optionsOf(src, m.index! + m[0].length - 1);
          if (!/region:/.test(opts) && !/CALLABLE_OPTS/.test(opts)) {
            missing.push(`${rel}: ${m[1]} (${kind})`);
          }
        }
      }
    }
    expect(missing, `no region, so these default to us-central1:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("puts that region in CALLABLE_OPTS, which every callable spreads", () => {
    expect(CALLABLE_OPTS.region).toBe(REGION);
    expect(REGION).toBe("asia-southeast1");
  });

  it("names only the one region across the backend", () => {
    const regions = new Set<string>();
    for (const { src } of sources) {
      for (const m of src.matchAll(/region:\s*"([^"]+)"/g)) regions.add(m[1]);
    }
    expect([...regions], "the backend is split across regions again").toEqual([REGION]);
  });
});

describe("the client calls the region the functions are in", () => {
  const client = readFileSync(join(ROOT, "src/services/firebaseFunctions.ts"), "utf8");

  it("agrees with the server, since a mismatch fails only at runtime", () => {
    const m = client.match(/FUNCTIONS_REGION\s*=\s*"([^"]+)"/);
    if (!m) throw new Error("FUNCTIONS_REGION not found in src/services/firebaseFunctions.ts");
    expect(m[1]).toBe(REGION);
  });

  it("passes it to getFunctions, rather than taking the us-central1 default", () => {
    expect(client).toMatch(/getFunctions\(getApp\(\),\s*FUNCTIONS_REGION\)/);
  });
});

describe("hosting rewrites point at the right region", () => {
  const hosting = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8"));

  it("matches every function rewrite to where that function runs", () => {
    const rewrites = (hosting.hosting?.rewrites ?? []).filter((r: any) => r.function);
    expect(rewrites.length, "no function rewrites found — has firebase.json moved?").toBeGreaterThan(0);
    for (const r of rewrites) {
      expect(r.function.region, `rewrite for ${r.function.functionId}`).toBe(REGION);
    }
  });
});
