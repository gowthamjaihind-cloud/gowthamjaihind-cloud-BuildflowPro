import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES, GUIDES_READY, guidePoster, guideVideo } from "./guides";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const pub = (p: string) => join(ROOT, "public", p);

/**
 * The guides list on the site and in Help points at files; a missing one plays
 * as a black box with a spinner. Every guide must have the script it was
 * recorded from, its video, its poster, and a measured length.
 */
// Until the set is published the guides are hidden, so only the scripts must exist.
describe.runIf(GUIDES_READY)("video guides (published)", () => {
  it("each has a script, a video, a poster and a length", () => {
    for (const g of GUIDES) {
      expect(existsSync(join(ROOT, `marketing/films/guides/${g.id}.script.mjs`)), `${g.id}: script`).toBe(true);
      expect(existsSync(pub(guideVideo(g.id))), `${g.id}: video`).toBe(true);
      expect(existsSync(pub(guidePoster(g.id))), `${g.id}: poster`).toBe(true);
      expect(g.seconds, `${g.id}: length not measured -- run publish.mjs`).toBeGreaterThan(10);
    }
  });

  it("keeps each video small enough for site mobile data", () => {
    for (const g of GUIDES) {
      expect(statSync(pub(guideVideo(g.id))).size, `${g.id}.mp4`).toBeLessThan(8 * 1024 * 1024);
      expect(statSync(pub(guidePoster(g.id))).size, `${g.id}.jpg`).toBeLessThan(200 * 1024);
    }
  });

  it("are titled the way their scripts title them", () => {
    for (const g of GUIDES) {
      const src = readFileSync(join(ROOT, `marketing/films/guides/${g.id}.script.mjs`), "utf8");
      expect(src, g.id).toContain(`"id": "guide-${g.id}"`);
    }
  });

  it("are offered before purchase (landing page) and after (Help)", () => {
    expect(readFileSync(join(ROOT, "src/pages/LandingPage.tsx"), "utf8")).toMatch(/id="guides"[\s\S]*<GuidesPlayer \/>/);
    expect(readFileSync(join(ROOT, "src/components/HelpChat.tsx"), "utf8")).toMatch(/<GuidesPlayer compact \/>/);
  });
});

describe("video guides (in progress)", () => {
  it("each has the script it will be recorded from", () => {
    for (const g of GUIDES) {
      expect(existsSync(join(ROOT, `marketing/films/guides/${g.id}.script.mjs`)), `${g.id}: script`).toBe(true);
    }
  });
});
