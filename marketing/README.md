# Marketing asset pipeline

Everything needed to regenerate the Sitetru films and the Telegram bot stills,
from the demo build, with no external services.

**Nothing here calls a hosted service.** The voice is a neural TTS model running
on this machine, the music is composed and synthesised by a script in this
repository, and the picture is rendered by a headless browser and ffmpeg. There
is no API key to hold, no per-render cost, no third party that has to still
exist in two years, and no licence attached to any frame or any second of audio.
That last one is the reason the music is generated rather than chosen: a library
track carries a licence, and a licence is exactly the sort of thing that
surfaces later, when a video is doing well.

## The two films

| File | What it is | Length |
| --- | --- | --- |
| `remotion/out/sitetru-launch.mp4` | The launch film. Argues. Cut from stills. | ~83s |
| `walkthrough/out/sitetru-walkthrough.mp4` | The walkthrough. Explains. The product actually running. | ~2:30 |

Different jobs, on purpose. The launch film opens on the evening a contractor
spends finding out what happened today, names the one genuinely unusual thing
about the product — the site engineer reports over Telegram, on a phone he
already has — and then spends its middle following a single log from site
through the plan, the stock, the purchase order, the task cost and the client
bill. That chain is the product; the features are just where it surfaces.

The walkthrough does not sell. It is a tour of the real app being clicked, in
the order a JOB runs rather than the order the sidebar lists: plan it, run the
day, buy the material, pay the people, watch the money, bill the client, keep
the paperwork. A tour that goes down the menu teaches the menu.

Build either from cold:

```bash
bash marketing/voice/fetch-voice.sh          # once: the ~58 MB voice model
npm run build:demo
node marketing/capture/serve-demo.mjs &
npm run capture:screens                      # only when the UI changes

npm run film:launch                           # voice -> picture -> mix
npm run film:walkthrough                      # voice -> record -> mix
```

### Timing is measured, never written

Both films lay their beats out from the **measured** length of each spoken line.
`marketing/films/build-voice.mjs` synthesises the script and writes a manifest
of what each line actually takes to say; the launch film's Remotion composition
imports those numbers, and the walkthrough recorder pads every beat until its
narration has had time to finish.

Edit a sentence and the film retimes itself. The alternative — frame counts kept
by hand next to a script — is what the earlier pipeline did, and it had already
drifted: a line that takes eleven seconds read over a beat that runs for six
leaves the voice talking across the next screen, and every beat after it slides
further out.

### The voice

`marketing/voice/` — Piper (VITS, neural) with the CC0 `en_US-joe-medium` model,
run locally. `fetch-voice.sh` gets the weights; they are not committed.

Piper normally ships a sidecar JSON beside each model with the phoneme table in
it, and the CC0 package on npm carries only the weights, so `synth.py` rebuilds
that config from Piper's own `DEFAULT_PHONEME_ID_MAP` — the same table every
espeak Piper voice uses, which is why this works rather than being a lucky
guess.

`master.mjs` is the chain that makes it sound like a voiceover rather than a
TTS demo: high-pass, de-esser (the single biggest audible improvement — the
model's /s/ is its worst artefact), a shelf out of the boxy 300–500 Hz region,
a presence lift at 3 kHz where consonants live, 4:1 compression with a slow
release, a limiter, and `loudnorm` to −16 LUFS.

**You cannot hear a render in CI, but you can check it.** `pronounce.py` prints
the IPA Piper will actually use for every word in a script, which turns
pronunciation into something verifiable:

```bash
python3 marketing/voice/pronounce.py marketing/films/launch.script.mjs
```

It has already earned its place. "Madurai" comes out /mˈædʒuːɹˌaɪ/ — MAD-joo-rye
— so the word is out of both scripts. "Sitetru" is right on its own
(/sˈaɪttɹuː/, SITE-troo), which is not something you would think to check and
not something you would want to discover in a finished film.

To hand a film to a human voice later, `films/out/<id>/script.txt` is the
timestamped script and every line is already a separate WAV — swapping one line
does not mean re-rendering a film.

### The music

`marketing/music/score.py` composes and renders both cues from oscillators and
noise. Two cues with different jobs:

- **launch** — D minor, 84 BPM, resolving to F major. Its shape is the script's
  shape: almost nothing under the opening question, an arpeggio when the product
  arrives, percussion under the middle where the film makes its case, pulled
  back for the last line so the voice has the frame, then the resolve on the
  mark.
- **walkthrough** — A minor, 72 BPM, no percussion, almost no movement. Its
  whole job is to stop the room sounding dead under a voice that talks for two
  and a half minutes. If you notice it, it is too loud.

`mix.mjs` places each line at its beat and ducks the score under the voice with
`sidechaincompress`, then delivers at −14 LUFS with a −1 dBTP ceiling, which is
what every platform normalises to. It prints what actually came out, and fails
if the audio graph ended before the picture did — which it silently did once,
trimming 2.7 seconds off the end card.

### The brand

`marketing/brand.mjs` is the single copy of the palette for everything under
`marketing/`, and `brand.test.mjs` reads `../src/index.css` and fails if it
drifts or if any renderer still holds a retired value. It runs in `npm test`
via `brand.spec.ts`.

This existed because the opposite was true for a long time. Five renderers each
carried their own hexes, and when the product moved to navy and cobalt not one
of them came along — so the films were rendered in the retired brand around
screenshots that show the current one, the walkthrough's click ring pinged
orange over a cobalt product, and nothing caught any of it, because
`marketing/` is a separate package with no CI step of its own.

## Requirements

- `ffmpeg` on PATH (`apt-get install -y --no-install-recommends ffmpeg`)
- `playwright-core` — a devDependency, so `npm install` covers it. It ships
  no browser; point `CHROME_PATH` at a Chromium binary if yours is not at the
  sandbox default `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- `ffmpeg` needs the `flite`, `deesser`, `acompressor`, `alimiter`, `loudnorm`
  and `sidechaincompress` filters. Ubuntu's build has all of them.
- `python3` with `numpy` and `scipy` (the score), and `piper-tts` (the voice).
- Fonts are served from `walkthrough/fonts/` on disk, not from Google. Left to
  the network they are a render-blocking third-party request that has stalled a
  load here before — and it fails SILENTLY: the frame renders in whatever the
  fallback stack resolves to, so a whole film comes out in the wrong typeface
  and nothing reports an error. That is exactly what the first render did.

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
