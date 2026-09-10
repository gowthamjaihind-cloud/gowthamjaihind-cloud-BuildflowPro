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

import { BRAND } from "../brand.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out");
const RAW = join(OUT, "raw");
const FONTS = join(HERE, "fonts");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.DEMO_URL || "http://localhost:4173";
const W = 1920, H = 1080;

/**
 * Seconds trimmed off the head of the recording.
 *
 * The app needs a few seconds to boot and settle before it is worth filming,
 * and recording starts the moment the page exists -- so the run necessarily
 * captures that. Cutting it here rather than shortening the settle keeps the
 * two concerns apart: the run waits as long as correctness needs, and the film
 * opens on a loaded screen. Every measured beat start is shifted by the same
 * amount, so the narration stays where it was put.
 *
 * Not zero: a beat of the portfolio before the first line lands is a better
 * opening than the voice starting over a still-arriving screen.
 */
const HEAD_TRIM = 2.6;

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

/* ---------------------------------------------------------------- cursor -- */
// The click ring, in the brand. It was #D97D54 -- the retired rust -- pinging
// orange over a navy-and-cobalt product for as long as this recorder has
// existed, because nothing connected marketing/ to the app's palette.
const RING = BRAND.primary;
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
    ' fill="${BRAND.ink}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  const r = document.createElement("div");
  r.id = "__ring";
  r.style.cssText = [
    "position:fixed","left:0","top:0","width:34px","height:34px","border-radius:50%",
    "z-index:2147483646","pointer-events:none","opacity:0","border:3px solid ${RING}",
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

/**
 * Scroll the page smoothly -- and scroll the thing that actually scrolls.
 *
 * THIS APP DOES NOT SCROLL THE WINDOW. Layout puts the content in an inner
 * `div.flex-1.overflow-y-auto`, so `window.scrollTo` is a no-op here. This
 * recorder had been calling it since it was written, which meant every
 * "scroll" in every walkthrough did nothing: the beats ran their full length
 * over a motionless page. Measured on the last cut, that produced eleven
 * separate motionless stretches of over five seconds, the longest 14.8s -- and
 * it looked exactly like a pacing problem, which is what sent me looking at
 * pacing rather than at whether the scroll worked.
 *
 * DESIGN.md already carried the warning, from the modal work: "Don't lock
 * scrolling with overflow:hidden on <body>. This app does not scroll the body
 * -- find what is actually scrollable."
 *
 * So this finds it: the tallest element that genuinely has somewhere to go.
 */
/** How far the real scroller can travel on this screen, in pixels. */
async function scrollRange(page) {
  return page.evaluate(() => {
    const s = [...document.querySelectorAll("div")]
      .filter((el) => {
        const oy = getComputedStyle(el).overflowY;
        return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 40;
      })
      .sort((a, b) => b.clientHeight - a.clientHeight)[0];
    return s ? Math.round(s.scrollHeight - s.clientHeight) : 0;
  });
}

async function glideScroll(page, to, ms = 900) {
  await page.evaluate(
    ([target, dur]) =>
      new Promise((done) => {
        const scroller =
          [...document.querySelectorAll("div")]
            .filter((el) => {
              const oy = getComputedStyle(el).overflowY;
              return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 40;
            })
            .sort((a, b) => b.clientHeight - a.clientHeight)[0] ?? document.scrollingElement;
        if (!scroller) return done();
        const max = Math.max(scroller.scrollHeight - scroller.clientHeight, 0);
        const start = scroller.scrollTop;
        const end = Math.min(Math.max(target, 0), max);
        if (Math.abs(end - start) < 2) return done();
        const t0 = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          scroller.scrollTop = start + (end - start) * e;
          t < 1 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
  await sleep(160);
}

const nav = (page, label) => page.getByRole("button", { name: label, exact: true }).first();

/* ----------------------------------------------------------------- beats -- */
/**
 * The beats come from the SCRIPT, and their pacing comes from the MEASURED
 * narration.
 *
 * This used to be a hand-written list where each beat's `say` sat next to a
 * pile of `sleep(2600)` calls chosen by feel, and the narration was a text file
 * handed to whoever recorded the audio afterwards. Those two things had no way
 * of agreeing: a line that takes eleven seconds to read over a beat that runs
 * for six leaves the voice talking over the next screen, and every beat after
 * it drifts further.
 *
 * Now marketing/films/walkthrough.script.mjs owns the words, build-voice.mjs
 * measures how long each one actually takes to say, and every beat here is
 * padded to at least that -- so the recording is as long as the narration needs
 * and the two are locked together by construction rather than by care.
 */
const VOICE = JSON.parse(
  readFileSync(resolve(HERE, "../films/out/walkthrough/manifest.json"), "utf8"),
);

/** What each beat DOES. The words and the timing come from the manifest. */
const ACTIONS = {
  // The portfolio is one screenful, so this fills its beat by moving the
  // pointer over each project card in turn rather than scrolling nothing.
  portfolio: async (page, budget = 6000) => {
    const stops = [[0.34, 0.46], [0.5, 0.62], [0.72, 0.62], [0.5, 0.3]];
    await fill(budget, stops.map(([x, y]) => [1450, async () => {
      await glide(page, W * x, H * y, 950);
      await sleep(480);
    }]));
  },
  open: async (page) => {
    await click(page, page.getByText("Sample Residence — Plot 12").first(), { settle: 3200 });
  },
  dashboard: async (page, budget = 10000) => {
    const t0 = Date.now();
    await sleep(900);
    await fill(
      Math.max(budget - (Date.now() - t0) - 900, 0),
      [340, 760, 1180, 620].map((to) => [STEP_COST, async () => {
        await glideScroll(page, to, SCROLL_MS);
        await sleep(DWELL_MS);
      }]),
    );
    await glideScroll(page, 0, 800);
  },
  // Telegram is the one part of the product that is not in the browser, and a
  // project has no Telegram screen to navigate to -- it lives in Settings,
  // reachable only from the portfolio. So this beat holds on the app while a
  // still of the bot is composited over exactly the window it occupied.
  // Telegram is a composited still, so nothing here drives the picture -- the
  // push-in that keeps it alive is applied to the overlay in post. This just
  // holds the app still underneath it so the cut-away has a clean bed.
  telegram: async (_page, budget = 14000) => {
    await sleep(Math.max(budget - 600, 500));
  },
};

/**
 * Spend a time budget on a list of moves, running only the ones that fit.
 *
 * The first attempt at filling a beat checked the deadline BEFORE each move and
 * then ran it, so a move starting a moment before the deadline ran a second and
 * a half past it. Every beat overshot, and the walkthrough came out 199s
 * instead of 160 -- longer, which is the exact opposite of the point. A budget
 * you can overrun is not a budget: each step is costed and skipped if it does
 * not fit.
 */
async function fill(budget, steps) {
  const end = Date.now() + budget;
  for (const [cost, run] of steps) {
    if (Date.now() + cost > end) break;
    await run();
  }
  // Anything left is genuinely spare; hold rather than start something that
  // would run past the line.
  const left = end - Date.now();
  if (left > 0) await sleep(left);
}

/**
 * The default action: go to a module and keep looking around it for as long as
 * the narration lasts, and no longer.
 *
 * The first version navigated, scrolled once, and stopped. Measured across a
 * run, that left **52 seconds of the 160 showing a motionless page** -- a third
 * of the film -- because every beat waits for its line to finish and most lines
 * outlast their clicks. That is the actual reason a walkthrough drags, and no
 * amount of transition polish fixes it: the cure is for something to be
 * happening. It is now 3s across the whole film.
 */
const SCROLL_MS = 1000;
const DWELL_MS = 520;
const STEP_COST = SCROLL_MS + DWELL_MS;

/**
 * Move the pointer around the content, for screens that cannot scroll.
 *
 * Five of the twelve modules -- Daily Logs, Labour, Procurement, Client
 * Estimates, Document Vault -- fit in one viewport with the demo's data, so
 * their scroll range is exactly zero. Measured on the last cut, those beats
 * were the remaining motionless stretches, up to 12.8 seconds each, and no
 * amount of scrolling code would ever have fixed them: there is nowhere to go.
 *
 * A tour is a person looking at a screen, so this is what a person does with
 * one. It also reads better than a push-in on a table of numbers.
 */
const tour = (page, budget) =>
  fill(
    budget,
    [
      [0.30, 0.34],
      [0.66, 0.42],
      [0.40, 0.62],
      [0.72, 0.70],
      [0.50, 0.40],
    ].map(([x, y]) => [1420, async () => {
      await glide(page, W * x, H * y, 940);
      await sleep(480);
    }]),
  );

const visit = (label, scrollTo) => async (page, budget = 6000) => {
  const t0 = Date.now();
  if (label) await click(page, nav(page, label), { settle: 2000 });
  const spent = Date.now() - t0;
  const left = Math.max(budget - spent, 0);

  // Ask the page what it can do before deciding what to do with it.
  const range = await scrollRange(page);
  // Reported back so the post-process knows which beats had nowhere to scroll
  // and need a camera move instead.
  page.__range = range;
  if (range < 200) {
    await tour(page, left);
    return;
  }

  const tail = 900;
  const steps = [];
  let depth = Math.min(scrollTo ?? 340, range);
  let dir = 1;
  for (let i = 0; i < 6; i++) {
    const to = depth;
    steps.push([STEP_COST, async () => {
      await glideScroll(page, to, SCROLL_MS);
      await sleep(DWELL_MS);
    }]);
    depth += dir * 360;
    if (depth > range) { dir = -1; depth = range; }
    if (depth < 0) { dir = 1; depth = 0; }
  }
  await fill(Math.max(left - tail, 0), steps);
  await glideScroll(page, 0, 800);
};

const BEATS = VOICE.beats.map((b) => ({
  id: b.id,
  say: b.text,
  cutTo: b.cutTo,
  /** Seconds the narration needs; the runner pads the beat to cover it. */
  voice: b.seconds,
  hold: b.hold,
  run: ACTIONS[b.id] ?? visit(b.nav, b.scroll),
}));

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

// The guided tour opens over the demo and its backdrop swallows clicks, which
// is right for a visitor and wrong for a scripted run -- it blocked every
// navigation the first time this met it. Mark it seen before anything loads.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("sitetru.demo.tour.done", "1");
  } catch {
    /* private mode: the tour will open and the run will report the failures */
  }
  // The demo's own furniture -- the LIVE DEMO bar, the Replay tour pill -- is a
  // property of the demo, not of the product, so it must never be in frame.
  //
  // This has to happen HERE rather than after the page loads. Recording starts
  // the moment the page exists, and the style tag used to be injected after
  // goto plus a 3.5s settle, so the first four or five seconds of every
  // walkthrough opened on a banner reading "nothing you do here is saved" --
  // the one frame a viewer sees before anything else.
  //
  // Getting this right took a measurement. An init script runs in a fresh
  // context where `document` exists but is EMPTY -- documentElement can still
  // be null -- so the obvious version, append to `document.head ??
  // document.documentElement`, threw on null and took the DOMContentLoaded
  // listener registered after it down with it. The style then never existed at
  // all, and the run looked like the CSS was simply being overridden.
  //
  // So: register the listener first, and keep trying until there is a head to
  // append to.
  const CSS =
    "[data-demo-banner],[data-demo-tour]{display:none!important}" +
    "body{padding-bottom:0!important}";
  const hide = () => {
    if (document.getElementById("__nofurniture")) return true;
    const target = document.head ?? document.body ?? document.documentElement;
    if (!target) return false;
    const style = document.createElement("style");
    style.id = "__nofurniture";
    style.textContent = CSS;
    target.appendChild(style);
    return true;
  };
  document.addEventListener("DOMContentLoaded", hide);
  if (!hide()) {
    // Poll only until it lands, which is within the first frame in practice.
    const timer = setInterval(() => {
      if (hide()) clearInterval(timer);
    }, 8);
    setTimeout(() => clearInterval(timer), 8000);
  }
});

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
// Belt and braces: the init script above already did this before the first
// frame, but a re-render can re-apply the body padding the banner reserves.
await page.evaluate(() => { document.body.style.paddingBottom = ""; });
await page.evaluate(CURSOR_JS);
await page.evaluate(([a, b]) => window.__cur?.(a, b), [mouse.x, mouse.y]);
await page.waitForTimeout(1200);

const marks = [];
for (const beat of BEATS) {
  const start = Date.now() - videoT0;
  // Declared out here so the mark below can see it; the try block only assigns.
  let idle = 0;
  process.stdout.write(`  ${beat.id.padEnd(12)} @ ${(start / 1000).toFixed(1)}s `);
  try {
    await page.evaluate(CURSOR_JS);            // survive any re-render
    // The action is told how long its narration runs, so it can fill the beat
    // instead of finishing early and leaving the page frozen.
    page.__range = undefined;
    await beat.run(page, (beat.voice + beat.hold) * 1000);
    // Hold until the narration for this beat has had time to finish, plus its
    // written hold. This is the whole point of measuring the voice first: a
    // beat whose clicks are quicker than its line waits, instead of letting
    // the voice run over the next screen and drag every later beat with it.
    //
    // `idle` is what that waiting costs in dead screen time, and it is recorded
    // rather than shrugged at: a beat that spends four of its eleven seconds
    // showing a motionless page is the reason a walkthrough drags, and you
    // cannot fix what you are not measuring.
    const need = (beat.voice + beat.hold) * 1000;
    const spent = Date.now() - videoT0 - start;
    idle = Math.max(need - spent, 0);
    if (idle > 0) await sleep(idle);
  } catch (e) {
    console.log(`FAILED: ${String(e).split("\n")[0].slice(0, 90)}`);
    marks.push({ ...beat, start, end: Date.now() - videoT0, idle: 0, failed: true });
    continue;
  }
  const end = Date.now() - videoT0;
  marks.push({ ...beat, start, end, idle, range: page.__range });
  console.log(
    `-> ${(end / 1000).toFixed(1)}s` + (idle > 400 ? `  (${(idle / 1000).toFixed(1)}s idle)` : ""),
  );
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
// Everything downstream works in FILM time, not run time.
const shifted = marks.map((m) => ({
  ...m,
  start: Math.max(m.start - HEAD_TRIM * 1000, 0),
  end: Math.max(m.end - HEAD_TRIM * 1000, 0),
}));
const cuts = shifted.filter((m) => m.cutTo && !m.failed);
const STILLS = resolve(HERE, "../remotion/public");
const FADE = 0.45;

/**
 * A punch-in on every module change.
 *
 * The recording is one continuous take, so it has no cuts to give it rhythm.
 * This supplies the accent instead: at each beat's start the frame is a few
 * percent large and settles over a third of a second, which reads as the camera
 * landing on the new screen. It is the same `Punch` the launch film opens every
 * shot with, applied to a stream that cannot be cut.
 *
 * Built as one expression rather than fourteen filters: `scale` re-evaluated
 * per frame, then cropped back to size. Z is 1 everywhere except inside a
 * punch window, so the picture is untouched for most of the film.
 */
const PUNCH = 0.34;      // seconds the settle takes
const PUNCH_AMOUNT = 0.05;
const zoomTerms = shifted
  .filter((m) => !m.failed)
  .map((m) => {
    const t = (m.start / 1000).toFixed(3);
    // (1 - x)^3: lands hard, settles soft.
    return `between(t,${t},${(m.start / 1000 + PUNCH).toFixed(3)})*pow(1-(t-${t})/${PUNCH},3)`;
  });
/**
 * A slow push, for the beats whose screen cannot scroll.
 *
 * Five of the twelve modules fit in one viewport with the demo's data, so their
 * scroll range is zero and they were the film's remaining motionless stretches
 * -- up to 13 seconds each. Moving the pointer around them did not help: a 22px
 * cursor on a 1920px frame is not motion, to a measurement or to a viewer.
 *
 * When the subject cannot move, the camera does. This is the documentary
 * answer to a still, and it is the only motion actually available on a screen
 * with nothing to scroll.
 */
// 11%, not 5%. At 5% a thirteen-second beat travels about 7 pixels a second on
// a 1920-wide frame -- real, but below the threshold where it reads as the film
// moving rather than the film sitting still. 11% is a move you can see without
// it becoming seasick.
const PUSH_AMOUNT = 0.11;
const pushTerms = shifted
  .filter((m) => !m.failed && typeof m.range === "number" && m.range < 200)
  .map((m) => {
    const a = (m.start / 1000).toFixed(3);
    const b = (m.end / 1000).toFixed(3);
    const dur = Math.max(m.end - m.start, 1) / 1000;
    return `between(t,${a},${b})*((t-${a})/${dur.toFixed(3)})`;
  });

const zoomExpr =
  `1+${PUNCH_AMOUNT}*(${zoomTerms.join("+")})` +
  (pushTerms.length ? `+${PUSH_AMOUNT}*(${pushTerms.join("+")})` : "");

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
  // A slow push across the cut-away's whole window. Without it the Telegram
  // beat is a fifteen-second freeze frame in the middle of the film -- by far
  // the longest motionless stretch, and the one a viewer notices.
  const push = 1 + 0.1;
  filters.push(
    `[${idx}:v]scale=w='${W}*(1+0.10*min(1,(t/${(to - from).toFixed(2)})))':` +
      `h='${H}*(1+0.10*min(1,(t/${(to - from).toFixed(2)})))':eval=frame,` +
    `crop=${W}:${H},format=rgba,` +
    `fade=t=in:st=0:d=${FADE}:alpha=1,` +
    `fade=t=out:st=${(to - from - FADE).toFixed(2)}:d=${FADE}:alpha=1,` +
    `setpts=PTS-STARTPTS+${from.toFixed(3)}/TB[ov${idx}]`,
    `[${last}][ov${idx}]overlay=0:0:enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'[bg${idx}]`,
  );
  void push;
  last = `bg${idx}`;
});

const args = ["-y", "-ss", String(HEAD_TRIM), "-i", webm, ...inputs];
// The punch runs last, over whatever the cut-aways left, so a module change
// under a composited still gets the same accent as one that is not.
filters.push(
  `[${last}]scale=w='iw*(${zoomExpr})':h='ih*(${zoomExpr})':eval=frame,` +
    `crop=${W}:${H}[punched]`,
);
last = "punched";
args.push("-filter_complex", filters.join(";"), "-map", `[${last}]`);
args.push(
  // crf 24, not 20. The per-frame push and punch-in defeat x264's ability to
  // reuse a static frame, so the same picture that encoded to 7 MB as a mostly
  // motionless take came out at 27 MB once it moved -- and the narrated cut
  // went past the 30 MB most places will accept for an upload. Screen content
  // at crf 24 is still visually clean; this is flat UI, not film grain.
  "-c:v", "libx264", "-preset", "slow", "-crf", "24",
  "-pix_fmt", "yuv420p",                        // required by most players
  "-movflags", "+faststart",
  "-r", "30",
  "-t", String((shifted.at(-1).end + 1200) / 1000),
  mp4,
);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
if (cuts.length) console.log(`  composited ${cuts.length} cut-away(s): ${cuts.map((c) => c.id).join(", ")}`);
if (pushTerms.length) {
  const pushed = shifted.filter((m) => typeof m.range === "number" && m.range < 200).map((m) => m.id);
  console.log(`  slow push on ${pushed.length} unscrollable screen(s): ${pushed.join(", ")}`);
}

const ts = (ms, sep = ",") => {
  const t = Math.max(0, ms);
  const h = String(Math.floor(t / 3.6e6)).padStart(2, "0");
  const m = String(Math.floor(t / 6e4) % 60).padStart(2, "0");
  const s = String(Math.floor(t / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${s}${sep}${String(Math.floor(t % 1000)).padStart(3, "0")}`;
};

writeFileSync(
  join(OUT, "walkthrough.srt"),
  shifted.map((b, i) =>
    `${i + 1}\n${ts(b.start)} --> ${ts(b.end)}\n${b.say}\n`).join("\n"),
);

const total = shifted.at(-1)?.end ?? 0;
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
    ...shifted.map((b) =>
      `| ${ts(b.start, ".").slice(3)} | ${ts(b.end, ".").slice(3)} | ${b.id}${b.failed ? " ⚠️ failed" : ""} | ${b.say} |`),
    "",
  ].join("\n"),
);

/* ----------------------------------------------------------------- audio -- */
// The picture is silent up to here. The mix places each line at the beat's
// MEASURED start, so the voice cannot be out of step with the screen it is
// describing -- and lays the score under it, ducked.
// The deliverable. `walkthrough.mp4` beside it is the silent picture, kept
// because a re-mix does not need a re-record.
const narrated = join(OUT, "sitetru-walkthrough.mp4");
try {
  const timed = {
    ...VOICE,
    beats: VOICE.beats.map((b) => {
      const m = shifted.find((x) => x.id === b.id);
      return { ...b, startsAt: m ? Number((m.start / 1000).toFixed(3)) : b.startsAt };
    }),
  };
  writeFileSync(join(OUT, "timed-manifest.json"), JSON.stringify(timed, null, 2));
  const { mixWithManifest } = await import("../films/mix.mjs");
  mixWithManifest("walkthrough", timed, mp4, narrated);
} catch (e) {
  console.log(`  audio mix skipped: ${String(e).split("\n")[0].slice(0, 120)}`);
}

const failed = shifted.filter((m) => m.failed);
console.log(`\n  runtime ${(total / 1000).toFixed(1)}s`);
console.log(`  ${mp4}`);
console.log(`  ${join(OUT, "walkthrough.srt")}`);
console.log(`  ${join(OUT, "walkthrough.md")}`);
if (failed.length) console.log(`  ${failed.length} beat(s) FAILED: ${failed.map((f) => f.id).join(", ")}`);
rmSync(RAW, { recursive: true, force: true });
