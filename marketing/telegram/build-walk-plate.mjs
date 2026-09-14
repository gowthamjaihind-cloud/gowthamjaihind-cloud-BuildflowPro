// Compose the 1920x1080 still the WALKTHROUGH cuts to for its Telegram beat.
//
//   node marketing/telegram/build-walk-plate.mjs
//
// The launch film shows these screens one at a time, as Plates, and can cut
// between them. The walkthrough cannot: it overlays a single still over the
// window the beat occupies, and that beat runs 15.7 seconds -- the longest in
// the film. One screen held that long is a freeze frame, so this puts two side
// by side and lets the recorder's slow push travel across them.
//
// It replaces `telegram-beat-full.png` from build-beat.mjs, which is a drawing
// of Telegram rather than Telegram. See plates/README.md.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";

import { BRAND } from "../brand.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// The plates live where the launch film reads them; this is the one copy.
const PLATES = join(HERE, "../remotion/public");
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });
const CHROME =
  process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Inlined as data URIs: the page is rendered from a string with no server, so a
// file:// reference would not resolve.
const dataUri = (name) => {
  const p = join(PLATES, name);
  if (!existsSync(p)) throw new Error(`missing plate ${p}`);
  return `data:image/png;base64,${readFileSync(p).toString("base64")}`;
};

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:1080px;background:${BRAND.surfaceDark};
    display:flex;align-items:center;justify-content:center;gap:56px}
  img{height:840px;width:auto;border-radius:22px;
    box-shadow:0 40px 110px rgba(0,0,0,.55)}
</style></head><body>
  <img src="${dataUri("p-menu.png")}">
  <img src="${dataUri("p-mats.png")}">
</body></html>`;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.setContent(page, { waitUntil: "networkidle" });
await p.waitForTimeout(400);
await p.screenshot({ path: join(OUT, "telegram-real-full.png") });
console.log("  wrote telegram-real-full.png");
await b.close();
