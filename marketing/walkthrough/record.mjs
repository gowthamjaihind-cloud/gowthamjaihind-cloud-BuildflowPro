// Records a narrated walkthrough of the real app by driving it in a browser.
//
//   npm run build:demo
//   node marketing/capture/serve-demo.mjs &     # serves dist-demo on :4173
//   npm run walkthrough
//
// Everything the video shows is the actual product running against the demo
// fixtures -- no mockups, no screenshots. Three files come out of one run:
//
//   out/walkthrough.mp4     the recording
//   out/walkthrough.srt     subtitles
//   out/walkthrough.md      a time-stamped voiceover script
//
// The timings in the subtitles and the script are MEASURED as the run
// executes, not written by hand. A beat that takes longer than planned moves
// its own caption, so the script can never drift out of sync with the video.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out");
const RAW = join(OUT, "raw");
const FONTS = join(HERE, "fonts");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.DEMO_URL || "http://localhost:4173";
const W = 1920, H = 1080;

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

/* ---------------------------------------------------------------- cursor -- */
// Playwright moves a real mouse but paints no pointer, so a raw recording
// looks like the UI is operating itself. This draws one and glides it, which
// is also what gives a viewer time to follow what is about to be clicked.
const CURSOR_JS = `
(() => {
  if (document.getElementById("__cur")) return;
  const c = document.createElement("div");
  c.id = "__cur";
  c.style.cssText = [
    "position:fixed","left:0","top:0","width:22px","height:22px","z-index:2147483647",
    "pointer-events:none","transform:translate(-2px,-2px)","transition:none",
  ].join(";");
  c.innerHTML =
    '<svg viewBox="0 0 22 22" width="22" height="22">' +
    '<path d="M2 1 L2 16 L6.2 12.4 L8.8 18.4 L11.6 17.2 L9 11.4 L14.4 11.2 Z"' +
    ' fill="#16232C" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  const r = document.createElement("div");
  r.id = "__ring";
  r.style.cssText = [
    "position:fixed","left:0","top:0","width:34px","height:34px","border-radius:50%",
    "z-index:2147483646","pointer-events:none","opacity:0","border:3px solid #D97D54",
    "transform:translate(-17px,-17px) scale(.4)",
  ].join(";");
  document.body.appendChild(r);
  window.__cur = (x, y) => {
    c.style.left = x + "px"; c.style.top = y + "px";
    r.style.left = x + "px"; r.style.top = y + "px";
  };
  window.__ping = () => {
    r.style.transition = "none";
    r.style.opacity = "1";
    r.style.transform = "translate(-17px,-17px) scale(.4)";
    requestAnimationFrame(() => {
      r.style.transition = "transform .45s cubic-bezier(.2,.7,.3,1), opacity .45s ease-out";
      r.style.opacity = "0";
      r.style.transform = "translate(-17px,-17px) scale(1.5)";
    });
  };
})();`;

/* ------------------------------------------------------------- utilities -- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let mouse = { x: W * 0.5, y: H * 0.62 };

/** Glide the pointer to a point over `ms`, moving the real mouse with it. */
async function glide(page, x, y, ms = 620) {
  const from = { ...mouse };
  const steps = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const e = ease(i / steps);
    const px = from.x + (x - from.x) * e;
    const py = from.y + (y - from.y) * e;
    await page.mouse.move(px, py);
    await page.evaluate(([a, b]) => window.__cur?.(a, b), [px, py]);
    await sleep(ms / steps);
  }
  mouse = { x, y };
}

/** Glide onto an element's centre and return its box. */
async function glideTo(page, locator, ms) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for target");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  return box;
}

async function click(page, locator, { settle = 1400 } = {}) {
  await glideTo(page, locator);
  await page.evaluate(() => window.__ping?.());
  await sleep(180);
  await locator.click({ timeout: 15000 });
  await sleep(settle);
}

/** Scroll the window smoothly -- a jump cut mid-page reads as a glitch. */
async function glideScroll(page, to, ms = 900) {
  await page.evaluate(
    ([target, dur]) =>
      new Promise((done) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          window.scrollTo(0, start + (target - start) * e);
          t < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
  await sleep(200);
}

const nav = (page, label) => page.getByRole("button", { name: label, exact: true }).first();

/* ----------------------------------------------------------------- beats -- */
// `say` is the voiceover for the beat and becomes its subtitle. `run` drives
// the app. Keep each `say` to what a listener can absorb while the action on
// screen plays out.
const BEATS = [
  {
    id: "portfolio",
    say: "This is Sitetru. Three sites for one contractor in Madurai — what stage each is at, on one screen.",
    async run(page) {
      await glide(page, W * 0.32, H * 0.52, 900);
      await sleep(2200);
    },
  },
  {
    id: "open-project",
    say: "Open a job and everything about it is in one place.",
    async run(page) {
      await click(page, page.getByText("Ramkumar Residence, Othakadai").first(), { settle: 3200 });
    },
  },
  {
    id: "dashboard",
    say: "Forty-three percent built. Fifty-three point seven lakh spent. Nothing flagged at risk — and none of that was typed into a spreadsheet.",
    async run(page) {
      await sleep(2600);
      await glideScroll(page, 320);
      await sleep(2000);
      await glideScroll(page, 0);
    },
  },
  {
    id: "wbs",
    say: "The plan is broken up the way you'd write it on paper. Days and budget go in once, here.",
    async run(page) {
      await click(page, nav(page, "WBS"), { settle: 2600 });
      await sleep(1800);
      await glideScroll(page, 380);
      await sleep(2400);
    },
  },
  {
    id: "logs",
    say: "Every day the site reports back. Progress, headcount, material used — logged against the task it belongs to.",
    async run(page) {
      await click(page, nav(page, "Daily Logs"), { settle: 2400 });
      // The fixtures deliberately carry no entry for today, so the default
      // view is empty. Step the date back to the most recent real log.
      const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const input = page.locator('input[type="date"]').first();
      if (await input.count()) {
        await input.fill(yesterday);
        await input.dispatchEvent("change");
        await page.evaluate(() => document.activeElement?.blur?.());
      }
      await sleep(2600);
      await glideScroll(page, 300);
      await sleep(2200);
    },
  },
  {
    id: "telegram",
    // Telegram is the one part of the product that does not happen in the
    // browser, so this beat cuts to the bot itself. The frames are composited
    // over this window in post, using the timings measured below -- the app
    // has no Telegram screen inside a project to navigate to.
    cutTo: "telegram-beat-full.png",
    say: "And your engineer sends it from Telegram — an app already on his phone. He picks what to log, and that is the whole job. Nothing to install on site, nobody to train.",
    async run() {
      await sleep(9000);
    },
  },
  {
    id: "procurement",
    say: "Material is bought against the job. Raise the order, receive it when it lands — stock and the supplier's account move on their own.",
    async run(page) {
      await click(page, nav(page, "Procurement"), { settle: 2600 });
      await sleep(2200);
      await glideScroll(page, 340);
      await sleep(2200);
    },
  },
  {
    id: "cost",
    say: "Which means cost is live. Planned against actual, on every head — so a gap shows up the day it opens, not at month end.",
    async run(page) {
      await click(page, nav(page, "Cost Management"), { settle: 2800 });
      await sleep(2600);
      await glideScroll(page, 360);
      await sleep(2400);
    },
  },
  {
    id: "estimates",
    say: "And you bill the client from the same breakdown you already built. Contract, cost to date, margin — with G S T on top.",
    async run(page) {
      await click(page, nav(page, "Client Estimates"), { settle: 2800 });
      await sleep(2800);
    },
  },
  {
    id: "close",
    say: "Sitetru. Truth, reported from site. Free to start, from nine hundred and ninety nine rupees a month.",
    async run(page) {
      await click(page, nav(page, "Dashboard"), { settle: 2600 });
      await sleep(2800);
    },
  },
];

/* ------------------------------------------------------------------- run -- */
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  serviceWorkers: "block",           // a mid-run SW update reloads the page
  recordVideo: { dir: RAW, size: { width: W, height: H } },
});

// Serve the webfonts from disk. Left to the network they are a render-blocking
// third-party request that has stalled a load here before, and a fallback
// system face would put the wrong type on every frame of the video.
const cssBody = readFileSync(join(FONTS, "fonts.css"), "utf8");
await ctx.route("https://fonts.googleapis.com/**", (r) =>
  r.fulfill({ status: 200, contentType: "text/css", body: cssBody }));
await ctx.route("**/__fonts/*.woff2", (r) =>
  r.fulfill({
    status: 200,
    contentType: "font/woff2",
    body: readFileSync(join(FONTS, r.request().url().split("/").pop())),
  }));
// Nothing else external should be able to stall or appear in the frame.
await ctx.route("https://www.google.com/recaptcha/**", (r) =>
  r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));

const page = await ctx.newPage();
// Recording begins the moment the page exists, so this -- not the first beat
// -- is frame zero of the video. Measuring beats from anything later shifts
// every subtitle and every composited cut earlier than the picture by however
// long setup took, which here is around ten seconds.
const videoT0 = Date.now();
page.on("pageerror", (e) => console.log("  page error:", String(e).slice(0, 120)));

await page.goto(`${BASE}/?demo=1`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.getElementById("root")?.children.length > 0, { timeout: 45000 });
await page.waitForTimeout(3500);

// The demo banner is a property of the demo, not of the product. Hide it so
// the walkthrough shows the app as a customer would run it.
await page.addStyleTag({ content: "[data-demo-banner]{display:none!important}" });
await page.evaluate(() => { document.body.style.paddingBottom = ""; });
await page.evaluate(CURSOR_JS);
await page.evaluate(([a, b]) => window.__cur?.(a, b), [mouse.x, mouse.y]);
await page.waitForTimeout(1200);

const marks = [];
for (const beat of BEATS) {
  const start = Date.now() - videoT0;
  process.stdout.write(`  ${beat.id.padEnd(12)} @ ${(start / 1000).toFixed(1)}s `);
  try {
    await page.evaluate(CURSOR_JS);            // survive any re-render
    await beat.run(page);
  } catch (e) {
    console.log(`FAILED: ${String(e).split("\n")[0].slice(0, 90)}`);
    marks.push({ ...beat, start, end: Date.now() - videoT0, failed: true });
    continue;
  }
  const end = Date.now() - videoT0;
  marks.push({ ...beat, start, end });
  console.log(`-> ${(end / 1000).toFixed(1)}s`);
}
await page.waitForTimeout(1200);

const video = page.video();
await ctx.close();                              // flushes the webm
const webm = await video.path();
await browser.close();

/* ---------------------------------------------------------------- output -- */
mkdirSync(OUT, { recursive: true });
const mp4 = join(OUT, "walkthrough.mp4");

// Composite any beat that declared a cutTo, over exactly the window that beat
// occupied. Because the window comes from the measured run rather than a
// hand-written offset, the cut cannot land on the wrong screen.
const cuts = marks.filter((m) => m.cutTo && !m.failed);
const STILLS = resolve(HERE, "../remotion/public");
const FADE = 0.45;

const inputs = [];
const filters = [];
let last = "0:v";
cuts.forEach((c, i) => {
  const from = c.start / 1000;
  const to = c.end / 1000;
  inputs.push("-loop", "1", "-t", String(to - from + 1), "-i", join(STILLS, c.cutTo));
  const idx = i + 1;
  // Fade the still up and out on its own alpha, then hold it over the frame
  // only inside the beat. Everything outside the window passes through.
  filters.push(
    `[${idx}:v]scale=${W}:${H},format=rgba,` +
    `fade=t=in:st=0:d=${FADE}:alpha=1,` +
    `fade=t=out:st=${(to - from - FADE).toFixed(2)}:d=${FADE}:alpha=1,` +
    `setpts=PTS-STARTPTS+${from.toFixed(3)}/TB[ov${idx}]`,
    `[${last}][ov${idx}]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[bg${idx}]`,
  );
  last = `bg${idx}`;
});

const args = ["-y", "-i", webm, ...inputs];
if (filters.length) args.push("-filter_complex", filters.join(";"), "-map", `[${last}]`);
args.push(
  "-c:v", "libx264", "-preset", "slow", "-crf", "20",
  "-pix_fmt", "yuv420p",                        // required by most players
  "-movflags", "+faststart",
  "-r", "30",
  "-t", String((marks.at(-1).end + 1200) / 1000),
  mp4,
);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
if (cuts.length) console.log(`  composited ${cuts.length} cut-away(s): ${cuts.map((c) => c.id).join(", ")}`);

const ts = (ms, sep = ",") => {
  const t = Math.max(0, ms);
  const h = String(Math.floor(t / 3.6e6)).padStart(2, "0");
  const m = String(Math.floor(t / 6e4) % 60).padStart(2, "0");
  const s = String(Math.floor(t / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s}${sep}${String(Math.floor(t % 1000)).padStart(3, "0")}`;
};

writeFileSync(
  join(OUT, "walkthrough.srt"),
  marks.map((b, i) =>
    `${i + 1}\n${ts(b.start)} --> ${ts(b.end)}\n${b.say}\n`).join("\n"),
);

const total = marks.at(-1)?.end ?? 0;
writeFileSync(
  join(OUT, "walkthrough.md"),
  [
    "# Sitetru walkthrough — voiceover script",
    "",
    `Runtime **${(total / 1000).toFixed(1)}s**. Timings are measured from the`,
    "recorded run, not estimated, so they match `walkthrough.mp4` exactly.",
    "Re-record and this file regenerates with it.",
    "",
    "| In | Out | On screen | Say |",
    "|---|---|---|---|",
    ...marks.map((b) =>
      `| ${ts(b.start, ".").slice(3)} | ${ts(b.end, ".").slice(3)} | ${b.id}${b.failed ? " ⚠️ failed" : ""} | ${b.say} |`),
    "",
  ].join("\n"),
);

const failed = marks.filter((m) => m.failed);
console.log(`\n  runtime ${(total / 1000).toFixed(1)}s`);
console.log(`  ${mp4}`);
console.log(`  ${join(OUT, "walkthrough.srt")}`);
console.log(`  ${join(OUT, "walkthrough.md")}`);
if (failed.length) console.log(`  ${failed.length} beat(s) FAILED: ${failed.map((f) => f.id).join(", ")}`);
rmSync(RAW, { recursive: true, force: true });
