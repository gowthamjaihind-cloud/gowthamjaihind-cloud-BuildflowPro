# DESIGN.md — Sitetru

Construction project management for Indian contractors. Site staff file the
day's work from Telegram; the office reads progress, cost and the client's bill
off the same numbers.

Every token below is the one the app actually ships (`src/index.css`). Where a
rule has a reason, the reason is here too — a value alone tells an agent *what*
to emit but not how to decide the case this file never covered.

**Provenance.** Three sources, all from
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
(MIT), all inspired-by readings of public patterns rather than official systems.
**Stripe** gives the light-palette structure and the type features; the accent
is no longer its indigo — see below.
**Wise** gives the status model — colour in the fill, a separate colour for the
text on it — and the Manrope/Inter pairing, which is Wise's own documented
substitute for its proprietary display face. **Linear** gives the dark surface
ladder, and nothing else. Geometry, spacing, Indian number formatting and all
Tamil handling are Sitetru's own. Every contrast value here is measured.

---

## 1. Visual theme & atmosphere

Site-office plain, not startup-slick. The audience is a contractor in Madurai
checking spend between site visits, often on a phone, often in sunlight. The
interface should read like a well-kept ledger: dense where the numbers are,
quiet everywhere else.

- **Calm ground, one accent.** A cool off-white page with a single cobalt
  for anything actionable. Colour means something; nothing is coloured for
  decoration.
- **Data over ornament.** No gradients behind numbers, no glassmorphism, no
  illustration. A figure and its label, aligned.
- **Density is earned.** Tables and logs run tight. Marketing surfaces breathe.
- **Never cheerful about bad news.** Overspend and slippage are stated plainly
  in the danger colour, not softened.

---

## 2. Colour palette & roles

```css
--primary:        #1D4ED8;  /* Cobalt — CTAs, active nav, emphasis. 6.70 on white */
--primary-deep:   #1A3FAF;  /* hover, and small emphasis text. 8.85 */
--primary-press:  #14307F;  /* pressed. 11.94 */
--primary-strong: #1A3FAF;  /* alias for emphasis text; formerly --rust-strong */
--page:           #F5F7FA;  /* the cool off-white ground */
--panel:          #FFFFFF;
--surface-dark:   #12203F;  /* deep navy — inverted panels, table headers. 16.10 */
--surface-edge:   #1E2B4D;  /* hairline ON a dark surface — navy, not neutral */
--ink:            #0F172A;  /* near-navy, never pure black. 17.85 on white */
--ink-muted:      #56637A;  /* 6.07 on white, 5.65 on the page */
--divider:        #E1E6EE;  /* hairline */
--success:        #046A4E;  /* 6.61 on white · 5.51 on its own 12% tint */
--danger:         #B3261E;  /* 6.54 · 5.37 */
--warning:        #9A4A22;  /* 6.22 · 5.21 */
--info:           #4A6C82;  /* 5.59 · 4.75 */

/* For content sitting ON a dark band. Every token above is tuned against
   white and fails on navy: cobalt measures 2.40:1 there, success 2.29:1. */
--primary-on-dark: #A8C2FF;  /* 9.07 on the navy band */
--success-on-dark: #34D399;  /* 7.72 on its own tint over navy */
```

**Roles.**
- Cobalt is for what the user can act on and for current position. One filled
  cobalt control per band; never a background wash. It was chosen over the
  Stripe indigo for legibility: higher ink contrast against its ground, and a
  hue familiar enough that nobody has to learn it. Both pass AA; cobalt has
  more headroom outdoors, which is where this product is read.
- `--ink-muted` is **not** Stripe's `#64748d`, which measures 4.49:1 on a tinted
  page and fails. The cobalt set uses `#56637A` — 6.07 on white, 5.65 on the
  page.
- Stripe's file documents **no semantic palette** — error and success live only
  in its product UI. Sitetru cannot work that way: over-budget and at-risk are
  the point of the product.
- **The status colours are text colours, so they must pass as text.** The
  previous set did not — success 3.77, danger 3.76, warning 4.43, info 3.55,
  every one below the 4.5 floor, across 269 `text-*` call sites. They are
  darkened above with the hue preserved. Following Wise, a status chip puts the
  colour in the fill and the same token in the text; both are checked.
- The accent must stay **semantically empty**. Green means on-track, red means
  over-budget, amber means behind schedule — an accent in any of those hues
  makes the status colours ambiguous. This is why Wise's lime is not adopted
  even though the rest of its model is: a green accent and a green "on track"
  cannot coexist in a product whose job is flagging trouble. Cobalt at 224° is
  clear of all three.
- **The retired palette is gone, tokens and all.** `--color-sage`, `--color-rust`,
  `--color-drab`, `--color-ice`, `--color-onyx` (#1B1C20, a zero-blue charcoal
  that gave the app a second, greyer dark next to the navy), `--color-fossil`
  (#C8D1D3 grey-teal, doing duty as a hairline, a hover and a disabled fill)
  and `--color-sand` no longer exist; `drab` was `surface-dark`
  and `ice` was `page` under older names, so those usages simply moved to the
  real token. Sage was doing four unrelated jobs and was split by meaning: plan
  and quota badges are brand (`primary/12`), the landing "Active" chip is a
  status (`success`), the RA-bill badge opposite "change order" is a category
  (`info`), and the decorative wash is `primary/20`. The two portfolio dots were
  both sage; active is now `success` and completed `info`, because two greens
  side by side said nothing.
- Ruby `#ea2261` and the other gradient stops are decorative in the source
  system and are **not** adopted here; at 4.29:1 ruby is large-text-only.

**Dark mode** follows Linear's surface ladder — a near-black canvas with four
lifted steps, so depth reads from stacked greys and hairlines instead of shadow:

```css
--page:      #010102;  /* canvas */
--surface-1: #0F1011;  /* cards */
--surface-2: #141516;  /* hovered / nested */
--surface-3: #18191A;  /* sub-nav, tertiary bands */
--surface-4: #191A1B;  /* deepest lifted surface */
--divider:   #23252A;  /* hairline */  --divider-strong: #34343A;
--ink:       #F7F8F8;  --ink-muted: #8A8F98;  /* 6.42:1 on canvas */
--primary:   #5B87FF;  /* lifted cobalt. 5.76 on surface-1, 6.31 on canvas.
                          #3E70FF clears 4.5 but only just, leaving no
                          headroom for a nested surface */
--success:   #34D399;  --danger: #F87171;   /* 9.91 · 6.89 on surface-1 */
--warning:   #F0A882;  --info:   #9BAAC2;   /* 9.64 · 8.09 */
```

**Never reuse a light-mode token on a dark surface** — and this file said so
before the code obeyed it. Cobalt as text on navy measured 2.40:1 in five
places, including *Require attention* on the dashboard's own at-risk card and
the amounts in Cost Management's transaction panel; the success green measured
2.29:1 in the status pills. Two mechanisms now hold the line:

- `text-primary-on-dark` for cobalt type on a dark band.
- A `.on-dark` class on the band itself, which re-points `--color-success` to
  the dark-surface value and so fixes a status pill's text, dot, tint and
  border in one declaration. Re-point the **theme** variable, not the raw one:
  Tailwind resolves `--color-success: var(--success)` at `:root`, and
  descendants inherit that already-substituted value, so overriding
  `--success` further down does nothing.

`.on-dark` deliberately does **not** re-point `--color-primary`. A hero can
hold a filled cobalt CTA, and that button has to stay cobalt.

---

## 3. Typography rules

```css
--font-sans:    "Inter", "Noto Sans Tamil", ui-sans-serif, system-ui, sans-serif;
--font-display: "Manrope", "Noto Sans Tamil", ui-sans-serif, system-ui, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

- **Manrope for display, Inter for body.** This is Wise's own documented
  substitute pairing for its proprietary faces, and Manrope was this app's
  original display face. `h1`/`h2` and anything marked `font-display` take
  Manrope; everything else takes Inter.
- **Noto Sans Tamil is declared in both stacks.** It already shipped for PDF
  export, but the interface named no Tamil face at all, leaving Tamil to the
  operating system — fine on Android, unreliable elsewhere. No design file
  covers this; it is specific to this product.
- **`ss01` globally** on the body, and **`tnum` / tabular figures** on every
  cell that renders money or a count. Digits then line up down a column. This
  is the single best idea in the source system for an app that is mostly
  ledgers, and it costs nothing.
- **Negative tracking on display sizes**, proportional: about -1.4px at 56px
  easing to -0.2px at 20px. Body sits at 0.
- **Nav labels are 15px in Manrope**, and this was arrived at by measurement,
  not taste. Inter at 17px lost "Cost Management", "Client Estimates" and
  "Consumption History" from the sidebar at 1024px. Manrope at 17px did not fix
  it either — the sidebar is simply not that wide. 15px does. Re-measure the
  sidebar at 1024 after any change to the face or the size; a mock-up at a
  guessed width will tell you the wrong answer.
- Weight 300 is the source brand's display signature. It is used sparingly here
  and **never below 15px**: thin type at small sizes is the first thing to fail
  on a phone in direct sunlight, which is where this product is read.

**Numbers are not decoration.**
- Indian digit grouping throughout: `₹1,07,61,000`, not `₹10,761,000`.
- Compact figures use **lakh and crore** (`₹53.7L`, `₹1.1Cr`). Never `K`/`M`.
- `₹` requires an embedded font in any PDF path. jsPDF's built-in Helvetica is
  WinAnsi and silently renders it as a superscript one.

---

## 4. Component stylings

| Component | Rules |
|---|---|
| **Primary button** | Cobalt fill, white text, `rounded-xl`, 800 uppercase tracking-wider; pressed `#2E2B8C` |
| **Secondary** | Transparent with `--divider` border, ink text |
| **Card** | White on Canvas Soft, `rounded-2xl`, `shadow-sm`, 1px hairline border |
| **Nav item** | `rounded-[18px]`; active = cobalt fill, white text, ring; idle = ink-muted with panel hover. Label 15px — see §3 |
| **Status chip** | `rounded-full`, 10px 800 uppercase. Colour goes in the fill at ~12% and in the text; both are checked against each other, per Wise |
| **Input** | White, hairline border, `rounded-xl`, cobalt focus ring |
| **Select** | Still a native `<select>`, restyled in `@layer base`: hairline border, `rounded-xl`, own caret. Native on purpose — the OS picker beats anything hand-built on a phone |
| **Screen header band** | `PageHero`. Flat `--surface-dark`, a 3px cobalt rule along the top edge, `--surface-edge` hairline, no shadow. Title 32px, band ~110px. Carries `on-dark`. One dark tone per screen — it matches the at-risk KPI card rather than introducing a second |
| **Dialog** | Any modal panel carries `<DialogBehaviour />` as its first child. That gives it `role="dialog"`, `aria-modal`, `aria-labelledby` wired to its own visible heading, Escape, a focus trap, focus restored to whatever opened it, and a scroll lock on the real scroll container. `useDialog` is the declarative form for new code |
| **Loading** | A spinner where the user pressed a control and there is no layout to hold — 37 of them live inside submit buttons, which is correct. `<SkeletonScreen/Rows/Cards/Text>` where the shape of what is coming *is* known. A spinner for a genuinely shapeless wait (OCR, an AI answer), and then it must carry text |
| **Empty state** | `<EmptyState>`. Icon tile, bold title, one muted sentence, optional action. Three sizes — `inline` (in a card section, no tile), `panel` (default), `page`. Inside a `<tbody>` pass `colSpan` and it renders `<tr><td colSpan>` |
| **Tooltip** | `<Tooltip label="…">` wrapping the control. Navy bubble, white-alpha edge, portalled to `<body>` so an `overflow-hidden` card cannot clip it; flips side near an edge. Shows on hover, on focus and **on tap**; `Escape` and any scroll dismiss. It sets `aria-label` on its child, so it replaces `title` rather than sitting beside it |
| **Toast** | Card shape, `shadow-lg`, tinted icon chip. Top of the screen; the foot carries the demo banner. Errors 8s and `role="alert"`, others 4–5s and `role="status"` |
| **Confirm dialog** | Centred card, scrim, `Escape` and scrim cancel. The button names the act — "Delete", not "Confirm". Replaces `window.confirm` |
| **Table header** | Brand Dark 900 bar, white small-caps labels, numeric columns right-aligned |

**The brand mark** is three ascending bars — a rising skyline — in white on a
cobalt tile, `rx` 116 of 512. White on cobalt is 6.70:1, which is what keeps
the bars separate at 16px; cobalt bars on the deep navy tile measure 2.40:1 and
merge into a solid square in a browser tab. The tile is 6.24:1 on the light
page and 3.11:1 on the dark canvas. `BrandLogo.tsx` and `public/icon.svg` draw
the same mark and must be changed together, along with `theme_color` in the
manifest and `index.html`.

**The wordmark** is Manrope 800 — the same face and weight as `h1`/`h2`, so the
name beside the mark matches the headings under it. It was 700, one step light.

Motion is one shared curve — `apple-transition`: 200ms
`cubic-bezier(0.2, 0, 0, 1)` over colour, shadow, transform and opacity. Nothing
animates position on load. Nothing bounces.

---

## 5. Layout principles

- Geometry is Sitetru's, not the source system's: the source uses pill buttons
  throughout, this app uses rounded rectangles. Radius scale in use, most to least: `rounded-xl` (12px) → `rounded-2xl` →
  `rounded-full` → `rounded-lg`. Large marketing surfaces go to
  `rounded-[24px]`/`[32px]`. Pick one per surface class and hold it.
- Fixed left sidebar, collapsible to a 56px icon rail. **Every layout must be
  checked in both states** — several defects have come from testing expanded
  only.
- Content is a single column of white cards on Canvas Soft, `max-w-6xl` on
  marketing pages.
- Spacing follows Tailwind's 4px scale; card padding `p-5`/`p-6`, section gaps
  `gap-4`/`gap-6`.

---

## 6. Depth & elevation

Four levels, and they mean altitude, not importance:

1. **Flat** — the Canvas Soft page.
2. `shadow-sm` — cards at rest. This is the overwhelming default (179 uses).
3. `shadow-lg`/`shadow-xl` — menus, popovers, the demo tour card.
4. `shadow-2xl` — fixed banners and modals that sit above everything.

Borders do the quiet separating; shadow is only for things that genuinely float.

---

## 7. Do's and don'ts

**Do**
- Right-align every numeric column and give it the mono face.
- Keep a badge inside its card's padding box — badges have escaped card edges
  here before.
- Let long labels wrap. Card titles are content, not chrome.
- State the unit: `22 deployed`, `56d`, `₹53.7L`.
- Give icon-only controls an `aria-label`; collapsed, the sidebar is twelve
  unlabelled buttons without one. `<Tooltip>` does this for you. Verify with
  the browser's accessibility tree, not by reading the JSX — a grep for
  icon-only buttons over-reported by 32 sites because it stripped `{t("…")}`
  as if it were markup, and under-reported others whose icon alias it did not
  know. The app now stands at 308 visible buttons, 0 unnamed.
- Name a control, then decide separately whether it needs a hint. A modal `X`
  wants a name and no bubble — the glyph is universally read. A trash icon in
  a table row wants both, because "delete *what*" is not in the glyph.
- Reach for `<Tooltip>`, never `title=`. Native `title` is not worthless —
  measured in Chromium it *does* give an icon-only button an accessible name,
  so removing one without adding `aria-label` makes things worse, not better.
  What it cannot do is appear on touch, and this product is read on a phone at
  a site gate. It also skips keyboard focus, waits about a second, and cannot
  be styled.
- Render a signed quantity as **magnitude plus a word**, never as a bare sign:
  `₹54.0L under budget`, not `₹-54.0L`. Two screens computed variance with
  opposite conventions — `actual - budget` on the dashboard, `planned - actual`
  in Cost Management — and both showed the same underspend in green, one as a
  positive number and one as a negative. The word is what makes them agree;
  the sign is an implementation detail and should not reach the user.
- Derive "behind schedule" from one shared helper. `expectedProgress()` in
  `src/lib/projectMetrics.ts` compares elapsed time to percent complete, with
  `SLIP_TOLERANCE` for the slack; every KPI, badge and phase label reads it.

**Don't**
- Don't `truncate` a title to make a row fit. It once reduced "Labour" to "L".
- Don't use `K` for thousands, or Western digit grouping.
- Don't put a negative number in the success colour. `₹-54.0L` in green reads
  as broken even when the sign convention is right.
- Don't lock scrolling with `overflow: hidden` on `<body>`. This app does not
  scroll the body — Layout scrolls an inner `div.flex-1.overflow-y-auto`, so
  the body trick is a no-op here and the page happily scrolled behind every
  open modal (measured: 324px). Find what is actually scrollable, and skip the
  dialog's own `max-h-[90vh] overflow-y-auto` panel.
- Don't guess a dialog's close handler. One of these panels has an Export PDF
  button where the close button normally sits; wiring Escape from the nearest
  `onClick` would have exported a file. `DialogBehaviour` presses the dialog's
  own close control instead — an explicit Close label, then Cancel, then an
  icon-only button — and does nothing if it finds none.
- Don't name a dialog with a new string. `aria-labelledby` pointed at the
  heading the modal already shows costs nothing and is already translated;
  `aria-label` would have meant inventing 37 names in two languages.
- Don't swap a spinner in for a skeleton, or the reverse. A spinner answers
  "is my click doing something"; a skeleton answers "what is about to appear".
  Ten lazily-loaded views shared one `py-32` spinner box, so every navigation
  showed an empty page and then jumped when the chunk landed.
- Don't animate a placeholder without a reduced-motion escape. `.skeleton` is
  a tinted block plus one sweep of light, and only the sweep is animated, so
  turning it off leaves a readable placeholder. `animate-pulse` was not
  covered by the reduced-motion block at all until now.
- Don't leave a loading state silent. The blocks are `aria-hidden`; exactly
  one wrapper carries `role="status"` and real text, so a screen reader hears
  "Loading…" once rather than three times from nested regions. Two full-screen
  spinners had no text at all.
- Don't tell a user with no data to adjust their filters. "Nothing yet" and
  "nothing matches" are different states and four screens conflated them: the
  guard was on the *filtered* list, so a brand-new project met "try adjusting
  your search or filters" with no filters set. Branch on the source list first,
  offer the way to create the first record there, and give the filtered branch
  a way to clear the filter.
- Don't put a `<div>` empty state inside a `<tbody>`. It is invalid markup and
  the browser hoists it out of the table. `colSpan` on `<EmptyState>` exists
  for this.
- Don't leave a call to action wired to nothing. The schedule's empty state
  offered "Add your first task" with no handler and no prop to supply one; it
  now says where tasks are actually created.
- Don't let a summary contradict a detail on the same screen — "0 tasks at
  risk" above a phase marked *Behind Schedule* destroys trust in both.
- Don't wrap a horizontal scroller in `md:flex-wrap` without checking 1024px.
- Don't colour a whole surface cobalt, and don't use cobalt as body-text colour — it is a CTA and link colour.
- Don't reach for `window.alert` or `window.confirm`. They render in the
  browser's chrome, announce the domain and cannot be styled; use `toast.*`
  and `confirmDialog` from `src/lib/feedback.ts`.
- Don't decorate a header band with a colour mesh. This one carried four
  animated radial gradients — teal `#87BBBE`, terracotta `#D87C54`, slate
  `#4C6B7F`, sand `#BFB19B` — plus a charcoal wash. Every hue belonged to the
  retired palette, and layered at low opacity they cancelled into a grey-brown
  that read as a rendering fault. A flat surface and one rule say the same
  thing and cannot rot.
- Don't write palette colours as `hsla()`. The mesh above, and seven more
  gradients under `body::before` tinting every screen, survived two hex sweeps
  because `hsla(18, 63%, 59%)` does not match a search for `#D87C54`. If a
  colour must be authored in another space, leave the hex in a comment beside
  it.
- Don't hardcode a colour in a component. A palette change cannot reach a
  literal: the move to indigo left 104 uses of the retired rust ramp behind,
  including a terracotta Export PDF button sitting beside indigo ones. Chart
  series are the documented exception — they need a categorical palette that
  is deliberately not the accent.

---

## 8. Responsive behaviour

- Breakpoints are Tailwind's defaults; **1024px is the one that breaks**, and it
  is the one most often skipped. Check 390, 768, 1024, 1440.
- Below `md`, the sidebar becomes a sheet. The nav renders **twice** in the DOM
  — sidebar and mobile menu — so anything selecting a nav element must take the
  copy actually laid out, not the first match.
- Tab strips stay single-line horizontal scrollers. Keep the scrollbar visible;
  hiding it leaves no affordance that there is more.
- Touch targets ≥ 44px. Fixed bottom bars must reserve their own height so they
  never sit on the last row of content.

---

## 9. Agent prompt guide

Prompts that keep new work on-system:

- "Build this on Canvas Soft with white cards, `rounded-2xl`, `shadow-sm`,
  cobalt only for the action."
- "Money in Indian grouping with lakh/crore; figures in JetBrains Mono,
  right-aligned."
- "Give me both sidebar states, and 390 / 1024 / 1440."
- "Label every icon-only control."
- "Tamil and English side by side — standard written register, not colloquial."

**Register note.** Interface Tamil is standard written Tamil
(*மாற்றவும்*), not the spoken form used in video narration (*மாத்துங்க*). The
two were mixed once and the interface read as slang.

---

*Format follows the `DESIGN.md` convention from
[VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design);
palette and type derive from the Stripe entry in
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md).
Both MIT. Those files are inspired-by readings of public patterns, not official
systems, and trademarks remain with their owners. Every value here is read back
out of this repository and its contrast measured.*
