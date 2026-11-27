/**
 * Profile images for Instagram and Facebook, in the brand.
 *   CHROME_PATH=... node marketing/social/profile/render-profile.mjs
 * profile.png (1080², shown as a circle), facebook-cover.png (1640x624, the
 * middle 1200 px stays visible on phones), highlight-*.png (1080x1920, the
 * centre shows inside the highlight circle).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BRAND } from "../../brand.mjs";
// marketing/'s playwright-core when installed, else the machine's playwright.
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require("playwright-core"); } catch { return require("playwright"); } })();

const HERE = dirname(fileURLToPath(import.meta.url));
const font = `data:font/woff2;base64,${readFileSync(resolve(HERE, "../../walkthrough/fonts/Manrope-var.woff2")).toString("base64")}`;
const bars = (size, fill = "#fff") => `<svg width="${size}" height="${size}" viewBox="120 120 272 272"><rect x="136" y="272" width="72" height="104" rx="22" fill="${fill}"/><rect x="222" y="212" width="72" height="164" rx="22" fill="${fill}"/><rect x="308" y="140" width="72" height="236" rx="22" fill="${fill}"/></svg>`;
const page = (w, h, body) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Manrope;font-weight:200 800;src:url("${font}") format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:Manrope,sans-serif}
.c{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}
</style>${body}`;

const shots = {
  "profile.png": [1080, 1080, `<div class="c" style="background:${BRAND.primary}">${bars(560)}</div>`],
  "facebook-cover.png": [1640, 624, `<div class="c" style="background:${BRAND.surfaceDark};color:#fff;flex-direction:row;gap:56px">
    <div style="background:${BRAND.primary};border-radius:44px;padding:34px">${bars(150)}</div>
    <div><div style="font-size:96px;font-weight:800;letter-spacing:-.02em">Sitetru</div>
    <div style="font-size:38px;font-weight:600;color:${BRAND.primaryOnDark};margin-top:10px">Truth, reported from site.</div>
    <div style="font-size:30px;font-weight:500;color:#C9D3E6;margin-top:22px">Daily logs · labour · materials · RA bills · from Telegram</div></div></div>`],
};
const highlights = { "start-here": "Start here", telegram: "Telegram", bills: "Bills & POs", labour: "Labour", pricing: "Pricing", faq: "FAQ" };
for (const [k, label] of Object.entries(highlights)) {
  shots[`highlight-${k}.png`] = [1080, 1920, `<div class="c" style="background:${BRAND.surfaceDark};color:#fff;gap:40px">
    <div style="background:${BRAND.primary};border-radius:60px;padding:50px">${bars(220)}</div>
    <div style="font-size:${label.length > 9 ? 96 : 120}px;font-weight:800;letter-spacing:-.02em">${label.replace("&", "&amp;")}</div></div>`];
}

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const p = await b.newPage();
for (const [name, [w, h, html]] of Object.entries(shots)) {
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(page(w, h, html));
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(HERE, name) });
  console.log(name);
}
await b.close();
