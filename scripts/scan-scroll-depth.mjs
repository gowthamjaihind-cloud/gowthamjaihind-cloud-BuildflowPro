// How far each screen is worth scrolling, measured from what it looks like.
//
//   npm run build:demo
//   node marketing/capture/serve-demo.mjs &
//   node scripts/scan-scroll-depth.mjs
//
// The walkthrough recorder scrolls each screen to keep the frame alive, and
// stops at the scroller's own range. That range is set by the TALLEST column,
// which on a two-column screen is not the same as how far the screen stays
// worth looking at: Cost Management is a short left column of cards and a chart
// beside a long Latest Transactions panel, so its last screenful is one narrow
// panel with two thirds of the frame bare. Five seconds of it reached the
// finished cut, in the beat whose line is "which is what makes this screen
// worth anything".
//
// WHY A SCREENSHOT AND NOT THE DOM. Two DOM measures were tried and both lie.
// Counting elements that paint a background over-counts: a full-height wrapper
// with a surface colour reads as content while looking empty, which reported
// Cost Management as fine. Counting only text-bearing leaves under-counts:
// charts and progress bars carry no text, which reported the Dashboard as
// sparse when it is full to the bottom. What "looks empty" is a fact about
// pixels, so this measures pixels.
//
// The number that matters is the EMPTIEST THIRD, not the average. A frame whose
// right third is a dense panel and whose left two thirds are bare still averages
// respectably; it just looks broken.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const BASE = process.env.DEMO_URL || "http://localhost:4173";
const CHROME =
  process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** Below this, the emptiest third of the frame reads as blank. */
const THRESH = 0.12;
/** The content area, less the sidebar, which is always populated. */
const CLIP = { x: 400, y: 160, width: 1450, height: 880 };

const SCREENS = [
  "Dashboard", "Project Insights", "WBS", "Daily Logs", "Labour & Billing",
  "Inventory", "Procurement", "Consumption History", "Cost Management",
  "Client Estimates", "Reports",
];

const scrollerRange = () => {
  const s = [...document.querySelectorAll("div")]
    .filter((el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 40;
    })
    .sort((a, b) => b.clientHeight - a.clientHeight)[0];
  return s ? Math.round(s.scrollHeight - s.clientHeight) : 0;
};

/** Fraction of the emptiest third that is not the page's own ground colour. */
function minBandCoverage(png) {
  // ImageMagick is not installed here; ffmpeg is, and it can report the
  // histogram of a crop. Simpler: downsample to a tiny grid and count.
  const out = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", png, "-vf", "scale=300:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" },
  );
  const W = 300, H = 180;
  const key = (i) => (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
  const counts = new Map();
  for (let i = 0; i < W * H * 3; i += 3) {
    const k = key(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let ground = 0, best = -1;
  for (const [k, n] of counts) if (n > best) { best = n; ground = k; }
  const bands = [0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (key(i) !== ground) bands[Math.min(2, Math.floor((x / W) * 3))]++;
    }
  }
  const per = (W / 3) * H;
  return Math.min(...bands.map((b) => b / per));
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("sitetru.demo.tour.done", "1");
    localStorage.setItem("darkMode", "true");
  } catch {
    /* private mode: the tour blocks navigation and the run reports it */
  }
});
const page = await ctx.newPage();
await page.goto(`${BASE}/?demo=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.getByText("Sample Residence — Plot 12").first().click();
await page.waitForTimeout(2600);

console.log(`deepest scroll whose emptiest third still carries >${THRESH * 100}% content\n`);
let capped = 0;
for (const name of SCREENS) {
  const btn = page.getByRole("button", { name, exact: true }).first();
  if (!(await btn.count())) { console.log(`  ${name.padEnd(20)} not reachable`); continue; }
  await btn.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const full = await page.evaluate(scrollerRange);
  if (full < 200) { console.log(`  ${name.padEnd(20)} full=${String(full).padStart(5)}  (cannot scroll)`); continue; }

  const probes = [];
  for (let i = 0; i <= 5; i++) {
    const to = Math.round((full * i) / 5);
    await page.evaluate(([t]) => {
      const s = [...document.querySelectorAll("div")]
        .filter((el) => {
          const oy = getComputedStyle(el).overflowY;
          return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 40;
        })
        .sort((a, b) => b.clientHeight - a.clientHeight)[0];
      if (s) s.scrollTop = t;
    }, [to]);
    await page.waitForTimeout(400);
    const shot = `/tmp/scroll-probe-${i}.png`;
    await page.screenshot({ path: shot, clip: CLIP });
    probes.push([to, minBandCoverage(shot)]);
  }
  const good = probes.filter(([, m]) => m > THRESH).map(([to]) => to);
  const safe = good.length ? Math.max(...good) : 0;
  const flag = safe < full ? "   <-- needs scrollMax" : "";
  if (safe < full) capped++;
  console.log(`  ${name.padEnd(20)} full=${String(full).padStart(5)}  safe=${String(safe).padStart(5)}${flag}`);
  console.log(`      ${probes.map(([to, m]) => `${to}:${(m * 100).toFixed(0)}%`).join("  ")}`);
}
console.log(`\n${capped} screen(s) need a scrollMax in walkthrough.script.mjs`);
await browser.close();
