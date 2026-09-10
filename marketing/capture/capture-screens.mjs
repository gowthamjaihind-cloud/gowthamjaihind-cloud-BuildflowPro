// Regenerates the app screenshots the video pipeline uses.
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

// nav label -> output filename, in nav order so the numbering matches the
// sidebar. All twelve modules are captured now: the launch film and the
// walkthrough between them draw on more than the original six, and a film is
// only as good as the shots available to cut from.
const SCREENS = [
  ["Dashboard",           "m-01-dashboard"],
  ["Project Insights",    "m-02-insights"],
  ["WBS",                 "m-03-wbs"],
  ["Daily Logs",          "m-04-daily-logs"],
  ["Labour & Billing",    "m-05-labour"],
  ["Inventory",           "m-06-inventory"],
  ["Procurement",         "m-07-procurement"],
  ["Consumption History", "m-08-consumption"],
  ["Cost Management",     "m-09-cost-management"],
  ["Client Estimates",    "m-10-client-estimates"],
  ["Reports",             "m-11-reports"],
  ["Document Vault",      "m-12-vault"],
];

/** Extra shots that live behind a sub-tab: nav label -> [[tab text, suffix]]. */
const SUBTABS = {
  "Cost Management": [["Task Costs", "tasks"]],
  Procurement: [["Goods Receipt", "grn"]],
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block",
});
// The guided tour puts a full-screen overlay over the app on first visit, which
// silently intercepts every click this script makes -- it is why the captures
// stopped regenerating after the tour shipped. record.mjs already marks the
// tour done for the same reason; this does the same, and hides the demo
// banner and the replay pill so they stay out of the frame.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("sitetru.demo.tour.done", "1");
  } catch {
    /* private mode: the CSS below still keeps it out of the shot */
  }
});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 110)));

await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
await page.addStyleTag({
  content: "[data-demo-banner],[data-demo-tour]{display:none!important}",
});
// The portfolio, before entering anything. It is where a customer with more
// than one job actually starts, and neither film had a shot of it.
await page.screenshot({ path: join(OUT, "m-00-portfolio.png") });
console.log("m-00-portfolio");

await page.getByText("Sample Residence — Plot 12").first().click();
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

  // Project Insights renders its analytics lazily and the gauges animate in;
  // captured too early it shows zeroed KPIs, which reads as an empty product.
  if (label === "Project Insights") await page.waitForTimeout(2600);

  // Scroll back to the top. A module the script has already visited keeps its
  // scroll position, and a screenshot taken mid-page has no header in it --
  // which is the one thing every crop in the films relies on being there.
  await page.evaluate(() => {
    const scroller = document.querySelector('[class*="overflow-y-auto"]');
    if (scroller) scroller.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);

  await page.screenshot({ path: join(OUT, `${name}.png`) });

  // A few modules keep the shot worth having behind a sub-tab. Cost
  // Management's Overview is project-level totals, and the launch film's
  // strongest claim is that cost lands against the TASK -- so it needs the
  // Task Costs tab, or the narration says one thing while the frame shows
  // another. That drift is the specific failure this pipeline has had before.
  for (const [tab, suffix] of SUBTABS[label] ?? []) {
    const btn = page.getByRole("button", { name: tab, exact: false }).first();
    if (!(await btn.count())) { console.log(`  skip ${name}-${suffix} (no ${tab} tab)`); continue; }
    await btn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await page.screenshot({ path: join(OUT, `${name}-${suffix}.png`) });
    console.log(`  ${name}-${suffix}`);
  }

  const body = await page.innerText("body");
  const empty = /no .*(found|yet|data)|nothing to|add your first|no activities logged/i.test(body);
  console.log(`${name}${empty ? "   [EMPTY STATE -- check fixtures]" : ""}`);
}

await browser.close();
console.log("\nwrote ->", OUT);
