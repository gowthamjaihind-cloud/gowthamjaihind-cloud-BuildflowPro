/**
 * Instagram story frames from a frame list, in the brand.
 *
 *   node marketing/social/render-story.mjs marketing/social/weeks/2026-W49/stories.json
 *
 * Writes stories/<id>.png (1080 x 1920, 9:16) next to the JSON. Text stays out
 * of Instagram's top 250 px and bottom 340 px, where the profile bar and the
 * reply box sit. A frame is:
 *   { id, tone?: "dark" | "light", kicker?, title, sub?, note?,
 *     space?: "sticker" | "post",   empty room for a poll / question / link
 *                                   sticker, or for a shared post or reel
 *     image?: repo path              a demo screen (marketing/video/screens*)
 *     focus?: "30% 0"                which part of a wide screen to show
 *   }
 * The empty room is left blank on purpose: the sticker or shared post goes
 * there in the Instagram app. `note` is for the founder only, never drawn.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { BRAND } from "../brand.mjs";
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require("playwright-core"); } catch { return require("playwright"); } })();

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FONT = resolve(HERE, "../walkthrough/fonts/Manrope-var.woff2");
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
const esc = (s = "") => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const spec = process.argv[2];
if (!spec) throw new Error("usage: render-story.mjs <stories.json>");
const frames = JSON.parse(readFileSync(spec, "utf8"));
const outDir = join(dirname(spec), "stories");
mkdirSync(outDir, { recursive: true });

const W = 1080, H = 1920;
const css = `
@font-face{font-family:Manrope;font-weight:200 800;font-display:block;src:url("${dataUrl(FONT, "font/woff2")}") format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:Manrope,system-ui,sans-serif}
.s{width:${W}px;height:${H}px;padding:270px 88px 360px;display:flex;flex-direction:column;position:relative}
.dark{background:${BRAND.surfaceDark};color:${BRAND.white}}
.light{background:${BRAND.page};color:${BRAND.ink}}
.kicker{font-size:32px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.primaryOnDark}}
.light .kicker{color:${BRAND.primary}}
h1{font-size:96px;line-height:1.04;font-weight:800;letter-spacing:-.02em;margin-top:26px}
p{font-size:42px;line-height:1.36;font-weight:500;margin-top:30px;color:${BRAND.inkMuted}}
.dark p{color:#C9D3E6}
.room{flex:1;min-height:520px}
.grow{flex:1}
.shot{margin-top:56px;flex:1;border-radius:32px;overflow:hidden;border:2px solid ${BRAND.divider};background:#fff;
  box-shadow:0 30px 60px -20px rgba(15,23,42,.35)}
.shot img{width:100%;height:100%;object-fit:cover;object-position:top left}
.foot{position:absolute;left:88px;right:88px;bottom:360px;display:flex;align-items:center;gap:16px;
  font-size:30px;font-weight:700;opacity:.75}
.foot svg{flex:none}
`;
const bars = (fill) => `<svg width="40" height="40" viewBox="120 120 272 272"><rect x="136" y="272" width="72" height="104" rx="22" fill="${fill}"/><rect x="222" y="212" width="72" height="164" rx="22" fill="${fill}"/><rect x="308" y="140" width="72" height="236" rx="22" fill="${fill}"/></svg>`;

const html = (f) => {
  const tone = f.tone || "dark";
  const head = `${f.kicker ? `<div class="kicker">${esc(f.kicker)}</div>` : ""}<h1>${esc(f.title)}</h1>`;
  let inner;
  if (f.image) {
    if (!/^marketing\/video\/screens/.test(f.image)) throw new Error(`${f.id}: screens must come from the demo captures`);
    const img = resolve(ROOT, f.image);
    if (!existsSync(img)) throw new Error(`${f.id}: missing ${f.image}`);
    inner = `${head}${f.sub ? `<p>${esc(f.sub)}</p>` : ""}<div class="shot"><img style="object-position:${esc(f.focus || "0 0")}" src="${dataUrl(img, "image/png")}"></div><div style="height:110px"></div>`;
  } else if (f.space) {
    // Text above the room; the sticker or shared post is placed in it.
    inner = `${head}${f.sub ? `<p>${esc(f.sub)}</p>` : ""}<div class="room"></div>`;
  } else {
    inner = `<div class="grow"></div>${head}${f.sub ? `<p>${esc(f.sub)}</p>` : ""}<div class="grow"></div>`;
  }
  const foot = `<div class="foot">${bars(tone === "dark" ? BRAND.white : BRAND.primary)}<span>sitetru.com</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="s ${tone}">${inner}${foot}</div></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const f of frames) {
  if (!f.id || !f.title) throw new Error("each frame needs id and title");
  await page.setContent(html(f), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = join(outDir, `${f.id}.png`);
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
