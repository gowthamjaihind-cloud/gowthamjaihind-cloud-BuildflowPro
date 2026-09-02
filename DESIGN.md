# DESIGN.md — Sitetru

Construction project management for Indian contractors. Site staff file the
day's work from Telegram; the office reads progress, cost and the client's bill
off the same numbers.

Every token below is the one the app actually ships (`src/index.css`). Where a
rule has a reason, the reason is here too — a value alone tells an agent *what*
to emit but not how to decide the case this file never covered.

---

## 1. Visual theme & atmosphere

Site-office plain, not startup-slick. The audience is a contractor in Madurai
checking spend between site visits, often on a phone, often in sunlight. The
interface should read like a well-kept ledger: dense where the numbers are,
quiet everywhere else.

- **Calm ground, one warm accent.** A near-white page with a single terracotta
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
--primary:      #D97D54;  /* Rust — actions, active nav, emphasis */
--rust-strong:  #A85433;  /* Rust darkened for small text on light (≈5.3:1) */
--page:         #F0F3F4;  /* Ice — app background */
--panel:        #FFFFFF;  /* Snow — cards, sheets */
--surface:      #FFFFFF;
--surface-dark: #324755;  /* Drab — headers, banners, inverted panels */
--ink:          #1B1C20;  /* Onyx — primary text */
--ink-muted:    #56778E;  /* Slate, darkened for AA body contrast (≈4.7:1) */
--divider:      #C8D1D3;  /* Fossil */
--success:      #059669;
--danger:       #EF4444;
--warning:      #B85F3B;
--info:         #6E8CA0;
```

Supporting brand hues: sage `#87BCBF`, sand `#B9B0A2`.

**Roles.**
- Rust is reserved for what the user can act on and for the current position
  (active nav, primary button, live progress). Never a background wash.
- `--rust-strong` exists **only** because `#D97D54` fails AA below ~18px on
  white. Small rust-coloured text uses the strong variant; large display type
  may use the base.
- `--ink-muted` is the darkened slate, not the brand slate, for the same reason.
  Do not substitute a lighter grey for "subtle" — it drops below 4.5:1.
- Status colours never carry meaning alone: pair with a label or icon.

---

## 3. Typography rules

```css
--font-sans:    "Manrope", ui-sans-serif, system-ui, sans-serif;
--font-display: "Manrope";
--font-mono:    "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

- **Manrope** everywhere; weights 400/500/600/700/800. Headings are 800 with
  `-0.02em` tracking. Body is 400–500.
- **JetBrains Mono** for figures that must align down a column, dates, and
  document numbers (`PO-2026-0018`). Not for prose.
- **Small caps labels**: 10–11px, weight 800, `uppercase`, `tracking-widest`,
  in `--ink-muted` or rust. This is the standard field label.
- **Tamil** renders in the same scale; Noto Sans Tamil is embedded for PDF
  export. Tamil is longer than English — never size a control to its English
  label.

**Numbers are not decoration.**
- Indian digit grouping throughout: `₹1,07,61,000`, not `₹10,761,000`.
- Compact figures use **lakh and crore** (`₹53.7L`, `₹1.1Cr`). Never `K`/`M` —
  a contractor does not read in thousands.
- `₹` requires an embedded font in any PDF path. jsPDF's built-in Helvetica is
  WinAnsi and silently renders it as a superscript one.

---

## 4. Component stylings

| Component | Rules |
|---|---|
| **Primary button** | Rust fill, white text, `rounded-xl`, 800 uppercase tracking-wider, `hover:#B85F3B` |
| **Secondary** | Transparent with `--divider` border, ink text |
| **Card** | Snow on Ice, `rounded-2xl`, `shadow-sm`, 1px divider border |
| **Nav item** | `rounded-[18px]`; active = rust fill, white text, ring; idle = ink-muted with panel hover |
| **Badge / pill** | `rounded-full`, 10px 800 uppercase, tinted background at ~10% with a 20% border |
| **Input** | White, divider border, `rounded-xl`, rust focus ring |
| **Table header** | Drab bar, white small-caps labels, numeric columns right-aligned |

Motion is one shared curve — `apple-transition`: 200ms
`cubic-bezier(0.2, 0, 0, 1)` over colour, shadow, transform and opacity. Nothing
animates position on load. Nothing bounces.

---

## 5. Layout principles

- Radius scale in use, most to least: `rounded-xl` (12px) → `rounded-2xl` →
  `rounded-full` → `rounded-lg`. Large marketing surfaces go to
  `rounded-[24px]`/`[32px]`. Pick one per surface class and hold it.
- Fixed left sidebar, collapsible to a 56px icon rail. **Every layout must be
  checked in both states** — several defects have come from testing expanded
  only.
- Content is a single column of cards on Ice, `max-w-6xl` on marketing pages.
- Spacing follows Tailwind's 4px scale; card padding `p-5`/`p-6`, section gaps
  `gap-4`/`gap-6`.

---

## 6. Depth & elevation

Four levels, and they mean altitude, not importance:

1. **Flat** — the Ice page.
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
- Don't colour a whole surface rust.

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

- "Build this on Ice with Snow cards, `rounded-2xl`, `shadow-sm`, rust only for
  the action."
- "Money in Indian grouping with lakh/crore; figures in JetBrains Mono,
  right-aligned."
- "Give me both sidebar states, and 390 / 1024 / 1440."
- "Label every icon-only control."
- "Tamil and English side by side — standard written register, not colloquial."

**Register note.** Interface Tamil is standard written Tamil
(*மாற்றவும்*), not the spoken form used in video narration (*மாத்துங்க*). The
two were mixed once and the interface read as slang.

---

*Format follows the `DESIGN.md` convention catalogued at
[VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design)
(MIT). Contents are Sitetru's own system, read out of this repository.*
