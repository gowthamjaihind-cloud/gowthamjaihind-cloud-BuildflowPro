import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUIDES, GUIDES_READY, RENDITIONS, guideCaptions, guidePoster, guidePosterWebp, guideRendition, guideVideo,
} from "./guides";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const pub = (p: string) => join(ROOT, "public", p);
const MB = 1024 * 1024;

/**
 * The guides list on the site and in Help points at files; a missing one plays
 * as a black box with a spinner. Every guide must have the script it was
 * recorded from, all three encodes, its posters, its captions and a length.
 */
// Until the set is published the guides are hidden, so only the scripts must exist.
describe.runIf(GUIDES_READY)("video guides (published)", () => {
  it("each has a script, three encodes, posters, captions and a length", () => {
    for (const g of GUIDES) {
      expect(existsSync(join(ROOT, `marketing/films/guides/${g.id}.script.mjs`)), `${g.id}: script`).toBe(true);
      for (const r of RENDITIONS) expect(existsSync(pub(guideVideo(g.id, r))), `${g.id}: ${r}p`).toBe(true);
      expect(existsSync(pub(guidePoster(g.id))), `${g.id}: poster`).toBe(true);
      for (const w of [640, 1280] as const) expect(existsSync(pub(guidePosterWebp(g.id, w))), `${g.id}: ${w} webp`).toBe(true);
      expect(readFileSync(pub(guideCaptions(g.id)), "utf8"), `${g.id}: captions`).toMatch(/^WEBVTT\n\n1\n\d\d:\d\d:\d\d\.\d{3} --> /);
      expect(g.seconds, `${g.id}: length not measured -- run publish.mjs`).toBeGreaterThan(10);
    }
  });

  it("keeps each file small enough for its screen", () => {
    // Per minute of video, so a longer guide is not held to a short one's
    // size: about 1.5 MB a minute on a phone is light on site data.
    const perMinute = { 480: 1.5 * MB, 720: 3 * MB, 1080: 5 * MB };
    for (const g of GUIDES) {
      const minutes = Math.max(1, g.seconds / 60);
      for (const r of RENDITIONS) expect(statSync(pub(guideVideo(g.id, r))).size, `${g.id} ${r}p`).toBeLessThan(perMinute[r] * minutes);
      // The phone encode is the one that matters on site data: well under the tablet one.
      expect(statSync(pub(guideVideo(g.id, 480))).size).toBeLessThan(statSync(pub(guideVideo(g.id, 720))).size * 0.75);
      expect(statSync(pub(guidePosterWebp(g.id, 640))).size, `${g.id} 640 poster`).toBeLessThan(40 * 1024);
      expect(statSync(pub(guidePoster(g.id))).size, `${g.id}.jpg`).toBeLessThan(200 * 1024);
    }
  });

  it("are titled the way their scripts title them", () => {
    for (const g of GUIDES) {
      const src = readFileSync(join(ROOT, `marketing/films/guides/${g.id}.script.mjs`), "utf8");
      expect(src, g.id).toContain(`"id": "guide-${g.id}"`);
    }
  });

  it("are offered before purchase (landing page, above pricing) and after (Help)", () => {
    const landing = readFileSync(join(ROOT, "src/pages/LandingPage.tsx"), "utf8");
    expect(landing).toMatch(/id="guides"[\s\S]*<GuidesPlayer \/>/);
    expect(landing.indexOf('id="guides"')).toBeLessThan(landing.indexOf('id="pricing"'));
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

describe("which encode a viewer gets", () => {
  const base = { devicePixelRatio: 2, screenWidth: 1440, fullscreen: false };
  it("phone: 480p inline", () => {
    expect(guideRendition({ ...base, width: 358, devicePixelRatio: 3, screenWidth: 844 })).toBe(480);
  });
  it("tablet and desktop: 720p inline", () => {
    expect(guideRendition({ ...base, width: 704, screenWidth: 1024 })).toBe(720);
    expect(guideRendition({ ...base, width: 690 })).toBe(720);
  });
  it("full screen: 1080p on a large display, 720p on a phone", () => {
    expect(guideRendition({ ...base, width: 1440, fullscreen: true })).toBe(1080);
    expect(guideRendition({ ...base, width: 844, screenWidth: 844, devicePixelRatio: 3, fullscreen: true })).toBe(720);
    expect(guideRendition({ ...base, width: 667, screenWidth: 667, fullscreen: true })).toBe(720);
  });
  it("Data Saver or a slow connection: always 480p", () => {
    expect(guideRendition({ ...base, width: 690, saveData: true })).toBe(480);
    expect(guideRendition({ ...base, width: 1440, fullscreen: true, effectiveType: "3g" })).toBe(480);
    expect(guideRendition({ ...base, width: 690, effectiveType: "4g" })).toBe(720);
  });
});
