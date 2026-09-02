# DESIGN.md — Sitetru

Construction project management for Indian contractors. Site staff file the
day's work from Telegram; the office reads progress, cost and the client's bill
off the same numbers.

Every token below is the one the app actually ships (`src/index.css`). Where a
rule has a reason, the reason is here too — a value alone tells an agent *what*
to emit but not how to decide the case this file never covered.

**Provenance.** The palette and type are derived from the Stripe `DESIGN.md`
in [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
(MIT) — itself an inspired-by reading of publicly observable patterns, not an
official Stripe system. Geometry, spacing and the semantic status colours remain
Sitetru's own. Contrast values below are measured, not quoted.

---

## 1. Visual theme & atmosphere

Site-office plain, not startup-slick. The audience is a contractor in Madurai
checking spend between site visits, often on a phone, often in sunlight. The
interface should read like a well-kept ledger: dense where the numbers are,
quiet everywhere else.

- **Calm ground, one accent.** A cool off-white page with a single indigo
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
--primary:      #533AFD;  /* Indigo — CTAs, active nav, emphasis. 6.19:1 on white */
--primary-deep: #4434D4;  /* gradient mid-stop, small emphasis text (8.7:1) */
--primary-press:#2E2B8C;  /* pressed */
--page:         #F6F9FC;  /* Canvas Soft — the cool off-white ground */
--panel:        #FFFFFF;  /* Canvas */
--surface-dark: #1C1E54;  /* Brand Dark 900 — inverted panels, headers */
--ink:          #0D253D;  /* Deep navy, never pure black. 15.57:1 */
--ink-muted:    #5A6A82;  /* 5.1:1 on white, 4.6:1 on the tinted page */
--divider:      #E3E8EE;  /* Hairline */
--success:      #059669;  /* Sitetru's own — Stripe documents no semantic palette */
--danger:       #EF4444;
--warning:      #B85F3B;
--info:         #6E8CA0;
```

**Roles.**
- Indigo is for what the user can act on and for current position. One filled
  indigo control per band; never a background wash.
- `--ink-muted` is **not** Stripe's `#64748d`. That value measures 4.49:1 on the
  tinted page and 3.95:1 on cream — both fail AA. Darkened to `#5A6A82` it
  passes on every surface this app uses.
- Stripe's file documents **no semantic palette** — error and success live only
  in its product UI. Sitetru cannot work that way: over-budget and at-risk are
  the point of the product, so success/danger/warning/info are kept.
- Ruby `#ea2261` and the other gradient stops are decorative in the source
  system and are **not** adopted here; at 4.29:1 ruby is large-text-only.

**Dark mode.** The base indigo is 2.20:1 on the dark panel — unreadable. Dark
mode lifts it to `#9D91FF` (5.94:1 on panel). Never reuse the light primary on
a dark surface.

---

## 3. Typography rules

```css
--font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;
--font-display: "Inter";
--font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

- **Inter** is the documented open-source stand-in for Sohne, which is
  proprietary. Weights 300–700.
- **`ss01` globally** on the body, and **`tnum` / tabular figures** on every
  cell that renders money or a count. Digits then line up down a column. This
  is the single best idea in the source system for an app that is mostly
  ledgers, and it costs nothing.
- **Negative tracking on display sizes**, proportional: about -1.4px at 56px
  easing to -0.2px at 20px. Body sits at 0.
- **Inter is wider than Manrope at the same size.** Nav labels moved 17px → 15px
  when the face changed, because at 17px the sidebar lost "Cost Management" and
  "Consumption History". Stripe's own body scale tops out at 15px, so this is
  more on-system, not less. Re-check any fixed-width label after a type change.
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
| **Primary button** | Indigo fill, white text, `rounded-xl`, 800 uppercase tracking-wider; pressed `#2E2B8C` |
| **Secondary** | Transparent with `--divider` border, ink text |
| **Card** | White on Canvas Soft, `rounded-2xl`, `shadow-sm`, 1px hairline border |
| **Nav item** | `rounded-[18px]`; active = indigo fill, white text, ring; idle = ink-muted with panel hover. Label 15px — see §3 |
| **Badge / pill** | `rounded-full`, 10px 800 uppercase, tinted background at ~10% with a 20% border |
| **Input** | White, hairline border, `rounded-xl`, indigo focus ring |
| **Table header** | Brand Dark 900 bar, white small-caps labels, numeric columns right-aligned |

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
  unlabelled buttons without one.

**Don't**
- Don't `truncate` a title to make a row fit. It once reduced "Labour" to "L".
- Don't use `K` for thousands, or Western digit grouping.
- Don't put a negative number in the success colour. `₹-54.0L` in green reads
  as broken even when the sign convention is right.
- Don't let a summary contradict a detail on the same screen — "0 tasks at
  risk" above a phase marked *Behind Schedule* destroys trust in both.
- Don't wrap a horizontal scroller in `md:flex-wrap` without checking 1024px.
- Don't colour a whole surface indigo, and don't use indigo as body-text colour — it is a CTA and link colour.

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
  indigo only for the action."
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
