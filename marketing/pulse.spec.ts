import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPulse } from "./films/pulse.mjs";

/**
 * Checks on Pulse, the fast cut, that a render cannot make for you. Lives at
 * marketing/*.spec.ts for the reason kinetic.spec.ts gives: it is the only
 * place the root vitest config collects from marketing/.
 */
const ROOT = join(__dirname, "remotion");
const film = readPulse(readFileSync(join(ROOT, "src/pulse/pulse.json"), "utf8"));

describe("Pulse", () => {
  it("cuts on the beat and runs about forty seconds", () => {
    expect(film.beat).toBe(15);
    for (const s of film.shots) expect(Number.isInteger(s.beats) && s.beats >= 1, JSON.stringify(s)).toBe(true);
    expect(film.seconds).toBeGreaterThanOrEqual(30);
    expect(film.seconds).toBeLessThanOrEqual(45);
    // Every cut is a whole number of beats from the start.
    for (const c of film.cuts) expect((c * film.fps) % film.beat).toBe(0);
  });

  it("gives the score its four impacts, in order, on cuts", () => {
    expect(film.hits.length).toBe(4);
    expect([...film.hits].sort((a, b) => a - b)).toEqual(film.hits);
    for (const h of film.hits.slice(1)) expect(film.cuts).toContain(h);
  });

  it("references only screenshots that exist", () => {
    // A missing staticFile renders as an empty box, not an error.
    const files = film.shots.flatMap((s: any) => [s.src, ...(s.images ?? [])]).filter(Boolean);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) expect(existsSync(join(ROOT, "public", f)), f).toBe(true);
  });

  it("aims every camera inside the screenshot", () => {
    for (const s of film.shots as any[]) {
      for (const cam of [s.from, s.to, s.vto].filter(Boolean)) {
        const [cx, cy, w] = cam;
        expect(cx > 0 && cx < 3200 && cy > 0 && cy < 2000, `${s.word ?? s.text}: ${cam}`).toBe(true);
        expect(w >= 400 && w <= 3200, `${s.word ?? s.text}: width ${w}`).toBe(true);
      }
    }
  });

  it("ends on the address and the trial the product actually offers", () => {
    const src = readFileSync(join(ROOT, "src/pulse/Pulse.tsx"), "utf8");
    expect(src).toContain("sitetru.com");
    expect(src).toContain("14-day free trial");
    // Onboarding offers the trial with no card; the film must not promise more.
    expect(readFileSync(join(__dirname, "../src/components/Onboarding.tsx"), "utf8") + readFileSync(join(__dirname, "../src/i18n/translations.ts"), "utf8")).toMatch(/no card/i);
  });
});
