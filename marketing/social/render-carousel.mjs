/**
 * Instagram carousels from a slide list, in the brand.
 *
 *   node marketing/social/render-carousel.mjs marketing/social/weeks/2026-W49/carousel-whatsapp.json
 *
 * Writes <name>-01.png, -02.png ... (1080 x 1350, Instagram's 4:5) next to the
 * JSON. A slide is { kind: "title" | "point" | "screen" | "cta", ... }:
 *   title:  { kicker?, title, sub? }
 *   point:  { n?, title, body }
 *   screen: { title, body?, image }   image: path from the repo root (demo screens only)
 *   cta:    { title, sub?, button }
 * Screens must come from the demo build (marketing/video/screens-light), never a
 * live account: see marketing/social/AGENT.md.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { BRAND } from "../brand.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const FONT = resolve(HERE, "../walkthrough/fonts/Manrope-var.woff2");
if (!existsSync(FONT)) throw new Error(`missing ${FONT}`);
// setContent pages are about:blank and cannot load file:// URLs: inline the font and screens.
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;

const spec = process.argv[2];
if (!spec) throw new Error("usage: render-carousel.mjs <slides.json>");
const slides = JSON.parse(readFileSync(spec, "utf8"));
const out = (i) => join(dirname(spec), `${basename(spec, ".json")}-${String(i + 1).padStart(2, "0")}.png`);
const esc = (s = "") => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

const W = 1080, H = 1350;
const css = `
@font-face{font-family:Manrope;font-weight:200 800;font-display:block;src:url("${dataUrl(FONT, "font/woff2")}") format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:Manrope,system-ui,sans-serif}
.s{width:${W}px;height:${H}px;padding:96px 88px;display:flex;flex-direction:column;position:relative}
.dark{background:${BRAND.surfaceDark};color:${BRAND.white}}
.light{background:${BRAND.page};color:${BRAND.ink}}
.kicker{font-size:30px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${BRAND.primaryOnDark}}
.light .kicker{color:${BRAND.primary}}
h1{font-size:92px;line-height:1.04;font-weight:800;letter-spacing:-.02em;margin-top:28px}
h2{font-size:68px;line-height:1.08;font-weight:800;letter-spacing:-.015em}
p{font-size:38px;line-height:1.38;font-weight:500;margin-top:30px;color:${BRAND.inkMuted}}
.dark p{color:#C9D3E6}
.n{font-size:200px;font-weight:800;line-height:1;color:${BRAND.primary};margin-bottom:24px}
.shot{margin-top:40px;flex:1;border-radius:28px;overflow:hidden;border:2px solid ${BRAND.divider};background:#fff;
  box-shadow:0 30px 60px -20px rgba(15,23,42,.35)}
.shot img{width:100%;height:100%;object-fit:cover;object-position:top left}
.btn{margin-top:56px;align-self:flex-start;background:${BRAND.primary};color:#fff;font-size:40px;font-weight:800;
  padding:30px 48px;border-radius:999px}
.foot{position:absolute;left:88px;right:88px;bottom:56px;display:flex;justify-content:space-between;
  font-size:26px;font-weight:700;opacity:.7}
.grow{flex:1}
`;

const body = (s, i) => {
  const tone = s.kind === "title" || s.kind === "cta" ? "dark" : "light";
  const foot = `<div class="foot"><span>sitetru.com</span><span>${i + 1} / ${slides.length}${i < slides.length - 1 ? "  →" : ""}</span></div>`;
  let inner = "";
  if (s.kind === "title") inner = `<div class="grow"></div>${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ""}<h1>${esc(s.title)}</h1>${s.sub ? `<p>${esc(s.sub)}</p>` : ""}<div class="grow"></div>`;
  else if (s.kind === "point") inner = `<div class="grow"></div>${s.n ? `<div class="n">${esc(s.n)}</div>` : ""}<h2>${esc(s.title)}</h2><p>${esc(s.body)}</p><div class="grow"></div>`;
  else if (s.kind === "screen") {
    const img = resolve(ROOT, s.image);
    if (!existsSync(img)) throw new Error(`missing screen ${s.image}`);
    if (!/marketing\/(video\/screens|remotion\/public\/telegram-)/.test(s.image)) throw new Error(`${s.image}: screens must come from the demo captures`);
    inner = `<h2>${esc(s.title)}</h2>${s.body ? `<p>${esc(s.body)}</p>` : ""}<div class="shot"><img src="${dataUrl(img, "image/png")}"></div><div style="height:60px"></div>`;
  } else if (s.kind === "cta") inner = `<div class="grow"></div><h1>${esc(s.title)}</h1>${s.sub ? `<p>${esc(s.sub)}</p>` : ""}<div class="btn">${esc(s.button)}</div><div class="grow"></div>`;
  else throw new Error(`slide ${i + 1}: unknown kind ${s.kind}`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="s ${tone}">${inner}${foot}</div></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const [i, s] of slides.entries()) {
  await page.setContent(body(s, i), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out(i) });
  console.log(out(i));
}
await browser.close();
