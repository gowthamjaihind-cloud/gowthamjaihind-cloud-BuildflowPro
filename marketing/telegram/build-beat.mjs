// Builds the Telegram still used in the launch video's Telegram beat.
//
// The video previously asserted "your engineer sends it on Telegram" over an
// app screenshot, which showed the destination but never the mechanism. This
// renders two phones side by side: the bot offering what can be logged, and
// the confirmation that came back. Every string is the bot's own, taken from
// functions/src/telegram/i18n.ts.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });
const CHROME =
  process.env.CHROME_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const bubble = (html, tap) => `
  <div class="row"><div>
    <div class="b bot">${html}</div>
    ${tap ? `<div class="tap">▲ tapped</div>` : ""}
  </div></div>`;

const me = (t) => `<div class="row me"><div class="b mine">${t}</div></div>`;

const phone = (title, inner) => `
  <div class="phone">
    <div class="bar"><div class="av">S</div><div><div class="who">Sitetru</div><div class="sub">bot</div></div></div>
    <div class="chat">${inner}</div>
    <div class="cap">${title}</div>
  </div>`;

const menu = phone(
  "What can be logged",
  me("/log") +
    bubble(
      `<b>Brickwork / blockwork</b> — 65%
      <div class="kb">
        <div class="k">+ Materials</div><div class="k">+ Labour</div>
        <div class="k">+ Equipment</div><div class="k">+ Photo</div>
        <div class="k">+ Note</div><div class="k wide">✅ Save</div>
      </div>`,
      true,
    ),
);

const done = phone(
  "What comes back",
  bubble(`<b>Which role?</b>
      <div class="kb">
        <div class="k">Mason</div><div class="k">Helper</div>
        <div class="k">Bar Bender</div><div class="k">Electrician</div>
      </div>`) +
    me("8") +
    bubble(
      `✅ <b>Logged</b>

Brickwork / blockwork — 65%
👷 22 deployed`,
      false,
    ),
);

const page = (w, h, stack) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{background:#324755;font-family:Manrope,system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center;
    gap:${stack ? 34 : 96}px;flex-direction:${stack ? "column" : "row"};
    padding:${stack ? "40px 50px 230px" : "10px 70px 210px"}}
  .phone{width:${stack ? 640 : 600}px;background:#0E1621;border-radius:34px;
    overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.45);flex:0 0 auto}
  .bar{background:#17212B;padding:16px 18px;display:flex;align-items:center;gap:12px}
  .av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#D97D54,#B85F3B);
    display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:16px}
  .who{color:#fff;font-weight:700;font-size:16px}.sub{color:#7D8E9E;font-size:12px}
  .chat{padding:16px 14px 20px;display:flex;flex-direction:column;gap:10px}
  .row{display:flex}.row.me{justify-content:flex-end}
  .b{max-width:92%;padding:12px 16px;border-radius:15px;font-size:18px;line-height:1.5;
    color:#fff;white-space:pre-line}
  .bot{background:#182533;border-bottom-left-radius:5px;min-width:300px}
  .mine{background:#2B5278;border-bottom-right-radius:5px}
  .kb{display:flex;flex-wrap:wrap;gap:7px;margin-top:11px}
  .k{background:#2B3E50;color:#7FC4F5;border-radius:10px;padding:12px 12px;font-size:16px;
    font-weight:700;flex:1 1 45%;text-align:center;white-space:nowrap}
  .k.wide{flex-basis:100%;background:#7FC4F5;color:#12212F}
  .tap{color:#7FC4F5;font-size:12px;font-weight:700;letter-spacing:.05em;
    text-align:center;margin-top:7px}
  b{font-weight:800}
  .cap{color:#87BCBF;font-size:13px;font-weight:800;letter-spacing:.18em;
    text-transform:uppercase;text-align:center;padding:0 0 16px}
</style></head><body>${menu}${done}</body></html>`;

const b = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
for (const [w, h, name, stack] of [
  [1920, 1080, "telegram-beat-16x9.png", false],
  [1080, 1920, "telegram-beat-9x16.png", true],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(page(w, h, stack), { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: join(OUT, name) });
  console.log("  wrote", name);
  await ctx.close();
}
await b.close();
