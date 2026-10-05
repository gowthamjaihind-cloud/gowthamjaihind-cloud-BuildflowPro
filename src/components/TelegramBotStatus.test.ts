import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Comments stripped before matching. These assertions are about what the code
 * DOES, and the comment explaining why minInstances is 0 necessarily contains
 * the string "minInstances: 1" — which would otherwise fail the check it exists
 * to protect.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Two things cost real money on an unlaunched app, and both were here.
 *
 * `telegramStatus` ran with minInstances: 1 — a Cloud Run instance reserved
 * around the clock, billed for CPU and memory whether a request arrives or not,
 * and the one cost in this project with no free tier. It was the largest line on
 * two months of bills, for a status badge.
 *
 * The badge itself sat in Layout, the shell around every screen, polling every
 * 15 seconds: 240 requests an hour, ~175,000 a month per open tab, each also
 * calling api.telegram.org.
 *
 * Neither is the kind of thing anyone notices in review, which is why they are
 * asserted rather than remembered.
 */

describe("the bot status endpoint reserves nothing", () => {
  const src = code("functions/src/telegram/index.ts");

  it("keeps every Telegram function at minInstances: 0", () => {
    const declared = [...src.matchAll(/minInstances:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(declared.length, "no minInstances declared — a default could change under us").toBeGreaterThan(0);
    for (const n of declared) expect(n, "a warm instance bills 24/7 with no free tier").toBe(0);
  });
});

describe("the bot status badge does not poll", () => {
  const src = code("src/components/TelegramBotStatus.tsx");

  it("checks once on mount, with no interval", () => {
    expect(src).not.toMatch(/setInterval/);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*checkBotStatus\(\);\s*\}, \[\]\)/);
  });

  it("offers a manual re-check instead", () => {
    expect(src).toMatch(/onClick=\{refresh\}/);
  });
});

describe("the badge lives only where it is needed", () => {
  it("is rendered in the Telegram settings panel", () => {
    expect(code("src/components/TelegramIntegration.tsx")).toMatch(/<TelegramBotStatus \/>/);
  });

  it("is NOT rendered anywhere else", () => {
    // Mounting it in a shell or a page header puts the request back on every
    // screen, which is the whole cost this removed.
    const allowed = new Set(["src/components/TelegramIntegration.tsx", "src/components/TelegramBotStatus.tsx"]);
    const offenders: string[] = [];
    for (const abs of walk(join(ROOT, "src"))) {
      const rel = abs.slice(ROOT.length + 1).split("\\").join("/");
      if (allowed.has(rel)) continue;
      if (/<TelegramBotStatus\b/.test(readFileSync(abs, "utf8"))) offenders.push(rel);
    }
    expect(offenders, `TelegramBotStatus mounted outside the settings panel: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("nothing else polls the backend on a timer", () => {
  it("has no setInterval that calls an API", () => {
    // Service-worker update checks and UI animations are fine; a timer that
    // fetches is a standing bill. Caught here rather than on an invoice.
    const offenders: string[] = [];
    for (const abs of walk(join(ROOT, "src"))) {
      const src = readFileSync(abs, "utf8");
      for (const m of src.matchAll(/setInterval\(([\s\S]{0,400}?)\n\s*\}?,\s*\d+/g)) {
        if (/\bfetch\(|httpsCallable|getDocs?\(|\.get\(\)/.test(m[1])) {
          offenders.push(abs.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders, `a timer is calling the backend in: ${offenders.join(", ")}`).toEqual([]);
  });
});
