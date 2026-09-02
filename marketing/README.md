# Marketing asset pipeline

Everything needed to regenerate the Sitetru walkthrough videos and the
Telegram bot stills, from the demo build, with no external services.

Two things this pipeline does NOT do: it has no text-to-speech, so the videos
carry their narration as on-screen text rather than voice; and it does not
talk to any hosted video tool. Renders happen locally with a headless browser
and ffmpeg.

## Requirements

- `ffmpeg` on PATH (`apt-get install -y --no-install-recommends ffmpeg`)
- `playwright-core` — a devDependency, so `npm install` covers it. It ships
  no browser; point `CHROME_PATH` at a Chromium binary if yours is not at the
  sandbox default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- Google Fonts must be reachable — Manrope and Noto Sans Tamil are pulled at
  render time. Tamil renders as tofu boxes without the latter.

## 1. Regenerate the screenshots (only when the UI changes)

```bash
npm run build:demo
node marketing/capture/serve-demo.mjs &      # serves dist-demo on :4173
npm run capture:screens                      # -> marketing/video/screens/
```

Captures at 3200x2000. The video crops *into* these images, so the resolution
is load-bearing — do not shrink them.

The script prints `[EMPTY STATE -- check fixtures]` next to any screen that
rendered with no data. Treat that as a failure: it usually means a hook reads
Firestore directly and has no demo branch, which is a real bug in the demo
build, not a capture problem.

## 2. Render the videos

```bash
npm run video                    # both cuts
npm run video:preview -- vert    # 6 stills, ~5s, no encode
node marketing/video/build.mjs ta   # one cut: vert | ta | both
```

Output lands in `marketing/video/out/` (gitignored):

| File | Format | Length |
| --- | --- | --- |
| `sitetru-vertical-en.mp4` | 1080x1920, 24fps | ~76s |
| `sitetru-tamil-16x9.mp4` | 1920x1080, 24fps | ~90s |

A full render is ~3 minutes per video. Use `PREVIEW=1` while iterating on
copy or framing — it renders only the pan endpoints, which are the frames
worth judging.

### How it works

The page exposes a seekable clock: `window.render(t)` positions every element
for time `t`. The build loop calls it once per frame, screenshots, and hands
the JPEGs to ffmpeg. Nothing depends on wall-clock timing, so renders are
deterministic and reproducible.

Each beat defines a region of interest in *source* pixels and pans across it —
`a` and `b` are `[x, y, width]`, with height derived from the window aspect so
nothing is ever distorted. This is the whole trick behind the vertical cut:
the screenshots are landscape, so the video crops into the panel being
described instead of letterboxing a whole screen down to unreadable.

Two knobs tune this per variant:

- `roiScale` — multiplies the crop width. Above 1 zooms out.
- `panScale` — fraction of the `a`→`b` distance actually travelled.

The 16:9 cut uses `1.25` / `0.55` because a wide frame has room to spare and
a long pan clips words mid-travel. The vertical cut uses `1.0` / `1.0`.

Keep the source region width at or under ~1560px against a 1080px-wide
window. Past that the app's own type drops below roughly 16px in frame and
stops being readable on a phone, which defeats the point.

## 3. Telegram bot stills

```bash
node marketing/telegram/build-chat.mjs
node marketing/telegram/shot.mjs marketing/telegram/out/en.html /tmp/tg-en.png
node marketing/telegram/shot.mjs marketing/telegram/out/ta.html /tmp/tg-ta.png
```

The conversation is transcribed from the bot's real strings in
`functions/src/telegram/i18n.ts`. Two details that are easy to get wrong and
which the mock deliberately gets right:

- The bot uses `inline_keyboard` with `callback_data`. Inline button taps do
  **not** echo as user messages — only typed input does (`/log`, `65`, `8`).
  Tapped buttons are shown highlighted instead of faked as chat bubbles.
- `log.ts` calls `sendMessage`, never `editMessageText`, so each tap appends a
  new message rather than rewriting one in place.

If you restage the conversation, re-read those strings first. Inventing bot
dialogue that does not match shipped behaviour is the failure mode here.

## Narration

`video/tamil-narration.txt` is the Tamil script, in spoken register — Tamil
grammar with the English product words contractors actually say
(பர்ச்சேஸ் ஆர்டர், ஸ்டாக், பட்ஜெட், எஸ்டிமேட், டெலிகிராம், GST). Translating
those into literary Tamil makes it sound foreign; that is the specific thing
to avoid.

The Tamil in `build.mjs` is copied from that file verbatim. If you edit one,
edit both.

On-screen figures must match whatever the screenshots actually show. Beat 4
already drifted once: it read ₹6.4L while the cost screen showed ₹53.7L,
because the demo dataset grew after the script was written.

## remotion/ — programmatic launch videos

Two compositions, both built from the same screenshots in `../video/screens`:

- **Hero** — 1920x1080, 81s. The site and YouTube cut.
- **Social** — 1080x1920, 30s. WhatsApp status, Instagram, Shorts.

```
cd marketing/remotion
npm install
npm run studio          # preview and scrub in the browser
npm run render:hero
npm run render:social
```

Rendering needs a Chromium. This environment ships one, and Remotion passes the
old `--headless` flag that current Chrome builds reject, so point it at the
headless shell instead:

```
npx remotion render Hero out/sitetru-hero.mp4 \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

### Why this exists alongside video/build.mjs

`video/build.mjs` renders frames from hand-written HTML. Remotion is React, so a
beat is a component and the timeline is data — easier to retime, restyle and
re-cut into other aspect ratios.

### The crop model

`Screen.tsx` takes a focus point (centre and width in source pixels; screens are
3200x2000) and derives the crop height from the composition's aspect ratio, so a
region always fills the frame exactly — never letterboxed, never floating,
never clipped at an edge by accident. Vertical needs its own narrower focus
values: at 9:16 the height is width x 16/9, so anything wider than ~1125px
overruns a 2000px-tall screenshot.

Captions are one full-bleed band across the foot of the frame. Text is never set
in a coloured chip, and nothing decorative is laid over a screen.

## walkthrough/ — the screen recording

A narrated tour of the real app, driven in a browser and captured as video. The
Remotion cut above is composed from stills; this one is the product actually
running, clicked through in order.

```bash
npm run build:demo
node marketing/capture/serve-demo.mjs &      # serves dist-demo on :4173
npm run walkthrough
```

Three files land in `walkthrough/out/` (untracked, like every render here):
`walkthrough.mp4`, `walkthrough.srt`, and `walkthrough.md` — a time-stamped
voiceover script to hand to whoever records the audio.

### Timings are measured, not written

Each beat carries its narration and the steps that drive the app. The runner
records when each beat actually started and finished, and the subtitles, the
script and the composited cut-aways are all built from those measurements. A
beat that runs long moves its own caption, so the script cannot drift out of
sync with the picture.

The clock starts when the page is created, because that is when recording
begins — not when the first beat runs. Anchoring it any later shifts every
subtitle earlier than the picture by however long start-up took, which is
around ten seconds.

### Cut-aways

A beat may declare `cutTo: "<file in remotion/public>"`. That still is
composited full-frame over exactly the window the beat occupied, with a short
fade either side. Telegram uses this: it is the one part of the product that
does not happen in the browser, and a project has no Telegram screen to
navigate to (Telegram lives in Settings, reachable only from the portfolio).
`telegram-beat-full.png` is the variant built for this — the other two reserve
space at the foot for Remotion's caption band, which reads as dead space when
the frame is used on its own.

### Fonts

`walkthrough/fonts/` holds Manrope and JetBrains Mono, served to the page from
disk during a recording. Left to the network they are a render-blocking
third-party request that has stalled a page load here before, and falling back
to a system face would put the wrong type on every frame.

### The pointer

Playwright moves a real mouse but paints no pointer, so a raw recording looks
like the UI is operating itself. The runner draws a cursor, glides it with
easing, and pings a ring on each click. Scrolling is eased for the same reason:
a jump cut mid-page reads as a glitch.
