// Regenerates the six app screenshots the video pipeline uses.
//
//   npm run build:demo                       # produces dist-demo/
//   node marketing/capture/serve-demo.mjs &  # serves it on :4173
//   node marketing/capture/capture-screens.mjs
//
// Screens are captured at 1600x1000 CSS px with deviceScaleFactor 2, so the
// PNGs land at 3200x2000 -- the video pipeline crops into them and needs the
// headroom. Do not lower the scale factor; the numbers stop being legible.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || resolve(HERE, "../video/screens");
const CHROME = process.env.CHROME_PATH ||
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.DEMO_URL || "http://localhost:4173";

// nav label -> output filename. The numbering is historical (there are 12
// modules; these six are the ones the walkthrough uses).
const SCREENS = [
  ["Dashboard",        "m-01-dashboard"],
  ["WBS",              "m-03-wbs"],
  ["Daily Logs",       "m-04-daily-logs"],
  ["Procurement",      "m-07-procurement"],
  ["Cost Management",  "m-09-cost-management"],
  ["Client Estimates", "m-10-client-estimates"],
];

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block",
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 110)));

await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.getByText("Ramkumar Residence, Othakadai").first().click();
await page.waitForTimeout(4000);

for (const [label, name] of SCREENS) {
  const nav = page.getByRole("button", { name: label, exact: true }).first();
  if (!(await nav.count())) { console.log(`skip ${label} (no nav button)`); continue; }
  await nav.click({ timeout: 8000 });
  await page.waitForTimeout(2800);

  // Daily Logs defaults to today, and the fixtures deliberately have no entry
  // for today -- every log is d(-1) or older. Without this the screen captures
  // as an empty state.
  if (label === "Daily Logs") {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const input = page.locator('input[type="date"]').first();
    if (await input.count()) {
      await input.fill(yesterday);
      await input.dispatchEvent("change");
      await page.evaluate(() => {
        const a = document.activeElement;
        if (a instanceof HTMLElement) a.blur();      // drop the focus ring
      });
      await page.mouse.click(1200, 800);
      await page.waitForTimeout(2500);
    }
  }

  await page.screenshot({ path: join(OUT, `${name}.png`) });
  const body = await page.innerText("body");
  const empty = /no .*(found|yet|data)|nothing to|add your first|no activities logged/i.test(body);
  console.log(`${name}${empty ? "   [EMPTY STATE -- check fixtures]" : ""}`);
}

await browser.close();
console.log("\nwrote ->", OUT);
