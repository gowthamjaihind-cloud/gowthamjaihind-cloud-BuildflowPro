// Audit rendered contrast across the product, in both themes.
//
//   npm run build:demo
//   node marketing/capture/serve-demo.mjs &
//   node scripts/audit-contrast.mjs
//
// `src/lib/contrast.test.ts` is the gate that runs in CI; it reads source files
// and is what keeps the palette honest. This is the complement it cannot be: it
// measures what the BROWSER computes, not what the CSS says.
//
// It earns its place. The static test passed while the public demo's "Start
// free trial" -- the site's conversion CTA -- was still white-on-cobalt at 3.30
// in dark mode, because the codemod had excluded `src/demo` as "not product UI"
// and the test inherited that blind spot. Only a real render found it. It also
// sees class lists assembled at runtime (`bg-${tone}`), which no source-file
// scan can resolve.
//
// Measure what the BROWSER computes, not what the CSS says. The token work is
// a chain -- --on-fill -> --color-on-primary -> .text-on-primary -- and Tailwind
// v4 substitutes at :root, so a token that reads correctly in the file can
// still resolve to the wrong value on the page. Only the rendered value counts.
import { chromium } from "playwright-core";

const BASE = "http://localhost:4173";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
/*
  Mark the guided tour seen BEFORE anything loads.

  Without this the tour opens over the demo and its backdrop swallows clicks,
  so every nav click silently does nothing and the sweep measures the FIRST
  screen ten times with a modal on top of it. That is what the first version of
  this script did, and it is why it reported "no text node below its WCAG
  threshold across ten screens in both themes" -- a result which was measuring
  one screen, behind a dialog.

  record.mjs carries the same line, with the same warning. I wrote that one and
  then failed to apply it here.
*/
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("sitetru.demo.tour.done", "1");
  } catch {
    /* private mode: the tour opens and the assertion below catches it */
  }
});
const page = await ctx.newPage();
await page.goto(`${BASE}/?demo=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

function lum([r, g, b]) {
  const l = [r, g, b].map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
const parse = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
const ratio = (a, b) => {
  const [x, y] = [lum(parse(a)), lum(parse(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Walk the product, not just the landing screen. The static test reads source
// files, so it cannot see a class list assembled at runtime (`bg-${tone}`);
// only a real render can. Dark mode is where every failure was, so sweep there.
// Screen names and the button selector come from the walkthrough recorder,
// which already knows this app's sidebar is buttons, not a <nav>.
const SCREENS = ["Dashboard", "WBS", "Daily Logs", "Labour & Billing", "Inventory",
  "Procurement", "Cost Management", "Project Insights", "Client Estimates",
  "Document Vault", "Settings"];

async function audit() {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const t = el.textContent?.trim();
      // Leaf-ish nodes only: a wrapper inherits its child's text and would
      // report the child's colour against its own background.
      if (!t || el.children.length > 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.opacity === "0") continue;
      /*
        Resolve the background the text ACTUALLY sits on, by walking up to the
        first painted ancestor.

        This used to skip any element whose own background was transparent,
        which is nearly all text -- a table cell, a heading, a label. So the
        sweep that reported "no text node below its WCAG threshold across ten
        screens" had only ever examined nodes that painted their own
        background, and the claim was far weaker than it sounded.

        What it missed: VirtualTable's container carries a hardcoded `bg-white`,
        a Tailwind literal that does not flip with the theme. In dark mode the
        table stayed white while its text went near-white, so every row of the
        inventory, procurement and cost tables was white-on-white -- contrast
        1.0, completely unreadable. It took re-recording the walkthrough in
        dark mode to see it.
      */
      let bg = s.backgroundColor;
      let at = el;
      while (at && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) {
        at = at.parentElement;
        if (!at) break;
        bg = getComputedStyle(at).backgroundColor;
      }
      if (!/^rgb\(/.test(bg)) continue;   // nothing opaque underneath
      const px = parseFloat(s.fontSize);
      const bold = parseInt(s.fontWeight, 10) >= 700;
      // WCAG large text: 24px, or 18.66px bold.
      const large = px >= 24 || (bold && px >= 18.66);
      const need = large ? 3 : 4.5;
      const p = (c) => c.match(/\d+/g).slice(0, 3).map(Number);
      const L = (v) => { const l = p(v).map((x) => (x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
      const [a, b] = [L(s.color), L(bg)];
      const r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (r < need) out.push(`${r.toFixed(2)}:1 (needs ${need}) ${s.color} on ${bg} "${t.slice(0, 30)}"`);
    }
    return [...new Set(out)];
  });
}

// Into a project, so the per-project screens exist to be visited.
const card = page.getByText("Sample Residence — Plot 12").first();
if (await card.count()) { await card.click(); await page.waitForTimeout(2600); }

let total = 0;
for (const theme of ["dark", "light"]) {
await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
await page.waitForTimeout(500);
console.log(`\n--- ${theme} ---`);
for (const name of SCREENS) {
  const btn = page.getByRole("button", { name, exact: true }).first();
  if (!(await btn.count())) { console.log(`  [${name}] not reachable`); continue; }
  await btn.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1400);
  // A click that silently does nothing is the failure mode this sweep had, so
  // check the screen actually changed rather than assuming it did.
  const landed = await page.evaluate((n) => {
    const active = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === n && /bg-primary|aria-current/.test(b.className + b.outerHTML),
    );
    return Boolean(active);
  }, name);
  if (!landed) { console.log(`  [${name}] click did not land -- NOT MEASURED`); continue; }
  const bad = await audit();
  total += bad.length;
  console.log(`  [${name}] ${bad.length ? "\n     " + bad.join("\n     ") : "clean"}`);
}
}
console.log(`\n${total} failing text nodes across ${SCREENS.length} screens, both themes`);

await browser.close();
