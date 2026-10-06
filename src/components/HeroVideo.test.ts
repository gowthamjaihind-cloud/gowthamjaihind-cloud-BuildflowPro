import { describe, it, expect } from "vitest";
import { existsSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const SRC = readFileSync(join(HERE, "./HeroVideo.tsx"), "utf8");

describe("the landing page film", () => {
  it("ships every file it references", () => {
    // A missing asset here is invisible in review and in the build: the page
    // renders, the poster is a blank box, and the play button leads nowhere.
    const refs = [...SRC.matchAll(/["'](\/media\/[^"']+)["']/g)].map((m) => m[1]);
    expect(refs.length, "HeroVideo no longer references any /media asset").toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(join(ROOT, "public", ref)), `public${ref} is referenced but missing`).toBe(true);
    }
  });

  it("keeps the film off the critical path", () => {
    // The audience is on Indian mobile data and the page already ships ~471 KB
    // of gzipped JS. The film must cost nothing until someone asks for it, so
    // the <source> is rendered conditionally -- preload="none" alone is weaker,
    // since browsers still range-request metadata for a src they can see.
    expect(SRC).toMatch(/preload="none"/);
    expect(SRC).toMatch(/\{started && <source/);
    expect(SRC).not.toMatch(/\bautoPlay\b/);
  });

  it("keeps the poster small enough to be free, and the film small enough to be fair", () => {
    const poster = statSync(join(ROOT, "public/media/sitetru-hero-poster.jpg")).size;
    const film = statSync(join(ROOT, "public/media/sitetru-hero.mp4")).size;
    // The poster is the only part every visitor pays for.
    expect(poster, "the poster is what loads for everyone — keep it under 120 KB").toBeLessThan(120 * 1024);
    // The source render is ~16.7 MB; it is re-encoded for the web before it
    // ships. If this fails, someone copied the raw render in.
    expect(film, "the film should be re-encoded for web, not the raw render").toBeLessThan(6 * 1024 * 1024);
  });

  it("is reachable by keyboard and screen reader", () => {
    expect(SRC).toMatch(/type="button"/);
    expect(SRC).toMatch(/aria-label=/);
    // iOS plays inline rather than hijacking the screen into fullscreen.
    expect(SRC).toMatch(/playsInline/);
  });
});
